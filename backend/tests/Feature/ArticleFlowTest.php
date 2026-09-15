<?php

namespace Tests\Feature;

use App\Models\ArticleScan;
use App\Models\PoLineItem;
use App\Models\QcChecker;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** New flow: 1 PO = N articles, 1 QR per article, accepted/rework/scrap loop. */
class ArticleFlowTest extends TestCase
{
    use RefreshDatabase;

    private function checker(string $code = 'T01'): QcChecker
    {
        return QcChecker::create(['name' => 'Tester One', 'checker_code' => $code]);
    }

    private function po(array $items = []): array
    {
        $res = $this->postJson('/api/purchase-orders', [
            'customer_name' => 'ABC Traders',
            'purchase_order_no' => 'PO-2026-045',
            'items' => $items ?: [
                ['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 100],
                ['article_no' => 'B202', 'bag_size' => '50kg', 'order_qty' => 50],
            ],
        ]);
        $res->assertStatus(201);

        return $res->json();
    }

    private function scan(string $token, int $accepted, int $rework = 0, int $scrap = 0, array $over = [])
    {
        return $this->postJson('/api/article-scans', array_merge([
            'article_token' => $token,
            'department' => 'packing',
            'qc_checker_code' => 'T01',
            'manufacturing_line_no' => 'L2',
            'accepted_qty' => $accepted,
            'rework_qty' => $rework,
            'scrap_qty' => $scrap,
        ], $over));
    }

    public function test_po_creates_line_numbers_and_one_qr_per_article(): void
    {
        $po = $this->po();

        $this->assertCount(2, $po['line_items']);
        $this->assertEquals([1, 2], array_column($po['line_items'], 'line_number'));
        $tokens = array_column($po['line_items'], 'article_qr_token');
        $this->assertCount(2, array_unique($tokens));
        foreach ($tokens as $t) {
            $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{32}$/', $t);
        }
    }

    public function test_duplicate_article_no_rejected_within_and_across_pos(): void
    {
        $this->po();

        // Duplicate within one request.
        $this->postJson('/api/purchase-orders', [
            'customer_name' => 'X', 'purchase_order_no' => 'PO-DUP-1',
            'items' => [
                ['article_no' => 'DUP', 'bag_size' => 'S', 'order_qty' => 10],
                ['article_no' => 'DUP', 'bag_size' => 'S', 'order_qty' => 10],
            ],
        ])->assertStatus(422);

        // Duplicate against an existing article (global uniqueness).
        $this->postJson('/api/purchase-orders', [
            'customer_name' => 'X', 'purchase_order_no' => 'PO-DUP-2',
            'items' => [['article_no' => 'A101', 'bag_size' => 'S', 'order_qty' => 10]],
        ])->assertStatus(422);
    }

    public function test_rework_loop_closes_at_accepted_plus_scrap_equals_qty(): void
    {
        $this->checker();
        $po = $this->po([['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 100]]);
        $token = $po['line_items'][0]['article_qr_token'];

        $this->scan($token, 85, 10, 5)->assertStatus(201);
        $ctx = $this->getJson("/api/articles/{$token}")->assertOk()->json();
        $this->assertEquals(85, $ctx['counters']['accepted']);
        $this->assertEquals(10, $ctx['counters']['rework']);
        $this->assertEquals(5, $ctx['counters']['scrap']);
        $this->assertEquals(10, $ctx['counters']['pending']);
        $this->assertFalse($ctx['counters']['complete']);

        // Re-scan the rework lot after repair with the SAME qr.
        $this->scan($token, 10, 0, 0, ['qc_checker_code' => 'T01'])->assertStatus(201);
        $ctx = $this->getJson("/api/articles/{$token}")->assertOk()->json();
        $this->assertEquals(95, $ctx['counters']['accepted']);
        $this->assertEquals(0, $ctx['counters']['pending']);
        $this->assertTrue($ctx['counters']['complete']);
        $this->assertEquals('complete', $ctx['status']);
    }

    public function test_accepted_plus_scrap_cannot_exceed_order_qty(): void
    {
        $this->checker();
        $po = $this->po([['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 10]]);
        $token = $po['line_items'][0]['article_qr_token'];

        $this->scan($token, 8, 0, 0)->assertStatus(201);
        $this->scan($token, 5, 0, 0)->assertStatus(422); // 8 + 5 > 10
        $this->assertEquals(8, PoLineItem::where('article_qr_token', $token)->first()->counters()['accepted']);
    }

    public function test_scan_requires_valid_checker_and_idempotent_uuid(): void
    {
        $po = $this->po([['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 10]]);
        $token = $po['line_items'][0]['article_qr_token'];

        $this->scan($token, 5)->assertStatus(422); // no checker yet

        $this->checker();
        $payload = ['article_token' => $token, 'department' => 'bagging', 'qc_checker_code' => 'T01',
            'accepted_qty' => 5, 'rework_qty' => 0, 'scrap_qty' => 0, 'client_uuid' => 'art-uuid-1'];
        $this->postJson('/api/article-scans', $payload)->assertStatus(201);
        $this->postJson('/api/article-scans', $payload)->assertStatus(200);
        $this->assertDatabaseCount('article_scans', 1);
        $this->assertEquals(1, ArticleScan::count());
    }

    public function test_deactivated_checker_blocked_and_breakdown_present(): void
    {
        $c = $this->checker();
        $po = $this->po([['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 10]]);
        $token = $po['line_items'][0]['article_qr_token'];

        $this->actingAs(User::factory()->create(), 'sanctum');
        $this->patchJson("/api/checkers/{$c->id}", ['active' => false])->assertOk();
        $this->scan($token, 5)->assertStatus(422);

        $this->assertDatabaseCount('article_scans', 0);
    }

    public function test_article_scan_resolves_via_unified_scan_route(): void
    {
        $this->checker();
        $po = $this->po([['article_no' => 'A101', 'bag_size' => '25kg', 'order_qty' => 10]]);
        $token = $po['line_items'][0]['article_qr_token'];

        $scan = $this->getJson("/api/scan/{$token}")->assertOk()->json();
        $this->assertEquals('article', $scan['type']);
        $this->assertEquals('A101', $scan['order']['article_no']);
    }
}
