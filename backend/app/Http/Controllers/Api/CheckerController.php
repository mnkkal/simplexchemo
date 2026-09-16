<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QcChecker;
use Illuminate\Http\Request;

class CheckerController extends Controller
{
    public function index()
    {
        return QcChecker::orderBy('name')->paginate(100);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'checker_code' => 'required|string|max:50|unique:qc_checkers,checker_code',
            'production_line_no' => 'nullable|string|max:50',
            'production_shift' => 'nullable|string|max:50',
        ]);

        return response()->json(QcChecker::create($data + ['active' => true]), 201);
    }

    /** Admin-only: rename tester, change code, activate/deactivate, reassign line/shift. */
    public function update(Request $request, QcChecker $checker)
    {
        $data = $request->validate([
            'active' => 'sometimes|required|boolean',
            'name' => 'sometimes|required|string|max:255',
            'checker_code' => 'sometimes|required|string|max:50|unique:qc_checkers,checker_code,'.$checker->id,
            'production_line_no' => 'nullable|string|max:50',
            'production_shift' => 'nullable|string|max:50',
        ]);
        $checker->fill($data);
        $checker->save();

        return response()->json($checker);
    }

    /** Admin-only: remove a tester (hard delete). */
    public function destroy(QcChecker $checker)
    {
        $checker->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Floor identity: checker enters code once per device; backend returns a
     * signed device token the PWA stores (remembered device). Every remark
     * submission still re-sends the checker code for attribution.
     */
    public function verify(Request $request)
    {
        $data = $request->validate(['checker_code' => 'required|string']);

        $checker = QcChecker::where('checker_code', $data['checker_code'])->where('active', true)->first();
        if (!$checker) {
            return response()->json(['message' => 'Invalid checker code'], 422);
        }

        $payload = base64_encode(json_encode([
            'code' => $checker->checker_code,
            'name' => $checker->name,
            'exp' => now()->addYear()->timestamp,
        ]));
        $sig = hash_hmac('sha256', $payload, config('app.key'));
        $deviceToken = $payload.'.'.$sig;

        $checker->device_token = $deviceToken;
        $checker->save();

        return response()->json([
            'name' => $checker->name,
            'checker_code' => $checker->checker_code,
            'device_token' => $deviceToken,
        ]);
    }
}
