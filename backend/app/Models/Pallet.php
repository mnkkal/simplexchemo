<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Pallet extends Model
{
    use HasFactory;

    protected $fillable = [
        'pallet_qr_token', 'customer_name', 'purchase_order_no', 'article_no',
        'bag_size', 'pallet_pcs', 'pallet_no', 'packing_date', 'packing_time',
        'packing_shift', 'packing_supervisor_name', 'packing_machine_operator_name',
        'qc_scanner_generated', 'client_uuid',
    ];

    protected $casts = [
        'packing_date' => 'date',
        'qc_scanner_generated' => 'boolean',
    ];

    public static function newToken(): string
    {
        do {
            $token = Str::random(32);
        } while (static::where('pallet_qr_token', $token)->exists()
            || Unit::where('unit_qr_token', $token)->exists());

        return $token;
    }

    public function palletUnits()
    {
        return $this->hasMany(PalletUnit::class);
    }

    public function units()
    {
        return $this->belongsToMany(Unit::class, 'pallet_units');
    }
}
