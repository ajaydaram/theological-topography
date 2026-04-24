import { SEED_DATA } from './seed';
import { normalizeVerse } from '../lib/normalizer';
import { VerseIndexEntry } from '../types';

/**
 * Dynamically builds the Verse Index by scanning all proofs 
 * across the entire SEED_DATA dataset.
 */
const buildIndex = () => {
  const index = new Map<string, Set<string>>();

  for (const doc of SEED_DATA) {
    if (!doc.proofs) continue;
    
    for (const proof of doc.proofs) {
      // Normalize before inserting so "Rom. 1:20" and "Romans 1:20" collapse 
      const verse = normalizeVerse(proof.display);
      
      if (!index.has(verse)) {
        index.set(verse, new Set());
      }
      index.get(verse)!.add(doc.id);
    }
  }

  const indexArray: VerseIndexEntry[] = [];
  const indexMap: Record<string, string[]> = {};

  for (const [verse, docSet] of index.entries()) {
    const docArray = Array.from(docSet);
    indexMap[verse] = docArray;
    indexArray.push({
      verse,
      referencedBy: docArray
    });
  }

  // Alphabetical sort for the JSON array
  indexArray.sort((a, b) => a.verse.localeCompare(b.verse));

  return { indexArray, indexMap };
};

export const { 
  indexArray: VERSE_INDEX_ARRAY, 
  indexMap: VERSE_INDEX_MAP 
} = buildIndex();
