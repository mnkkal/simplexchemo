<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qc_checkers', function (Blueprint $table) {
            $table->string('production_line_no', 50)->nullable()->after('checker_code');
            $table->string('production_shift', 50)->nullable()->after('production_line_no');
        });
    }

    public function down(): void
    {
        Schema::table('qc_checkers', function (Blueprint $table) {
            $table->dropColumn(['production_line_no', 'production_shift']);
        });
    }
};
