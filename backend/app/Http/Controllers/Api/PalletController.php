<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pallet;
use App\Models\PalletUnit;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PalletController extends Controller
{
    public function index()
    {
        return Pallet::withCount('palletUnits')->orderByDesc('id')->paginate(50);
    }

    public function show(Pallet $pallet)
    {
        return $pallet->load(['units.order', 'palletUnits']);
    }

    /**
     * Pack multiple passed units into a new pallet.
     * Generates a brand-new pallet QR token (never reuses a unit token).
     * Idempotent per packing session via client_uuid — refresh mid-save is safe.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'unit_tokens' => 'required|array|min:1',
            'unit_tokens.*' => 'string',
            'pallet_no' => 'required|string|max:255',
            'packing_date' => 'required|date',
            'packing_time' => 'nullable|string|max:50',
            'packing_shift' => 'required|string|max:50',
            'packing_supervisor_name' => 'nullable|string|max:255',
            'packing_machine_operator_name' => 'nullable|string|max:255',
            'client_uuid' => 'nullable|string|max:64',
        ]);

        if (!empty($data['client_uuid'])) {
            $existing = Pallet::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return response()->json($existing->load('units'), 200);
            }
        }

        return DB::transaction(function () use ($data) {
            $units = Unit::whereIn('unit_qr_token', $data['unit_tokens'])->with('order')->get();

            if ($units->count() !== count(array_unique($data['unit_tokens']))) {
                abort(422, 'One or more unit QRs were not found');
            }

            // All units in one pallet must share the same order/article.
            $orderIds = $units->pluck('order_id')->unique();
            if ($orderIds->count() > 1) {
                abort(422, 'All units in one pallet must belong to the same order');
            }

            // Only fully-passed units can be packed.
            $notPassed = $units->where('status', '!=', 'passed');
            if ($notPassed->isNotEmpty()) {
                abort(422, 'Only units with passed QC in both rounds can be packed. Blocked: '.$notPassed->count());
            }

            // A unit can belong to only one pallet.
            $already = PalletUnit::whereIn('unit_id', $units->pluck('id'))->exists();
            if ($already) {
                abort(422, 'One or more units are already packed in another pallet');
            }

            $first = $units->first();
            $order = $first->order;

            $pallet = Pallet::create([
                'pallet_qr_token' => Pallet::newToken(),
                'customer_name' => $order->customer_name,
                'purchase_order_no' => $order->purchase_order_no,
                'article_no' => $order->article_no,
                'bag_size' => $order->bag_size,
                'pallet_pcs' => $units->count(),
                'pallet_no' => $data['pallet_no'],
                'packing_date' => $data['packing_date'],
                'packing_time' => $data['packing_time'] ?? now()->format('H:i'),
                'packing_shift' => $data['packing_shift'],
                'packing_supervisor_name' => $data['packing_supervisor_name'] ?? null,
                'packing_machine_operator_name' => $data['packing_machine_operator_name'] ?? null,
                'qc_scanner_generated' => true,
                'client_uuid' => $data['client_uuid'] ?? null,
            ]);

            foreach ($units as $unit) {
                PalletUnit::create([
                    'pallet_id' => $pallet->id,
                    'unit_id' => $unit->id,
                    'added_at' => now(),
                ]);
            }

            return response()->json($pallet->load('units'), 201);
        });
    }
}
