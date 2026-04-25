const BIBLE_API_BASE_URL = 'https://bible-api.com';
const BIBLE_API_TRANSLATION = 'kjv';
const DEFAULT_GITHUB_KJV_JSON_URL = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json';

type GithubBibleBook = {
  name: string;
  abbrev?: string;
  chapters: string[][];
};

type ParsedReference = {
  book: string;
  chapter: number;
  verses: number[];
};

let githubBiblePromise: Promise<GithubBibleBook[]> | null = null;

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Cache successful verse responses at edge and allow stale while revalidate.
      'cache-control': status === 200
        ? 'public, s-maxage=3600, stale-while-revalidate=86400'
        : 'no-store',
    },
  });
}

function normalizeVerseText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeBookName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseReference(reference: string): ParsedReference | null {
  const match = reference.trim().match(/^(.+?)\s+(\d+):(\d+(?:\s*[-,]\s*\d+)*)$/);
  if (!match) return null;

  const [, rawBook, rawChapter, rawVerses] = match;
  const chapter = Number(rawChapter);
  if (!Number.isFinite(chapter) || chapter < 1) return null;

  const verses = new Set<number>();
  for (const part of rawVerses.split(',')) {
    const cleaned = part.trim();
    if (!cleaned) continue;

    if (cleaned.includes('-')) {
      const [startRaw, endRaw] = cleaned.split('-').map((item) => Number(item.trim()));
      if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) return null;
      const start = Math.min(startRaw, endRaw);
      const end = Math.max(startRaw, endRaw);
      for (let verse = start; verse <= end; verse += 1) {
        if (verse > 0) verses.add(verse);
      }
    } else {
      const verse = Number(cleaned);
      if (!Number.isFinite(verse) || verse < 1) return null;
      verses.add(verse);
    }
  }

  if (!verses.size) return null;

  return {
    book: rawBook.trim(),
    chapter,
    verses: Array.from(verses).sort((a, b) => a - b),
  };
}

async function loadGithubBibleJson() {
  if (!githubBiblePromise) {
    const sourceUrl = process.env.VERSE_JSON_URL || DEFAULT_GITHUB_KJV_JSON_URL;
    githubBiblePromise = fetch(sourceUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GitHub JSON returned ${response.status}`);
        }
        return response.json() as Promise<GithubBibleBook[]>;
      })
      .then((payload) => {
        if (!Array.isArray(payload)) {
          throw new Error('Invalid GitHub JSON payload shape.');
        }
        return payload;
      })
      .catch((error) => {
        githubBiblePromise = null;
        throw error;
      });
  }

  return githubBiblePromise;
}

async function resolveFromGithubJson(reference: string) {
  const parsed = parseReference(reference);
  if (!parsed) return null;

  const payload = await loadGithubBibleJson();
  const targetBook = normalizeBookName(parsed.book);
  const book = payload.find((item) => {
    const byName = normalizeBookName(item.name) === targetBook;
    const byAbbrev = item.abbrev ? normalizeBookName(item.abbrev) === targetBook : false;
    return byName || byAbbrev;
  });

  if (!book) return null;

  const chapter = book.chapters[parsed.chapter - 1];
  if (!chapter || !Array.isArray(chapter)) return null;

  const chunks: string[] = [];
  for (const verseNumber of parsed.verses) {
    const verseText = chapter[verseNumber - 1];
    if (!verseText) continue;
    chunks.push(`${book.name} ${parsed.chapter}:${verseNumber} ${verseText}`);
  }

  if (!chunks.length) return null;

  return {
    reference,
    text: normalizeVerseText(chunks.join('\n')),
    translation: 'KJV',
    source: 'github-json',
  };
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const reference = (url.searchParams.get('reference') ?? '').trim();

  if (!reference) {
    return json(400, { error: 'Missing reference query parameter.' });
  }

  const upstreamUrl = `${BIBLE_API_BASE_URL}/${encodeURIComponent(reference)}?translation=${BIBLE_API_TRANSLATION}`;

  try {
    const githubResolved = await resolveFromGithubJson(reference);
    if (githubResolved) {
      return json(200, githubResolved);
    }

    const upstreamResponse = await fetch(upstreamUrl);

    if (!upstreamResponse.ok) {
      const status = upstreamResponse.status === 404 || upstreamResponse.status === 429
        ? upstreamResponse.status
        : 502;
      return json(status, { error: `Upstream verse provider returned ${upstreamResponse.status}.` });
    }

    const payload = await upstreamResponse.json() as {
      error?: string;
      text?: string;
      translation_name?: string;
    };

    if (payload.error) {
      return json(404, { error: payload.error });
    }

    const text = normalizeVerseText(payload.text ?? '');
    if (!text) {
      return json(502, { error: 'Verse provider returned empty text.' });
    }

    return json(200, {
      reference,
      text,
      translation: (payload.translation_name ?? 'KJV').trim() || 'KJV',
      source: 'bible-api.com-fallback',
    });
  } catch {
    return json(502, { error: 'Unable to reach verse provider.' });
  }
}
