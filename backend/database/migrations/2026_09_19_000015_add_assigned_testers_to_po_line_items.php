<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Per-article tester assignment: who may record QC / Air-wash
        // verdicts on this article. NULL = open to any active tester.
        Schema::table('po_line_items', function (Blueprint $table) {
            $table->string('assigned_qc_code', 50)->nullable()->after('status');
            $table->string('assigned_aw_code', 50)->nullable()->after('assigned_qc_code');
        });
    }

    public function down(): void
    {
        Schema::table('po_line_items', function (Blueprint $table) {
            $table->dropColumn(['assigned_qc_code', 'assigned_aw_code']);
        });
    }
};
