const BIBLE_API_BASE_URL = 'https://bible-api.com';
const BIBLE_API_TRANSLATION = 'kjv';

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

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const reference = (url.searchParams.get('reference') ?? '').trim();

  if (!reference) {
    return json(400, { error: 'Missing reference query parameter.' });
  }

  const upstreamUrl = `${BIBLE_API_BASE_URL}/${encodeURIComponent(reference)}?translation=${BIBLE_API_TRANSLATION}`;

  try {
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
      source: 'bible-api.com',
    });
  } catch {
    return json(502, { error: 'Unable to reach verse provider.' });
  }
}
