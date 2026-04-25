import { CreedDocumentType, HistoricalDate } from '../types';

export type HistoricalOverride = {
  match: RegExp;
  type?: CreedDocumentType;
  date?: HistoricalDate;
};

export const HISTORICAL_OVERRIDES: HistoricalOverride[] = [
  {
    match: /apostles\s+creed/i,
    type: 'ecumenical-creed',
    date: {
      label: 'A.D. 650 (received text)',
      startYear: 650,
      precision: 'circa',
      confidence: 'medium',
    },
  },
  {
    match: /athanasian\s+creed/i,
    type: 'ecumenical-creed',
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
    type: 'article',
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
    type: 'canon',
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
    type: 'declaration',
    date: {
      label: 'A.D. 1886/1888',
      startYear: 1886,
      endYear: 1888,
      precision: 'year-range',
      confidence: 'high',
    },
  },
];
