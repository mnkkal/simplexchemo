<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class PoLineItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'purchase_order_id', 'line_number', 'article_no', 'bag_size',
        'order_qty', 'article_qr_token', 'label_exported', 'status',
    ];

    protected $casts = [
        'label_exported' => 'boolean',
    ];

    public static function newToken(): string
    {
        do {
            $token = Str::random(32);
        } while (static::where('article_qr_token', $token)->exists()
            || Unit::where('unit_qr_token', $token)->exists()
            || Pallet::where('pallet_qr_token', $token)->exists());

        return $token;
    }

    public function purchaseOrder()
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function scans()
    {
        return $this->hasMany(ArticleScan::class);
    }

    /** Live counters: accepted (net) + scrap (terminal) drive completion. */
    public function counters(): array
    {
        $accepted = (int) $this->scans()->sum('accepted_qty');
        $rework = (int) $this->scans()->sum('rework_qty');
        $scrap = (int) $this->scans()->sum('scrap_qty');
        $pending = max(0, $this->order_qty - $accepted - $scrap);

        return [
            'accepted' => $accepted,
            'rework' => $rework,
            'scrap' => $scrap,
            'pending' => $pending,
            'complete' => ($accepted + $scrap) >= $this->order_qty,
        ];
    }

    public function refreshStatus(): string
    {
        $c = $this->counters();
        if ($c['complete']) {
            $status = 'complete';
        } elseif ($c['accepted'] > 0 || $c['scrap'] > 0 || $c['rework'] > 0) {
            $status = 'in_progress';
        } else {
            $status = 'pending';
        }

        $this->status = $status;
        $this->save();

        return $status;
    }
}
