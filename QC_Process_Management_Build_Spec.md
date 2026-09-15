# Quality Check Process Management — Build Specification

Use this as a full spec/prompt to hand to a developer or an AI coding assistant to build the system end to end.

## 1. Project overview

Build a barcode/QR-based Quality Check Process Management system for a manufacturing floor (garment/bag production). It tracks a production unit from order creation, through two rounds of quality checking, through pallet packing, to a scan-anytime traceability view for both internal staff and the end customer.

**Stack**: Laravel (backend/API), Next.js + React + Tailwind (frontend), built as an installable PWA (not a native app). Single codebase serves staff-facing and public-facing views on different routes.

## 2. Core workflow (five stages)

1. **Order & barcode generation** — order is entered; system generates a unique QR per unit and a printable label.
2. **Production QC (Round 1)** — QC checker scans a unit, identifies with their checker code, records Pass / Repair / Reject.
3. **Air-wash QC (Round 2)** — same unit is scanned again after air wash; a checker (same or different) records Pass / Repair / Reject.
4. **Pallet packing** — multiple passed units are physically grouped into a pallet. The pallet gets its **own new QR code** (see section 4) — this is not a reused unit QR.
5. **Scan & trace** — scanning any unit QR or pallet QR (staff or end customer) shows the relevant history.

## 3. Data model / entities

### `orders`
- `id`, `customer_name`, `purchase_order_no`, `article_no`, `bag_size`, `order_qty`, `created_at`

### `units`
- `id`, `order_id` (FK), `unit_qr_token` (unique, random 32-char, NOT sequential/guessable), `label_generated` (bool), `label_printed` (bool), `status` (`pending` / `in_qc` / `passed` / `failed_final`), `created_at`

### `qc_rounds`
- `id`, `unit_id` (FK), `round_type` (`production` / `air_wash`), `attempt_number` (int, increments on retest — never overwrite previous attempts), `production_date`, `production_shift`, `production_unit_no`, `production_line_no`, `production_supervisor_name`, `qc_checker_name`, `qc_checker_code`, `remark` (`pass` / `repair` / `reject`), `notes`, `tested_at`

Keep every attempt as its own row so retests never lose history. A unit only reaches `passed` status once both rounds show `pass` on their latest attempt.

### `pallets`
- `id`, `pallet_qr_token` (unique, random 32-char, newly generated at packing time — never reused from a unit), `customer_name`, `purchase_order_no`, `article_no`, `bag_size`, `pallet_pcs` (count of units inside), `pallet_no`, `packing_date`, `packing_time`, `packing_shift`, `packing_supervisor_name`, `packing_machine_operator_name`, `qc_scanner_generated` (bool), `created_at`

The `customer_name`, `purchase_order_no`, `article_no`, `bag_size` fields on the pallet are copied from the common order info at the time of packing (all units in one pallet should share the same order/article) — this is what "common information" means for the pallet QR.

### `pallet_units` (pivot/join table)
- `id`, `pallet_id` (FK), `unit_id` (FK), `added_at`

Links each pallet to every unit packed inside it. A unit can belong to only one pallet.

### `qc_checkers`
- `id`, `name`, `checker_code` (unique, used to identify themselves — not a full login), `device_token` (nullable, set after first submission from a device so the device is "remembered" for future scans), `active`

### `users` (internal staff — order team, packing team, management)
- Standard Laravel auth for back-office roles (order entry, admin dashboard). Full login here is fine since this isn't the fast-scan floor flow.

## 4. QR code rules — read carefully

- **Two QR types only**, generated at two different moments:
  1. **Unit QR** — generated once, at order/label stage, one per production unit.
  2. **Pallet QR** — generated once, at pack time, one per pallet. This is a **brand-new token**, not derived from or equal to any unit's QR.
- A pallet QR encodes/links to: the common order fields (customer, PO no., article no., bag size), the list of unit IDs packed into it, and `packing_date`, `packing_time`, `packing_shift`.
- Do **not** reuse a unit's QR to represent the pallet. Do **not** generate a QR at any other stage (no separate QR for QC rounds — QC rounds are recorded against the existing unit QR).
- Both QR types resolve through the same URL pattern, e.g. `/scan/{token}` — the backend looks up whether the token belongs to a unit or a pallet and renders the appropriate view. This keeps one scanning flow for staff and customers regardless of what was scanned.
- Tokens must be random and non-sequential/non-guessable (avoid incrementing IDs in the URL) so one customer can't enumerate other orders' or pallets' data.

## 5. Screens / views needed

### Staff-facing (requires checker code or staff login)
- **Order entry form** — create order, trigger unit QR + label generation, reprint label.
- **QC entry page** (opened by scanning a unit QR) — shows unit/order context, checker code entry, Pass/Repair/Reject selection + notes, submit. Must indicate which round (production or air-wash) is currently open for this unit.
- **Pallet packing page** — scan/add multiple unit QRs into a new pallet, auto-fill common order info from the first scanned unit, capture packing date/time/shift and supervisor/operator names, generate the pallet QR + printable label on save.
- **Admin dashboard** — order list, pass/repair/reject rates by line/shift/checker, pallet list with contained units, exports (CSV/Excel).

### Public-facing (no auth, read-only)
- **Unit scan view** — product/order info + both QC rounds' pass status (no checker names, no repair/reject detail — just confirms it passed).
- **Pallet scan view** — order info, packing date/shift, count of units, and their aggregate QC-pass status.

## 6. Offline / PWA requirements

- Installable PWA (Add to Home Screen), single Next.js codebase.
- Service worker caches the app shell so it loads with no network.
- QC remark submissions and pallet-packing actions taken offline are written to IndexedDB first, tagged with a client-generated UUID + timestamp, and synced to the Laravel API automatically once connectivity returns (Background Sync API or reconnect-triggered retry).
- A unit/order's details should be available offline only if that record was already fetched/cached during a prior online session on that device.

## 7. Checker identity

- No username/password login for QC checkers or packing staff on the floor.
- First use on a device: enter checker code once; store a signed device token (JWT in localStorage / PWA storage) so the device is "remembered."
- Each subsequent submission still requires re-entering the checker code (not the full device token flow) to attribute that specific remark to a specific person, but does not require a password.

## 8. Non-functional requirements

- Multi-round QC history must never be overwritten — always append new attempts.
- Pallet QR generation must be idempotent per packing session — don't allow duplicate pallet tokens for the same physical pallet if the page is refreshed mid-save.
- Exports (CSV/Excel) should mirror the same 3-tab structure as the original reference file (Order & Barcode, Production & QC Data, Pallet Scanner Data) for continuity with existing reporting.
- Barcode/label print format should be confirmed against existing printer/label stock (e.g. Zebra ZPL vs. standard image-based label) before finalizing the print module.

## 9. Out of scope (for this phase)

- Multi-tenant support for multiple factories (single-tenant deployment assumed unless specified otherwise).
- Native mobile app builds.
- Payment/billing integration.
