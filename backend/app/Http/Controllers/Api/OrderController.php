<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function index()
    {
        return Order::withCount('units')->orderByDesc('id')->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'customer_name' => 'required|string|max:255',
            'purchase_order_no' => 'required|string|max:255',
            'article_no' => 'required|string|max:255',
            'bag_size' => 'required|string|max:255',
            'order_qty' => 'required|integer|min:1|max:100000',
        ]);

        return DB::transaction(function () use ($data) {
            $order = Order::create($data);

            // Stage 1: generate one unique unit QR token per production unit.
            $units = [];
            for ($i = 0; $i < $order->order_qty; $i++) {
                $units[] = [
                    'order_id' => $order->id,
                    'unit_qr_token' => Unit::newToken(),
                    'label_generated' => true,
                    'label_printed' => false,
                    'status' => 'pending',
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            foreach (array_chunk($units, 500) as $chunk) {
                Unit::insert($chunk);
            }

            return response()->json($order->loadCount('units'), 201);
        });
    }

    public function show(Order $order)
    {
        return $order->load(['units' => fn ($q) => $q->orderBy('id')->limit(200)])->loadCount('units');
    }

    public function units(Order $order)
    {
        return $order->units()->orderBy('id')->paginate(200);
    }

    /** Reprint support: flip label_printed once labels leave the printer. */
    public function markPrinted(Order $order)
    {
        $order->units()->update(['label_printed' => true]);

        return response()->json(['ok' => true]);
    }
}
