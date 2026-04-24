import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type NormalizedNode = {
  id: string;
  citationIds?: number[];
  proofs: Array<{
    display: string;
  }>;
};

type NormalizedPayload = {
  nodes: NormalizedNode[];
};

async function main() {
  const normalizedPath = path.resolve(process.cwd(), 'public', 'normalized-creeds.json');
  const outputPath = path.resolve(process.cwd(), 'public', 'verse-pivot.json');

  const raw = await readFile(normalizedPath, 'utf8');
  const payload = JSON.parse(raw) as NormalizedPayload;

  const verseToCreedIds = new Map<string, Set<string>>();

  for (const node of payload.nodes) {
    for (const proof of node.proofs ?? []) {
      const verse = proof.display;
      if (!verseToCreedIds.has(verse)) {
        verseToCreedIds.set(verse, new Set());
      }
      verseToCreedIds.get(verse)!.add(node.id);
    }
  }

  const entries = Array.from(verseToCreedIds.entries())
    .map(([verse, ids]) => ({
      verse,
      creedIds: Array.from(ids).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.verse.localeCompare(b.verse));

  const output = {
    generatedAt: new Date().toISOString(),
    totalVerses: entries.length,
    entries,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Built verse pivot with ${entries.length} verse keys at ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
