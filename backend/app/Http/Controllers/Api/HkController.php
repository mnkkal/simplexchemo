<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HkEntry;
use App\Models\HkInspection;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Housekeeping control board, digitized. Floor endpoints are public by
 * design (shared line devices, sweeper/inspector names as identity —
 * same model as the QC floor flow). Staff-only corrections live behind
 * Sanctum. Photos are client-compressed; the server only accepts images
 * and stores paths (files under public/uploads, no DB blobs).
 */
class HkController extends Controller
{
    public const STANDARDS = [
        ['key' => 'floor', 'label' => 'Floor is free from PP scrap, dust and oil.'],
        ['key' => 'machines', 'label' => 'Machines are clean and free from dust, oil and waste.'],
        ['key' => 'bins', 'label' => 'Waste bins are not overfilled and are emptied on time.'],
        ['key' => 'aisles', 'label' => 'Aisles and gangways are clear for safe movement.'],
        ['key' => 'bags', 'label' => 'Bags are stored on racks, not on the floor.'],
        ['key' => 'tobacco', 'label' => 'No tobacco, gutkha or pan spitting in the production area.'],
        ['key' => 'fire', 'label' => 'Fire extinguishers are available and accessible.'],
    ];

    public const SLOTS = [
        ['value' => '08:00', 'label' => '08.00'],
        ['value' => '10:00', 'label' => '10.00'],
        ['value' => '12:00', 'label' => '12.00'],
        ['value' => '14:00', 'label' => '02.00'],
        ['value' => '16:00', 'label' => '04.00'],
        ['value' => '18:00', 'label' => '06.00'],
        ['value' => '20:00', 'label' => '08.00'],
    ];

    public const SHIFTS = ['A', 'B'];
    private const STATUS = ['done', 'not_done'];
    private const VERDICT = ['ok', 'not_ok'];

    /** Public: fixed lists driving all HK forms (single source of truth). */
    public function meta()
    {
        return response()->json([
            'standards' => self::STANDARDS,
            'slots' => self::SLOTS,
            'shifts' => self::SHIFTS,
        ]);
    }

    /** Public diary: entries + inspections, optional line/date filters. */
    public function diary(Request $request)
    {
        $data = $request->validate([
            'line_no' => 'nullable|string|max:50',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);

        $q = HkEntry::with('inspection')->orderByDesc('cleaning_date')->orderBy('slot');
        if (!empty($data['line_no'])) {
            $q->where('line_no', $data['line_no']);
        }
        if (!empty($data['from'])) {
            $q->whereDate('cleaning_date', '>=', $data['from']);
        }
        if (!empty($data['to'])) {
            $q->whereDate('cleaning_date', '<=', $data['to']);
        }

        return response()->json($q->limit(500)->get());
    }

    /** Floor: one housekeeping row per line + date + slot. */
    public function storeEntry(Request $request)
    {
        $slots = collect(self::SLOTS)->pluck('value')->all();
        $data = $request->validate([
            'line_no' => 'required|string|max:50',
            'cleaning_date' => 'required|date',
            'slot' => 'required|string|in:'.implode(',', $slots),
            'shift' => 'required|string|in:'.implode(',', self::SHIFTS),
            'sweeper_name' => 'required|string|max:255',
            'sweeping' => 'required|string|in:'.implode(',', self::STATUS),
            'mopping' => 'required|string|in:'.implode(',', self::STATUS),
            'machine_cleaning' => 'required|string|in:'.implode(',', self::STATUS),
        ]);

        if (HkEntry::where('line_no', $data['line_no'])
            ->whereDate('cleaning_date', $data['cleaning_date'])
            ->where('slot', $data['slot'])->exists()) {
            return response()->json(['message' => 'Already recorded for this line, date and slot'], 422);
        }

        return response()->json(HkEntry::create($data), 201);
    }

    /** Staff-only correction of an entry. */
    public function updateEntry(Request $request, HkEntry $entry)
    {
        $slots = collect(self::SLOTS)->pluck('value')->all();
        $data = $request->validate([
            'shift' => 'sometimes|required|string|in:'.implode(',', self::SHIFTS),
            'sweeper_name' => 'sometimes|required|string|max:255',
            'sweeping' => 'sometimes|required|string|in:'.implode(',', self::STATUS),
            'mopping' => 'sometimes|required|string|in:'.implode(',', self::STATUS),
            'machine_cleaning' => 'sometimes|required|string|in:'.implode(',', self::STATUS),
        ]);
        $entry->fill($data);
        $entry->save();

        return response()->json($entry->load('inspection'));
    }

    /** Floor: inspect one entry — verdict + full 7-standard checklist + photos. */
    public function storeInspection(Request $request)
    {
        $data = $request->validate([
            'hk_entry_id' => 'required|integer|exists:hk_entries,id',
            'inspector_name' => 'required|string|max:255',
            'overall_status' => 'required|string|in:'.implode(',', self::VERDICT),
            'remark' => 'nullable|string',
            'standards' => 'required|array',
            'standards.*.key' => 'required|string',
            'standards.*.value' => 'required|string|in:'.implode(',', self::VERDICT),
            'photos' => 'nullable|array|max:3',
            'photos.*' => 'image|mimes:jpg,jpeg,png,webp|max:10240',
        ]);
        $this->assertFullStandards($data['standards']);

        if (HkInspection::where('hk_entry_id', $data['hk_entry_id'])->exists()) {
            return response()->json(['message' => 'This slot is already inspected'], 422);
        }

        $inspection = HkInspection::create([
            'hk_entry_id' => $data['hk_entry_id'],
            'inspector_name' => $data['inspector_name'],
            'overall_status' => $data['overall_status'],
            'remark' => $data['remark'] ?? null,
            'standards' => $this->normalizeStandards($data['standards']),
            'photo_paths' => $this->storePhotos($request),
        ]);

        return response()->json($inspection->load('entry'), 201);
    }

    /** Staff-only correction (POST so multipart photos keep working). */
    public function updateInspection(Request $request, HkInspection $inspection)
    {
        $data = $request->validate([
            'inspector_name' => 'sometimes|required|string|max:255',
            'overall_status' => 'sometimes|required|string|in:'.implode(',', self::VERDICT),
            'remark' => 'nullable|string',
            'standards' => 'sometimes|required|array',
            'standards.*.key' => 'required|string',
            'standards.*.value' => 'required|string|in:'.implode(',', self::VERDICT),
            'photos' => 'nullable|array|max:3',
            'photos.*' => 'image|mimes:jpg,jpeg,png,webp|max:10240',
        ]);
        if (array_key_exists('standards', $data)) {
            $this->assertFullStandards($data['standards']);
            $data['standards'] = $this->normalizeStandards($data['standards']);
        }
        $newPhotos = $this->storePhotos($request);
        if ($newPhotos) {
            $existing = $inspection->photo_paths ?? [];
            $data['photo_paths'] = array_values(array_slice(array_merge($existing, $newPhotos), 0, 6));
        }
        unset($data['photos']);
        $inspection->fill($data);
        $inspection->save();

        return response()->json($inspection->load('entry'));
    }

    private function assertFullStandards(array $standards): void
    {
        $keys = collect(self::STANDARDS)->pluck('key')->sort()->values()->all();
        $given = collect($standards)->pluck('key')->sort()->values()->all();
        if ($keys !== $given) {
            abort(422, 'All 7 housekeeping standards must be answered');
        }
    }

    private function normalizeStandards(array $standards): array
    {
        return collect($standards)->mapWithKeys(fn ($s) => [$s['key'] => $s['value']])->all();
    }

    /** @return string[] stored relative paths */
    private function storePhotos(Request $request): array
    {
        if (!$request->hasFile('photos')) {
            return [];
        }
        $dir = public_path('uploads/housekeeping');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $paths = [];
        foreach ((array) $request->file('photos') as $file) {
            if (!$file || !$file->isValid()) {
                continue;
            }
            $name = date('Ymd_His').'_'.Str::random(8).'.'.$file->extension();
            $file->move($dir, $name);
            $paths[] = 'uploads/housekeeping/'.$name;
        }

        return $paths;
    }
}
