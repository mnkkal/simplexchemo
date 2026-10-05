<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-unit serial: the physical bag number written on the product
        // (1..N per article). A verdict with a serial tracks exactly one
        // unit; re-scans of the same serial append (repair loop) — latest
        // row per serial is the unit's current state.
        Schema::table('article_scans', function (Blueprint $table) {
            $table->unsignedInteger('serial_no')->nullable()->after('stage');
            $table->index(['po_line_item_id', 'serial_no']);
        });
    }

    public function down(): void
    {
        Schema::table('article_scans', function (Blueprint $table) {
            $table->dropIndex(['po_line_item_id', 'serial_no']);
            $table->dropColumn('serial_no');
        });
    }
};
