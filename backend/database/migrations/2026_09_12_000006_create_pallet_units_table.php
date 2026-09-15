<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pallet_units', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pallet_id')->constrained('pallets')->cascadeOnDelete();
            $table->foreignId('unit_id')->constrained('units')->cascadeOnDelete();
            $table->timestamp('added_at')->nullable();
            $table->timestamps();
            $table->unique(['pallet_id', 'unit_id']);
            $table->unique(['unit_id']); // a unit belongs to only one pallet
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pallet_units');
    }
};
