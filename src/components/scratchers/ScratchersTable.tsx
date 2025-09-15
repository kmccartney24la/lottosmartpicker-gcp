'use client';
import React from 'react';
import type { ActiveGame } from './types';
import type { DisplayMode } from './DisplayModeSwitcher';

type ThumbKind = 'ticket' | 'odds';

function pctTopPrizesRemain(g: ActiveGame) {
  const orig = g.topPrizesOriginal ?? 0;
  const rem  = g.topPrizesRemaining ?? 0;
  return orig > 0 ? rem / orig : 0;
}

const OddsCell = ({ g }: { g: ActiveGame }) => (
  <div style={{ lineHeight: 1.25 }} aria-label="Odds adjusted and printed">
    <div className="mono">{g.adjustedOdds != null ? `1 in ${Number(g.adjustedOdds).toFixed(2)}` : '—'}</div>
    <div className="mono hint">{g.overallOdds != null ? `1 in ${g.overallOdds}` : '—'}</div>
  </div>
);

const TopLeftCell = ({ g }: { g: ActiveGame }) => {
  const pct = Math.round(pctTopPrizesRemain(g) * 100);
  return (
    <div style={{ lineHeight: 1.25 }}>
      <div className="mono">{(g.topPrizesRemaining ?? 0).toLocaleString()} / {(g.topPrizesOriginal ?? 0).toLocaleString()}</div>
      <div className="mono hint">{isFinite(pct) ? `${pct}% left` : '—'}</div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }} />
      </div>
    </div>
  );
};

function lifecycleLabel(v?: ActiveGame['lifecycle']) {
  if (!v) return null;
  const map: Record<string,string> = {
    new: 'New',
    ending: 'Ending soon',
    active: 'Active',
  };
  return map[v] ?? v[0]?.toUpperCase() + v.slice(1);
}

function Price({ value }: { value: number | undefined }) {
  if (value == null || Number.isNaN(value)) return <>—</>;
  return <>${value}</>;
}

function Money({ value }: { value: number | undefined }) {
  if (value == null || Number.isNaN(value)) return <>—</>;
  return <>${value.toLocaleString()}</>;
}

function DesktopSkeleton() {
  return (
    <div role="status" aria-live="polite" className="scratchers-skel desktop-only" style={{ width:'100%' }}>
      <table className="compact" style={{ tableLayout:'auto', width:'100%' }} aria-hidden="true">
        <thead>
          <tr>
            <th style={{ width: '38%', textAlign:'left' }}>Name</th>
            <th className="mono" style={{ width:'10%', textAlign:'right' }}>Game #</th>
            <th className="mono" style={{ width:'10%', textAlign:'right' }}>Price</th>
            <th className="mono" style={{ width:'18%', textAlign:'right' }}>Odds (adj / print)</th>
            <th className="mono" style={{ width:'12%', textAlign:'right' }}>Top prize</th>
            <th className="mono" style={{ width:'12%', textAlign:'right' }}>Top-prizes left</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="row skeleton">
              <td><div className="skeleton-line w-70" /><div className="skeleton-line w-40" /></td>
              <td className="mono" style={{ textAlign:'right' }}><div className="skeleton-line w-40" /></td>
              <td className="mono" style={{ textAlign:'right' }}><div className="skeleton-line w-30" /></td>
              <td style={{ textAlign:'right' }}><div className="skeleton-line w-60" /><div className="skeleton-line w-40" /></td>
              <td className="mono" style={{ textAlign:'right' }}><div className="skeleton-line w-50" /></td>
              <td style={{ textAlign:'right' }}>
                <div className="skeleton-line w-60" />
                <div className="meter"><span className="skeleton-fill" style={{ width: '50%' }} /></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="visually-hidden">Loading scratchers…</span>
    </div>
  );
}

function MobileSkeleton() {
  return (
    <div role="status" aria-live="polite" className="scratchers-skel mobile-only">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mobile-card skeleton">
          <div className="line1"><div className="skeleton-line w-60" /><span className="chip skeleton-pill" /></div>
          <div className="line2 mono"><div className="skeleton-line w-80" /></div>
          <div className="line3 mono"><div className="skeleton-line w-70" /></div>
          <div className="line4 mono">
            <div className="skeleton-line w-40" />
            <div className="meter"><span className="skeleton-fill" style={{ width: '50%' }} /></div>
          </div>
        </div>
      ))}
      <span className="visually-hidden">Loading scratchers…</span>
    </div>
  );
}

export default function ScratchersTable({
  games,
  loading,
  displayMode = 'detailed',
  globalImageKind = 'ticket',
}: {
  games: ActiveGame[];
  loading: boolean;
  displayMode?: DisplayMode;   // now: 'compact' | 'detailed' | 'expanded'
  /** Global image selection that also resets per-row overrides on change */
  globalImageKind?: ThumbKind; // 'ticket' | 'odds'
}) {
  const isDetailed  = displayMode === ('detailed' as any);
  const isExpanded  = displayMode === ('expanded' as any);
  const showThumbs  = isDetailed || isExpanded;

  // Per-row overrides
  const [rowThumb, setRowThumb] = React.useState<Record<number, ThumbKind>>({});
  React.useEffect(() => { setRowThumb({}); }, [globalImageKind]); // reset when global toggles
  const currentKindFor = (id: number): ThumbKind => rowThumb[id] ?? globalImageKind;
  const toggleRow = (id: number) =>
    setRowThumb(prev => ({ ...prev, [id]: (currentKindFor(id) === 'odds' ? 'ticket' : 'odds') }));

  /** Lightbox (Detailed mode only) */
  type LightboxState = { id: number; kind: ThumbKind } | null;
  const [lightbox, setLightbox] = React.useState<LightboxState>(null);
  const gameMap = React.useMemo(() => new Map(games.map(g => [g.gameNumber, g])), [games]);

  const openLightbox = (id: number) => {
    if (!isDetailed) return;              // disabled outside detailed mode
    setLightbox({ id, kind: currentKindFor(id) });
  };
  const closeLightbox = () => setLightbox(null);
  const setLightboxKind = (id: number, kind: ThumbKind) => {
    setLightbox(s => (s && s.id === id ? { ...s, kind } : s));
    setRowThumb(prev => ({ ...prev, [id]: kind })); // keep row thumb in sync
  };

  React.useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeLightbox();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const g = gameMap.get(lightbox.id);
        if (!g) return;
        const hasT = !!g.ticketImageUrl, hasO = !!g.oddsImageUrl;
        const next: ThumbKind =
          lightbox.kind === 'ticket' ? (hasO ? 'odds' : 'ticket') : (hasT ? 'ticket' : 'odds');
        setLightboxKind(lightbox.id, next);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, gameMap]);

  if (loading) {
    return (
      <div className="scratchers-table" aria-busy="true">
        <DesktopSkeleton />
        <MobileSkeleton />
      </div>
    );
  }
  if (!loading && games.length === 0) return <div>No games match your filters.</div>;

  return (
    <div className={`scratchers-table ${isExpanded ? 'mode-expanded' : isDetailed ? 'mode-detailed' : 'mode-compact'}`}>
      {/* Desktop / tablet table */}
      <table
        className="compact desktop-only"
        role="table"
        aria-label="GA Scratchers comparison"
        style={{ tableLayout:'auto', width:'100%' }}
      >
        <thead>
          <tr>
            {showThumbs && (
              <th className="mono" style={{ width: isExpanded ? '12%' : '10%', textAlign:'left' }}>
                Image
              </th>
            )}
            <th style={{ width: showThumbs ? (isExpanded ? '32%' : '34%') : '38%', textAlign:'left' }}>Name</th>
            <th className="mono" style={{ width:'10%', textAlign:'right' }}>Game #</th>
            <th className="mono" style={{ width:'10%', textAlign:'right' }}>Price</th>
            <th className="mono" style={{ width:'18%', textAlign:'right' }}>Odds (adj / print)</th>
            <th className="mono" style={{ width:'12%', textAlign:'right' }}>Top prize</th>
            <th className="mono" style={{ width:'12%', textAlign:'right' }}>Top-prizes left</th>
          </tr>
        </thead>
        <tbody>
          {games.map(g => {
            const kind = currentKindFor(g.gameNumber);
            const src = (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) || g.ticketImageUrl || g.oddsImageUrl;
            return (
              <tr key={g.gameNumber} className="row">
                {showThumbs && (
                <td style={{ whiteSpace:'nowrap' }}>
                  {isExpanded ? (
                    <div className="thumb-wrap">
                      {(() => {
                        const kind = currentKindFor(g.gameNumber);
                        const src =
                          (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) ||
                          g.ticketImageUrl || g.oddsImageUrl;
                        return src
                          ? <img className="thumb-full" src={src!} alt="" loading="lazy" decoding="async" aria-hidden="true" />
                          : <div className="thumb placeholder" aria-hidden="true" />;
                      })()}
                      <div className="thumb-badge mono">
                        {currentKindFor(g.gameNumber) === 'odds' ? 'Odds' : 'Ticket'}
                      </div>
                      <div className="thumb-controls" role="group" aria-label="Swap image">
                        <button
                          type="button"
                          className="thumb-arrow"
                          aria-label={`Show ${currentKindFor(g.gameNumber) === 'odds' ? 'ticket' : 'odds'} image`}
                          onClick={() => toggleRow(g.gameNumber)}
                        >
                          ‹ ›
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="thumb-open"
                      onClick={() => openLightbox(g.gameNumber)}
                      aria-label={`Open ${currentKindFor(g.gameNumber)} image for ${g.name}`}
                    >
                      {(() => {
                        const kind = currentKindFor(g.gameNumber);
                        const src =
                          (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) ||
                          g.ticketImageUrl || g.oddsImageUrl;
                        return src
                          ? <img className="thumb" src={src!} alt="" loading="lazy" decoding="async" />
                          : <div className="thumb placeholder" aria-hidden="true" />;
                      })()}
                    </button>
                  )}
                </td>
              )}
                <td style={{ whiteSpace:'normal', overflow:'visible', textOverflow:'clip' }}>
                  <div style={{ fontWeight:700, lineHeight:1.25 }}>
                    {g.name}{' '}
                    {lifecycleLabel(g.lifecycle) && (
                      <span
                        className={`chip lifecycle ${g.lifecycle}`}
                        title={lifecycleLabel(g.lifecycle) ?? undefined}
                      >
                        {lifecycleLabel(g.lifecycle)}
                      </span>
                    )}
                  </div>
                  {g.startDate && (
                  <div className="hint" style={{ marginTop:2 }}>
                    {`Launch: ${g.startDate}`}
                  </div>
                )}
                </td>
                <td className="mono" style={{ textAlign:'right', whiteSpace:'nowrap' }}>{g.gameNumber}</td>
                <td className="mono" style={{ textAlign:'right', whiteSpace:'nowrap' }}><Price value={g.price} /></td>
                <td style={{ textAlign:'right' }}><OddsCell g={g} /></td>
                <td className="mono" style={{ textAlign:'right' }}>
                  <Money value={g.topPrizeValue} />
                </td>
                <td style={{ textAlign:'right' }}><TopLeftCell g={g} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile stacked list */}
      <div className="mobile-only" role="list" aria-label="GA Scratchers comparison, mobile cards">
        {games.map(g => {
          const pct = Math.round(pctTopPrizesRemain(g) * 100);
          const kind = currentKindFor(g.gameNumber);
          const src = (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) || g.ticketImageUrl || g.oddsImageUrl;
          return (
            <div key={g.gameNumber} role="listitem" className="mobile-card">
              <div className="line1">
                <div className="title-wrap">
                  {showThumbs && (
                    isExpanded ? (
                      <div className="thumb-wrap" style={{ display:'inline-block' }}>
                        {(() => {
                          const src =
                            (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) ||
                            g.ticketImageUrl || g.oddsImageUrl;
                          return src
                            ? <img className="thumb-full" src={src!} alt="" loading="lazy" decoding="async" aria-hidden="true" />
                            : <div className="thumb placeholder" aria-hidden="true" />;
                        })()}
                        <div className="thumb-badge mono">{kind === 'odds' ? 'Odds' : 'Ticket'}</div>
                        <div className="thumb-controls" role="group" aria-label="Swap image">
                          <button
                            type="button"
                            className="thumb-arrow"
                            aria-label={`Show ${kind === 'odds' ? 'ticket' : 'odds'} image`}
                            onClick={() => toggleRow(g.gameNumber)}
                          >
                            ‹ ›
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="thumb-open"
                        onClick={() => openLightbox(g.gameNumber)}
                        aria-label={`Open ${kind} image for ${g.name}`}
                        style={{ display:'inline-block' }}
                      >
                        {(() => {
                          const src =
                            (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) ||
                            g.ticketImageUrl || g.oddsImageUrl;
                          return src
                            ? <img className="thumb" src={src!} alt="" loading="lazy" decoding="async" />
                            : <div className="thumb placeholder" aria-hidden="true" />;
                        })()}
                      </button>
                    )
                  )}
                  <div className="name">{g.name}</div>
                </div>
                {lifecycleLabel(g.lifecycle) && (
                  <span className={`chip lifecycle ${g.lifecycle}`}>{lifecycleLabel(g.lifecycle)}</span>
                )}
              </div>
              <div className="line2 mono">
                <span aria-label="Game number">#{g.gameNumber}</span>
                <span aria-hidden="true"> • </span>
                <span aria-label="Price"><Price value={g.price} /></span>
                <span aria-hidden="true"> • </span>
                <span aria-label="Top prize">Top: <Money value={g.topPrizeValue} /></span>
              </div>
              <div className="line3 mono">
                <span aria-label="Adjusted odds">{g.adjustedOdds != null ? `Adj 1 in ${Number(g.adjustedOdds).toFixed(2)}` : 'Adj —'}</span>
                <span aria-hidden="true"> / </span>
                <span className="hint" aria-label="Printed odds">{g.overallOdds != null ? `Print 1 in ${g.overallOdds}` : 'Print —'}</span>
              </div>
              <div className="line4 mono">
                <span className="counts">
                  {(g.topPrizesRemaining ?? 0).toLocaleString()} / {(g.topPrizesOriginal ?? 0).toLocaleString()} · {isFinite(pct) ? `${pct}% left` : '—'}
                </span>
                <div className="meter" aria-hidden="true"><span style={{ width: `${isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }} /></div>
              </div>
              {g.startDate && (
                <div className="line5 hint">
                  Launch: {g.startDate}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox (Detailed mode only) */}
      {isDetailed && lightbox && (() => {
        const g = gameMap.get(lightbox.id);
        if (!g) return null;
        const hasTicket = !!g.ticketImageUrl;
        const hasOdds = !!g.oddsImageUrl;
        const effectiveKind: ThumbKind =
          lightbox.kind === 'odds' && hasOdds ? 'odds'
          : lightbox.kind === 'ticket' && hasTicket ? 'ticket'
          : (hasTicket ? 'ticket' : 'odds');
        const src = effectiveKind === 'odds' ? g.oddsImageUrl : (g.ticketImageUrl ?? g.oddsImageUrl);
        return (
          <div className="lightbox-overlay" onClick={closeLightbox}>
            <div
              className="lightbox"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`lb-title-${g.gameNumber}`}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="lightbox-header">
                <h2 id={`lb-title-${g.gameNumber}`}>{g.name}</h2>
                <button type="button" className="btn" aria-label="Close image" onClick={closeLightbox}>✕</button>
              </header>
              <div className="lightbox-body">
                {src ? (
                  <img
                    className="lightbox-img"
                    src={src}
                    alt={`${g.name} ${effectiveKind === 'odds' ? 'odds' : 'ticket'} image`}
                    decoding="async"
                  />
                ) : <div className="thumb placeholder" aria-hidden="true" />}
              </div>
              <div className="lightbox-controls">
                <button
                  type="button"
                  className={`btn ${effectiveKind === 'ticket' ? 'btn-primary' : ''}`}
                  onClick={() => setLightboxKind(g.gameNumber, 'ticket')}
                  disabled={!hasTicket}
                  aria-disabled={!hasTicket}
                >
                  Ticket
                </button>
                <button
                  type="button"
                  className={`btn ${effectiveKind === 'odds' ? 'btn-primary' : ''}`}
                  onClick={() => setLightboxKind(g.gameNumber, 'odds')}
                  disabled={!hasOdds}
                  aria-disabled={!hasOdds}
                >
                  Odds
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
