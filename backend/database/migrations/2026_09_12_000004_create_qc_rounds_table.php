<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qc_rounds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->string('round_type'); // production|air_wash
            $table->unsignedInteger('attempt_number')->default(1);
            $table->date('production_date')->nullable();
            $table->string('production_shift')->nullable();
            $table->string('production_unit_no')->nullable();
            $table->string('production_line_no')->nullable();
            $table->string('production_supervisor_name')->nullable();
            $table->string('qc_checker_name')->nullable();
            $table->string('qc_checker_code');
            $table->string('remark'); // pass|repair|reject
            $table->text('notes')->nullable();
            $table->string('client_uuid', 64)->unique()->nullable(); // offline idempotency key
            $table->timestamp('tested_at')->nullable();
            $table->timestamps();
            $table->index(['unit_id', 'round_type', 'attempt_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qc_rounds');
    }
};
