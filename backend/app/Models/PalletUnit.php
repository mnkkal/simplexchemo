<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PalletUnit extends Model
{
    use HasFactory;

    protected $fillable = ['pallet_id', 'unit_id', 'added_at'];

    protected $casts = ['added_at' => 'datetime'];

    public function pallet()
    {
        return $this->belongsTo(Pallet::class);
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }
}
