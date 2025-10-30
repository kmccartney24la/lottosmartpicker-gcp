// src/workers/lspWorker.ts
/* eslint-disable no-restricted-globals */
// Dedicated Worker for heavy math/parsing. Imported functions are pure.
// We keep the API tiny and data-only for structured clone friendliness.

import {
  parseCanonicalCsv, parseFlexibleCsv,
  computeStats, analyzeGame, generateTicket,
  // imports for non-5-ball work
  computeDigitStats,
  computePick10Stats,
  computeQuickDrawStats,
  generatePick10Ticket,
  generateQuickDrawTicket,
  // AON (12/24) helpers come from the generalized k-of-N module
  computeAllOrNothingStats,
  generateAllOrNothingTicket,
  // types
  type LottoRow, type EraConfig, type GameKey,
  type DigitRow, type Pick10Row, type QuickDrawRow, type AllOrNothingRow,
} from '@lsp/lib';

type Msg =
  | { id: string; type: 'parseCanonicalCsv'; csv: string; game: GameKey }
  | { id: string; type: 'parseFlexibleCsv'; csv: string }
  | { id: string; type: 'computeStats'; rows: LottoRow[]; game: GameKey; override?: EraConfig }
  | { id: string; type: 'analyzeGame'; rows: LottoRow[]; game: GameKey }
  | { id: string; type: 'generateTicket'; rows: LottoRow[]; game: GameKey; opts: any; override?: EraConfig }
  // non-5-ball tasks
  | { id: string; type: 'computeDigitStats'; rows: DigitRow[]; k: 2|3|4|5 }
  | { id: string; type: 'computePick10Stats'; rows: Pick10Row[] }
  | { id: string; type: 'computeQuickDrawStats'; rows: QuickDrawRow[] }
  | { id: string; type: 'generatePick10Ticket'; stats: ReturnType<typeof computePick10Stats>; opts: { mode:'hot'|'cold'; alpha:number } }
  | { id: string; type: 'generateQuickDrawTicket'; stats: ReturnType<typeof computeQuickDrawStats>; spots: 1|2|3|4|5|6|7|8|9|10; opts: { mode:'hot'|'cold'; alpha:number } }
  // Texas All or Nothing (12 from 24)
  | { id: string; type: 'computeAllOrNothingStats'; rows: AllOrNothingRow[] }
  | { id: string; type: 'generateAllOrNothingTicket'; stats: ReturnType<typeof computeAllOrNothingStats>; opts: { mode:'hot'|'cold'; alpha:number } }
  | { id: string; type: 'cancel' };

const inflight = new Map<string, boolean>();

self.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (!msg || !('type' in msg)) return;
  if (msg.type === 'cancel') { inflight.clear(); return; }

  inflight.set(msg.id, true);
  const done = <T>(ok: boolean, payload?: T, error?: string) => {
    // if cancelled mid-flight, drop the reply silently
    if (!inflight.has(msg.id)) return;
    inflight.delete(msg.id);
    (self as any).postMessage({ id: msg.id, ok, payload, error });
  };

  try {
    switch (msg.type) {
      case 'parseCanonicalCsv': {
        const out = parseCanonicalCsv(msg.csv, msg.game);
        return done(true, out);
      }
      case 'parseFlexibleCsv': {
        const out = parseFlexibleCsv(msg.csv);
        return done(true, out);
      }
      case 'computeStats': {
        const out = computeStats(msg.rows, msg.game, msg.override);
        return done(true, out);
      }
      case 'analyzeGame': {
        const out = analyzeGame(msg.rows, msg.game);
        return done(true, out);
      }
      case 'generateTicket': {
        const out = generateTicket(msg.rows, msg.game, msg.opts, msg.override);
        return done(true, out);
      }
      case 'computeDigitStats': {
        const out = computeDigitStats(msg.rows, msg.k);
        return done(true, out);
      }
      case 'computePick10Stats': {
        const out = computePick10Stats(msg.rows);
        return done(true, out);
      }
      case 'computeQuickDrawStats': {
        const out = computeQuickDrawStats(msg.rows);
        return done(true, out);
      }
      case 'generatePick10Ticket': {
        const out = generatePick10Ticket(msg.stats, msg.opts);
        return done(true, out);
      }
      case 'generateQuickDrawTicket': {
        const out = generateQuickDrawTicket(msg.stats, msg.spots, msg.opts);
        return done(true, out);
      }
      case 'computeAllOrNothingStats': {
        const out = computeAllOrNothingStats(msg.rows);
        return done(true, out);
      }
      case 'generateAllOrNothingTicket': {
        const out = generateAllOrNothingTicket(msg.stats, msg.opts);
        return done(true, out);
      }
    }
  } catch (err: any) {
    return done(false, undefined, err?.message || String(err));
  }
};
