<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Unit extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id', 'unit_qr_token', 'label_generated', 'label_printed', 'status',
    ];

    protected $casts = [
        'label_generated' => 'boolean',
        'label_printed' => 'boolean',
    ];

    public static function newToken(): string
    {
        do {
            $token = Str::random(32);
        } while (static::where('unit_qr_token', $token)->exists()
            || Pallet::where('pallet_qr_token', $token)->exists());

        return $token;
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function qcRounds()
    {
        return $this->hasMany(QcRound::class);
    }

    public function palletUnits()
    {
        return $this->hasMany(PalletUnit::class);
    }

    public function latestRound(string $type): ?QcRound
    {
        return $this->qcRounds()->where('round_type', $type)->orderByDesc('attempt_number')->first();
    }

    /** Recompute pending|in_qc|passed|failed_final from latest attempts. */
    public function refreshStatus(): string
    {
        $prod = $this->latestRound('production');
        $air = $this->latestRound('air_wash');

        if (!$prod && !$air) {
            $status = 'pending';
        } elseif ($prod && $prod->remark === 'reject') {
            // reject in production blocks progress until a passing retest exists;
            // latest attempt decides, so a reject latest => failed/in_qc
            $status = 'in_qc';
        } elseif ($air && $air->remark === 'reject') {
            $status = 'failed_final';
        } elseif (
            $prod && $prod->remark === 'pass'
            && $air && $air->remark === 'pass'
        ) {
            $status = 'passed';
        } else {
            $status = 'in_qc';
        }

        $this->status = $status;
        $this->save();

        return $status;
    }

    /** Which round is currently open for this unit? */
    public function currentRound(): string
    {
        $prod = $this->latestRound('production');
        if (!$prod || $prod->remark !== 'pass') {
            return 'production';
        }

        return 'air_wash';
    }
}
