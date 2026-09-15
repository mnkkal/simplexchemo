<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PurchaseOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_name', 'purchase_order_no',
    ];

    public function lineItems()
    {
        return $this->hasMany(PoLineItem::class)->orderBy('line_number');
    }
}
