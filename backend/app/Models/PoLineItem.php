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

    /** Testable pool: customer order + replacement inflow for scrapped units. */
    public function poolQty(): int
    {
        return $this->order_qty + (int) ($this->replacement_qty ?? 0);
    }

    /**
     * Per-level counters. QC covers the pool; Air-wash covers the pool minus
     * QC-scrapped units (dead bags never reach air-wash — replacements heal
     * the pool when staff records them).
     */
    public function stageCounters(string $stage): array
    {
        $pool = $this->poolQty();
        $accepted = (int) $this->scans()->where('stage', $stage)->sum('accepted_qty');
        $rework = (int) $this->scans()->where('stage', $stage)->sum('rework_qty');
        $scrap = (int) $this->scans()->where('stage', $stage)->sum('scrap_qty');
        if ($stage === 'airwash') {
            $qcScrap = (int) $this->scans()->where('stage', 'qc')->sum('scrap_qty');
            $target = max(0, $pool - $qcScrap);
            $pending = max(0, $target - $accepted - $scrap);

            return [
                'accepted' => $accepted,
                'rework' => $rework,
                'scrap' => $scrap,
                'pending' => $pending,
                'complete' => ($accepted + $scrap) >= $target,
            ];
        }
        $pending = max(0, $pool - $accepted - $scrap);

        return [
            'accepted' => $accepted,
            'rework' => $rework,
            'scrap' => $scrap,
            'pending' => $pending,
            'complete' => ($accepted + $scrap) >= $pool,
        ];
    }

    /** Currently open testing level: 'qc' → 'airwash' → null (both done). */
    public function openStage(): ?string
    {
        if (!$this->stageCounters('qc')['complete']) {
            return 'qc';
        }
        if (!$this->stageCounters('airwash')['complete']) {
            return 'airwash';
        }

        return null;
    }

    /**
     * Live counters. Flat keys describe the OPEN level (what the floor acts
     * on); per-level breakdowns under 'qc' / 'airwash'. Article is complete
     * only when BOTH levels cover the order qty.
     */
    public function counters(): array
    {
        $qc = $this->stageCounters('qc');
        $aw = $this->stageCounters('airwash');
        $open = $this->openStage();
        $cur = $open === 'airwash' ? $aw : $qc;

        return [
            'stage' => $open,
            'qc' => $qc,
            'airwash' => $aw,
            'accepted' => $cur['accepted'],
            'rework' => $cur['rework'],
            'scrap' => $cur['scrap'],
            'pending' => $open === null ? 0 : $cur['pending'],
            'complete' => $open === null,
        ];
    }

    public function refreshStatus(): string
    {
        $c = $this->counters();
        if ($c['complete']) {
            $status = 'complete';
        } elseif ($this->scans()->exists()) {
            $status = 'in_progress';
        } else {
            $status = 'pending';
        }

        $this->status = $status;
        $this->save();

        return $status;
    }
}
