<?php

namespace Tests\Feature;

use App\Models\QcChecker;
use App\Models\QcRound;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Automated coverage for QC_Test_Cases.csv (TC-001..TC-048, API-testable subset).
 * Offline/PWA shell cases (TC-038..TC-042) and camera/print cases are manual.
 */
class QcWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function checker(string $code = 'QC01'): QcChecker
    {
        return QcChecker::create(['name' => 'Ravi', 'checker_code' => $code]);
    }

    private function order(int $qty = 10, array $over = []): array
    {
        $res = $this->postJson('/api/orders', array_merge([
            'customer_name' => 'Simplex',
            'purchase_order_no' => 'PO-100',
            'article_no' => 'ART-9',
            'bag_size' => '50kg',
            'order_qty' => $qty,
        ], $over));
        $res->assertStatus(201);

        return $res->json();
    }

    private function tokens(int $orderId): array
    {
        return $this->getJson("/api/orders/{$orderId}")->json('units.*.unit_qr_token');
    }

    private function qc(string $token, string $round, string $remark, string $code = 'QC01', array $extra = [])
    {
        return $this->postJson('/api/qc', array_merge([
            'unit_token' => $token,
            'round_type' => $round,
            'remark' => $remark,
            'qc_checker_code' => $code,
        ], $extra));
    }

    private function passUnit(string $token, string $code = 'QC01'): void
    {
        $this->qc($token, 'production', 'pass', $code)->assertStatus(201);
        $this->qc($token, 'air_wash', 'pass', $code)->assertStatus(201);
    }

    private function staff(): User
    {
        return User::factory()->create();
    }

    // ---- Admin auth (password protection) ----

    public function test_admin_login_issues_token_and_wrong_password_fails(): void
    {
        User::factory()->create(['email' => 'admin@factory.local', 'password' => bcrypt('password')]);

        $ok = $this->postJson('/api/login', ['email' => 'admin@factory.local', 'password' => 'password']);
        $ok->assertOk()->assertJsonStructure(['token', 'user']);

        $bad = $this->postJson('/api/login', ['email' => 'admin@factory.local', 'password' => 'wrong']);
        $bad->assertStatus(422);
    }

    public function test_admin_endpoints_require_password_login(): void
    {
        $this->getJson('/api/dashboard')->assertStatus(401);
        $this->getJson('/api/export')->assertStatus(401);
        $this->getJson('/api/checkers')->assertStatus(401);
        $this->postJson('/api/checkers', ['name' => 'X', 'checker_code' => 'QX'])->assertStatus(401);

        $this->actingAs($this->staff(), 'sanctum');
        $this->getJson('/api/dashboard')->assertOk();
        $this->getJson('/api/export')->assertOk();
        $this->getJson('/api/checkers')->assertOk();

        // Floor endpoints stay public (checker-code identity, no password).
        $this->getJson('/api/scan/anything')->assertStatus(404); // not 401
    }

    // ---- TC-001..TC-011 Order & Unit QR ----

    public function test_tc001_order_qty_10_creates_10_unique_units(): void
    {
        $o = $this->order(10);
        $units = $this->getJson("/api/orders/{$o['id']}")->json('units');
        $this->assertCount(10, $units);
        $this->assertCount(10, array_unique(array_column($units, 'unit_qr_token')));
    }

    public function test_tc002_tokens_unique_across_orders(): void
    {
        $a = $this->order(10);
        $b = $this->order(50, ['purchase_order_no' => 'PO-101']);
        $all = array_merge($this->tokens($a['id']), $this->tokens($b['id']));
        $this->assertCount(60, $all);
        $this->assertCount(60, array_unique($all));
    }

    public function test_tc003_tokens_are_random_32char(): void
    {
        $o = $this->order(20);
        foreach ($this->tokens($o['id']) as $t) {
            $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{32}$/', $t);
        }
    }

    public function test_tc004_qty_1_creates_exactly_one_unit(): void
    {
        $o = $this->order(1);
        $this->assertCount(1, $this->tokens($o['id']));
    }

    public function test_tc005_tc006_tc007_invalid_qty_rejected(): void
    {
        foreach ([0, -5, 'abc'] as $qty) {
            $this->postJson('/api/orders', [
                'customer_name' => 'X', 'purchase_order_no' => 'P', 'article_no' => 'A',
                'bag_size' => 'S', 'order_qty' => $qty,
            ])->assertStatus(422);
        }
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('units', 0);
    }

    public function test_tc008_qty_5000_generates_all_units(): void
    {
        $o = $this->order(5000);
        $count = Unit::where('order_id', $o['id'])->count();
        $this->assertEquals(5000, $count);
        $this->assertEquals(5000, Unit::where('order_id', $o['id'])->distinct()->count('unit_qr_token'));
    }

    public function test_tc009_order_qty_cannot_be_edited(): void
    {
        $o = $this->order(10);
        // No update route exists: qty edits are structurally blocked
        // (405 where the URI exists for another method, 404 elsewhere).
        $this->putJson("/api/orders/{$o['id']}", ['order_qty' => 15])->assertStatus(405);
        $this->patchJson("/api/orders/{$o['id']}", ['order_qty' => 15])->assertStatus(405);
        $this->assertCount(10, $this->tokens($o['id']));
    }

    public function test_tc010_reprint_does_not_regenerate_token(): void
    {
        $o = $this->order(2);
        $before = $this->tokens($o['id']);
        $after = $this->tokens($o['id']); // reprint = re-read same token
        $this->assertEquals($before, $after);

        $this->actingAs($this->staff(), 'sanctum');
        $this->postJson("/api/orders/{$o['id']}/printed")->assertOk();
        $this->assertEquals($before, $this->tokens($o['id']));
    }

    public function test_tc011_fresh_unit_scans_as_pending(): void
    {
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $scan = $this->getJson("/api/scan/{$t}")->assertOk()->json();
        $this->assertEquals('unit', $scan['type']);
        $this->assertFalse($scan['qc_passed']);
        $ctx = $this->getJson("/api/qc/{$t}")->assertOk()->json();
        $this->assertEquals('pending', $ctx['unit']['status']);
    }

    // ---- TC-012..TC-018 Round 1 ----

    public function test_tc012_round1_pass_opens_round2(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'pass')->assertStatus(201);
        $ctx = $this->getJson("/api/qc/{$t}")->json();
        $this->assertEquals('air_wash', $ctx['current_round']);
    }

    public function test_tc013_round1_repair_stays_in_round1(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'repair', 'QC01', ['notes' => 'stain'])->assertStatus(201);
        $this->assertEquals('production', $this->getJson("/api/qc/{$t}")->json('current_round'));
    }

    public function test_tc014_round1_reject_does_not_advance(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'reject')->assertStatus(201);
        $ctx = $this->getJson("/api/qc/{$t}")->json();
        $this->assertEquals('production', $ctx['current_round']);
        $this->assertNotEquals('passed', $ctx['unit']['status']);
    }

    public function test_tc015_retest_appends_new_attempt(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'repair')->assertStatus(201);
        $this->qc($t, 'production', 'pass')->assertStatus(201);
        $unit = Unit::where('unit_qr_token', $t)->first();
        $attempts = $unit->qcRounds()->where('round_type', 'production')->orderBy('attempt_number')->get();
        $this->assertEquals([1, 2], $attempts->pluck('attempt_number')->all());
        $this->assertEquals(['repair', 'pass'], $attempts->pluck('remark')->all());
    }

    public function test_tc016_tc044_blank_checker_code_blocked(): void
    {
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->postJson('/api/qc', [
            'unit_token' => $t, 'round_type' => 'production', 'remark' => 'pass', 'qc_checker_code' => '',
        ])->assertStatus(422);
        $this->assertDatabaseCount('qc_rounds', 0);
    }

    public function test_tc017_unknown_checker_code_rejected(): void
    {
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'pass', 'ZZZ999')->assertStatus(422);
        $this->assertDatabaseCount('qc_rounds', 0);
    }

    public function test_tc018_round2_unit_presents_round2(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'pass')->assertStatus(201);
        $this->assertEquals('air_wash', $this->getJson("/api/qc/{$t}")->json('current_round'));
    }

    // ---- TC-019..TC-022 Round 2 ----

    public function test_tc019_round2_pass_marks_unit_passed(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->passUnit($t);
        $this->assertEquals('passed', $this->getJson("/api/qc/{$t}")->json('unit.status'));
    }

    public function test_tc020_round2_blocked_before_round1_pass(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'air_wash', 'pass')->assertStatus(422); // pending
        $this->qc($t, 'production', 'repair')->assertStatus(201);
        $this->qc($t, 'air_wash', 'pass')->assertStatus(422); // repair, not pass
        $this->assertDatabaseMissing('qc_rounds', ['round_type' => 'air_wash']);
    }

    public function test_tc021_round2_repair_keeps_round1_pass(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'pass')->assertStatus(201);
        $this->qc($t, 'air_wash', 'repair')->assertStatus(201);
        $unit = Unit::where('unit_qr_token', $t)->first();
        $this->assertEquals('pass', $unit->latestRound('production')->remark);
        $this->assertNotEquals('passed', $unit->refreshStatus());
    }

    public function test_tc022_final_pass_after_repair_keeps_history(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'pass')->assertStatus(201);
        $this->qc($t, 'air_wash', 'repair')->assertStatus(201);
        $this->qc($t, 'air_wash', 'pass')->assertStatus(201);
        $unit = Unit::where('unit_qr_token', $t)->first();
        $this->assertEquals('passed', $unit->status);
        $this->assertEquals(
            ['repair', 'pass'],
            $unit->qcRounds()->where('round_type', 'air_wash')->orderBy('attempt_number')->pluck('remark')->all()
        );
    }

    // ---- TC-023..TC-031 Pallets ----

    private function passedTokens(int $qty = 3): array
    {
        $this->checker();
        $o = $this->order($qty);
        $tokens = $this->tokens($o['id']);
        foreach ($tokens as $t) {
            $this->passUnit($t);
        }

        return $tokens;
    }

    private function pack(array $tokens, array $over = []): mixed
    {
        return $this->postJson('/api/pallets', array_merge([
            'unit_tokens' => $tokens,
            'pallet_no' => 'P-1',
            'packing_date' => '2026-09-12',
            'packing_shift' => 'B',
        ], $over));
    }

    public function test_tc023_pallet_qr_is_new_and_distinct(): void
    {
        $tokens = $this->passedTokens(3);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9]{32}$/', $p['pallet_qr_token']);
        $this->assertNotContains($p['pallet_qr_token'], $tokens);
    }

    public function test_tc024_tc025_pallet_scan_shows_order_info_and_shift(): void
    {
        $tokens = $this->passedTokens(2);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $scan = $this->getJson("/api/scan/{$p['pallet_qr_token']}")->assertOk()->json();
        $this->assertEquals('pallet', $scan['type']);
        $this->assertEquals('Simplex', $scan['pallet']['customer_name']);
        $this->assertEquals('PO-100', $scan['pallet']['purchase_order_no']);
        $this->assertEquals('ART-9', $scan['pallet']['article_no']);
        $this->assertEquals('B', $scan['pallet']['packing_shift']);
        $this->assertStringStartsWith('2026-09-12', (string) $scan['pallet']['packing_date']);
    }

    public function test_tc026_non_passed_unit_rejected_from_pallet(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']); // pending
        $this->pack([$t])->assertStatus(422);
    }

    public function test_tc027_unit_cannot_join_two_pallets(): void
    {
        $tokens = $this->passedTokens(2);
        $this->pack([$tokens[0]], ['pallet_no' => 'P-A'])->assertStatus(201);
        $this->pack($tokens, ['pallet_no' => 'P-B'])->assertStatus(422);
    }

    public function test_tc028_mixed_orders_rejected(): void
    {
        $this->checker();
        $a = $this->order(1);
        $b = $this->order(1, ['purchase_order_no' => 'PO-200']);
        $ta = $this->tokens($a['id']);
        $tb = $this->tokens($b['id']);
        foreach (array_merge($ta, $tb) as $t) {
            $this->passUnit($t);
        }
        $this->pack(array_merge($ta, $tb))->assertStatus(422);
    }

    public function test_tc029_pallet_save_is_idempotent(): void
    {
        $tokens = $this->passedTokens(2);
        $uuid = 'pack-session-123';
        $first = $this->pack($tokens, ['client_uuid' => $uuid])->assertStatus(201)->json();
        $second = $this->pack($tokens, ['client_uuid' => $uuid])->assertStatus(200)->json();
        $this->assertEquals($first['pallet_qr_token'], $second['pallet_qr_token']);
        $this->assertDatabaseCount('pallets', 1);
    }

    public function test_tc030_single_unit_pallet_allowed(): void
    {
        $tokens = $this->passedTokens(1);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $this->assertEquals(1, $p['pallet_pcs']);
    }

    public function test_tc031_pallet_token_stable_on_reprint(): void
    {
        $tokens = $this->passedTokens(2);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $again = $this->getJson("/api/pallets/{$p['id']}")->assertOk()->json();
        $this->assertEquals($p['pallet_qr_token'], $again['pallet_qr_token']);
    }

    // ---- TC-032..TC-037 Scan & trace ----

    public function test_tc032_public_unit_scan_is_redacted(): void
    {
        $tokens = $this->passedTokens(1);
        $scan = $this->getJson("/api/scan/{$tokens[0]}")->assertOk()->json();
        $this->assertTrue($scan['qc_passed']);
        $flat = json_encode($scan);
        $this->assertStringNotContainsString('QC01', $flat);
        $this->assertStringNotContainsString('Ravi', $flat);
        $this->assertArrayNotHasKey('rounds', $scan);
        $this->assertArrayNotHasKey('unit', $scan);
    }

    public function test_tc033_public_pallet_scan_is_aggregate(): void
    {
        $tokens = $this->passedTokens(3);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $scan = $this->getJson("/api/scan/{$p['pallet_qr_token']}")->assertOk()->json();
        $this->assertTrue($scan['all_passed']);
        $this->assertEquals(3, $scan['unit_count']);
        $this->assertEquals(3, $scan['passed_count']);
        $this->assertArrayNotHasKey('units', $scan);
    }

    public function test_tc034_staff_scan_shows_full_history(): void
    {
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $this->qc($t, 'production', 'repair', 'QC01', ['notes' => 'loose stitch'])->assertStatus(201);
        $this->qc($t, 'production', 'pass')->assertStatus(201);

        $this->actingAs($this->staff(), 'sanctum');
        $scan = $this->getJson("/api/scan/{$t}?staff=1")->assertOk()->json();
        $this->assertEquals('unit', $scan['type']);
        $this->assertCount(2, $scan['rounds']);
        $this->assertEquals('QC01', $scan['rounds'][0]['qc_checker_code']);
    }

    public function test_tc035_invalid_token_is_404(): void
    {
        $this->getJson('/api/scan/NOPE-NOT-A-TOKEN-123')->assertStatus(404);
    }

    public function test_tc036_pending_unit_not_shown_as_passed(): void
    {
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $scan = $this->getJson("/api/scan/{$t}")->assertOk()->json();
        $this->assertFalse($scan['qc_passed']);
        $this->assertFalse($scan['production_passed']);
        $this->assertFalse($scan['air_wash_passed']);
    }

    public function test_tc037_same_pattern_distinguishes_unit_vs_pallet(): void
    {
        $tokens = $this->passedTokens(1);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        $this->assertEquals('unit', $this->getJson("/api/scan/{$tokens[0]}")->json('type'));
        $this->assertEquals('pallet', $this->getJson("/api/scan/{$p['pallet_qr_token']}")->json('type'));
    }

    // ---- TC-043..TC-048 identity, security, export ----

    public function test_tc043_verify_stores_device_token(): void
    {
        $this->checker();
        $res = $this->postJson('/api/checkers/verify', ['checker_code' => 'QC01'])->assertOk()->json();
        $this->assertNotEmpty($res['device_token']);
        $this->assertNotEmpty(QcChecker::where('checker_code', 'QC01')->first()->device_token);
    }

    public function test_tc045_deactivated_checker_is_blocked(): void
    {
        $c = $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);

        $this->actingAs($this->staff(), 'sanctum');
        $this->patchJson("/api/checkers/{$c->id}", ['active' => false])->assertOk();

        $this->postJson('/api/checkers/verify', ['checker_code' => 'QC01'])->assertStatus(422);
        $this->qc($t, 'production', 'pass')->assertStatus(422);
        $this->assertDatabaseCount('qc_rounds', 0);
    }

    public function test_tc046_tokens_are_not_enumerable(): void
    {
        $this->getJson('/api/scan/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')->assertStatus(404);
        $this->getJson('/api/scan/00000000000000000000000000000000')->assertStatus(404);
    }

    public function test_tc047_public_endpoints_expose_no_internals(): void
    {
        $tokens = $this->passedTokens(1);
        $p = $this->pack($tokens)->assertStatus(201)->json();
        foreach (["/api/scan/{$tokens[0]}", "/api/scan/{$p['pallet_qr_token']}"] as $url) {
            $flat = json_encode($this->getJson($url)->assertOk()->json());
            $this->assertStringNotContainsString('qc_checker_code', $flat);
            $this->assertStringNotContainsString('qc_checker_name', $flat);
            $this->assertStringNotContainsString('notes', $flat);
        }
    }

    public function test_tc048_export_matches_live_data(): void
    {
        $tokens = $this->passedTokens(2);
        $this->pack($tokens)->assertStatus(201);

        $this->actingAs($this->staff(), 'sanctum');
        $exp = $this->getJson('/api/export')->assertOk()->json();
        $this->assertCount(Unit::count(), $exp['order_barcode']);
        $this->assertCount(QcRound::count(), $exp['production_qc']);
        $this->assertEquals(1, count($exp['pallet_scanner']));
        $this->assertEquals(2, $exp['pallet_scanner'][0]['pallet_pcs']);
    }

    public function test_qc_offline_retry_with_same_uuid_is_idempotent(): void
    {
        // TC-040 (server side): retried sync with same client_uuid creates one row.
        $this->checker();
        $o = $this->order(1);
        [$t] = $this->tokens($o['id']);
        $payload = ['unit_token' => $t, 'round_type' => 'production', 'remark' => 'pass',
            'qc_checker_code' => 'QC01', 'client_uuid' => 'offline-uuid-1'];
        $this->postJson('/api/qc', $payload)->assertStatus(201);
        $this->postJson('/api/qc', $payload)->assertStatus(200);
        $this->assertDatabaseCount('qc_rounds', 1);
    }
}
