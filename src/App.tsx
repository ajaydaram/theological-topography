import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Clock, FileText, Hash, Link as LinkIcon, Network, Search } from 'lucide-react';
import { loadCreedDocuments, loadVerseIndexData, buildTopicIndex, type VerseIndexData, type CreedDataSource } from './data/loadCreeds';
import { SEED_DATA } from './data/seed';
import { CreedDocument, CreedDocumentType } from './types';
import { THEMES, ThemeMode } from './theme';
import { readTelemetryCounts, recordTelemetryEvent, type TelemetryCounts } from './lib/telemetry';
import { VERSE_TEXT_SOURCE_LABEL } from './lib/verseText';
import { useVerseTextCache } from './hooks/useVerseTextCache';
import { VerseTextTogglePanel } from './components/VerseTextTogglePanel';

type LoadStatus = 'loading' | 'remote' | 'fallback';
type CompareSide = 'left' | 'right';
type HistoricalTypeFilter = 'all' | CreedDocumentType;

function formatGeneratedAt(value: string | null) {
  if (!value) return 'UNKNOWN';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'UNKNOWN';
  return parsed.toLocaleString();
}

function readQueryParam(name: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return value && value.trim() ? value : fallback;
}

function formatDocumentTypeLabel(value: string | undefined) {
  if (!value) return 'document';
  return value.replace(/-/g, ' ');
}

export default function App() {
  const [data, setData] = useState<CreedDocument[]>(SEED_DATA);
  const [activeId, setActiveId] = useState<string>(() => readQueryParam('active', SEED_DATA[0]?.id ?? ''));
  const [referenceId, setReferenceId] = useState<string>(() => readQueryParam('reference', ''));
  const [referenceSide, setReferenceSide] = useState<CompareSide>(() => (readQueryParam('side', 'right') === 'left' ? 'left' : 'right'));
  const [historicalTypeFilter, setHistoricalTypeFilter] = useState<HistoricalTypeFilter>(() => {
    const value = readQueryParam('type', 'all').toLowerCase();
    const allowed: HistoricalTypeFilter[] = ['all', 'ecumenical-creed', 'confession', 'catechism', 'declaration', 'article', 'canon', 'other'];
    return (allowed as string[]).includes(value) ? (value as HistoricalTypeFilter) : 'all';
  });
  const [deepSearchQuery, setDeepSearchQuery] = useState<string>(() => readQueryParam('deep', ''));
  const [searchQuery, setSearchQuery] = useState<string>(() => readQueryParam('search', ''));
  const [selectedVerse, setSelectedVerse] = useState<string>('');
  const [hoveredVerse, setHoveredVerse] = useState<string>('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('museum');
  const [hasSwitchedTheme, setHasSwitchedTheme] = useState<boolean>(false);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<CreedDataSource | 'seed-fallback'>('seed-fallback');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [verseIndexData, setVerseIndexData] = useState<VerseIndexData>({ verseIndex: [], verseMap: {} });
  const [telemetryCounts, setTelemetryCounts] = useState<TelemetryCounts>(() => readTelemetryCounts());
  const deepSearchInputRef = useRef<HTMLInputElement | null>(null);
  const initialActiveIdRef = useRef(activeId);
  const initialReferenceIdRef = useRef(referenceId);

  const theme = THEMES[themeMode];
  const {
    verseTextCache,
    visibleVerseTexts,
    toggleVerseText,
    showAllVerseTexts,
    hideAllVerseTexts,
    retryVerseText,
  } = useVerseTextCache({
    onReveal: () => {
      recordTelemetryEvent('verse_text_revealed');
      setTelemetryCounts(readTelemetryCounts());
    },
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const loaded = await loadCreedDocuments();
        const verseData = await loadVerseIndexData(loaded.documents);
        if (cancelled) return;

        const requestedActiveId = initialActiveIdRef.current;
        const requestedReferenceId = initialReferenceIdRef.current;
        const nextActiveId = loaded.documents.some((doc) => doc.id === requestedActiveId) ? requestedActiveId : loaded.documents[0]?.id ?? '';
        const nextReferenceId = loaded.documents.some((doc) => doc.id === requestedReferenceId) ? requestedReferenceId : '';

        setData(loaded.documents);
        setVerseIndexData(verseData);
        setActiveId(nextActiveId);
        setReferenceId(nextReferenceId);
        setLoadStatus('remote');
        setDataSource(loaded.source);
        setGeneratedAt(loaded.generatedAt);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;

        setData(SEED_DATA);
        setActiveId((current) => SEED_DATA.some((doc) => doc.id === current) ? current : SEED_DATA[0]?.id ?? '');
        setLoadStatus('fallback');
        setDataSource('seed-fallback');
        setGeneratedAt(null);
        setLoadError(error instanceof Error ? error.message : 'Failed to fetch remote data');
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  const documents = useMemo(
    () => [...data].sort((a, b) => Number(a.year) - Number(b.year) || a.title.localeCompare(b.title)),
    [data],
  );

  const topicIndex = useMemo(() => buildTopicIndex(documents), [documents]);
  const availableHistoricalTypes = useMemo(() => {
    const counts = documents.reduce<Record<string, number>>((acc, doc) => {
      const key = doc.historical?.type ?? 'other';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const order: CreedDocumentType[] = ['ecumenical-creed', 'confession', 'catechism', 'declaration', 'article', 'canon', 'other'];
    return order
      .filter((type) => counts[type])
      .map((type) => ({ type, count: counts[type] }));
  }, [documents]);

  const getDoc = (id: string) => documents.find((doc) => doc.id === id);
  const toDocs = (ids: string[]) => ids.map((id) => getDoc(id)).filter((doc): doc is CreedDocument => Boolean(doc));
  const matchesTypeFilter = (doc: CreedDocument) => {
    if (historicalTypeFilter === 'all') return true;
    return (doc.historical?.type ?? 'other') === historicalTypeFilter;
  };
  const groupedNearbyDocs = useMemo(() => {
    const order: CreedDocumentType[] = ['ecumenical-creed', 'confession', 'catechism', 'declaration', 'article', 'canon', 'other'];
    const nearbyDocs = documents
      .filter((doc) => doc.id !== activeId)
      .filter(matchesTypeFilter)
      .slice(0, 12);

    const groups = nearbyDocs.reduce<Record<string, CreedDocument[]>>((acc, doc) => {
      const key = doc.historical?.type ?? 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});

    return order
      .filter((type) => groups[type]?.length)
      .map((type) => ({ type, docs: groups[type] }));
  }, [documents, activeId, historicalTypeFilter]);

  const activeDoc = getDoc(activeId) ?? documents[0];
  const referenceDoc = referenceId ? getDoc(referenceId) : undefined;

  useEffect(() => {
    if (!activeDoc) return;

    if (!activeDoc.proofs.some((proof) => proof.display === selectedVerse)) {
      setSelectedVerse(activeDoc.proofs[0]?.display ?? '');
    }
  }, [activeDoc?.id]);

  useEffect(() => {
    if (referenceId && !referenceDoc) {
      setReferenceId('');
    }
  }, [referenceDoc, referenceId]);

  const computeLineage = (docId: string) => {
    const trail: CreedDocument[] = [];
    const seen = new Set<string>();
    let current = getDoc(docId);

    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      trail.unshift(current);
      current = current.history_link ? getDoc(current.history_link) : undefined;
    }

    return trail;
  };

  const getEraLabel = (year: number | string) => {
    const numericYear = Number(year);

    if (numericYear <= 500) return 'Early Creeds';
    if (numericYear <= 1700) return 'Reformation';
    return 'Modern';
  };

  const getTraditionLabel = (title: string) => {
    const knownLabels = ['Westminster', 'Heidelberg', 'Belgic', 'Nicene', 'Apostles', 'Athanasian', 'Baptist', 'Savoy', 'Basel', 'Zurich', 'Canons', 'Chalcedon', 'Tertullian'];
    const lowerTitle = title.toLowerCase();
    const knownMatch = knownLabels.find((label) => lowerTitle.includes(label.toLowerCase()));

    if (knownMatch) return knownMatch;

    const words = title.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const fallback = words.find((word) => !/^\d+$/.test(word));
    return fallback ?? title;
  };

  const buildBreadcrumbTrail = (trail: CreedDocument[]) => {
    if (trail.length === 0) return [];

    const rootEra = getEraLabel(trail[0].year);
    const activeEra = getEraLabel(trail[trail.length - 1].year);
    const tradition = getTraditionLabel(trail[trail.length - 1].title);

    return Array.from(new Set([rootEra, activeEra, tradition]));
  };

  const timelineIndex = useMemo(() => Math.max(documents.findIndex((doc) => doc.id === activeDoc?.id), 0), [documents, activeDoc?.id]);

  const TOPIC_KEYWORDS = {
    Scripture: ['scripture', 'holy scripture', 'word of god', 'canon', 'apocrypha'],
    Trinity: ['trinity', 'godhead', 'father', 'son', 'holy ghost', 'holy spirit'],
    Christology: ['christ', 'mediator', 'incarnation', 'redemption', 'atonement', 'resurrection'],
    Soteriology: ['salvation', 'justification', 'sanctification', 'adoption', 'faith', 'grace'],
    Ecclesiology: ['church', 'synod', 'council', 'minister', 'worship', 'sacrament'],
    Providence: ['providence', 'decree', 'predestination', 'foreknowledge', 'counsel'],
    Anthropology: ['man', 'adam', 'free will', 'sin', 'fall', 'nature'],
    Law: ['law', 'commandment', 'oath', 'vow', 'sabbath', 'magistrate'],
    Covenant: ['covenant', 'testament'],
    Eschatology: ['judgment', 'resurrection', 'death', 'eternal', 'heaven', 'hell'],
  };

  const rootMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    // Find matching topics for this query
    const matchingTopics = new Set<string>();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((kw) => kw.includes(query) || query.includes(kw))) {
        matchingTopics.add(topic);
      }
    }

    return documents
      .filter(matchesTypeFilter)
      .map((doc) => {
        const title = doc.title.toLowerCase();
        const content = doc.content.toLowerCase();
        const topics = (doc.topics ?? []).join(' ').toLowerCase();
        const proofs = doc.proofs.map((proof) => proof.display).join(' ').toLowerCase();
        const haystack = `${title} ${content} ${topics} ${proofs}`;

        // Score based on where the query appears
        let score = 0;
        if (title.includes(query)) score += 10;
        if (proofs.includes(query)) score += 5;
        if (topics.includes(query)) score += 8;
        if (content.includes(query)) score += 2;

        // Bonus for topic keyword matches
        for (const topic of matchingTopics) {
          if ((doc.topics ?? []).includes(topic)) score += 15;
        }

        return { doc, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.doc.year) - Number(b.doc.year) || a.doc.title.localeCompare(b.doc.title))
      .map((entry) => entry.doc);
  }, [documents, searchQuery, historicalTypeFilter]);

  const verseMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return verseIndexData.verseIndex.filter((entry) => entry.verse.toLowerCase().includes(query)).slice(0, 8);
  }, [searchQuery, verseIndexData.verseIndex]);

  const deepSearch = useMemo(() => {
    const query = deepSearchQuery.trim().toLowerCase();
    if (!query) {
      return {
        confessionMatches: [] as Array<{ doc: CreedDocument; score: number; matchedBy: string[] }>,
        directVerseMatches: [] as typeof verseIndexData.verseIndex,
        supportedVerseCount: 0,
      };
    }

    const synonymMap: Record<string, string[]> = {
      justification: ['justify', 'justified', 'righteousness', 'imputation', 'imputed righteousness'],
      sanctification: ['sanctify', 'sanctified', 'holiness'],
      atonement: ['propitiation', 'sacrifice', 'redemption'],
      covenant: ['testament', 'federal theology'],
      predestination: ['election', 'foreordination', 'decree'],
    };

    const queryTokens = query.split(/\s+/).filter(Boolean);
    const expandedTerms = new Set<string>(queryTokens);

    for (const token of queryTokens) {
      for (const synonym of synonymMap[token] ?? []) {
        expandedTerms.add(synonym.toLowerCase());
      }
    }

    const confessionMatches = documents
      .filter(matchesTypeFilter)
      .map((doc) => {
        const title = doc.title.toLowerCase();
        const content = doc.content.toLowerCase();
        const topics = (doc.topics ?? []).join(' ').toLowerCase();
        const matchedBy = new Set<string>();

        let score = 0;
        for (const term of expandedTerms) {
          if (title.includes(term)) {
            score += 5;
            matchedBy.add('title');
          }
          if (topics.includes(term)) {
            score += 3;
            matchedBy.add('topic');
          }
          if (content.includes(term)) {
            score += 2;
            matchedBy.add('content');
          }
        }

        return {
          doc,
          score,
          matchedBy: Array.from(matchedBy),
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.doc.year) - Number(b.doc.year) || a.doc.title.localeCompare(b.doc.title));

    const directVerseMatches = verseIndexData.verseIndex
      .filter((entry) => Array.from(expandedTerms).some((term) => entry.verse.toLowerCase().includes(term)))
      .sort((a, b) => b.referencedBy.length - a.referencedBy.length || a.verse.localeCompare(b.verse));

    const supportedVerses = new Set<string>(directVerseMatches.map((entry) => entry.verse));

    for (const entry of confessionMatches) {
      for (const proof of entry.doc.proofs) {
        supportedVerses.add(proof.display);
      }
    }

    return {
      confessionMatches,
      directVerseMatches,
      supportedVerseCount: supportedVerses.size,
    };
  }, [deepSearchQuery, documents, historicalTypeFilter, verseIndexData.verseIndex]);

  const lineage = useMemo(() => activeDoc ? computeLineage(activeDoc.id) : [], [activeDoc?.id]);
  const referenceLineage = useMemo(() => referenceDoc ? computeLineage(referenceDoc.id) : [], [referenceDoc?.id]);
  const ancestryBreadcrumb = useMemo(() => buildBreadcrumbTrail(lineage), [lineage]);
  const referenceBreadcrumb = useMemo(() => buildBreadcrumbTrail(referenceLineage), [referenceLineage]);
  const rootDocument = useMemo(() => lineage[0] ?? activeDoc, [lineage, activeDoc]);
  const lineageParents = useMemo(() => lineage.slice(0, -1), [lineage]);

  const selectedVerseDocs = useMemo(() => {
    if (!selectedVerse) return [];
    return toDocs(verseIndexData.verseMap[selectedVerse] ?? []);
  }, [selectedVerse, verseIndexData]);

  const hoveredVerseDocs = useMemo(() => {
    if (!hoveredVerse || !activeDoc) return [];
    return toDocs(verseIndexData.verseMap[hoveredVerse] ?? [])
      .filter((doc) => doc.id !== activeDoc.id)
      .sort((a, b) => Number(a.year) - Number(b.year) || a.title.localeCompare(b.title))
      .slice(0, 3);
  }, [hoveredVerse, activeDoc?.id, verseIndexData]);

  const relatedDocs = useMemo(() => toDocs(activeDoc?.connections ?? []).slice(0, 5), [activeDoc?.connections]);

  const topicPeers = useMemo(() => {
    if (!activeDoc) return [];
    return (activeDoc.topics ?? []).map((topic) => ({
      topic,
      docs: toDocs(topicIndex[topic] ?? []).filter((doc) => doc.id !== activeDoc.id).slice(0, 4),
    }));
  }, [activeDoc?.id, activeDoc?.topics, topicIndex]);
  const hasReferencePanel = Boolean(referenceDoc);
  const hasDoctrineSearch = Boolean(searchQuery.trim() || deepSearchQuery.trim());
  const hasPrimaryDocument = Boolean(activeDoc);
  const hasComparisonDocument = Boolean(referenceDoc);
  const hasVerseRoots = Boolean(selectedVerse);

  const workflowSteps = [
    { id: 'search', label: 'Search a doctrine term', complete: hasDoctrineSearch },
    { id: 'primary', label: 'Open one primary document', complete: hasPrimaryDocument },
    { id: 'compare', label: 'Open one comparison document', complete: hasComparisonDocument },
    { id: 'roots', label: 'Read verse roots', complete: hasVerseRoots },
    { id: 'theme', label: 'Switch themes', complete: hasSwitchedTheme },
  ];
  const completedWorkflowSteps = workflowSteps.filter((step) => step.complete).length;

  const logTelemetry = (name: Parameters<typeof recordTelemetryEvent>[0]) => {
    recordTelemetryEvent(name);
    setTelemetryCounts(readTelemetryCounts());
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (activeId) params.set('active', activeId); else params.delete('active');
    if (referenceId) params.set('reference', referenceId); else params.delete('reference');
    params.set('side', referenceSide);
    if (historicalTypeFilter !== 'all') params.set('type', historicalTypeFilter); else params.delete('type');
    if (deepSearchQuery.trim()) params.set('deep', deepSearchQuery.trim()); else params.delete('deep');
    if (searchQuery.trim()) params.set('search', searchQuery.trim()); else params.delete('search');

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  }, [activeId, referenceId, referenceSide, historicalTypeFilter, deepSearchQuery, searchQuery]);

  const openReferencePanel = (docId: string) => {
    setReferenceId(docId);
    logTelemetry('reference_panel_opened');
  };

  const swapPanels = () => {
    if (!referenceDoc) return;

    setActiveId(referenceDoc.id);
    setReferenceId(activeDoc?.id ?? '');
    logTelemetry('panel_swapped');
  };

  const handleThemeToggle = () => {
    setHasSwitchedTheme(true);
    setThemeMode((current) => (current === 'museum' ? 'minimalist' : 'museum'));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === '/' && !isTypingTarget) {
        event.preventDefault();
        deepSearchInputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape' && referenceId) {
        event.preventDefault();
        setReferenceId('');
        return;
      }

      if (isTypingTarget) return;

      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const currentIndex = documents.findIndex((doc) => doc.id === activeDoc?.id);
        if (currentIndex < 0) return;

        const nextIndex = event.key === '['
          ? Math.max(currentIndex - 1, 0)
          : Math.min(currentIndex + 1, documents.length - 1);

        const nextDoc = documents[nextIndex];
        if (nextDoc) {
          setActiveId(nextDoc.id);
        }
        return;
      }

      if (event.key.toLowerCase() === 'r' && relatedDocs.length > 0) {
        event.preventDefault();
        openReferencePanel(relatedDocs[0].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDoc?.id, documents, referenceId, relatedDocs]);

  return (
    <div className={`theme-shell theme-${themeMode} flex h-screen w-full ${theme.colors.bg} ${theme.colors.text} ${theme.typography.fontBody} overflow-hidden`}>
      <aside className={`w-80 border-r ${theme.colors.border} ${theme.colors.bg} flex flex-col h-full shrink-0 overflow-y-auto`}>
        <div className={`p-6 border-b ${theme.colors.border} ${theme.colors.paperBg}/70 backdrop-blur-sm relative shrink-0`}>
          <button
            onClick={handleThemeToggle}
            className={`absolute top-4 right-4 text-[9px] uppercase font-bold p-1 border ${theme.colors.border}`}
          >
            {themeMode}
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Network className={`w-5 h-5 ${theme.colors.accent}`} />
            <div>
              <h1 className={`text-[10px] font-bold tracking-[0.2em] uppercase ${theme.colors.text}`}>Theological Topography</h1>
              <p className={`text-[10px] font-mono ${theme.colors.accent} font-bold`}>PIPELINE_BACKED_FEED</p>
            </div>
          </div>
          <div className={`text-[10px] font-mono ${theme.colors.textMuted}`}>
            {loadStatus === 'remote' ? 'NORMALIZED_PIPELINE_READY' : loadStatus === 'fallback' ? 'FALLBACK_DATA_ACTIVE' : 'FETCHING_PIPELINE_DATA'}
          </div>
          {loadError && (
            <div className="mt-2 text-[10px] font-mono text-[#A52A2A] leading-snug">
              {loadError}
            </div>
          )}
        </div>

        <div className="p-4 border-b border-[#000000] shrink-0">
          <label className="text-[9px] uppercase tracking-widest text-[#000000] mb-2 flex items-center gap-2 font-bold">
            <Search className="w-3 h-3" /> Roots and Search
          </label>
          <input
            type="text"
            placeholder="Search doctrine, verse, or topic"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-[#F9F7F2] border border-[#000000] p-2 text-[11px] font-mono focus:border-[#A52A2A] focus:outline-none transition-colors text-[#000000] placeholder-[#000000]"
          />
          <div className="mt-3">
            <div className="text-[9px] uppercase tracking-widest text-[#000000] mb-2 font-bold">Historical Type</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setHistoricalTypeFilter('all')}
                className={`px-2 py-1 border text-[9px] font-mono uppercase tracking-widest ${historicalTypeFilter === 'all' ? 'border-[#A52A2A] text-[#A52A2A] bg-[#F9F7F2]' : 'border-[#000000] text-[#000000] hover:border-[#A52A2A]'}`}
              >
                All ({documents.length})
              </button>
              {availableHistoricalTypes.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  onClick={() => setHistoricalTypeFilter(entry.type)}
                  className={`px-2 py-1 border text-[9px] font-mono uppercase tracking-widest ${historicalTypeFilter === entry.type ? 'border-[#A52A2A] text-[#A52A2A] bg-[#F9F7F2]' : 'border-[#000000] text-[#000000] hover:border-[#A52A2A]'}`}
                >
                  {formatDocumentTypeLabel(entry.type)} ({entry.count})
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 border border-dashed border-[#000000] p-2 text-[10px] text-[#000000] bg-[#F9F7F2]">
            <div className="font-bold uppercase tracking-widest text-[9px] mb-1">What This App Does</div>
            <div className="font-mono leading-snug">
              Each document is connected by scripture roots and doctrinal links. Open a document, then follow the chain to see its root document and nearby connected documents.
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-[#000000] bg-[#F9F7F2] shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] uppercase tracking-widest text-[#A52A2A] font-bold">Pinned Study Workflow</h2>
            <span className="font-mono text-[10px] text-[#000000]">{completedWorkflowSteps}/5</span>
          </div>
          <ol className="space-y-2">
            {workflowSteps.map((step, index) => (
              <li key={step.id} className="flex items-center justify-between gap-3 text-[10px] font-mono text-[#000000] border border-dashed border-[#000000] px-2 py-2">
                <span className="flex items-center gap-2">
                  <span className="font-bold">{index + 1}.</span>
                  <span>{step.label}</span>
                </span>
                <span className={`font-bold ${step.complete ? 'text-[#A52A2A]' : 'text-[#000000]/60'}`}>{step.complete ? 'DONE' : 'TODO'}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          {searchQuery ? (
            <div className="space-y-5">
              <section>
                <h2 className="text-[10px] uppercase tracking-widest text-[#A52A2A] font-bold mb-4 px-2">Document Matches</h2>
                <div className="space-y-2">
                  {rootMatches.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setActiveId(doc.id)}
                      className={`w-full text-left p-3 border border-[#000000] transition-all group ${activeDoc?.id === doc.id ? 'bg-[#F9F7F2]' : 'hover:bg-[#F9F7F2]/50'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-mono text-[10px] font-bold ${activeDoc?.id === doc.id ? 'text-[#A52A2A]' : 'text-[#000000]'}`}>{doc.year}</span>
                        <span className="text-[9px] text-[#000000]">{doc.proofs.length} ROOTS</span>
                      </div>
                      <h3 className={`font-serif text-sm leading-snug ${activeDoc?.id === doc.id ? 'text-[#000000] underline decoration-[#A52A2A] decoration-2 underline-offset-4' : 'text-[#000000] group-hover:underline underline-offset-4'}`}>
                        {doc.title}
                      </h3>
                    </button>
                  ))}
                  {rootMatches.length === 0 && (
                    <div className="font-mono text-[10px] text-[#000000] py-4 text-center border border-dashed border-[#000000] px-3">
                      <div>NO_DOCUMENTS_FOUND</div>
                      <div className="mt-1">Try next: search broader terms like grace, covenant, trinity, or switch historical type.</div>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-[10px] uppercase tracking-widest text-[#A52A2A] font-bold mb-4 px-2">Verse Matches</h2>
                <div className="space-y-2">
                  {verseMatches.map((verse) => (
                    <button
                      key={verse.verse}
                      onClick={() => setSelectedVerse(verse.verse)}
                      className="w-full text-left p-3 border border-dashed border-[#000000] hover:border-[#A52A2A] bg-[#F9F7F2] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] font-bold underline decoration-[#000000] underline-offset-4">{verse.verse}</span>
                        <span className="text-[9px] text-[#000000]">{verse.referencedBy.length} DOCS</span>
                      </div>
                    </button>
                  ))}
                  {verseMatches.length === 0 && searchQuery && (
                    <div className="font-mono text-[10px] text-[#000000] py-4 text-center border border-dashed border-[#000000] px-3">
                      <div>NO_VERSE_MATCHES</div>
                      <div className="mt-1">Try next: search a direct verse like Romans 8:29 or John 1:1.</div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h2 className="text-[10px] uppercase tracking-widest text-[#A52A2A] font-bold">Roots for This Paragraph</h2>
                  <span className="text-[9px] font-mono text-[#000000]">{activeDoc?.proofs.length ?? 0}</span>
                </div>
                <div className="space-y-2">
                  {activeDoc?.proofs.map((proof) => {
                    const sharedDocs = verseIndexData.verseMap[selectedVerse || proof.display] ?? [];
                    const isSelected = selectedVerse === proof.display;

                    return (
                      <button
                        key={proof.display}
                        onClick={() => setSelectedVerse(proof.display)}
                        className={`w-full text-left p-3 border transition-colors ${isSelected ? 'border-[#A52A2A] bg-[#F9F7F2]' : 'border-[#000000] hover:border-[#A52A2A] hover:bg-[#F9F7F2]/50'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-mono text-[10px] text-[#000000] mb-1">ROOT</div>
                            <div className="font-serif text-sm leading-snug">{proof.display}</div>
                          </div>
                          <span className="text-[9px] font-mono text-[#000000] whitespace-nowrap">{sharedDocs.length} DOCS</span>
                        </div>
                      </button>
                    );
                  })}
                  {!activeDoc?.proofs.length && (
                    <div className="font-mono text-[10px] text-[#000000] py-4 text-center border border-dashed border-[#000000] px-3">
                      <div>NO_ROOTS_AVAILABLE</div>
                      <div className="mt-1">Try next: open another document or use Deep Search to find scripture-linked entries.</div>
                    </div>
                  )}
                </div>
              </section>

              {selectedVerse && (
                <section>
                  <h2 className="text-[10px] uppercase tracking-widest text-[#A52A2A] font-bold mb-4 px-2">Shared by This Verse</h2>
                  <div className="space-y-2">
                    {selectedVerseDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setActiveId(doc.id)}
                        className={`w-full text-left p-3 border border-dashed border-[#000000] hover:border-[#A52A2A] transition-colors ${activeDoc?.id === doc.id ? 'bg-[#F9F7F2]' : 'bg-[#F9F7F2]'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[9px] text-[#000000]">{doc.year}</span>
                          <span className="text-[9px] text-[#000000]">{doc.proofs.length} ROOTS</span>
                        </div>
                        <div className="font-serif text-sm leading-snug line-clamp-2">{doc.title}</div>
                      </button>
                    ))}
                    {selectedVerseDocs.length === 0 && (
                      <div className="font-mono text-[10px] text-[#000000] py-4 text-center border border-dashed border-[#000000] px-3">
                        <div>NO_SHARED_DOCUMENTS</div>
                        <div className="mt-1">Try next: select another root verse from this paragraph to compare overlap.</div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-[#000000] bg-[#F9F7F2] shrink-0">
          <div className="p-4 bg-[#F9F7F2] text-[#000000] border-double border-4 border-[#000000]">
            <div className="text-[9px] uppercase tracking-widest opacity-60 mb-2">Data Status</div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 ${loadStatus === 'remote' ? 'bg-[#A52A2A]' : 'bg-[#000000]'}`}></div>
              <span className="font-mono text-[11px] uppercase">
                {dataSource === 'remote-fetch' ? 'REMOTE_FETCH' : dataSource === 'local-snapshot' ? 'LOCAL_SNAPSHOT' : 'SEED_FALLBACK'}
              </span>
            </div>
            <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-[#000000] space-y-1">
              <div>Last Generated {formatGeneratedAt(generatedAt)}</div>
              <div>Source Used {dataSource === 'remote-fetch' ? 'Remote fetch' : dataSource === 'local-snapshot' ? 'Local snapshot' : 'Seed fallback'}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-[#000000] font-mono text-[10px] uppercase tracking-widest text-[#000000]">
              <div className="mb-2 opacity-70">Usage Metrics (Local)</div>
              <div className="space-y-1">
              <div>Deep Search {telemetryCounts.deep_search_submitted}</div>
              <div>Compare Opened {telemetryCounts.reference_panel_opened}</div>
              <div>Tooltips {telemetryCounts.verse_tooltip_opened}</div>
              <div>Swaps {telemetryCounts.panel_swapped}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-y-auto overflow-x-hidden bg-[#F9F7F2] relative">
        <header className="border-b border-[#000000] px-8 py-4 flex flex-col bg-[#F9F7F2]/50 backdrop-blur-sm shrink-0 gap-4">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <div className="bg-[#A52A2A] text-[#F9F7F2] px-2 py-1 font-mono text-[10px] font-bold tracking-tight uppercase whitespace-nowrap">
              {activeDoc?.year ?? '----'}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-widest text-[#000000] font-bold">Focused View</div>
              <div className="font-serif text-sm text-[#000000] truncate">{activeDoc?.title ?? 'Loading documents from GitHub...'}</div>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2 text-[10px] font-mono text-[#000000] whitespace-nowrap">
            <span>DOCUMENTS</span>
            <span className="text-[#A52A2A] font-bold">{documents.length}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-[#000000]">
            <span>COMPARE</span>
            <button
              type="button"
              aria-label="Pin reference panel to the left"
              onClick={() => setReferenceSide('left')}
              className={referenceSide === 'left' ? 'text-[#A52A2A]' : ''}
            >
              PIN_LEFT
            </button>
            <button
              type="button"
              aria-label="Swap active and reference panels"
              onClick={swapPanels}
              disabled={!referenceDoc}
              className={!referenceDoc ? 'opacity-40 cursor-not-allowed' : ''}
            >
              SWAP
            </button>
            <button
              type="button"
              aria-label="Pin reference panel to the right"
              onClick={() => setReferenceSide('right')}
              className={referenceSide === 'right' ? 'text-[#A52A2A]' : ''}
            >
              PIN_RIGHT
            </button>
            <button
              type="button"
              aria-label="Close reference panel"
              onClick={() => setReferenceId('')}
              disabled={!referenceDoc}
              className={!referenceDoc ? 'opacity-40 cursor-not-allowed' : ''}
            >
              CLOSE
            </button>
          </div>

          <div className="w-full grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-[#000000] mb-1 block">
                Deep Search
              </label>
              <div className="flex items-center gap-2 border border-[#000000] px-3 py-2">
                <Search className="w-3 h-3 text-[#A52A2A]" />
                <input
                  ref={deepSearchInputRef}
                  type="text"
                  value={deepSearchQuery}
                  onChange={(event) => setDeepSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && deepSearchQuery.trim()) {
                      logTelemetry('deep_search_submitted');
                    }
                  }}
                  placeholder="Scan confessions, content, and verse index"
                  className="w-full bg-transparent text-[13px] text-[#000000] placeholder-[#000000] focus:outline-none"
                  aria-label="Deep search doctrine and verse index"
                />
              </div>
            </div>

            {deepSearchQuery.trim() ? (
              <div className="border border-dashed border-[#000000] p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#A52A2A] mb-2">
                  Deep Search Result
                </div>
                <div className="font-mono text-[10px] text-[#000000] mb-1">
                  Mentioned in {deepSearch.confessionMatches.length} Confessions
                </div>
                <div className="font-mono text-[10px] text-[#000000] mb-2">
                  Supported by {deepSearch.supportedVerseCount} Verses
                </div>
                <div className="flex flex-wrap gap-3 font-mono text-[10px] text-[#000000]">
                  <span className="underline decoration-[#A52A2A] underline-offset-4">
                    CONFESSIONS {deepSearch.confessionMatches.length}
                  </span>
                  <span className="underline decoration-[#A52A2A] underline-offset-4">
                    VERSE_MATCHES {deepSearch.directVerseMatches.length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#000000] p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#000000]">
                  Query any doctrine term (e.g. Justification)
                </div>
              </div>
            )}
          </div>

          {deepSearchQuery.trim() && (
            <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="border border-dashed border-[#000000] p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#A52A2A] mb-2">Confessions</div>
                <div className="space-y-1">
                  {deepSearch.confessionMatches.slice(0, 5).map((entry) => (
                    <button key={entry.doc.id} onClick={() => setActiveId(entry.doc.id)} className="block w-full text-left font-serif text-sm text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]">
                      {entry.doc.title}
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-[#A52A2A]">
                        SCORE {entry.score} · {entry.matchedBy.join('+').toUpperCase()}
                      </span>
                    </button>
                  ))}
                  {deepSearch.confessionMatches.length === 0 && (
                    <div className="font-mono text-[10px] text-[#000000]">NO_CONFESSION_MATCHES</div>
                  )}
                </div>
              </div>

              <div className="border border-dashed border-[#000000] p-3">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#A52A2A] mb-2">Verses</div>
                <div className="space-y-1">
                  {deepSearch.directVerseMatches.slice(0, 5).map((entry) => (
                    <button key={entry.verse} onClick={() => setSelectedVerse(entry.verse)} className="block w-full text-left font-serif text-sm text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]">
                      {entry.verse}
                    </button>
                  ))}
                  {deepSearch.directVerseMatches.length === 0 && (
                    <div className="font-mono text-[10px] text-[#000000]">
                      <div>NO_VERSE_MATCHES</div>
                      <div className="mt-1">Try next: use scripture-form queries like Psalm 23:1 or Romans 5.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 p-6 md:p-10 relative w-full bg-[#F9F7F2]">
          {activeDoc ? (
            <div className={`grid grid-cols-1 ${hasReferencePanel ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(320px,0.6fr)]' : 'xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]'} gap-8 max-w-[1900px] mx-auto h-full items-start`}>
              <section className={`${theme.layout.docContainer} h-full p-6 md:p-10 relative overflow-hidden ${referenceSide === 'left' ? 'xl:order-2' : 'xl:order-1'}`}>
                <div className={`text-[120px] md:text-[220px] ${theme.typography.watermark} absolute right-3 top-6 pointer-events-none select-none max-w-full md:block z-0`}>
                  {activeDoc.year}
                </div>

                <div className="relative z-10 flex flex-col h-full min-h-[60vh]">
                  <div className="flex flex-wrap items-center gap-2 mb-5 text-[9px] uppercase tracking-[0.2em] font-bold text-[#000000]">
                    {ancestryBreadcrumb.map((crumb, index) => (
                      <React.Fragment key={`${crumb}-${index}`}>
                        <span className={index === 0 ? 'text-[#A52A2A]' : ''}>{crumb}</span>
                        {index < ancestryBreadcrumb.length - 1 && <ChevronRight className="w-3 h-3" />}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    {(activeDoc.topics ?? []).length > 0 ? (
                      activeDoc.topics?.map((topic) => (
                        <span key={topic} className={`inline-flex items-center gap-1 px-2 py-1 border text-[9px] uppercase tracking-widest ${theme.colors.border} ${theme.colors.textMuted}`}>
                          <Hash className="w-3 h-3" />
                          {topic}
                        </span>
                      ))
                    ) : (
                      <span className={`text-[9px] uppercase tracking-widest ${theme.colors.textMuted}`}>NO_TOPICS_IN_FALLBACK</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4 text-[9px] uppercase tracking-widest font-bold text-[#000000]">
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Roots</span>
                    <span>{activeDoc.proofs.length}</span>
                    <span className="mx-1">•</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {activeDoc.year}</span>
                    {activeDoc.historical?.date?.label && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{activeDoc.historical.date.label}</span>
                      </>
                    )}
                    {activeDoc.historical?.type && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{formatDocumentTypeLabel(activeDoc.historical.type)}</span>
                      </>
                    )}
                    {activeDoc.historical?.date?.confidence && (
                      <>
                        <span className="mx-1">•</span>
                        <span>{activeDoc.historical.date.confidence} confidence</span>
                      </>
                    )}
                    <span className="mx-1">•</span>
                    <span className="truncate">{activeDoc.sourcePath ?? 'local-seed'}</span>
                  </div>

                  <h2 className={`${theme.typography.fontHeading} leading-tight mb-8 ${theme.colors.text} text-4xl md:text-5xl lg:text-6xl`}>
                    {activeDoc.title}
                  </h2>

                  <p className={`${theme.typography.fontBody} leading-relaxed ${theme.colors.text} mb-10 ${theme.typography.dropCap} text-xl`}>
                    {activeDoc.content}
                  </p>

                  <div className={`grid grid-cols-1 lg:grid-cols-2 gap-10 border-t ${theme.colors.border} pt-10 mt-auto`}>
                    <div>
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-4 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        Scripture Roots
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => showAllVerseTexts(activeDoc.proofs.map((proof) => proof.display))}
                          className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
                        >
                          Show All Visible Roots
                        </button>
                        <button
                          type="button"
                          onClick={() => hideAllVerseTexts(activeDoc.proofs.map((proof) => proof.display))}
                          className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
                        >
                          Hide All
                        </button>
                      </div>
                      <div className="text-[9px] font-mono uppercase tracking-widest text-[#000000] mb-3">
                        Verse text source: {VERSE_TEXT_SOURCE_LABEL}
                      </div>
                      <ul className="space-y-3">
                        {activeDoc.proofs.map((proof) => {
                          const sharedDocs = verseIndexData.verseMap[proof.display] ?? [];
                          const isSelected = selectedVerse === proof.display;
                          const verseTooltipDocs = hoveredVerse === proof.display ? hoveredVerseDocs : [];
                          const isVerseVisible = Boolean(visibleVerseTexts[proof.display]);
                          const verseTextEntry = verseTextCache[proof.display] ?? { status: 'idle' as const };

                          return (
                            <li key={proof.display} className="relative">
                              <div onMouseEnter={() => { setHoveredVerse(proof.display); logTelemetry('verse_tooltip_opened'); }} onMouseLeave={() => setHoveredVerse('')}>
                                <button
                                  onClick={() => setSelectedVerse(proof.display)}
                                  className={`w-full text-left flex items-start gap-3 p-3 border transition-colors ${isSelected ? 'border-[#A52A2A] bg-[#F9F7F2]' : 'border-[#000000] hover:border-[#A52A2A]'}`}
                                >
                                  <span className="font-mono text-[10px] text-[#A52A2A] font-bold whitespace-nowrap underline decoration-[#000000] underline-offset-4">
                                    ROOT
                                  </span>
                                  <div className="flex-1">
                                    <div className="text-[13px] font-serif text-[#000000]">{proof.display}</div>
                                    <div className="text-[9px] font-mono text-[#000000] mt-1 tracking-widest uppercase">
                                      Shared by {sharedDocs.length} document(s)
                                    </div>
                                  </div>
                                </button>

                                <VerseTextTogglePanel
                                  reference={proof.display}
                                  isVisible={isVerseVisible}
                                  entry={verseTextEntry}
                                  onToggle={toggleVerseText}
                                  onRetry={retryVerseText}
                                  idPrefix="active-verse"
                                />

                                {verseTooltipDocs.length > 0 && (
                                  <div className="absolute left-0 top-full z-20 mt-2 w-72 border border-[#000000] bg-[#F9F7F2] p-3 shadow-lg">
                                    <div className="text-[9px] uppercase tracking-[0.2em] text-[#A52A2A] font-bold mb-2">Also cited by</div>
                                    <div className="space-y-2">
                                      {verseTooltipDocs.map((doc) => (
                                        <button key={doc.id} onClick={() => openReferencePanel(doc.id)} className="block w-full text-left">
                                          <div className="flex items-center justify-between gap-3 text-[9px] font-mono text-[#000000] mb-1">
                                            <span>{doc.year}</span>
                                            <span>{doc.proofs.length} ROOTS</span>
                                          </div>
                                          <div className="font-serif text-sm leading-snug text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]">
                                            {doc.title}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                        {activeDoc.proofs.length === 0 && (
                          <li className="text-[10px] font-mono text-[#000000] italic border border-dashed border-[#000000] px-3 py-2">
                            <div>NO_ROOTS_REGISTERED</div>
                            <div className="mt-1 not-italic">Try next: open Topic Neighbors to find related entries with citations.</div>
                          </li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-4 flex items-center gap-2">
                        <Network className="w-3 h-3" />
                        References and Notes
                      </h3>

                      <div className="space-y-6">
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-[#000000] block mb-2 flex items-center gap-2">
                            <LinkIcon className="w-3 h-3" />
                            Chain of Custody
                          </div>
                          {rootDocument && (
                            <button
                              onClick={() => setActiveId(rootDocument.id)}
                              className="w-full text-left p-3 mb-2 border border-[#A52A2A] bg-[#F9F7F2] hover:bg-[#F9F7F2]/60 transition-colors"
                            >
                              <div className="text-[9px] uppercase tracking-widest text-[#A52A2A] font-bold mb-1">Root Document</div>
                              <div className="flex items-center justify-between gap-3 text-[9px] font-mono text-[#000000] mb-1">
                                <span>{rootDocument.year}</span>
                                <span>ID {rootDocument.id.toUpperCase()}</span>
                              </div>
                              <div className="font-serif text-sm text-[#000000] leading-snug line-clamp-2">{rootDocument.title}</div>
                            </button>
                          )}
                          <div className="space-y-2">
                            {lineageParents.length > 0 ? lineageParents.map((node, index) => (
                              <button
                                key={node.id}
                                onClick={() => setActiveId(node.id)}
                                className={`w-full text-left flex items-center gap-2 p-2 border border-dashed border-[#000000] hover:border-[#A52A2A] transition-colors ${index === lineageParents.length - 1 ? 'bg-[#F9F7F2]' : 'bg-[#F9F7F2]'}`}
                              >
                                <ChevronRight className="w-3 h-3 text-[#000000]" />
                                <span className="font-serif text-sm font-bold text-[#000000] line-clamp-2">{node.title}</span>
                              </button>
                            )) : (
                              <div className="font-mono text-[10px] text-[#000000] py-2 border-b border-dashed border-[#000000]">
                                ROOT_NODE / FOUNDATIONAL
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-[#000000] block mb-2 flex items-center gap-2">
                            <Network className="w-3 h-3" />
                            Cross-Reference Engine
                          </div>
                          <div className="space-y-4">
                            {relatedDocs.map((doc) => (
                              <button
                                key={doc.id}
                                onClick={() => openReferencePanel(doc.id)}
                                className="w-full text-left p-3 border border-dashed border-[#000000] hover:border-[#A52A2A] transition-colors bg-[#F9F7F2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A52A2A]"
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <span className="font-mono text-[10px] text-[#000000] font-bold">{doc.id.toUpperCase()}</span>
                                  <span className="text-[9px] font-bold text-[#000000]">{doc.year} AD</span>
                                </div>
                                <p className="text-xs font-serif leading-snug italic text-[#000000] line-clamp-3">{doc.content}</p>
                              </button>
                            ))}
                            {relatedDocs.length === 0 && (
                              <div className="font-mono text-[10px] text-[#000000] py-2 border-b border-dashed border-[#000000]">
                                <div>NO_CONNECTIONS_FOUND</div>
                                <div className="mt-1">Try next: open Topic Neighbors or pick a verse root to discover linked documents.</div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-[#000000] block mb-2 flex items-center gap-2">
                            <Hash className="w-3 h-3" />
                            Topic Neighbors
                          </div>
                          <div className="space-y-3">
                            {topicPeers.length > 0 ? topicPeers.map((group) => (
                              <div key={group.topic} className="p-3 border border-dashed border-[#000000] bg-[#F9F7F2]">
                                <div className="text-[9px] uppercase tracking-widest text-[#A52A2A] font-bold mb-2">{group.topic}</div>
                                <div className="space-y-2">
                                  {group.docs.map((doc) => (
                                    <button key={doc.id} onClick={() => setActiveId(doc.id)} className="block w-full text-left text-sm underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]">
                                      {doc.title}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )) : (
                              <div className="font-mono text-[10px] text-[#000000] py-2 border-b border-dashed border-[#000000]">
                                NO_TOPIC_MATCHES
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {referenceDoc && (
                <section className={`${theme.layout.docContainer} h-full p-6 md:p-10 relative overflow-hidden border-[#000000] ${referenceSide === 'left' ? 'xl:order-1' : 'xl:order-2'}`}>
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-2">Reference Panel</div>
                      <div className="font-mono text-[10px] text-[#000000] uppercase">Side-by-side comparison</div>
                    </div>
                    <button onClick={() => setActiveId(referenceDoc.id)} className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-1 border border-[#000000] hover:border-[#A52A2A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#A52A2A]">
                      Promote
                    </button>
                  </div>

                  <div className="space-y-5 relative z-10">
                    <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-bold text-[#000000]">
                      {referenceBreadcrumb.map((crumb, index) => (
                        <React.Fragment key={`${crumb}-${index}`}>
                          <span className={index === 0 ? 'text-[#A52A2A]' : ''}>{crumb}</span>
                          {index < referenceBreadcrumb.length - 1 && <ChevronRight className="w-3 h-3" />}
                        </React.Fragment>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-widest font-bold text-[#000000]">
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Roots</span>
                      <span>{referenceDoc.proofs.length}</span>
                      <span className="mx-1">•</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {referenceDoc.year}</span>
                      {referenceDoc.historical?.date?.label && (
                        <>
                          <span className="mx-1">•</span>
                          <span>{referenceDoc.historical.date.label}</span>
                        </>
                      )}
                      {referenceDoc.historical?.type && (
                        <>
                          <span className="mx-1">•</span>
                          <span>{formatDocumentTypeLabel(referenceDoc.historical.type)}</span>
                        </>
                      )}
                      {referenceDoc.historical?.date?.confidence && (
                        <>
                          <span className="mx-1">•</span>
                          <span>{referenceDoc.historical.date.confidence} confidence</span>
                        </>
                      )}
                      <span className="mx-1">•</span>
                      <span className="truncate">{referenceDoc.sourcePath ?? 'local-seed'}</span>
                    </div>

                    <h2 className={`${theme.typography.fontHeading} leading-tight ${theme.colors.text} text-3xl md:text-4xl lg:text-5xl`}>
                      {referenceDoc.title}
                    </h2>

                    <p className={`${theme.typography.fontBody} leading-relaxed ${theme.colors.text} ${theme.typography.dropCap} text-lg`}>
                      {referenceDoc.content}
                    </p>

                    <div className={`border-t ${theme.colors.border} pt-6`}>
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-4 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        Scripture Roots
                      </h3>
                      <div className="flex items-center gap-3 mb-3">
                        <button
                          type="button"
                          onClick={() => showAllVerseTexts(referenceDoc.proofs.slice(0, 6).map((proof) => proof.display))}
                          className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
                        >
                          Show All Visible Roots
                        </button>
                        <button
                          type="button"
                          onClick={() => hideAllVerseTexts(referenceDoc.proofs.slice(0, 6).map((proof) => proof.display))}
                          className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
                        >
                          Hide All
                        </button>
                      </div>
                      <div className="text-[9px] font-mono uppercase tracking-widest text-[#000000] mb-3">
                        Verse text source: {VERSE_TEXT_SOURCE_LABEL}
                      </div>
                      <div className="space-y-2">
                        {referenceDoc.proofs.slice(0, 6).map((proof) => {
                          const isVerseVisible = Boolean(visibleVerseTexts[proof.display]);
                          const verseTextEntry = verseTextCache[proof.display] ?? { status: 'idle' as const };

                          return (
                            <div key={proof.display} className="border border-dashed border-[#000000] bg-[#F9F7F2] p-3">
                              <button onClick={() => setSelectedVerse(proof.display)} className="w-full text-left hover:text-[#A52A2A] transition-colors">
                                <div className="font-serif text-sm leading-snug text-[#000000]">{proof.display}</div>
                              </button>

                              <VerseTextTogglePanel
                                reference={proof.display}
                                isVisible={isVerseVisible}
                                entry={verseTextEntry}
                                onToggle={toggleVerseText}
                                onRetry={retryVerseText}
                                idPrefix="reference-verse"
                                compact
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <aside className={`${theme.layout.docContainer} h-full p-6 md:p-8 space-y-8 xl:order-3`}>
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-4 flex items-center gap-2">
                    <LinkIcon className="w-3 h-3" />
                    Family Tree
                  </h3>
                  <div className="space-y-3">
                    {lineage.map((node, index) => (
                      <button
                        key={node.id}
                        onClick={() => setActiveId(node.id)}
                        className={`w-full text-left p-3 border transition-colors ${index === lineage.length - 1 ? 'border-[#A52A2A] bg-[#F9F7F2]' : 'border-[#000000] hover:border-[#A52A2A] hover:bg-[#F9F7F2]/50'}`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="font-mono text-[9px] text-[#000000]">{node.year}</span>
                          {index < lineage.length - 1 && <ChevronRight className="w-3 h-3 text-[#000000]" />}
                        </div>
                        <div className="font-serif text-sm leading-snug">{node.title}</div>
                      </button>
                    ))}
                    {lineage.length === 0 && <div className="font-mono text-[10px] text-[#000000] py-4 text-center">NO_LINEAGE</div>}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#A52A2A] mb-4 flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Nearby Documents
                  </h3>
                  <div className="space-y-3">
                    {groupedNearbyDocs.map((group) => (
                      <div key={group.type} className="space-y-2">
                        <div className="text-[9px] uppercase tracking-widest text-[#A52A2A] font-bold border-b border-dashed border-[#000000] pb-1">
                          {formatDocumentTypeLabel(group.type)}
                        </div>
                        {group.docs.map((doc) => (
                          <button key={doc.id} onClick={() => setActiveId(doc.id)} className="w-full text-left p-3 border border-dashed border-[#000000] hover:border-[#A52A2A] transition-colors bg-[#F9F7F2]">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-[9px] text-[#000000]">{doc.year}</span>
                              <span className="text-[9px] text-[#000000]">{doc.proofs.length} ROOTS</span>
                            </div>
                            <div className="font-serif text-sm leading-snug line-clamp-2">{doc.title}</div>
                          </button>
                        ))}
                      </div>
                    ))}
                    {groupedNearbyDocs.length === 0 && (
                      <div className="font-mono text-[10px] text-[#000000] py-2 border-b border-dashed border-[#000000]">
                        NO_NEARBY_DOCUMENTS_FOR_FILTER
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto bg-[#F9F7F2] border-double border-[6px] border-[#000000] p-8 md:p-16">
              <div className="font-mono text-[10px] text-[#000000] uppercase tracking-widest">Loading doctrine workspace...</div>
            </div>
          )}
        </div>

        <footer className="border-t border-[#000000] bg-[#000000] text-[#F9F7F2] px-8 py-4 hidden md:flex items-center gap-6 font-mono text-[10px] tracking-tight shrink-0">
          <div className="text-[#A52A2A] font-bold tracking-widest uppercase whitespace-nowrap">Timeline</div>
          <div className="flex-1 flex items-center gap-4">
            <span className="text-[#F9F7F2] whitespace-nowrap">{documents[0]?.year ?? '----'}</span>
            <input
              type="range"
              min={0}
              max={Math.max(documents.length - 1, 0)}
              value={timelineIndex}
              onChange={(event) => {
                const nextDoc = documents[Number(event.target.value)];
                if (nextDoc) {
                  setActiveId(nextDoc.id);
                }
              }}
              className="w-full accent-[#A52A2A]"
            />
            <span className="text-[#F9F7F2] whitespace-nowrap">{documents[documents.length - 1]?.year ?? '----'}</span>
          </div>
          <div className="text-[#F9F7F2] whitespace-nowrap">
            {activeDoc?.year} · {activeDoc?.title}
          </div>
        </footer>
      </main>
    </div>
  );
}
