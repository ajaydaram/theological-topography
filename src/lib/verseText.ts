export interface VerseTextResult {
  reference: string;
  text: string;
  translation: string;
  source: string;
}

const BIBLE_API_BASE_URL = 'https://bible-api.com';
const BIBLE_API_TRANSLATION = 'kjv';
const BIBLE_API_TRANSLATION_LABEL = 'KJV';

export const VERSE_TEXT_SOURCE_LABEL = `${BIBLE_API_TRANSLATION_LABEL} via bible-api.com`;

function normalizeVerseText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchVerseText(reference: string): Promise<VerseTextResult> {
  const cleanedReference = reference.trim();
  if (!cleanedReference) {
    throw new Error('Verse reference is empty.');
  }

  const url = `${BIBLE_API_BASE_URL}/${encodeURIComponent(cleanedReference)}?translation=${BIBLE_API_TRANSLATION}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load verse text (${response.status}).`);
  }

  const payload = await response.json() as {
    error?: string;
    text?: string;
    translation_name?: string;
  };

  if (payload.error) {
    throw new Error(payload.error);
  }

  const text = normalizeVerseText(payload.text ?? '');
  if (!text) {
    throw new Error('No verse text returned by provider.');
  }

  return {
    reference: cleanedReference,
    text,
    translation: (payload.translation_name ?? BIBLE_API_TRANSLATION_LABEL).trim() || BIBLE_API_TRANSLATION_LABEL,
    source: 'bible-api.com',
  };
}