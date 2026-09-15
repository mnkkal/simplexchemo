<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class QcRound extends Model
{
    use HasFactory;

    protected $fillable = [
        'unit_id', 'round_type', 'attempt_number',
        'production_date', 'production_shift', 'production_unit_no',
        'production_line_no', 'production_supervisor_name',
        'qc_checker_name', 'qc_checker_code', 'remark', 'notes',
        'client_uuid', 'tested_at',
    ];

    protected $casts = [
        'production_date' => 'date',
        'tested_at' => 'datetime',
    ];

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }
}
