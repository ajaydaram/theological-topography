import { readFile } from 'node:fs/promises';
import path from 'node:path';

type NormalizedProof = {
  verseId: string;
  display: string;
};

type NormalizedNode = {
  id: string;
  title: string;
  year: number;
  content: string;
  proofs: NormalizedProof[];
  sourcePath: string;
  citationIds?: number[];
};

type NormalizedPayload = {
  generatedAt: string;
  totalNodes: number;
  nodes: NormalizedNode[];
};

type VersePivotEntry = {
  verse: string;
  creedIds: string[];
};

type VersePivotPayload = {
  generatedAt: string;
  totalVerses: number;
  entries: VersePivotEntry[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function validateNormalized(payload: NormalizedPayload) {
  assert(isNonEmptyString(payload.generatedAt), 'normalized-creeds.json missing generatedAt');
  assert(Array.isArray(payload.nodes), 'normalized-creeds.json nodes must be an array');
  assert(typeof payload.totalNodes === 'number', 'normalized-creeds.json totalNodes must be a number');
  assert(payload.totalNodes === payload.nodes.length, 'normalized-creeds.json totalNodes does not match nodes length');

  const nodeIds = new Set<string>();

  payload.nodes.forEach((node, index) => {
    assert(isNonEmptyString(node.id), `normalized node[${index}] missing id`);
    assert(!nodeIds.has(node.id), `normalized node duplicate id: ${node.id}`);
    nodeIds.add(node.id);

    assert(isNonEmptyString(node.title), `normalized node[${index}] missing title`);
    assert(typeof node.year === 'number' && Number.isFinite(node.year), `normalized node[${index}] invalid year`);
    assert(typeof node.content === 'string', `normalized node[${index}] invalid content`);
    assert(Array.isArray(node.proofs), `normalized node[${index}] proofs must be an array`);
    assert(isNonEmptyString(node.sourcePath), `normalized node[${index}] missing sourcePath`);

    if (node.citationIds !== undefined) {
      assert(Array.isArray(node.citationIds), `normalized node[${index}] citationIds must be an array`);
    }

    node.proofs.forEach((proof, proofIndex) => {
      assert(isNonEmptyString(proof.verseId), `normalized node[${index}] proof[${proofIndex}] missing verseId`);
      assert(isNonEmptyString(proof.display), `normalized node[${index}] proof[${proofIndex}] missing display`);
    });
  });

  return nodeIds;
}

function validatePivot(payload: VersePivotPayload, validNodeIds: Set<string>) {
  assert(isNonEmptyString(payload.generatedAt), 'verse-pivot.json missing generatedAt');
  assert(Array.isArray(payload.entries), 'verse-pivot.json entries must be an array');
  assert(typeof payload.totalVerses === 'number', 'verse-pivot.json totalVerses must be a number');
  assert(payload.totalVerses === payload.entries.length, 'verse-pivot.json totalVerses does not match entries length');

  const verseSet = new Set<string>();

  payload.entries.forEach((entry, index) => {
    assert(isNonEmptyString(entry.verse), `verse entry[${index}] missing verse`);
    assert(!verseSet.has(entry.verse), `verse entry duplicate verse: ${entry.verse}`);
    verseSet.add(entry.verse);

    assert(Array.isArray(entry.creedIds), `verse entry[${index}] creedIds must be an array`);

    entry.creedIds.forEach((creedId, creedIndex) => {
      assert(isNonEmptyString(creedId), `verse entry[${index}] creedIds[${creedIndex}] invalid`);
      assert(validNodeIds.has(creedId), `verse entry[${index}] creedIds[${creedIndex}] references unknown node id: ${creedId}`);
    });
  });
}

async function main() {
  const normalizedPath = path.resolve(process.cwd(), 'public', 'normalized-creeds.json');
  const pivotPath = path.resolve(process.cwd(), 'public', 'verse-pivot.json');

  const normalizedRaw = await readFile(normalizedPath, 'utf8');
  const pivotRaw = await readFile(pivotPath, 'utf8');

  const normalizedPayload = JSON.parse(normalizedRaw) as NormalizedPayload;
  const pivotPayload = JSON.parse(pivotRaw) as VersePivotPayload;

  const nodeIds = validateNormalized(normalizedPayload);
  validatePivot(pivotPayload, nodeIds);

  console.log(`Validated data schema: ${normalizedPayload.nodes.length} nodes, ${pivotPayload.entries.length} verse entries`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
