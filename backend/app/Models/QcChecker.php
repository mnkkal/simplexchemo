<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class QcChecker extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'checker_code', 'production_line_no', 'production_shift', 'device_token', 'active'];

    protected $casts = ['active' => 'boolean'];
}
