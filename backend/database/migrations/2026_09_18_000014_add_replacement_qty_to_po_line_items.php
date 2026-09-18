<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Replacement inflow: scrapped units are re-produced, so fresh units
        // arrive per article. They enlarge the testable pool at both levels.
        Schema::table('po_line_items', function (Blueprint $table) {
            $table->unsignedInteger('replacement_qty')->default(0)->after('order_qty');
        });
    }

    public function down(): void
    {
        Schema::table('po_line_items', function (Blueprint $table) {
            $table->dropColumn('replacement_qty');
        });
    }
};
