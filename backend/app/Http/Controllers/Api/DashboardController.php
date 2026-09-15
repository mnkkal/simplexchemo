<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArticleScan;
use App\Models\Order;
use App\Models\Pallet;
use App\Models\PoLineItem;
use App\Models\PurchaseOrder;
use App\Models\QcRound;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats(Request $request)
    {
        $pass = (clone QcRound::query())->where('remark', 'pass')->count();
        $repair = (clone QcRound::query())->where('remark', 'repair')->count();
        $reject = (clone QcRound::query())->where('remark', 'reject')->count();

        $byLine = QcRound::select('production_line_no', DB::raw('count(*) as total'),
                DB::raw("sum(case when remark='pass' then 1 else 0 end) as pass"),
                DB::raw("sum(case when remark='repair' then 1 else 0 end) as repair"),
                DB::raw("sum(case when remark='reject' then 1 else 0 end) as reject"))
            ->groupBy('production_line_no')->get();

        $byShift = QcRound::select('production_shift', DB::raw('count(*) as total'),
                DB::raw("sum(case when remark='pass' then 1 else 0 end) as pass"),
                DB::raw("sum(case when remark='repair' then 1 else 0 end) as repair"),
                DB::raw("sum(case when remark='reject' then 1 else 0 end) as reject"))
            ->groupBy('production_shift')->get();

        $byChecker = QcRound::select('qc_checker_code', 'qc_checker_name', DB::raw('count(*) as total'),
                DB::raw("sum(case when remark='pass' then 1 else 0 end) as pass"),
                DB::raw("sum(case when remark='repair' then 1 else 0 end) as repair"),
                DB::raw("sum(case when remark='reject' then 1 else 0 end) as reject"))
            ->groupBy('qc_checker_code', 'qc_checker_name')->get();

        return response()->json([
            'orders' => Order::count(),
            'pallets' => Pallet::count(),
            'remarks' => ['pass' => $pass, 'repair' => $repair, 'reject' => $reject],
            'by_line' => $byLine,
            'by_shift' => $byShift,
            'by_checker' => $byChecker,
            // New article-level flow: 1 PO = N articles, 1 QR per article.
            'purchase_orders' => PurchaseOrder::count(),
            'articles' => PoLineItem::count(),
            'articles_complete' => PoLineItem::where('status', 'complete')->count(),
            'article_remarks' => [
                'accepted' => (int) ArticleScan::sum('accepted_qty'),
                'rework' => (int) ArticleScan::sum('rework_qty'),
                'scrap' => (int) ArticleScan::sum('scrap_qty'),
            ],
            'article_by_checker' => ArticleScan::select('qc_checker_code', 'qc_checker_name', DB::raw('SUM(accepted_qty) as accepted'), DB::raw('SUM(rework_qty) as rework'), DB::raw('SUM(scrap_qty) as scrap'), DB::raw('COUNT(*) as scans'))
                ->groupBy('qc_checker_code', 'qc_checker_name')->get(),
            'article_by_line' => ArticleScan::select('manufacturing_line_no', DB::raw('SUM(accepted_qty) as accepted'), DB::raw('SUM(rework_qty) as rework'), DB::raw('SUM(scrap_qty) as scrap'), DB::raw('COUNT(*) as scans'))
                ->groupBy('manufacturing_line_no')->get(),
            // Daily defect counts: Pass (accepted) vs Repair (rework) vs Reject (scrap)
            // per day, traced to line + checker.
            'article_daily' => ArticleScan::select(
                DB::raw('COALESCE(production_date, DATE(tested_at)) as day'),
                DB::raw('SUM(accepted_qty) as accepted'),
                DB::raw('SUM(rework_qty) as rework'),
                DB::raw('SUM(scrap_qty) as scrap'),
                DB::raw('COUNT(*) as scans')
            )->groupBy(DB::raw('COALESCE(production_date, DATE(tested_at))'))->orderBy('day', 'desc')->limit(60)->get(),
            'article_by_shift' => ArticleScan::select('production_shift', DB::raw('SUM(accepted_qty) as accepted'), DB::raw('SUM(rework_qty) as rework'), DB::raw('SUM(scrap_qty) as scrap'), DB::raw('COUNT(*) as scans'))
                ->groupBy('production_shift')->get(),
        ]);
    }

    /**
     * Mirror the 3-tab reference report as JSON (frontend builds CSV/XLSX):
     * Tab 1 Order & Barcode, Tab 2 Production & QC Data, Tab 3 Pallet Scanner Data.
     */
    public function export()
    {
        $tab1 = Order::with('units')->orderBy('id')->get()->flatMap(fn ($o) => $o->units->map(fn ($u) => [
            'customer_name' => $o->customer_name,
            'purchase_order_no' => $o->purchase_order_no,
            'article_no' => $o->article_no,
            'bag_size' => $o->bag_size,
            'order_qty' => $o->order_qty,
            'unit_id' => $u->id,
            'unit_qr_token' => $u->unit_qr_token,
            'label_generated' => $u->label_generated,
            'label_printed' => $u->label_printed,
            'status' => $u->status,
        ]))->values();

        $tab2 = QcRound::with('unit.order')->orderBy('id')->get()->map(fn ($r) => [
            'unit_id' => $r->unit_id,
            'unit_qr_token' => $r->unit?->unit_qr_token,
            'round_type' => $r->round_type,
            'attempt_number' => $r->attempt_number,
            'production_date' => $r->production_date,
            'production_shift' => $r->production_shift,
            'production_unit_no' => $r->production_unit_no,
            'production_line_no' => $r->production_line_no,
            'production_supervisor_name' => $r->production_supervisor_name,
            'qc_checker_name' => $r->qc_checker_name,
            'qc_checker_code' => $r->qc_checker_code,
            'remark' => $r->remark,
            'notes' => $r->notes,
            'tested_at' => $r->tested_at,
        ])->values();

        $tab3 = Pallet::with('units')->orderBy('id')->get()->map(fn ($p) => [
            'pallet_qr_token' => $p->pallet_qr_token,
            'customer_name' => $p->customer_name,
            'purchase_order_no' => $p->purchase_order_no,
            'article_no' => $p->article_no,
            'bag_size' => $p->bag_size,
            'pallet_pcs' => $p->pallet_pcs,
            'pallet_no' => $p->pallet_no,
            'packing_date' => $p->packing_date,
            'packing_time' => $p->packing_time,
            'packing_shift' => $p->packing_shift,
            'packing_supervisor_name' => $p->packing_supervisor_name,
            'packing_machine_operator_name' => $p->packing_machine_operator_name,
            'unit_ids' => $p->units->pluck('id')->implode(','),
        ])->values();

        return response()->json([
            'order_barcode' => $tab1,
            'production_qc' => $tab2,
            'pallet_scanner' => $tab3,
            // New article-level tabs: PO lines + article scans (accepted/rework/scrap).
            'po_articles' => PurchaseOrder::with('lineItems')->orderBy('id')->get()->flatMap(fn ($po) => $po->lineItems->map(fn ($line) => [
                'customer_name' => $po->customer_name,
                'purchase_order_no' => $po->purchase_order_no,
                'line_number' => $line->line_number,
                'article_no' => $line->article_no,
                'bag_size' => $line->bag_size,
                'order_qty' => $line->order_qty,
                'article_qr_token' => $line->article_qr_token,
                'status' => $line->status,
            ]))->values(),
            'article_scans' => ArticleScan::with('lineItem.purchaseOrder')->orderBy('id')->get()->map(fn ($s) => [
                'purchase_order_no' => $s->lineItem?->purchaseOrder?->purchase_order_no,
                'article_no' => $s->lineItem?->article_no,
                'line_number' => $s->lineItem?->line_number,
                'department' => $s->department,
                'production_date' => $s->production_date,
                'production_shift' => $s->production_shift,
                'production_unit_no' => $s->production_unit_no,
                'manufacturing_line_no' => $s->manufacturing_line_no,
                'production_supervisor_name' => $s->production_supervisor_name,
                'qc_checker_name' => $s->qc_checker_name,
                'qc_checker_code' => $s->qc_checker_code,
                'air_wash_checker_name' => $s->air_wash_checker_name,
                'air_wash_checker_code' => $s->air_wash_checker_code,
                'pass_qty' => $s->accepted_qty,
                'repair_qty' => $s->rework_qty,
                'reject_qty' => $s->scrap_qty,
                'accepted_qty' => $s->accepted_qty,
                'rework_qty' => $s->rework_qty,
                'scrap_qty' => $s->scrap_qty,
                'notes' => $s->notes,
                'tested_at' => $s->tested_at,
            ])->values(),
        ]);
    }
}
