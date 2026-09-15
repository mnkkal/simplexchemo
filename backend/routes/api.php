<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\ArticleScanController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CheckerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PalletController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\QcController;
use App\Http\Controllers\Api\ScanController;
use App\Http\Controllers\Api\TesterController;

// Public: single scan flow resolves unit QR vs pallet QR (§4).
Route::get('/scan/{token}', [ScanController::class, 'show']);

// Tester self-service: own profile + own past work only (device-token auth,
// never the admin panel). Floor identity, no password, §7.
Route::get('/tester/{code}/work', [TesterController::class, 'work']);
// Floor identity: checker code verify (no password, §7). Public by design.
Route::post('/checkers/verify', [CheckerController::class, 'verify']);

// QC remark + article scans accept offline-synced retries; idempotency via client_uuid.
// Floor endpoints stay public by design (checker-code identity, §7).
Route::post('/qc', [QcController::class, 'store']);
Route::get('/qc/{token}', [QcController::class, 'context']);
Route::get('/articles/{token}', [ArticleScanController::class, 'context']);
Route::post('/article-scans', [ArticleScanController::class, 'store']);

// Staff auth (back-office order entry / admin).
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'me']);
    // Back-office: order entry, PO entry, pallet packing lists — staff login required.
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::get('/orders/{order}/units', [OrderController::class, 'units']);
    Route::post('/orders/{order}/printed', [OrderController::class, 'markPrinted']);
    // New flow: 1 PO = N articles, 1 QR per article — staff login required.
    Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
    Route::post('/purchase-orders', [PurchaseOrderController::class, 'store']);
    Route::get('/purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'show']);
    Route::post('/purchase-orders/{purchaseOrder}/labels', [PurchaseOrderController::class, 'labels']);
    // Pallet packing — staff login required.
    Route::post('/pallets', [PalletController::class, 'store']);
    Route::get('/pallets', [PalletController::class, 'index']);
    Route::get('/pallets/{pallet}', [PalletController::class, 'show']);
    // Admin-only (password login required): dashboard, exports, tester management.
    Route::get('/checkers', [CheckerController::class, 'index']);
    Route::post('/checkers', [CheckerController::class, 'store']);
    Route::patch('/checkers/{checker}', [CheckerController::class, 'update']);
    Route::delete('/checkers/{checker}', [CheckerController::class, 'destroy']);
    // Staff-only correction of an existing article scan (prefilled edit, no re-entry).
    Route::patch('/article-scans/{scan}', [ArticleScanController::class, 'update']);
    Route::get('/dashboard', [DashboardController::class, 'stats']);
    Route::get('/export', [DashboardController::class, 'export']);
});
