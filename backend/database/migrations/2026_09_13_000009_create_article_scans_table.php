<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Attempt-based QC history: every scan appends a row, never overwrites.
        // accepted = good stock, rework = back to queue (re-scanned), scrap = terminal loss.
        // Closing rule: sum(accepted_qty) + sum(scrap_qty) >= order_qty => complete.
        Schema::create('article_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('po_line_item_id')->constrained('po_line_items')->cascadeOnDelete();
            $table->string('department', 50); // e.g. bagging|packing|qc
            $table->string('qc_checker_code', 50);
            $table->string('qc_checker_name', 255)->nullable();
            $table->string('manufacturing_line_no', 50)->nullable();
            $table->string('production_shift', 50)->nullable();
            $table->unsignedInteger('accepted_qty')->default(0);
            $table->unsignedInteger('rework_qty')->default(0);
            $table->unsignedInteger('scrap_qty')->default(0);
            $table->text('notes')->nullable();
            $table->string('client_uuid', 64)->nullable()->unique();
            $table->timestamp('tested_at')->nullable();
            $table->timestamps();

            $table->index('po_line_item_id');
            $table->index('qc_checker_code');
            $table->index('manufacturing_line_no');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('article_scans');
    }
};
