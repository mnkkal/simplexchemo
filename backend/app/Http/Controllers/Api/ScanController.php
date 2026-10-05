<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pallet;
use App\Models\PoLineItem;
use App\Models\Unit;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    /**
     * Single scanning flow: GET /api/scan/{token}.
     * Resolves unit QR vs pallet QR and renders the appropriate view.
     * Public callers get a redacted trace; staff (?staff=1 with auth) get full history.
     */
    public function show(Request $request, string $token)
    {
        // New flow first: 1 QR per article number.
        $line = PoLineItem::where('article_qr_token', $token)->with(['purchaseOrder', 'scans' => fn ($q) => $q->orderBy('id')])->first();
        if ($line) {
            $isStaff = $request->boolean('staff') || $request->user() !== null;
            $counters = $line->counters();

            if (!$isStaff) {
                return response()->json([
                    'type' => 'article',
                    'order' => [
                        'customer_name' => $line->purchaseOrder->customer_name,
                        'purchase_order_no' => $line->purchaseOrder->purchase_order_no,
                        'article_no' => $line->article_no,
                        'bag_size' => $line->bag_size,
                        'order_qty' => $line->order_qty,
                    ],
                    'qc_passed' => $line->status === 'complete',
                    'status' => $line->status,
                    'counters' => $counters,
                ]);
            }

            return response()->json([
                'type' => 'article',
                'line_item' => $line,
                'purchase_order' => $line->purchaseOrder,
                'counters' => $counters,
                'status' => $line->status,
                'history' => $line->scans,
            ]);
        }

        $unit = Unit::where('unit_qr_token', $token)->with(['order', 'qcRounds' => fn ($q) => $q->orderBy('round_type')->orderBy('attempt_number')])->first();
        if ($unit) {
            $isStaff = $request->boolean('staff') || $request->user() !== null;

            $prod = $unit->latestRound('production');
            $air = $unit->latestRound('air_wash');

            if (!$isStaff) {
                // Public unit scan view: product/order info + pass confirmation only.
                return response()->json([
                    'type' => 'unit',
                    'order' => [
                        'customer_name' => $unit->order->customer_name,
                        'purchase_order_no' => $unit->order->purchase_order_no,
                        'article_no' => $unit->order->article_no,
                        'bag_size' => $unit->order->bag_size,
                    ],
                    'qc_passed' => $unit->status === 'passed',
                    'production_passed' => $prod && $prod->remark === 'pass',
                    'air_wash_passed' => $air && $air->remark === 'pass',
                    'status' => $unit->status,
                ]);
            }

            return response()->json([
                'type' => 'unit',
                'unit' => $unit,
                'order' => $unit->order,
                'current_round' => $unit->currentRound(),
                'rounds' => $unit->qcRounds,
            ]);
        }

        $pallet = Pallet::where('pallet_qr_token', $token)->with(['units.qcRounds', 'articleLines.scans', 'articleLines.purchaseOrder'])->first();
        if ($pallet) {
            $isStaff = $request->boolean('staff') || $request->user() !== null;

            $unitIds = $pallet->units->pluck('id');
            $passed = $pallet->units->where('status', 'passed')->count();

            // New article flow: every packed article with order details,
            // both QC levels, and (staff) full scan history — plus a
            // per-serial unit summary (which seq. no. tested by whom).
            $lines = $pallet->articleLines->map(function ($l) use ($isStaff) {
                $c = $l->counters();
                $row = [
                    'article_no' => $l->article_no,
                    'bag_size' => $l->bag_size,
                    'order_qty' => $l->order_qty,
                    'packed_qty' => (int) ($l->pivot->qty ?? 0),
                    'purchase_order_no' => $l->purchaseOrder?->purchase_order_no,
                    'customer_name' => $l->purchaseOrder?->customer_name,
                    'qc' => $c['qc'],
                    'airwash' => $c['airwash'],
                    'complete' => $c['complete'],
                    'units' => $this->serialSummary($l, $isStaff),
                ];
                if ($isStaff) {
                    $row['history'] = $l->scans;
                }

                return $row;
            })->values();

            $allPassed = $lines->isNotEmpty()
                ? $lines->every(fn ($l) => $l['complete'])
                : ($passed === $pallet->units->count() && $pallet->units->count() > 0);

            $payload = [
                'type' => 'pallet',
                'pallet' => $isStaff ? $pallet : [
                    'customer_name' => $pallet->customer_name,
                    'purchase_order_no' => $pallet->purchase_order_no,
                    'article_no' => $pallet->article_no,
                    'bag_size' => $pallet->bag_size,
                    'pallet_no' => $pallet->pallet_no,
                    'packing_date' => $pallet->packing_date,
                    'packing_shift' => $pallet->packing_shift,
                    'pallet_pcs' => $pallet->pallet_pcs,
                ],
                'unit_count' => $pallet->units->count(),
                'passed_count' => $passed,
                'all_passed' => $allPassed,
                'lines' => $lines,
            ];

            if ($isStaff) {
                $payload['unit_ids'] = $unitIds;
                $payload['units'] = $pallet->units;
            }

            return response()->json($payload);
        }

        return response()->json(['message' => 'QR token not found'], 404);
    }

    /**
     * Per-unit summary for one article: every seq. no. 1..pool with its
     * testers and state (latest row wins per serial). Full range for sane
     * pools; scanned-only beyond 2000 units.
     */
    private function serialSummary(PoLineItem $line, bool $isStaff): array
    {
        $pool = $line->poolQty();
        $bySerial = $line->scans->groupBy('serial_no');
        $scanned = $bySerial->keys()->filter(fn ($s) => $s !== null && $s !== '')->map(fn ($s) => (int) $s)->all();
        $range = $pool <= 2000 ? range(1, max(1, $pool)) : [];
        $serials = collect(array_merge($range, $scanned))->unique()->sort()->values();

        return $serials->map(function ($s) use ($bySerial, $isStaff) {
            $rows = $bySerial->has($s) ? $bySerial[$s]->values() : collect();
            $qcAcc = (int) $rows->where('stage', 'qc')->sum('accepted_qty');
            $qcScr = (int) $rows->where('stage', 'qc')->sum('scrap_qty');
            $awAcc = (int) $rows->where('stage', 'airwash')->sum('accepted_qty');
            $awScr = (int) $rows->where('stage', 'airwash')->sum('scrap_qty');
            $status = $rows->isEmpty() ? 'pending'
                : (($qcScr + $awScr) > 0 ? 'scrap'
                : (($qcAcc + $awAcc) > 0 ? 'pass' : 'in_progress'));
            $unit = [
                'serial' => $s,
                'status' => $status,
                'qc_by' => $rows->where('stage', 'qc')->map(fn ($r) => $r->qc_checker_name ?: $r->qc_checker_code)->filter()->unique()->values(),
                'aw_by' => $rows->where('stage', 'airwash')->map(fn ($r) => $r->air_wash_checker_name ?: $r->air_wash_checker_code)->filter()->unique()->values(),
            ];
            if ($isStaff) {
                $unit['rows'] = $rows;
            }

            return $unit;
        })->values()->all();
    }
}
