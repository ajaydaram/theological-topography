import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

type CreedProof = {
  verseId: string;
  display: string;
};

type NormalizedNode = {
  id: string;
  title: string;
  year: number;
  content: string;
  proofs: CreedProof[];
  citationIds: number[];
  sourcePath: string;
};

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

const BOOK_MAP: Record<string, string> = {
  'Gen.': 'Genesis',
  'Ex.': 'Exodus',
  'Exod.': 'Exodus',
  'Lev.': 'Leviticus',
  'Num.': 'Numbers',
  'Deut.': 'Deuteronomy',
  'Josh.': 'Joshua',
  'Judg.': 'Judges',
  'Ruth': 'Ruth',
  '1 Sam.': '1 Samuel',
  '2 Sam.': '2 Samuel',
  '1 Kings': '1 Kings',
  '2 Kings': '2 Kings',
  '1 Chron.': '1 Chronicles',
  '2 Chron.': '2 Chronicles',
  'Ezra': 'Ezra',
  'Neh.': 'Nehemiah',
  'Esth.': 'Esther',
  'Job': 'Job',
  'Ps.': 'Psalms',
  'Psa.': 'Psalms',
  'Prov.': 'Proverbs',
  'Eccles.': 'Ecclesiastes',
  'Song': 'Song of Solomon',
  'Isa.': 'Isaiah',
  'Jer.': 'Jeremiah',
  'Lam.': 'Lamentations',
  'Ezek.': 'Ezekiel',
  'Dan.': 'Daniel',
  'Hos.': 'Hosea',
  'Joel': 'Joel',
  'Amos': 'Amos',
  'Obad.': 'Obadiah',
  'Jonah': 'Jonah',
  'Mic.': 'Micah',
  'Nah.': 'Nahum',
  'Hab.': 'Habakkuk',
  'Zeph.': 'Zephaniah',
  'Hag.': 'Haggai',
  'Zech.': 'Zechariah',
  'Mal.': 'Malachi',
  'Matt.': 'Matthew',
  'Mk.': 'Mark',
  'Lk.': 'Luke',
  'Jn.': 'John',
  'Acts': 'Acts',
  'Rom.': 'Romans',
  '1 Cor.': '1 Corinthians',
  '2 Cor.': '2 Corinthians',
  'Gal.': 'Galatians',
  'Eph.': 'Ephesians',
  'Phil.': 'Philippians',
  'Col.': 'Colossians',
  '1 Thess.': '1 Thessalonians',
  '2 Thess.': '2 Thessalonians',
  '1 Tim.': '1 Timothy',
  '2 Tim.': '2 Timothy',
  'Tit.': 'Titus',
  'Philem.': 'Philemon',
  'Heb.': 'Hebrews',
  'Jas.': 'James',
  '1 Pet.': '1 Peter',
  '2 Pet.': '2 Peter',
  '1 Jn.': '1 John',
  '2 Jn.': '2 John',
  '3 Jn.': '3 John',
  'Jude': 'Jude',
  'Rev.': 'Revelation',
};

const BOOK_ENTRIES = Object.entries(BOOK_MAP).sort((a, b) => b[0].length - a[0].length);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value))));
}

function extractCitationIds(text: string | undefined) {
  if (!text) return [];

  const matches = text.matchAll(/\[(\d+)\]/g);
  return uniqueNumbers(Array.from(matches, (match) => Number.parseInt(match[1], 10)));
}

function stripCitationMarkers(text: string | undefined) {
  if (!text) return '';

  return text
    .replace(/\[(\d+)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function normalizeSegment(segment: string) {
  const trimmed = segment.trim();

  for (const [abbr, full] of BOOK_ENTRIES) {
    if (trimmed.startsWith(abbr)) {
      const remainder = trimmed.slice(abbr.length).replace(/^\./, '').trim();
      const normalizedRemainder = remainder.replace(/\./g, ':');
      return normalizedRemainder ? `${full} ${normalizedRemainder}` : full;
    }
  }

  return trimmed.replace(/\./g, ':');
}

function normalizeVerse(reference: string) {
  return reference
    .split('-')
    .map(normalizeSegment)
    .join('-')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectProofs(proofs: RemoteProof[] | undefined, citationIds: number[] = []): CreedProof[] {
  if (!proofs) return [];

  const proofById = new Map<number, RemoteProof>();
  for (const proof of proofs) {
    if (typeof proof.Id === 'number') {
      proofById.set(proof.Id, proof);
    }
  }

  const orderedProofs = citationIds.length > 0 ? citationIds.map((id) => proofById.get(id)).filter((proof): proof is RemoteProof => Boolean(proof)) : proofs;
  const allReferences = orderedProofs.flatMap((proof) => proof.References ?? []);
  const unique = Array.from(new Set(allReferences));

  return unique.map((reference) => {
    const normalized = normalizeVerse(reference);
    return {
      verseId: normalized,
      display: normalized,
    };
  });
}

function createNode(params: {
  id: string;
  title: string;
  year: number;
  content: string;
  proofs: CreedProof[];
  citationIds: number[];
  sourcePath: string;
}): NormalizedNode {
  return {
    id: params.id,
    title: params.title,
    year: params.year,
    content: params.content,
    proofs: params.proofs,
    citationIds: params.citationIds,
    sourcePath: params.sourcePath,
  };
}

function getBodyText(record: Record<string, any>) {
  return record.ContentWithProofs ?? record.AnswerWithProofs ?? record.TextWithProofs ?? record.Content ?? record.Answer ?? record.Text ?? '';
}

function createNodeFromRecord(params: {
  id: string;
  title: string;
  year: number;
  record: Record<string, any>;
  sourcePath: string;
}): NormalizedNode {
  const bodyText = getBodyText(params.record);
  const citationIds = extractCitationIds(bodyText);

  return createNode({
    id: params.id,
    title: params.title,
    year: params.year,
    content: stripCitationMarkers(bodyText),
    proofs: collectProofs(params.record.Proofs, citationIds),
    citationIds,
    sourcePath: params.sourcePath,
  });
}

function normalizeCreed(fileName: string, creed: RemoteCreed): NormalizedNode[] {
  const sourcePath = `creeds/${fileName}`;
  const baseId = slugify(fileName.replace(/\.json$/, ''));
  const year = Number.parseInt(creed.Metadata.Year, 10) || 0;
  const data = creed.Data as any;

  switch (creed.Metadata.CreedFormat) {
    case 'Creed':
      return [
        createNodeFromRecord({
          id: baseId,
          title: creed.Metadata.Title,
          year,
          record: data,
          sourcePath,
        }),
      ];
    case 'Canon':
      return Array.isArray(data)
        ? data.map((article: any) =>
            createNodeFromRecord({
              id: `${baseId}-article-${slugify(String(article.Article ?? article.Title ?? 'article'))}`,
              title: `${creed.Metadata.Title} ${article.Article ?? article.Title ?? ''}`.trim(),
              year,
              record: article,
              sourcePath,
            }),
          )
        : [];
    case 'Confession':
      return Array.isArray(data)
        ? data.flatMap((chapter: any) => {
            const chapterTitle = `${creed.Metadata.Title} Chapter ${chapter.Chapter}: ${chapter.Title ?? ''}`.trim();
            return Array.isArray(chapter.Sections)
              ? chapter.Sections.map((section: any) =>
                  createNodeFromRecord({
                    id: `${baseId}-ch-${slugify(String(chapter.Chapter))}-sec-${slugify(String(section.Section))}`,
                    title: `${chapterTitle} (Section ${section.Section})`,
                    year,
                    record: section,
                    sourcePath,
                  }),
                )
              : [];
          })
        : [];
    case 'Catechism':
      return Array.isArray(data)
        ? data.map((question: any) =>
            createNodeFromRecord({
              id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}`,
              title: `${creed.Metadata.Title} Q${question.Number}: ${question.Question ?? ''}`.trim(),
              year,
              record: question,
              sourcePath,
            }),
          )
        : [];
    case 'HenrysCatechism':
      return Array.isArray(data)
        ? data.flatMap((question: any) =>
            Array.isArray(question.SubQuestions) && question.SubQuestions.length > 0
              ? question.SubQuestions.map((subQuestion: any) =>
                    createNodeFromRecord({
                    id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}-${slugify(String(subQuestion.Number ?? '0'))}`,
                    title: `${creed.Metadata.Title} ${question.Number}.${subQuestion.Number}: ${subQuestion.Question ?? ''}`.trim(),
                    year,
                      record: subQuestion,
                    sourcePath,
                  }),
                )
              : [
                    createNodeFromRecord({
                    id: `${baseId}-q-${slugify(String(question.Number ?? '0'))}`,
                    title: `${creed.Metadata.Title} ${question.Number}: ${question.Question ?? ''}`.trim(),
                    year,
                      record: question,
                    sourcePath,
                  }),
                ],
          )
        : [];
    default:
      return [];
  }
}

async function main() {
  const sourceDir = path.resolve(process.cwd(), 'data-source', 'creeds');
  const targetDir = path.resolve(process.cwd(), 'public');
  const targetFile = path.join(targetDir, 'normalized-creeds.json');

  const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.json'));
  const nodes: NormalizedNode[] = [];

  for (const fileName of files) {
    const filePath = path.join(sourceDir, fileName);
    const raw = await readFile(filePath, 'utf8');
    const creed = JSON.parse(raw) as RemoteCreed;
    nodes.push(...normalizeCreed(fileName, creed));
  }

  const sorted = nodes.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  const idCounts = new Map<string, number>();
  const deduped = sorted.map((node) => {
    const count = (idCounts.get(node.id) ?? 0) + 1;
    idCounts.set(node.id, count);

    if (count === 1) {
      return node;
    }

    return {
      ...node,
      id: `${node.id}-dup-${count}`,
    };
  });

  await mkdir(targetDir, { recursive: true });
  await writeFile(
    targetFile,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), totalNodes: deduped.length, nodes: deduped }, null, 2)}\n`,
    'utf8',
  );

  console.log(`Normalized ${deduped.length} nodes into ${targetFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
