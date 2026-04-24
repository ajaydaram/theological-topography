const STORAGE_KEY = 'theological-topography-telemetry';

export type TelemetryEventName =
  | 'deep_search_submitted'
  | 'reference_panel_opened'
  | 'verse_tooltip_opened'
  | 'panel_swapped';

export type TelemetryCounts = Record<TelemetryEventName, number>;

const DEFAULT_COUNTS: TelemetryCounts = {
  deep_search_submitted: 0,
  reference_panel_opened: 0,
  verse_tooltip_opened: 0,
  panel_swapped: 0,
};

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readTelemetryCounts(): TelemetryCounts {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_COUNTS };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COUNTS };

    const parsed = JSON.parse(raw) as Partial<TelemetryCounts>;
    return {
      deep_search_submitted: parsed.deep_search_submitted ?? 0,
      reference_panel_opened: parsed.reference_panel_opened ?? 0,
      verse_tooltip_opened: parsed.verse_tooltip_opened ?? 0,
      panel_swapped: parsed.panel_swapped ?? 0,
    };
  } catch {
    return { ...DEFAULT_COUNTS };
  }
}

export function recordTelemetryEvent(name: TelemetryEventName) {
  const storage = getStorage();
  if (!storage) return;

  const counts = readTelemetryCounts();
  counts[name] += 1;
  storage.setItem(STORAGE_KEY, JSON.stringify(counts));
}
