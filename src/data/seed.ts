import { CreedDocument } from '../types';
import { WCF_DATA } from './wcf';

const INITIAL_DATA: CreedDocument[] = [
  {
    id: 'apostles-1',
    title: "Apostles' Creed - Article I",
    content: 'I believe in God, the Father almighty, creator of heaven and earth.',
    year: 390,
    proofs: [{ verseId: 'Genesis 1:1', display: 'Genesis 1:1' }],
    connections: ['nicene-1'],
    history_link: null,
  },
  {
    id: 'nicene-1',
    title: 'Nicene Creed - Article I',
    content: 'We believe in one God, the Father Almighty, Maker of heaven and earth, and of all things visible and invisible.',
    year: 325,
    proofs: [
      { verseId: 'Deuteronomy 6:4', display: 'Deuteronomy 6:4' },
      { verseId: 'Isaiah 44:6', display: 'Isaiah 44:6' }
    ],
    connections: ['apostles-1', 'wcf-2-1', 'bcf-1'],
    history_link: 'apostles-1',
  },
  {
    id: 'bcf-1',
    title: 'Belgic Confession - Article 1: There Is One Only God',
    content: 'We all believe with the heart and confess with the mouth that there is one only simple and spiritual Being, which we call God; and that He is eternal, incomprehensible, invisible, immutable, infinite, almighty, perfectly wise, just, good, and the overflowing fountain of all good.',
    year: 1561,
    proofs: [
      { verseId: 'Ephesians 4:6', display: 'Ephesians 4:6' },
      { verseId: '1 Timothy 1:17', display: '1 Timothy 1:17' }
    ],
    connections: ['wcf-2-1', 'nicene-1'],
    history_link: 'nicene-1',
  }
];

export const SEED_DATA: CreedDocument[] = [...INITIAL_DATA, ...WCF_DATA];
