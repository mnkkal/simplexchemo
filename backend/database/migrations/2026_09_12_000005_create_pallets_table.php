<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pallets', function (Blueprint $table) {
            $table->id();
            $table->string('pallet_qr_token', 64)->unique();
            $table->string('customer_name');
            $table->string('purchase_order_no');
            $table->string('article_no');
            $table->string('bag_size');
            $table->unsignedInteger('pallet_pcs')->default(0);
            $table->string('pallet_no');
            $table->date('packing_date');
            $table->string('packing_time')->nullable();
            $table->string('packing_shift');
            $table->string('packing_supervisor_name')->nullable();
            $table->string('packing_machine_operator_name')->nullable();
            $table->boolean('qc_scanner_generated')->default(false);
            $table->string('client_uuid', 64)->unique()->nullable(); // idempotent packing session
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pallets');
    }
};
