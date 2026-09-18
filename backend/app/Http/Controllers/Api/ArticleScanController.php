<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArticleScan;
use App\Models\PoLineItem;
use App\Models\QcChecker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ArticleScanController extends Controller
{
    /** QC entry context: line item + PO + live counters + attempt history. */
    public function context(Request $request, string $token)
    {
        $line = PoLineItem::where('article_qr_token', $token)->with(['purchaseOrder', 'scans' => fn ($q) => $q->orderBy('id')])->firstOrFail();

        // Tester isolation (§7): staff sees everything; a tester sees only
        // their own rows; anonymous sees meta + counters only. Counters stay
        // global — the verdict math needs the true pending balance.
        [$staff, $checker] = $this->resolveViewer($request);
        $history = $line->scans;
        $byChecker = $this->breakdown($line, 'qc_checker_code', 'qc');
        $byAirwash = $this->breakdown($line, 'air_wash_checker_code', 'airwash');
        // "By line" follows the open level (the floor's current work).
        $byLine = $this->breakdown($line, 'manufacturing_line_no', $line->openStage() ?? 'airwash');
        if (!$staff) {
            if ($checker) {
                $history = $history->filter(fn ($s) => $s->qc_checker_code === $checker->checker_code
                    || $s->air_wash_checker_code === $checker->checker_code)->values();
                $byChecker = array_values(array_filter($byChecker, fn ($r) => $r['key'] === $checker->checker_code));
                $byAirwash = array_values(array_filter($byAirwash, fn ($r) => $r['key'] === $checker->checker_code));
            } else {
                $history = [];
                $byChecker = [];
                $byAirwash = [];
            }
        }

        return response()->json([
            'type' => 'article',
            'line_item' => $line,
            'purchase_order' => $line->purchaseOrder,
            'counters' => $line->counters(),
            'status' => $line->status,
            'history' => $history,
            'by_checker' => $byChecker,
            'by_airwash' => $byAirwash,
            'by_line' => $byLine,
            // Active testers for the QC/air-wash dropdowns (public: codes are
            // floor identity, not secrets — same list Admin → Testers manages).
            'testers' => QcChecker::where('active', true)->orderBy('name')
                ->get(['id', 'name', 'checker_code', 'production_line_no', 'production_shift']),
        ]);
    }

    /**
     * Record one QC scan: accepted + rework (re-queue) + scrap (terminal).
     * Always appends — rework lots are re-scanned until the level target is
     * covered. The level is chosen by the tester (QC and Air-wash run in
     * parallel); it defaults to the first incomplete level.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'article_token' => 'required|string',
            'department' => 'required|string|max:50',
            'stage' => 'nullable|in:qc,airwash',
            'qc_checker_code' => 'required|string|max:50',
            'manufacturing_line_no' => 'nullable|string|max:50',
            'production_shift' => 'nullable|string|max:50',
            // Secondary details logged at internal scan of the supplier label.
            'production_date' => 'nullable|date',
            'production_unit_no' => 'nullable|string|max:50',
            'production_supervisor_name' => 'nullable|string|max:255',
            'air_wash_checker_code' => 'nullable|string|max:50',
            'accepted_qty' => 'required|integer|min:0|max:100000',
            'rework_qty' => 'required|integer|min:0|max:100000',
            'scrap_qty' => 'required|integer|min:0|max:100000',
            'notes' => 'nullable|string',
            'client_uuid' => 'nullable|string|max:64',
            'tested_at' => 'nullable|date',
        ]);

        // Two-role workflow: an admin may scan only to attach secondary
        // production details (zero quantities), while the tester records the
        // Pass/Repair/Reject verdict. A row is junk only if it carries
        // neither quantities nor any production detail.
        $hasDetails = !empty($data['manufacturing_line_no'])
            || !empty($data['production_shift'])
            || !empty($data['production_date'])
            || !empty($data['production_unit_no'])
            || !empty($data['production_supervisor_name'])
            || !empty($data['air_wash_checker_code'])
            || !empty($data['notes']);
        if (($data['accepted_qty'] + $data['rework_qty'] + $data['scrap_qty']) < 1 && !$hasDetails) {
            return response()->json(['message' => 'Enter quantities or production details'], 422);
        }

        if (!empty($data['client_uuid'])) {
            $existing = ArticleScan::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                $line = $existing->lineItem;
                return response()->json(array_merge(
                    $existing->load('lineItem')->toArray(),
                    ['counters' => $line->counters(), 'status' => $line->status]
                ), 200);
            }
        }

        $checker = QcChecker::where('checker_code', $data['qc_checker_code'])->where('active', true)->first();
        if (!$checker) {
            return response()->json(['message' => 'Invalid checker code '.$data['qc_checker_code'].' — create it in Admin → Testers first'], 422);
        }

        // Air-wash QC checker must also be a valid active tester when provided.
        $airWash = null;
        if (!empty($data['air_wash_checker_code'])) {
            $airWash = QcChecker::where('checker_code', $data['air_wash_checker_code'])->where('active', true)->first();
            if (!$airWash) {
                return response()->json(['message' => 'Invalid air-wash checker code '.$data['air_wash_checker_code'].' — create it in Admin → Testers first'], 422);
            }
        }

        $line = PoLineItem::where('article_qr_token', $data['article_token'])->firstOrFail();

        return DB::transaction(function () use ($data, $line, $checker, $airWash) {
            // Serialize concurrent tester submissions on this article: lock
            // the row before reading sums so two testers can't both consume
            // the same pending balance (double-count overshoot).
            $line = PoLineItem::whereKey($line->id)->lockForUpdate()->firstOrFail();

            // Two levels run in parallel, each chosen by the tester; default
            // is the first incomplete level. Air-wash covers the pool minus
            // QC-scrapped units (dead bags never reach air-wash).
            $stage = $data['stage'] ?? $line->openStage();
            if ($stage === null || !in_array($stage, ['qc', 'airwash'], true)) {
                abort(422, 'Article complete at both levels (QC + Air-wash). Use Edit to correct a row.');
            }
            $c = $line->stageCounters($stage);
            $accepted = (int) $line->scans()->where('stage', $stage)->sum('accepted_qty');
            $scrap = (int) $line->scans()->where('stage', $stage)->sum('scrap_qty');

            // Rework is re-queueable so it never consumes the cap; accepted+scrap must fit the level target.
            $target = $c['pending'] + $accepted + $scrap;
            if ($accepted + $scrap + $data['accepted_qty'] + $data['scrap_qty'] > $target) {
                abort(422, 'Accepted + scrap would exceed '.($stage === 'qc' ? 'QC' : 'Air-wash').' target '.$target.' (already accepted '.$accepted.', scrap '.$scrap.')');
            }

            // Attribution: QC rows carry the submitter as QC tester (+ optional
            // air-wash code from the details form). Air-wash rows carry the
            // submitter as the air-wash tester (qc code mirrors the recorder;
            // qc_checker_code is NOT NULL, and stage keeps the levels apart).
            $scan = ArticleScan::create([
                'po_line_item_id' => $line->id,
                'department' => $data['department'],
                'stage' => $stage,
                'qc_checker_code' => $checker->checker_code,
                'qc_checker_name' => $checker->name,
                'manufacturing_line_no' => $data['manufacturing_line_no'] ?? null,
                'production_shift' => $data['production_shift'] ?? null,
                'production_date' => $data['production_date'] ?? now()->toDateString(),
                'production_unit_no' => $data['production_unit_no'] ?? null,
                'production_supervisor_name' => $data['production_supervisor_name'] ?? null,
                'air_wash_checker_code' => $stage === 'airwash' ? $checker->checker_code : $airWash?->checker_code,
                'air_wash_checker_name' => $stage === 'airwash' ? $checker->name : $airWash?->name,
                'accepted_qty' => $data['accepted_qty'],
                'rework_qty' => $data['rework_qty'],
                'scrap_qty' => $data['scrap_qty'],
                'notes' => $data['notes'] ?? null,
                'client_uuid' => $data['client_uuid'] ?? null,
                'tested_at' => $data['tested_at'] ?? now(),
            ]);

            $line->refreshStatus();

            return response()->json(array_merge(
                $scan->load('lineItem')->toArray(),
                ['counters' => $line->counters(), 'status' => $line->status]
            ), 201);
        });
    }

    /**
     * Staff-only correction: edit an existing scan row (e.g. wrong qty or
     * wrong secondary details). Fields come prefilled in the UI, so nothing
     * needs re-entering — change only what's wrong and save.
     * Cap is re-checked against all OTHER scans, then counters refreshed.
     */
    public function update(Request $request, ArticleScan $scan)
    {
        $data = $request->validate([
            'department' => 'sometimes|required|string|max:50',
            'qc_checker_code' => 'sometimes|required|string|max:50',
            'manufacturing_line_no' => 'nullable|string|max:50',
            'production_shift' => 'nullable|string|max:50',
            'production_date' => 'nullable|date',
            'production_unit_no' => 'nullable|string|max:50',
            'production_supervisor_name' => 'nullable|string|max:255',
            'air_wash_checker_code' => 'nullable|string|max:50',
            'accepted_qty' => 'sometimes|required|integer|min:0|max:100000',
            'rework_qty' => 'sometimes|required|integer|min:0|max:100000',
            'scrap_qty' => 'sometimes|required|integer|min:0|max:100000',
            'notes' => 'nullable|string',
        ]);

        $line = $scan->lineItem;

        if (array_key_exists('qc_checker_code', $data)) {
            $checker = QcChecker::where('checker_code', $data['qc_checker_code'])->where('active', true)->first();
            if (!$checker) {
                return response()->json(['message' => 'Invalid checker code '.$data['qc_checker_code'].' — create it in Admin → Testers first'], 422);
            }
            $scan->qc_checker_code = $checker->checker_code;
            $scan->qc_checker_name = $checker->name;
        }

        if (array_key_exists('air_wash_checker_code', $data)) {
            if (empty($data['air_wash_checker_code'])) {
                $scan->air_wash_checker_code = null;
                $scan->air_wash_checker_name = null;
            } else {
                $airWash = QcChecker::where('checker_code', $data['air_wash_checker_code'])->where('active', true)->first();
                if (!$airWash) {
                    return response()->json(['message' => 'Invalid air-wash checker code '.$data['air_wash_checker_code'].' — create it in Admin → Testers first'], 422);
                }
                $scan->air_wash_checker_code = $airWash->checker_code;
                $scan->air_wash_checker_name = $airWash->name;
            }
        }

        foreach (['department', 'manufacturing_line_no', 'production_shift', 'production_date', 'production_unit_no', 'production_supervisor_name', 'notes'] as $f) {
            if (array_key_exists($f, $data)) {
                $scan->{$f} = $data[$f];
            }
        }
        foreach (['accepted_qty', 'rework_qty', 'scrap_qty'] as $f) {
            if (array_key_exists($f, $data)) {
                $scan->{$f} = $data[$f];
            }
        }

        if (($scan->accepted_qty + $scan->rework_qty + $scan->scrap_qty) < 1) {
            return response()->json(['message' => 'Enter at least one quantity greater than zero'], 422);
        }

        // Re-check the cap within this row's level, excluding its old values.
        $otherAccepted = (int) $line->scans()->where('stage', $scan->stage)->where('id', '!=', $scan->id)->sum('accepted_qty');
        $otherScrap = (int) $line->scans()->where('stage', $scan->stage)->where('id', '!=', $scan->id)->sum('scrap_qty');
        if ($otherAccepted + $otherScrap + $scan->accepted_qty + $scan->scrap_qty > $line->order_qty) {
            return response()->json(['message' => 'Accepted + scrap would exceed order qty '.$line->order_qty.' at '.($scan->stage === 'airwash' ? 'Air-wash' : 'QC').' level (other scans already accepted '.$otherAccepted.', scrap '.$otherScrap.')'], 422);
        }

        $scan->save();
        $line->refreshStatus();

        return response()->json(array_merge(
            $scan->load('lineItem')->toArray(),
            ['counters' => $line->counters(), 'status' => $line->status]
        ));
    }

    /**
     * Staff-only: record replacement inflow — fresh units produced for
     * scrapped ones. Enlarges the testable pool at both levels.
     */
    public function addReplacement(Request $request, string $token)
    {
        $data = $request->validate(['qty' => 'required|integer|min:1|max:100000']);
        $line = PoLineItem::where('article_qr_token', $token)->firstOrFail();
        $line->increment('replacement_qty', $data['qty']);
        $line->refresh();
        $line->refreshStatus();

        return response()->json([
            'replacement_qty' => (int) $line->replacement_qty,
            'pool_qty' => $line->poolQty(),
            'counters' => $line->counters(),
            'status' => $line->status,
        ]);
    }

    private function breakdown(PoLineItem $line, string $column, ?string $stage = null): array
    {
        $q = $line->scans();
        if ($stage !== null) {
            $q->where('stage', $stage);
        }
        return $q
            ->selectRaw($column.' as grp, SUM(accepted_qty) as accepted, SUM(rework_qty) as rework, SUM(scrap_qty) as scrap, COUNT(*) as scans')
            ->groupBy($column)
            ->get()
            ->map(function ($r) use ($line) {
                $total = ((int) $r->accepted) + ((int) $r->rework) + ((int) $r->scrap);
                $scanned = max(1, $total);

                return [
                    'key' => $r->grp ?: '—',
                    'accepted' => (int) $r->accepted,
                    'rework' => (int) $r->rework,
                    'scrap' => (int) $r->scrap,
                    'scans' => (int) $r->scans,
                    'pass_pct' => round((((int) $r->accepted) / $scanned) * 100, 1),
                    'fail_pct' => round((((int) $r->rework + (int) $r->scrap) / $scanned) * 100, 1),
                ];
            })->values()->all();
    }

    /**
     * Who is asking: [staff, checker]. Staff = valid Sanctum token.
     * Tester = X-Device-Token matching an active checker. Else anonymous.
     */
    private function resolveViewer(Request $request): array
    {
        if (Auth::guard('sanctum')->user()) {
            return [true, null];
        }
        $token = (string) $request->header('X-Device-Token', '');
        $checker = $token !== ''
            ? QcChecker::where('device_token', $token)->where('active', true)->first()
            : null;

        return [false, $checker];
    }
}
