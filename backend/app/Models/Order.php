<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_name', 'purchase_order_no', 'article_no', 'bag_size', 'order_qty',
    ];

    public function units()
    {
        return $this->hasMany(Unit::class);
    }
}
