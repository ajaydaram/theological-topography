import React from 'react';
import type { VerseTextEntry } from '../hooks/useVerseTextCache';

interface VerseTextTogglePanelProps {
  reference: string;
  isVisible: boolean;
  entry: VerseTextEntry;
  onToggle: (reference: string) => void;
  onRetry: (reference: string) => void;
  idPrefix: string;
  compact?: boolean;
}

function toDomId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function VerseTextTogglePanel({
  reference,
  isVisible,
  entry,
  onToggle,
  onRetry,
  idPrefix,
  compact = false,
}: VerseTextTogglePanelProps) {
  const panelId = `${idPrefix}-${toDomId(reference)}`;

  return (
    <div className={compact ? 'mt-2' : 'mt-2 ml-2'}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(reference);
        }}
        aria-expanded={isVisible}
        aria-controls={panelId}
        className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
      >
        {isVisible ? 'Hide Verse Text' : 'Show Verse Text'}
      </button>

      {isVisible && (
        <div
          id={panelId}
          className={`mt-2 ${compact ? 'border border-[#000000] bg-white/60' : 'border border-dashed border-[#000000] bg-[#F9F7F2]'} p-3`}
        >
          <div className="text-[9px] font-mono uppercase tracking-widest text-[#A52A2A] mb-2">
            {(entry.translation ?? 'KJV')} via {entry.source ?? 'bible-api.com'}
          </div>

          {entry.status === 'loading' && (
            <div className="space-y-2 min-h-16" aria-live="polite">
              <div className="h-3 w-full bg-[#000000]/10 animate-pulse" />
              <div className="h-3 w-5/6 bg-[#000000]/10 animate-pulse" />
              <div className="h-3 w-4/6 bg-[#000000]/10 animate-pulse" />
            </div>
          )}

          {entry.status === 'loaded' && (
            <p className="text-sm font-serif leading-relaxed text-[#000000] whitespace-pre-line">{entry.text}</p>
          )}

          {entry.status === 'error' && (
            <div className="space-y-2">
              <div className="text-xs font-serif text-[#A52A2A]">{entry.error ?? 'Unable to load verse text.'}</div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry(reference);
                }}
                className="text-[9px] font-mono uppercase tracking-widest text-[#000000] underline decoration-[#000000] underline-offset-4 hover:decoration-[#A52A2A]"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
