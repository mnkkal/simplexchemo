<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->string('unit_qr_token', 64)->unique();
            $table->boolean('label_generated')->default(false);
            $table->boolean('label_printed')->default(false);
            $table->string('status')->default('pending'); // pending|in_qc|passed|failed_final
            $table->timestamps();
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('units');
    }
};
