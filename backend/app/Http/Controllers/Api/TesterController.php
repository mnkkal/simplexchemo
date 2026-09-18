<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArticleScan;
use App\Models\PoLineItem;
use App\Models\QcChecker;
use Illuminate\Http\Request;

/**
 * Tester self-service (floor role, no staff login).
 * Auth is the device token issued at tester login: the app sends it as
 * X-Device-Token and it must match the stored token for that checker code.
 * Testers can only ever see their OWN work — never the admin panel.
 */
class TesterController extends Controller
{
    public function work(Request $request, string $code)
    {
        $checker = QcChecker::where('checker_code', $code)->firstOrFail();

        $token = (string) ($request->header('X-Device-Token') ?? $request->input('device_token', ''));
        if ($token === '' || $checker->device_token === null || !hash_equals($checker->device_token, $token)) {
            return response()->json(['message' => 'Tester session invalid — log in again'], 401);
        }

        $scans = ArticleScan::with('lineItem.purchaseOrder')
            ->where(function ($q) use ($checker) {
                // Stage-aware ownership: QC rows belong to their QC tester,
                // Air-wash rows to their air-wash tester.
                $q->where(fn ($q2) => $q2->where('stage', 'qc')->where('qc_checker_code', $checker->checker_code))
                    ->orWhere(fn ($q2) => $q2->where('stage', 'airwash')->where('air_wash_checker_code', $checker->checker_code));
            })
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        $byArticle = $scans->groupBy(fn ($s) => $s->lineItem?->purchaseOrder?->purchase_order_no.' | '.$s->lineItem?->article_no)
            ->map(fn ($rows, $key) => [
                'order' => $key,
                'scans' => $rows->count(),
                'accepted' => (int) $rows->sum('accepted_qty'),
                'rework' => (int) $rows->sum('rework_qty'),
                'scrap' => (int) $rows->sum('scrap_qty'),
            ])->values();

        return response()->json([
            'profile' => [
                'name' => $checker->name,
                'checker_code' => $checker->checker_code,
                'production_line_no' => $checker->production_line_no,
                'production_shift' => $checker->production_shift,
                'active' => (bool) $checker->active,
            ],
            // Work queue: articles still pending. Rows on the tester's assigned
            // line first (their work), then other/unstarted lines.
            'queue' => $this->queue($checker),
            'totals' => [
                'scans' => $scans->count(),
                'as_qc' => $scans->where('stage', 'qc')->count() + $scans->whereNull('stage')->count(),
                'as_air_wash' => $scans->where('stage', 'airwash')->count(),
                'accepted' => (int) $scans->sum('accepted_qty'),
                'rework' => (int) $scans->sum('rework_qty'),
                'scrap' => (int) $scans->sum('scrap_qty'),
            ],
            'by_article' => $byArticle,
            'recent' => $scans->map(fn ($s) => [
                'id' => $s->id,
                'stage' => $s->stage ?? 'qc',
                'production_date' => $s->production_date,
                'purchase_order_no' => $s->lineItem?->purchaseOrder?->purchase_order_no,
                'article_no' => $s->lineItem?->article_no,
                'department' => $s->department,
                'role' => ($s->stage ?? 'qc') === 'airwash' ? 'Air-wash' : 'QC',
                'manufacturing_line_no' => $s->manufacturing_line_no,
                'production_shift' => $s->production_shift,
                'accepted_qty' => $s->accepted_qty,
                'rework_qty' => $s->rework_qty,
                'scrap_qty' => $s->scrap_qty,
                'notes' => $s->notes,
                'tested_at' => $s->tested_at,
            ])->values(),
        ]);
    }

    private function queue(QcChecker $checker): array
    {
        $lines = PoLineItem::with(['purchaseOrder', 'scans' => fn ($q) => $q->orderByDesc('id')->limit(1)])
            ->where('status', '!=', 'complete')
            ->orderBy('id')
            ->limit(100)
            ->get();

        // Strict assignment: a tester sees ONLY articles assigned to them
        // (at either level). Unassigned work is invisible until staff assigns.
        $mine = [];
        foreach ($lines as $line) {
            if ($line->assigned_qc_code !== $checker->checker_code
                && $line->assigned_aw_code !== $checker->checker_code) {
                continue;
            }
            $lastLine = $line->scans->first()?->manufacturing_line_no;
            $mine[] = [
                'line_item_id' => $line->id,
                'purchase_order_no' => $line->purchaseOrder?->purchase_order_no,
                'customer_name' => $line->purchaseOrder?->customer_name,
                'article_no' => $line->article_no,
                'bag_size' => $line->bag_size,
                'order_qty' => $line->order_qty,
                'status' => $line->status,
                'counters' => $line->counters(),
                'article_qr_token' => $line->article_qr_token,
                'last_line' => $lastLine,
                'mine' => true,
                'assigned_qc_code' => $line->assigned_qc_code,
                'assigned_aw_code' => $line->assigned_aw_code,
            ];
        }

        return ['mine' => $mine, 'other' => []];
    }
}
