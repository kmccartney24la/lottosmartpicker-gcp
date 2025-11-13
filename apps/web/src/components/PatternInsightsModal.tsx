// src/components/PatternInsightsModal.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import './PatternInsightsModal.css';
import { usePatternInsights } from '../hooks/usePatternInsights';
import type { GameKey, LogicalGameKey } from '@lsp/lib';
import { getCurrentEraConfig } from '@lsp/lib';

import PatternDigitsView from 'apps/web/src/components/PatternDigitsView';
import PatternCashPopView from 'apps/web/src/components/PatternCashPopView';
import PatternKOfNView from 'apps/web/src/components/PatternKOfNView';
import PatternLottoView from 'apps/web/src/components/PatternLottoView';

type Props = {
  open: boolean;
  gameKey: GameKey | LogicalGameKey | null;
  onClose: () => void;
  period?: 'midday' | 'evening' | 'both';
};

export default function PatternInsightsModal({
  open,
  gameKey,
  onClose,
  period = 'both',
}: Props) {
  const {
    loading,
    error,
    displayName,
    lottoRows,
    digitRows,
    kofnRows,
    cashpopRows,
    isDigits,
    isCashPop,
  } = usePatternInsights({ open, gameKey, period });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  if (!open || !gameKey) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const era = getCurrentEraConfig(gameKey as GameKey);

  // ⭐ infer “lotto-ish” directly from era — covers FL Lotto, Jackpot Triple Play, TX Two Step, etc.
  const looksLottoLike =
    !!era &&
    (
      era.mainPick >= 5 ||               // draws a board of mains
      era.specialMax > 0                 // has a separate special domain
    );

  return (
    <div className="pattern-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="pattern-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pattern insights dashboard"
      >
        <header className="pattern-modal-header">
          <div>
            <h2 className="pattern-modal-title">Pattern Insights</h2>
            <p className="pattern-modal-sub">Game: {displayName}</p>
            {era ? (
              <p className="pattern-muted-small">
                {era.label} · effective {era.start}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="pattern-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {loading && <div className="pattern-modal-loading">Loading rows…</div>}
        {error && <div className="pattern-modal-error">{error}</div>}

        {/* digits first */}
        {!loading && !error && isDigits && digitRows && (
          <PatternDigitsView gameKey={gameKey} rows={digitRows} />
        )}

        {/* cash pop */}
        {!loading && !error && isCashPop && cashpopRows && (
          <PatternCashPopView rows={cashpopRows} />
        )}

        {/* ⭐ lotto-style: even if the hook didn’t give us lottoRows, prefer lotto when the era says so */}
        {!loading &&
          !error &&
          !isDigits &&
          !isCashPop &&
          looksLottoLike && (
            <PatternLottoView gameKey={gameKey} rows={lottoRows || []} />
          )}

        {/* fallback: true k-of-N (Pick10, QuickDraw, All or Nothing) */}
        {!loading &&
          !error &&
          !isDigits &&
          !isCashPop &&
          !looksLottoLike &&
          !lottoRows &&
          kofnRows && (
            <PatternKOfNView gameKey={gameKey} rows={kofnRows} />
          )}
      </div>
    </div>
  );
}
