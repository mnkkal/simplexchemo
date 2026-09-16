<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QcChecker;
use App\Models\QcRound;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class QcController extends Controller
{
    /** Staff QC entry context: unit + order + which round is open. */
    public function context(Request $request, string $token)
    {
        $unit = Unit::where('unit_qr_token', $token)->with(['order', 'qcRounds' => fn ($q) => $q->orderBy('attempt_number')])->firstOrFail();

        // Tester isolation (§7): staff sees all rounds; a tester sees only
        // their own; anonymous sees meta + current round only.
        [$staff, $checker] = $this->resolveViewer($request);
        $rounds = $unit->qcRounds;
        if (!$staff) {
            $rounds = $checker
                ? $rounds->filter(fn ($r) => $r->qc_checker_code === $checker->checker_code)->values()
                : [];
        }

        return response()->json([
            'unit' => $unit,
            'order' => $unit->order,
            'current_round' => $unit->currentRound(),
            'rounds' => $rounds,
        ]);
    }

    /**
     * Record Pass/Repair/Reject. Always appends a new attempt row — never overwrites.
     * Supports offline idempotency via client_uuid.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'unit_token' => 'required|string',
            'round_type' => 'required|in:production,air_wash',
            'remark' => 'required|in:pass,repair,reject',
            'qc_checker_code' => 'required|string',
            'production_date' => 'nullable|date',
            'production_shift' => 'nullable|string|max:50',
            'production_unit_no' => 'nullable|string|max:50',
            'production_line_no' => 'nullable|string|max:50',
            'production_supervisor_name' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'client_uuid' => 'nullable|string|max:64',
            'tested_at' => 'nullable|date',
        ]);

        // Idempotent replay (offline sync / double submit / refresh).
        if (!empty($data['client_uuid'])) {
            $existing = QcRound::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return response()->json($existing->load('unit'), 200);
            }
        }

        $checker = QcChecker::where('checker_code', $data['qc_checker_code'])->where('active', true)->first();
        if (!$checker) {
            return response()->json(['message' => 'Invalid checker code'], 422);
        }

        $unit = Unit::where('unit_qr_token', $data['unit_token'])->firstOrFail();

        // Enforce round order: air_wash requires a passing production round first.
        if ($data['round_type'] === 'air_wash') {
            $prod = $unit->latestRound('production');
            if (!$prod || $prod->remark !== 'pass') {
                return response()->json(['message' => 'Production round must pass before air-wash QC'], 422);
            }
        }

        $attempt = (int) ($unit->qcRounds()->where('round_type', $data['round_type'])->max('attempt_number') ?? 0) + 1;

        $round = QcRound::create([
            'unit_id' => $unit->id,
            'round_type' => $data['round_type'],
            'attempt_number' => $attempt,
            'production_date' => $data['production_date'] ?? now()->toDateString(),
            'production_shift' => $data['production_shift'] ?? null,
            'production_unit_no' => $data['production_unit_no'] ?? null,
            'production_line_no' => $data['production_line_no'] ?? null,
            'production_supervisor_name' => $data['production_supervisor_name'] ?? null,
            'qc_checker_name' => $checker->name,
            'qc_checker_code' => $checker->checker_code,
            'remark' => $data['remark'],
            'notes' => $data['notes'] ?? null,
            'client_uuid' => $data['client_uuid'] ?? null,
            'tested_at' => $data['tested_at'] ?? now(),
        ]);

        // Remember this device for this checker (checker-code flow, §7).
        if (!$checker->device_token) {
            $checker->device_token = hash('sha256', $checker->checker_code.'|'.request()->ip().'|'.request()->userAgent());
            $checker->save();
        }

        $unit->refreshStatus();

        return response()->json($round->load('unit'), 201);
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
