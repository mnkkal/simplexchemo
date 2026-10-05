<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HkEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'line_no', 'cleaning_date', 'slot', 'shift', 'sweeper_name',
        'sweeping', 'mopping', 'machine_cleaning',
    ];

    public function inspection()
    {
        return $this->hasOne(HkInspection::class, 'hk_entry_id');
    }
}
