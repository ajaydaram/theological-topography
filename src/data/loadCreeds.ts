import { CreedDocument, CreedDocumentType, CreedProof, HistoricalDate, VerseIndexEntry } from '../types';
import { formatVerseReference } from '../lib/normalizer';

const NORMALIZED_URL = '/normalized-creeds.json';
const VERSE_PIVOT_URL = '/verse-pivot.json';
const SNAPSHOT_URL = '/data.json';
const TREE_URL = 'https://api.github.com/repos/NonlinearFruit/Creeds.json/git/trees/master?recursive=1';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/NonlinearFruit/Creeds.json/master/';

const TOPIC_RULES = [
  { topic: 'Scripture', keywords: ['scripture', 'holy scripture', 'word of god', 'canon', 'apocrypha'] },
  { topic: 'Trinity', keywords: ['trinity', 'godhead', 'father', 'son', 'holy ghost', 'holy spirit'] },
  { topic: 'Christology', keywords: ['christ', 'mediator', 'incarnation', 'redemption', 'atonement', 'resurrection'] },
  { topic: 'Soteriology', keywords: ['salvation', 'justification', 'sanctification', 'adoption', 'faith', 'grace'] },
  { topic: 'Ecclesiology', keywords: ['church', 'synod', 'council', 'minister', 'worship', 'sacrament'] },
  { topic: 'Providence', keywords: ['providence', 'decree', 'predestination', 'foreknowledge', 'counsel'] },
  { topic: 'Anthropology', keywords: ['man', 'adam', 'free will', 'sin', 'fall', 'nature'] },
  { topic: 'Law', keywords: ['law', 'commandment', 'oath', 'vow', 'sabbath', 'magistrate'] },
  { topic: 'Covenant', keywords: ['covenant', 'testament'] },
  { topic: 'Eschatology', keywords: ['judgment', 'resurrection', 'death', 'eternal', 'heaven', 'hell'] },
];

type RemoteProof = {
  Id?: number;
  References?: string[];
};

type RemoteMetadata = {
  Title: string;
  Year: string;
  CreedFormat: 'Creed' | 'Canon' | 'Confession' | 'Catechism' | 'HenrysCatechism';
};

type RemoteCreed = {
  Metadata: RemoteMetadata;
  Data: unknown;
};

type SnapshotDocument = Omit<CreedDocument, 'topics'> & {
  topics?: string[];
};

type SnapshotPayload = {
  generatedAt?: string;
  documents?: SnapshotDocument[];
  nodes?: SnapshotDocument[];
};

export type CreedDataSource = 'local-snapshot' | 'remote-fetch';

export type LoadedCreedData = {
  documents: CreedDocument[];
  source: CreedDataSource;
  generatedAt: string | null;
};

type VersePivotPayload = {
  entries: Array<{
    verse: string;
    creedIds: string[];
  }>;
};

export type VerseIndexData = {
  verseIndex: VerseIndexEntry[];
  verseMap: Record<string, string[]>;
};

type TreeEntry = {
  path: string;
  type: string;
};

const DATE_OVERRIDES: Array<{
  match: RegExp;
  date: HistoricalDate;
}> = [
  {
    match: /apostles\s+creed/i,
    date: {
      label: 'A.D. 650 (received text)',
      startYear: 650,
      precision: 'circa',
      confidence: 'medium',
    },
  },
  {
    match: /athanasian\s+creed/i,
    date: {
      label: '5th-6th century',
      startYear: 500,
      endYear: 600,
      precision: 'century-range',
      confidence: 'medium',
    },
  },
  {
    match: /thirty\s*[- ]?nine\s+articles/i,
    date: {
      label: 'A.D. 1563/1571',
      startYear: 1563,
      endYear: 1571,
      precision: 'year-range',
      confidence: 'high',
    },
  },
  {
    match: /canons\s+of\s+dort/i,
    date: {
      label: 'A.D. 1618-1619',
      startYear: 1618,
      endYear: 1619,
      precision: 'year-range',
      confidence: 'high',
    },
  },
  {
    match: /chicago\s*[- ]?lambeth\s+quadrilateral/i,
    date: {
      label: 'A.D. 1886/1888',
      startYear: 1886,
      endYear: 1888,
      precision: 'year-range',
      confidence: 'high',
    },
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferDocumentType(title: string): CreedDocumentType {
  const normalized = title.toLowerCase();

  if (/\b(apostles|nicene|chalcedonian|athanasian)\b/.test(normalized) && normalized.includes('creed')) {
    return 'ecumenical-creed';
  }

  if (normalized.includes('catechism')) return 'catechism';
  if (normalized.includes('confession')) return 'confession';
  if (normalized.includes('declaration') || normalized.includes('statement') || normalized.includes('articles')) return 'declaration';
  if (normalized.includes('canon') || normalized.includes('canons')) return 'canon';
  if (normalized.includes('creed')) return 'confession';

  return 'other';
}

function inferHistoricalDate(title: string, year: number): HistoricalDate {
  for (const override of DATE_OVERRIDES) {
    if (override.match.test(title)) {
      return override.date;
    }
  }

  if (Number.isFinite(year) && year > 0) {
    return {
      label: `A.D. ${year}`,
      startYear: year,
      precision: 'year',
      confidence: 'high',
    };
  }

  return {
    label: 'UNKNOWN',
    precision: 'unknown',
    confidence: 'low',
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function collectProofs(proofs: RemoteProof[] | undefined): CreedProof[] {
  if (!proofs) return [];

  const references = proofs.flatMap((proof) => proof.References ?? []);
  return uniqueStrings(references).map((reference) => {
    const display = formatVerseReference(reference);
    return {
      verseId: display,
      display,
    };
  });
}

function inferTopics(title: string, content: string): string[] {
  const haystack = `${title} ${content}`.toLowerCase();
  return TOPIC_RULES
    .filter(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)))
    .map(({ topic }) => topic);
}

function createDocument(params: {
  id: string;
  title: string;
  content: string;
  year: number;
  proofs: CreedProof[];
  sourcePath: string;
}): CreedDocument {
  const historicalType = inferDocumentType(params.title);

  return {
    ...params,
    connections: [],
    history_link: null,
    topics: inferTopics(params.title, params.content),
    sourcePath: params.sourcePath,
    historical: {
      type: historicalType,
      date: inferHistoricalDate(params.title, params.year),
    },
  };
}

function normalizeSnapshotDocuments(payload: SnapshotPayload): CreedDocument[] {
  const sourceDocuments = payload.documents ?? payload.nodes ?? [];

  return sourceDocuments.map((document) => ({
    ...document,
    topics: document.topics ?? inferTopics(document.title, document.content),
    sourcePath: document.sourcePath ?? 'public/data.json',
    historical: document.historical ?? {
      type: inferDocumentType(document.title),
      date: inferHistoricalDate(document.title, Number(document.year)),
    },
  }));
}

function buildVerseIndexFromPivot(payload: VersePivotPayload): VerseIndexData {
  const verseIndex = payload.entries
    .map((entry) => ({
      verse: entry.verse,
      referencedBy: uniqueStrings(entry.creedIds),
    }))
    .sort((a, b) => b.referencedBy.length - a.referencedBy.length || a.verse.localeCompare(b.verse));

  return {
    verseIndex,
    verseMap: Object.fromEntries(verseIndex.map((entry) => [entry.verse, entry.referencedBy])),
  };
}

function flattenCreed(filePath: string, creed: RemoteCreed): CreedDocument[] {
  const baseId = slugify(filePath.replace(/^creeds\//, '').replace(/\.json$/, ''));
  const year = Number.parseInt(creed.Metadata.Year, 10) || 0;

  const data = creed.Data as any;
  switch (creed.Metadata.CreedFormat) {
    case 'Creed': {
      return [
        createDocument({
          id: baseId,
          title: creed.Metadata.Title,
          content: data.Content ?? '',
          year,
          proofs: collectProofs(data.Proofs),
          sourcePath: filePath,
        }),
      ];
    }
    case 'Canon': {
      return Array.isArray(data)
        ? data.map((article: any) =>
            createDocument({
              id: `${baseId}-article-${slugify(String(article.Article ?? article.Title ?? 'article'))}`,
              title: `${creed.Metadata.Title} ${article.Article ?? article.Title ?? ''}`.trim(),
              content: article.Content ?? '',
              year,
              proofs: collectProofs(article.Proofs),
              sourcePath: filePath,
            }),
          )
        : [];
    }
    case 'Confession': {
      return Array.isArray(data)
        ? data.flatMap((chapter: any) => {
            const chapterTitle = `${creed.Metadata.Title} Chapter ${chapter.Chapter}: ${chapter.Title ?? ''}`.trim();
            return Array.isArray(chapter.Sections)
              ? chapter.Sections.map((section: any) =>
                  createDocument({
                    id: `${baseId}-ch-${slugify(String(chapter.Chapter))}-sec-${slugify(String(section.Section))}`,
                    title: `${chapterTitle} (Section ${section.Section})`,
                    content: section.Content ?? '',
                    year,
                    proofs: collectProofs(section.Proofs),
                    sourcePath: filePath,
                  }),
                )
              : [];
          })
        : [];
    }
    case 'Catechism': {
      return Array.isArray(data)
        ? data.map((question: any) =>
            createDocument({
              id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}`,
              title: `${creed.Metadata.Title} Q${question.Number}: ${question.Question ?? ''}`.trim(),
              content: question.Answer ?? '',
              year,
              proofs: collectProofs(question.Proofs),
              sourcePath: filePath,
            }),
          )
        : [];
    }
    case 'HenrysCatechism': {
      return Array.isArray(data)
        ? data.flatMap((question: any) =>
            Array.isArray(question.SubQuestions) && question.SubQuestions.length > 0
              ? question.SubQuestions.map((subQuestion: any) =>
                  createDocument({
                    id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}-${slugify(String(subQuestion.Number ?? '0'))}`,
                    title: `${creed.Metadata.Title} ${question.Number}.${subQuestion.Number}: ${subQuestion.Question ?? ''}`.trim(),
                    content: subQuestion.Answer ?? '',
                    year,
                    proofs: collectProofs(subQuestion.Proofs),
                    sourcePath: filePath,
                  }),
                )
              : [
                  createDocument({
                    id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}`,
                    title: `${creed.Metadata.Title} ${question.Number}: ${question.Question ?? ''}`.trim(),
                    content: question.Answer ?? '',
                    year,
                    proofs: collectProofs(question.Proofs),
                    sourcePath: filePath,
                  }),
                ],
          )
        : [];
    }
    default:
      return [];
  }
}

function chooseAncestor(currentIndex: number, docs: CreedDocument[]) {
  const current = docs[currentIndex];
  const priorDocs = docs.slice(0, currentIndex);
  const currentTopics = current.topics ?? [];

  let bestMatch: CreedDocument | null = null;
  let bestScore = 0;

  for (const candidate of priorDocs) {
    const candidateTopics = candidate.topics ?? [];
    const sharedTopics = currentTopics.filter((topic) => candidateTopics.includes(topic)).length;
    const sharedVerses = current.proofs.filter((proof) => candidate.proofs.some((other) => other.verseId === proof.verseId)).length;
    const score = sharedTopics * 4 + sharedVerses;

    if (score > bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function enrichDocuments(documents: CreedDocument[]) {
  const sorted = [...documents].sort((a, b) => Number(a.year) - Number(b.year) || a.title.localeCompare(b.title));

  return sorted.map((doc, index) => {
    const ancestor = chooseAncestor(index, sorted);
    const docTopics = doc.topics ?? [];
    const related = sorted
      .filter((candidate) => candidate.id !== doc.id)
      .map((candidate) => {
        const candidateTopics = candidate.topics ?? [];
        const sharedTopics = docTopics.filter((topic) => candidateTopics.includes(topic)).length;
        const sharedVerses = doc.proofs.filter((proof) => candidate.proofs.some((other) => other.verseId === proof.verseId)).length;
        return {
          candidate,
          score: sharedTopics * 4 + sharedVerses,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.candidate.year) - Number(b.candidate.year))
      .slice(0, 5)
      .map((entry) => entry.candidate.id)
      .filter((id) => id !== ancestor?.id);

    return {
      ...doc,
      history_link: ancestor?.id ?? null,
      connections: uniqueStrings(related),
    };
  });
}

export async function loadCreedDocuments(): Promise<LoadedCreedData> {
  const normalizedSnapshot = await fetchJson<SnapshotPayload>(NORMALIZED_URL);
  if (normalizedSnapshot) {
    return {
      documents: enrichDocuments(normalizeSnapshotDocuments(normalizedSnapshot)),
      source: 'local-snapshot',
      generatedAt: normalizedSnapshot.generatedAt ?? null,
    };
  }

  try {
    const snapshotResponse = await fetch(SNAPSHOT_URL);
    if (snapshotResponse.ok) {
      const snapshot = (await snapshotResponse.json()) as SnapshotPayload;
      return {
        documents: enrichDocuments(normalizeSnapshotDocuments(snapshot)),
        source: 'local-snapshot',
        generatedAt: snapshot.generatedAt ?? null,
      };
    }
  } catch {
    // Fall through to the remote source.
  }

  const treeResponse = await fetch(TREE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!treeResponse.ok) {
    throw new Error(`Failed to load repository tree (${treeResponse.status})`);
  }

  const tree = (await treeResponse.json()) as { tree?: TreeEntry[] };
  const creedFiles = (tree.tree ?? []).filter((entry) => entry.type === 'blob' && /^creeds\/.*\.json$/.test(entry.path));

  const documents = await Promise.all(
    creedFiles.map(async (entry) => {
      const response = await fetch(`${RAW_BASE_URL}${entry.path}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${entry.path} (${response.status})`);
      }

      const creed = (await response.json()) as RemoteCreed;
      return flattenCreed(entry.path, creed);
    }),
  );

  return {
    documents: enrichDocuments(documents.flat()),
    source: 'remote-fetch',
    generatedAt: null,
  };
}

export async function loadVerseIndexData(documents: CreedDocument[]): Promise<VerseIndexData> {
  const pivot = await fetchJson<VersePivotPayload>(VERSE_PIVOT_URL);
  if (pivot) {
    return buildVerseIndexFromPivot(pivot);
  }

  return buildVerseIndex(documents);
}

export function buildVerseIndex(documents: CreedDocument[]) {
  const index = new Map<string, Set<string>>();

  for (const document of documents) {
    for (const proof of document.proofs) {
      const verse = proof.display;
      if (!index.has(verse)) {
        index.set(verse, new Set<string>());
      }

      index.get(verse)!.add(document.id);
    }
  }

  const verseIndex = Array.from(index.entries())
    .map(([verse, referencedBy]) => ({ verse, referencedBy: Array.from(referencedBy) }))
    .sort((a, b) => b.referencedBy.length - a.referencedBy.length || a.verse.localeCompare(b.verse));

  const verseMap = Object.fromEntries(verseIndex.map((entry) => [entry.verse, entry.referencedBy]));

  return { verseIndex, verseMap };
}

export function buildTopicIndex(documents: CreedDocument[]) {
  const topicMap = new Map<string, string[]>();

  for (const document of documents) {
    for (const topic of document.topics ?? []) {
      if (!topicMap.has(topic)) {
        topicMap.set(topic, []);
      }

      topicMap.get(topic)!.push(document.id);
    }
  }

  return Object.fromEntries(
    Array.from(topicMap.entries()).map(([topic, ids]) => [topic, uniqueStrings(ids)]),
  );
}