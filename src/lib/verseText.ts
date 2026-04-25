export interface VerseTextResult {
  reference: string;
  text: string;
  translation: string;
  source: string;
}

export type VerseTextErrorCode =
  | 'EMPTY_REFERENCE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'INVALID_RESPONSE';

export class VerseTextError extends Error {
  code: VerseTextErrorCode;

  constructor(code: VerseTextErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface VerseTextRequestOptions {
  endpoint?: string;
  timeoutMs?: number;
  retries?: number;
}

const VERSE_PROXY_ENDPOINT = '/api/verse';
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const BIBLE_API_TRANSLATION_LABEL = 'KJV';

export const VERSE_TEXT_SOURCE_LABEL = `${BIBLE_API_TRANSLATION_LABEL} via GitHub JSON (API fallback)`;

function normalizeVerseText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toVerseTextError(error: unknown, statusHint?: number): VerseTextError {
  if (error instanceof VerseTextError) return error;

  if (statusHint === 404) {
    return new VerseTextError('NOT_FOUND', 'Verse not found in source translation.');
  }

  if (statusHint === 429) {
    return new VerseTextError('RATE_LIMITED', 'Verse source is busy. Please retry shortly.');
  }

  if (statusHint && statusHint >= 500) {
    return new VerseTextError('UPSTREAM', `Verse provider error (${statusHint}).`);
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new VerseTextError('TIMEOUT', 'Verse request timed out.');
  }

  if (error instanceof TypeError) {
    return new VerseTextError('NETWORK', 'Network error while loading verse text.');
  }

  if (error instanceof Error) {
    return new VerseTextError('UPSTREAM', error.message);
  }

  return new VerseTextError('UPSTREAM', 'Unable to load verse text.');
}

export async function fetchVerseText(reference: string, options: VerseTextRequestOptions = {}): Promise<VerseTextResult> {
  const cleanedReference = reference.trim();
  if (!cleanedReference) {
    throw new VerseTextError('EMPTY_REFERENCE', 'Verse reference is empty.');
  }

  const endpoint = options.endpoint ?? VERSE_PROXY_ENDPOINT;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${endpoint}?reference=${encodeURIComponent(cleanedReference)}`;

  let lastError: VerseTextError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw toVerseTextError(new Error(`HTTP ${response.status}`), response.status);
      }

      const payload = await response.json() as {
        error?: string;
        text?: string;
        translation?: string;
        source?: string;
      };

      if (payload.error) {
        throw new VerseTextError('UPSTREAM', payload.error);
      }

      const text = normalizeVerseText(payload.text ?? '');
      if (!text) {
        throw new VerseTextError('INVALID_RESPONSE', 'No verse text returned by provider.');
      }

      clearTimeout(timeoutId);
      return {
        reference: cleanedReference,
        text,
        translation: (payload.translation ?? BIBLE_API_TRANSLATION_LABEL).trim() || BIBLE_API_TRANSLATION_LABEL,
        source: (payload.source ?? 'bible-api.com').trim() || 'bible-api.com',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = toVerseTextError(error);

      const retryable = lastError.code === 'NETWORK' || lastError.code === 'TIMEOUT' || lastError.code === 'UPSTREAM' || lastError.code === 'RATE_LIMITED';
      if (!retryable || attempt === retries) {
        throw lastError;
      }

      await sleep(BASE_BACKOFF_MS * (2 ** attempt));
    }
  }

  throw lastError ?? new VerseTextError('UPSTREAM', 'Unable to load verse text.');
}