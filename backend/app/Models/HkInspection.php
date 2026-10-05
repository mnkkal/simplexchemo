<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class HkInspection extends Model
{
    use HasFactory;

    protected $fillable = [
        'hk_entry_id', 'inspector_name', 'overall_status', 'remark',
        'standards', 'photo_paths',
    ];

    protected $casts = [
        'standards' => 'array',
        'photo_paths' => 'array',
    ];

    public function entry()
    {
        return $this->belongsTo(HkEntry::class, 'hk_entry_id');
    }
}
