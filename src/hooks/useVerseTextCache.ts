import { useEffect, useMemo, useState } from 'react';
import { fetchVerseText } from '../lib/verseText';

export type VerseTextStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface VerseTextEntry {
  status: VerseTextStatus;
  text?: string;
  translation?: string;
  source?: string;
  error?: string;
  loadedAt?: number;
}

interface VerseTextCacheOptions {
  ttlMs?: number;
  onReveal?: () => void;
}

const STORAGE_KEY = 'theological-topography-verse-text-cache-v1';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function getSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readPersistedCache(ttlMs: number): Record<string, VerseTextEntry> {
  const storage = getSessionStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, VerseTextEntry>;
    const now = Date.now();
    const validEntries = Object.entries(parsed).filter(([, value]) => {
      if (!value || typeof value !== 'object') return false;
      if (value.status !== 'loaded') return false;
      if (!value.loadedAt) return false;
      return now - value.loadedAt <= ttlMs;
    });

    return Object.fromEntries(validEntries);
  } catch {
    return {};
  }
}

export function useVerseTextCache(options: VerseTextCacheOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const [visibleVerseTexts, setVisibleVerseTexts] = useState<Record<string, boolean>>({});
  const [verseTextCache, setVerseTextCache] = useState<Record<string, VerseTextEntry>>(() => readPersistedCache(ttlMs));

  useEffect(() => {
    const storage = getSessionStorage();
    if (!storage) return;

    const loadedEntries = Object.entries(verseTextCache).filter(([, value]) => {
      const entry = value as VerseTextEntry;
      return entry.status === 'loaded';
    });
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(loadedEntries)));
  }, [verseTextCache]);

  const ensureVerseTextLoaded = (reference: string) => {
    const key = reference.trim();
    if (!key) return;

    const cached = verseTextCache[key];
    if (cached?.status === 'loading' || cached?.status === 'loaded') {
      return;
    }

    setVerseTextCache((current) => ({
      ...current,
      [key]: { status: 'loading' },
    }));

    void (async () => {
      try {
        const verseText = await fetchVerseText(key);
        setVerseTextCache((current) => ({
          ...current,
          [key]: {
            status: 'loaded',
            text: verseText.text,
            translation: verseText.translation,
            source: verseText.source,
            loadedAt: Date.now(),
          },
        }));
      } catch (error) {
        setVerseTextCache((current) => ({
          ...current,
          [key]: {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unable to load verse text.',
          },
        }));
      }
    })();
  };

  const showVerseText = (reference: string) => {
    const key = reference.trim();
    if (!key) return;

    const wasVisible = Boolean(visibleVerseTexts[key]);
    setVisibleVerseTexts((current) => ({
      ...current,
      [key]: true,
    }));

    ensureVerseTextLoaded(key);
    if (!wasVisible) {
      options.onReveal?.();
    }
  };

  const hideVerseText = (reference: string) => {
    const key = reference.trim();
    if (!key) return;

    setVisibleVerseTexts((current) => ({
      ...current,
      [key]: false,
    }));
  };

  const toggleVerseText = (reference: string) => {
    const key = reference.trim();
    if (!key) return;

    if (visibleVerseTexts[key]) {
      hideVerseText(key);
      return;
    }

    showVerseText(key);
  };

  const showAllVerseTexts = (references: string[]) => {
    const cleaned = references.map((reference) => reference.trim()).filter(Boolean);
    if (!cleaned.length) return;

    setVisibleVerseTexts((current) => {
      const next = { ...current };
      for (const reference of cleaned) {
        const wasVisible = Boolean(next[reference]);
        next[reference] = true;
        if (!wasVisible) {
          options.onReveal?.();
        }
      }
      return next;
    });

    for (const reference of cleaned) {
      ensureVerseTextLoaded(reference);
    }
  };

  const hideAllVerseTexts = (references: string[]) => {
    const cleaned = references.map((reference) => reference.trim()).filter(Boolean);
    if (!cleaned.length) return;

    setVisibleVerseTexts((current) => {
      const next = { ...current };
      for (const reference of cleaned) {
        next[reference] = false;
      }
      return next;
    });
  };

  const retryVerseText = (reference: string) => {
    const key = reference.trim();
    if (!key) return;

    setVerseTextCache((current) => ({
      ...current,
      [key]: { status: 'idle' },
    }));
    ensureVerseTextLoaded(key);
  };

  const visibleCount = useMemo(
    () => Object.values(visibleVerseTexts).filter(Boolean).length,
    [visibleVerseTexts],
  );

  return {
    verseTextCache,
    visibleVerseTexts,
    visibleCount,
    toggleVerseText,
    showVerseText,
    hideVerseText,
    showAllVerseTexts,
    hideAllVerseTexts,
    retryVerseText,
  };
}
