<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('article_scans', function (Blueprint $table) {
            // Secondary scanning details logged when the printed supplier label
            // is scanned internally: time & location + personnel + air-wash QC.
            $table->date('production_date')->nullable()->after('production_shift');
            $table->string('production_unit_no', 50)->nullable()->after('production_date');
            $table->string('production_supervisor_name', 255)->nullable()->after('production_unit_no');
            $table->string('air_wash_checker_code', 50)->nullable()->after('qc_checker_name');
            $table->string('air_wash_checker_name', 255)->nullable()->after('air_wash_checker_code');
        });
    }

    public function down(): void
    {
        Schema::table('article_scans', function (Blueprint $table) {
            $table->dropColumn([
                'production_date',
                'production_unit_no',
                'production_supervisor_name',
                'air_wash_checker_code',
                'air_wash_checker_name',
            ]);
        });
    }
};
