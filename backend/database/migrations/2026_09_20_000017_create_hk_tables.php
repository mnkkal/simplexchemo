<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Housekeeping board, digitized: one row per line + date + 2-hour
        // slot with the three floor statuses (done / not done).
        Schema::create('hk_entries', function (Blueprint $table) {
            $table->id();
            $table->string('line_no', 50)->index();
            $table->date('cleaning_date');
            $table->string('slot', 5);
            $table->string('shift', 2);
            $table->string('sweeper_name', 255);
            $table->string('sweeping', 10);
            $table->string('mopping', 10);
            $table->string('machine_cleaning', 10);
            $table->timestamps();

            $table->unique(['line_no', 'cleaning_date', 'slot']);
            $table->index(['cleaning_date', 'line_no']);
        });

        // One inspection per entry: overall verdict + 7 standards + remark +
        // compressed photos (paths only — files live in public/uploads).
        Schema::create('hk_inspections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hk_entry_id')->constrained('hk_entries')->cascadeOnDelete()->unique();
            $table->string('inspector_name', 255);
            $table->string('overall_status', 10);
            $table->text('remark')->nullable();
            $table->text('standards');
            $table->text('photo_paths')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hk_inspections');
        Schema::dropIfExists('hk_entries');
    }
};
