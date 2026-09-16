<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ArticleScan extends Model
{
    use HasFactory;

    protected $fillable = [
        'po_line_item_id', 'department', 'stage',
        'qc_checker_code', 'qc_checker_name',
        'manufacturing_line_no', 'production_shift',
        'production_date', 'production_unit_no', 'production_supervisor_name',
        'air_wash_checker_code', 'air_wash_checker_name',
        'accepted_qty', 'rework_qty', 'scrap_qty',
        'notes', 'client_uuid', 'tested_at',
    ];

    protected $casts = [
        'tested_at' => 'datetime',
        'production_date' => 'date',
    ];

    public function lineItem()
    {
        return $this->belongsTo(PoLineItem::class, 'po_line_item_id');
    }
}
