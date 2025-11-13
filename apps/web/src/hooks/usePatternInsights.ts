// src/hooks/usePatternInsights.ts
import { useEffect, useMemo, useState } from 'react';
import type {
  GameKey,
  LogicalGameKey,
  LottoRow,
  DigitRowEx,
  Pick10Row,
  QuickDrawRow,
  AllOrNothingRow,
  CashPopRow,
  CashPopPeriod,
} from '@lsp/lib';
import {
  resolveGameMeta,
  filterRowsForCurrentEra,
  fetchRowsWithCache,
  fetchLogicalRows,
  fetchDigitRowsFor,
  isDigitShape,
  digitLogicalFor,
  fetchCashPopRows,
  normalizeCashPopPeriod,
  fetchPick10RowsFor,
  fetchQuickDrawRowsFor,
  fetchAllOrNothingRowsFor,
  displayNameFor,
  effectivePeriod,
  coerceAnyPeriod,
  LOGICAL_TO_UNDERLYING, // ← add this
} from '@lsp/lib';

type Period = 'midday' | 'evening' | 'both';

type UsePatternInsightsArgs = {
  open: boolean;
  gameKey: GameKey | LogicalGameKey | null;
  period?: Period;
};

type UsePatternInsightsResult = {
  loading: boolean;
  error: string | null;
  meta: ReturnType<typeof resolveGameMeta> | null;
  displayName: string;
  lottoRows: LottoRow[] | null;
  digitRows: DigitRowEx[] | null;
  kofnRows: Array<Pick10Row | QuickDrawRow | AllOrNothingRow> | null;
  cashpopRows: CashPopRow[] | null;
  isDigits: boolean;
  isCashPop: boolean;
};

export function usePatternInsights({
  open,
  gameKey,
  period = 'both',
}: UsePatternInsightsArgs): UsePatternInsightsResult {
  const [lottoRows, setLottoRows] = useState<LottoRow[] | null>(null);
  const [digitRows, setDigitRows] = useState<DigitRowEx[] | null>(null);
  const [kofnRows, setKofnRows] = useState<Array<Pick10Row | QuickDrawRow | AllOrNothingRow> | null>(null);
  const [cashpopRows, setCashpopRows] = useState<CashPopRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(() => {
    if (!gameKey) return null;
    return resolveGameMeta(gameKey as GameKey | undefined, gameKey as LogicalGameKey | undefined);
  }, [gameKey]);

  const displayName = gameKey ? displayNameFor(gameKey) : '';

  useEffect(() => {
    if (!open || !gameKey) {
      setLottoRows(null);
      setDigitRows(null);
      setKofnRows(null);
      setCashpopRows(null);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const m = resolveGameMeta(
          gameKey as GameKey | undefined,
          gameKey as LogicalGameKey | undefined
        );

        // pick the real period (evening wins when both, etc.)
        const effPeriod = effectivePeriod(m, coerceAnyPeriod(period));

        if (String(gameKey) === 'tx_texas_two_step') {
          // meta + period sanity
          // (shape should be 'five', hasSpecial true, mainPickOverride 4)
          // (effPeriod should be 'all' or 'evening' depending on your policy)
          // eslint-disable-next-line no-console
          console.log('[PI][TS] meta.shape:', m.shape, 'hasSpecial:', m.hasSpecial, 'mainPickOverride:', m.mainPickOverride, 'effPeriod:', effPeriod);
        }


        // 1) digits
        if (isDigitShape(m.shape)) {
          const digLogical = digitLogicalFor(undefined, gameKey as LogicalGameKey);
          if (!digLogical) {
            throw new Error('Digit logical could not be resolved for ' + String(gameKey));
          }
          const got = await fetchDigitRowsFor(digLogical as any, effPeriod); // ← use effPeriod
          if (!cancelled) {
            setDigitRows(got);
            setLottoRows(null);
            setKofnRows(null);
            setCashpopRows(null);
          }
          return;
        }

        // 2) cashpop
        if (m.shape === 'cashpop') {
          const cpPeriod = normalizeCashPopPeriod(effPeriod) as CashPopPeriod | 'all';
          const got = await fetchCashPopRows(cpPeriod);
          if (!cancelled) {
            setCashpopRows(got);
            setDigitRows(null);
            setLottoRows(null);
            setKofnRows(null);
          }
          return;
        }

        // 3) k-of-N
        if (m.shape === 'pick10') {
          const got = await fetchPick10RowsFor(gameKey as any);
          if (!cancelled) {
            setKofnRows(got);
            setDigitRows(null);
            setLottoRows(null);
            setCashpopRows(null);
          }
          return;
        }

        if (m.shape === 'quickdraw') {
          const got = await fetchQuickDrawRowsFor(gameKey as any);
          if (!cancelled) {
            setKofnRows(got);
            setDigitRows(null);
            setLottoRows(null);
            setCashpopRows(null);
          }
          return;
        }

        // TX all-or-nothing
        if (gameKey === 'tx_all_or_nothing') {
          const got = await fetchAllOrNothingRowsFor('tx_all_or_nothing', 'all');
          if (!cancelled) {
            setKofnRows(got);
            setDigitRows(null);
            setLottoRows(null);
            setCashpopRows(null);
          }
          return;
        }

        // 4) default: five/six lotto
        const isLogical = typeof gameKey === 'string' && gameKey in LOGICAL_TO_UNDERLYING;
        if (isLogical) {
          // Some logicals (e.g., tx_texas_two_step) don’t have midday/evening/etc.
          // If the requested period isn’t defined, fall back to 'all'.
          const pm = LOGICAL_TO_UNDERLYING[gameKey as LogicalGameKey];
          const usePeriod =
            (effPeriod && Object.prototype.hasOwnProperty.call(pm, effPeriod))
              ? (effPeriod as keyof typeof pm)
              : 'all';

              if (String(gameKey) === 'tx_texas_two_step') {
                // eslint-disable-next-line no-console
                console.log('[PI][TS] period map keys:', Object.keys(pm || {}), '→ using period:', usePeriod, '→ underlyings:', pm?.[usePeriod]);
              }

          const logicalRows = await fetchLogicalRows({
            logical: gameKey as LogicalGameKey,
            period: usePeriod as any, // fetcher accepts our union of period keys
          });

          if (String(gameKey) === 'tx_texas_two_step') {
            const first = logicalRows[0];
            const last  = logicalRows[logicalRows.length - 1];
            // eslint-disable-next-line no-console
            console.log('[PI][TS] fetched logicalRows:', logicalRows.length,
              'first:', first && { game: first.game, date: first.date },
              'last:',  last  && { game: last.game,  date: last.date }
            );
          }

          // keep only the current era and sort ascending (oldest → newest)
          const filtered = filterRowsForCurrentEra(logicalRows, gameKey as LogicalGameKey)
            .slice()
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

            if (String(gameKey) === 'tx_texas_two_step') {
              // eslint-disable-next-line no-console
              console.log('[PI][TS] after era filter:', filtered.length,
                filtered[0] && { first: filtered[0].date, game: filtered[0].game },
                filtered[filtered.length - 1] && { last: filtered[filtered.length - 1].date, game: filtered[filtered.length - 1].game }
              );
            }

          if (!cancelled) {
            setLottoRows(filtered);
            setDigitRows(null);
            setKofnRows(null);
            setCashpopRows(null);
          }
        } else {
          const fetched = await fetchRowsWithCache({ game: gameKey as GameKey });
          if (String(gameKey) === 'tx_texas_two_step') {
            const f0 = fetched[0], fl = fetched[fetched.length - 1];
            // eslint-disable-next-line no-console
            console.log('[PI][TS] fetched canonical:', fetched.length,
              f0 && { first: f0.date, game: f0.game },
              fl && { last: fl.date, game: fl.game }
            );
          }

          const filtered = filterRowsForCurrentEra(fetched, gameKey as GameKey)
            .slice()
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
          if (!cancelled) {
            setLottoRows(filtered);
            setDigitRows(null);
            setKofnRows(null);
            setCashpopRows(null);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[PI][TS] load failed:', e);
          setError(e?.message || 'Failed to load game rows.');
          setLottoRows(null);
          setDigitRows(null);
          setKofnRows(null);
          setCashpopRows(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, gameKey, period]);

  const isDigits = !!meta && isDigitShape(meta.shape);
  const isCashPop = !!meta && meta.shape === 'cashpop';

  return {
    loading,
    error,
    meta,
    displayName,
    lottoRows,
    digitRows,
    kofnRows,
    cashpopRows,
    isDigits,
    isCashPop,
  };
}
