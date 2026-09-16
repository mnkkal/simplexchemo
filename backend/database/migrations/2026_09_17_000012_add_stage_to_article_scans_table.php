<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Two testing levels per article, each covering the full order qty:
        // Level 1 QC first, then Level 2 Air-wash from 0. Existing rows are
        // QC-level work, so the default backfills them correctly.
        Schema::table('article_scans', function (Blueprint $table) {
            $table->string('stage', 20)->default('qc')->after('department');
            $table->index('stage');
        });
    }

    public function down(): void
    {
        Schema::table('article_scans', function (Blueprint $table) {
            $table->dropIndex(['stage']);
            $table->dropColumn('stage');
        });
    }
};
