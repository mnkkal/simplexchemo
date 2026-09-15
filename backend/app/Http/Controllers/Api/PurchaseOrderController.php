<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PoLineItem;
use App\Models\PurchaseOrder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseOrderController extends Controller
{
    public function index()
    {
        return PurchaseOrder::with('lineItems')->orderByDesc('id')->paginate(50);
    }

    /**
     * Create 1 PO header + N article line items in one transaction.
     * Generates exactly 1 article QR token per line (never PO-level).
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_name' => 'required|string|max:255',
            'purchase_order_no' => 'required|string|max:255|unique:purchase_orders,purchase_order_no',
            'items' => 'required|array|min:1|max:200',
            'items.*.article_no' => 'required|string|max:255|distinct|unique:po_line_items,article_no',
            'items.*.bag_size' => 'required|string|max:255',
            'items.*.order_qty' => 'required|integer|min:1|max:100000',
        ]);

        return DB::transaction(function () use ($data) {
            $po = PurchaseOrder::create([
                'customer_name' => $data['customer_name'],
                'purchase_order_no' => $data['purchase_order_no'],
            ]);

            $lineNo = 0;
            foreach ($data['items'] as $item) {
                $lineNo++;
                PoLineItem::create([
                    'purchase_order_id' => $po->id,
                    'line_number' => $lineNo,
                    'article_no' => $item['article_no'],
                    'bag_size' => $item['bag_size'],
                    'order_qty' => $item['order_qty'],
                    'article_qr_token' => PoLineItem::newToken(),
                    'status' => 'pending',
                ]);
            }

            return response()->json($po->load('lineItems'), 201);
        });
    }

    public function show(PurchaseOrder $purchaseOrder)
    {
        $po = $purchaseOrder->load(['lineItems.scans' => fn ($q) => $q->orderBy('id')]);

        $lines = $po->lineItems->map(fn ($line) => array_merge(
            $line->toArray(),
            ['counters' => $line->counters()]
        ));

        return response()->json(array_merge($po->toArray(), ['line_items' => $lines]));
    }

    /** Label-supplier export: 1 row per article QR + mark exported (reprint-safe). */
    public function labels(PurchaseOrder $purchaseOrder)
    {
        $po = $purchaseOrder->load('lineItems');
        $po->lineItems()->update(['label_exported' => true]);

        return response()->json([
            'purchase_order_no' => $po->purchase_order_no,
            'customer_name' => $po->customer_name,
            'labels' => $po->lineItems->map(fn ($line) => [
                'line_number' => $line->line_number,
                'article_no' => $line->article_no,
                'bag_size' => $line->bag_size,
                'order_qty' => $line->order_qty,
                'article_qr_token' => $line->article_qr_token,
            ])->values(),
        ]);
    }
}
