<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // New article flow: completed articles (QC + Air-wash) packed into a
        // pallet with their own pallet QR. One row per article per pallet.
        Schema::create('pallet_line_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pallet_id')->constrained('pallets')->cascadeOnDelete();
            $table->foreignId('po_line_item_id')->constrained('po_line_items')->cascadeOnDelete();
            $table->unsignedInteger('qty');
            $table->timestamps();

            $table->unique(['pallet_id', 'po_line_item_id']);
            $table->index('po_line_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pallet_line_items');
    }
};
