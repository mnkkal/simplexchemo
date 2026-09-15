<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('po_line_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->unsignedInteger('line_number');
            $table->string('article_no')->unique();
            $table->string('bag_size');
            $table->unsignedInteger('order_qty');
            // 1 QR per article (strictly article-level, never PO-level).
            $table->string('article_qr_token', 64)->unique();
            $table->boolean('label_exported')->default(false);
            $table->string('status')->default('pending'); // pending|in_progress|complete
            $table->timestamps();

            $table->unique(['purchase_order_id', 'line_number']);
            $table->unique(['purchase_order_id', 'article_no']);
            $table->index('purchase_order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('po_line_items');
    }
};
