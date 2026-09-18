<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PalletLineItem extends Model
{
    use HasFactory;

    protected $fillable = ['pallet_id', 'po_line_item_id', 'qty'];

    public function pallet()
    {
        return $this->belongsTo(Pallet::class);
    }

    public function lineItem()
    {
        return $this->belongsTo(PoLineItem::class, 'po_line_item_id');
    }
}
