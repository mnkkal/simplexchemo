<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pallet;
use App\Models\PalletLineItem;
use App\Models\PalletUnit;
use App\Models\PoLineItem;
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
     * Pack passed units (legacy unit flow) OR completed articles (new PO
     * flow) into a new pallet. Generates a brand-new pallet QR token.
     * Idempotent per packing session via client_uuid — refresh mid-save is safe.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'unit_tokens' => 'nullable|array|min:1',
            'unit_tokens.*' => 'string',
            'articles' => 'nullable|array|min:1',
            'articles.*.article_token' => 'required|string',
            'articles.*.qty' => 'nullable|integer|min:1|max:100000',
            'pallet_no' => 'required|string|max:255',
            'packing_date' => 'required|date',
            'packing_time' => 'nullable|string|max:50',
            'packing_shift' => 'required|string|max:50',
            'packing_supervisor_name' => 'nullable|string|max:255',
            'packing_machine_operator_name' => 'nullable|string|max:255',
            'client_uuid' => 'nullable|string|max:64',
        ]);

        $hasUnits = !empty($data['unit_tokens']);
        $hasArticles = !empty($data['articles']);
        if ($hasUnits === $hasArticles) {
            return response()->json(['message' => 'Provide either unit_tokens (legacy units) or articles (tested PO articles), not both'], 422);
        }

        if (!empty($data['client_uuid'])) {
            $existing = Pallet::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return response()->json($existing->load(['units', 'articleLines']), 200);
            }
        }

        if ($hasArticles) {
            return $this->storeArticles($data);
        }

        return $this->storeUnits($data);
    }

    /**
     * New flow: group fully-tested articles into a pallet. Only articles
     * complete at BOTH levels can be packed; packed qty comes from passed
     * (Air-wash accepted) stock minus what is already on other pallets.
     */
    private function storeArticles(array $data)
    {
        return DB::transaction(function () use ($data) {
            $tokens = collect($data['articles'])->pluck('article_token')->all();
            if (count($tokens) !== count(array_unique($tokens))) {
                abort(422, 'Duplicate article in the same pallet');
            }
            $lines = PoLineItem::whereIn('article_qr_token', $tokens)->with('purchaseOrder')->get();
            if ($lines->count() !== count($tokens)) {
                abort(422, 'One or more article QRs were not found');
            }
            if ($lines->pluck('purchase_order_id')->unique()->count() > 1) {
                abort(422, 'All articles in one pallet must belong to the same PO');
            }
            $incomplete = $lines->reject(fn ($l) => $l->counters()['complete']);
            if ($incomplete->isNotEmpty()) {
                abort(422, 'Only articles complete at both QC levels can be packed. Blocked: '.$incomplete->pluck('article_no')->implode(', '));
            }

            $po = $lines->first()->purchaseOrder;
            $items = [];
            $total = 0;
            foreach ($data['articles'] as $a) {
                $line = $lines->firstWhere('article_qr_token', $a['article_token']);
                $packed = (int) PalletLineItem::where('po_line_item_id', $line->id)->sum('qty');
                $available = $line->counters()['airwash']['accepted'] - $packed;
                $qty = $a['qty'] ?? $available;
                if ($qty < 1 || $qty > $available) {
                    abort(422, "Article {$line->article_no}: only {$available} pcs available to pack");
                }
                $items[] = ['line' => $line, 'qty' => $qty];
                $total += $qty;
            }

            $articleNos = $lines->pluck('article_no')->unique()->values()->all();
            $bagSizes = $lines->pluck('bag_size')->unique()->values()->all();
            $pallet = Pallet::create([
                'pallet_qr_token' => Pallet::newToken(),
                'customer_name' => $po->customer_name,
                'purchase_order_no' => $po->purchase_order_no,
                'article_no' => substr(implode(', ', $articleNos), 0, 255),
                'bag_size' => count($bagSizes) === 1 ? $bagSizes[0] : 'MIXED',
                'pallet_pcs' => $total,
                'pallet_no' => $data['pallet_no'],
                'packing_date' => $data['packing_date'],
                'packing_time' => $data['packing_time'] ?? now()->format('H:i'),
                'packing_shift' => $data['packing_shift'],
                'packing_supervisor_name' => $data['packing_supervisor_name'] ?? null,
                'packing_machine_operator_name' => $data['packing_machine_operator_name'] ?? null,
                'qc_scanner_generated' => true,
                'client_uuid' => $data['client_uuid'] ?? null,
            ]);

            foreach ($items as $item) {
                PalletLineItem::create([
                    'pallet_id' => $pallet->id,
                    'po_line_item_id' => $item['line']->id,
                    'qty' => $item['qty'],
                ]);
            }

            return response()->json($pallet->load(['articleLines.scans', 'articleLines.purchaseOrder']), 201);
        });
    }

    private function storeUnits(array $data)
    {
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
