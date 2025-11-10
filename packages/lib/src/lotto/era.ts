// packages/lib/src/lotto/era.ts
import type {
  EraConfig,
  EraGame,
  GameKey,
  LogicalGameKey,
  LottoRow,
} from './types.js';

// Re-export types for convenience (as requested).
export type { EraConfig, EraGame } from './types.js';

/* ---------------- Era definitions (CURRENT ERA ONLY) ----------------
   We always analyze/generate using the current matrices:
   - Powerball:    5/69 + 1/26 since 2015-10-07
   - Mega Millions:5/70 + 1/24 since 2025-04-08
-------------------------------------------------------------------*/
export const CURRENT_ERA: Record<EraGame, EraConfig> = {
  multi_powerball: {
    start: '2015-10-07',
    mainMax: 69,
    specialMax: 26,
    mainPick: 5,
    label: '5/69 + 1/26',
    description:
      'Powerball’s current matrix took effect on Oct 7, 2015: 5 mains from 1–69 and Powerball 1–26 (changed from 59/35).',
  },
  multi_megamillions: {
    start: '2017-10-28',
    mainMax: 70,
    specialMax: 24,
    mainPick: 5,
    label: '5/70 + 1/24',
    description:
      'Mega Millions’ current matrix took effect on Apr 8, 2025: 5 mains from 1–70 and Mega Ball 1–24 (reduced from 25).',
  },
  multi_cash4life: {
    start: '2014-06-16',
    mainMax: 60,
    specialMax: 4,
    mainPick: 5,
    label: '5/60 + Cash Ball 1/4',
    description:
      'Cash4Life: 5 mains from 1–60 and Cash Ball 1–4. Daily draws at 9:00 p.m. ET. Matrix stable since 2014.',
  },
  ga_fantasy5: {
    start: '2019-04-25',
    mainMax: 42,
    specialMax: 0,
    mainPick: 5,
    label: '5/42 (no bonus)',
    description:
      'Fantasy 5: 5 mains from 1–42, no bonus ball. Daily draws at 11:34 p.m. ET.',
  },
  ny_take5: {
    start: '1992-01-17',
    mainMax: 39,
    specialMax: 0,
    mainPick: 5,
    label: '5/39 (no bonus)',
    description:
      'NY Take 5: 5 mains from 1–39, no bonus ball. Draws twice daily (midday/evening).',
  },
  ny_lotto: {
    start: '2001-09-12',
    mainMax: 59,
    specialMax: 0,      
    mainPick: 6,          // six mains
    label: '6/59 + Bonus (1–59)',
    description:
      'NY Lotto: 6 mains from 1–59 plus a Bonus ball (also 1–59). Jackpot odds = C(59,6); Bonus used for 2nd prize.',
  },
  fl_lotto: {
    start: '1999-10-24',
    mainMax: 53,
    specialMax: 0,      
    mainPick: 6,          // six mains
    label: '6/53 (no bonus; 6th stored as special)',
    description:
      'Florida LOTTO: 6 mains from 1–53. Double Play rows are excluded.',
  },
  fl_jackpot_triple_play: {
    start: '2019-01-30',
    mainMax: 46,
    specialMax: 0,       
    mainPick: 6,
    label: '6/46 (no bonus; 6th stored as special)',
    description:
      'Florida Jackpot Triple Play: 6 mains from 1–46, no bonus ball.',
  },
  fl_fantasy5: {
    start: '1999-04-25',
    mainMax: 36,
    specialMax: 0,
    mainPick: 5,
    label: '5/36 (no bonus)',
    description:
      'Florida Fantasy 5: 5 mains from 1–36, no bonus ball. Midday & Evening draws; rows before 1999-04-25 are excluded.',
  },
  ca_superlotto_plus: {
    start: '2000-06-01',
    mainMax: 47,
    specialMax: 27,
    mainPick: 5,
    label: '5/47 + Mega 1/27',
    description:
      'California SuperLotto Plus: 5 mains from 1–47 and a Mega number 1–27. Draws Wed & Sat; matrix in place since June 2000.',
  },
  ca_fantasy5: {
    start: '1992-01-01',
    mainMax: 39,
    specialMax: 0,
    mainPick: 5,
    label: '5/39 (no bonus)',
    description:
      'California Fantasy 5: 5 mains from 1–39, no bonus ball. Daily draws; entry closes at 6:30 p.m. PT.',
  },
  tx_lotto_texas: {
    start: '2006-04-19',
    mainMax: 54,
    specialMax: 0,     
    mainPick: 6,
    label: '6/54 (no bonus; 6th stored as special)',
    description:
      'Lotto Texas: 6 mains from 1–54. We store the 6th main in “special” to match the 5+special CSV schema.',
  },
  tx_cash5: {
    start: '2018-09-23',
    mainMax: 35,
    specialMax: 0,
    mainPick: 5,
    label: '5/35 (no bonus)',
    description:
      'Texas Cash Five: 5 mains from 1–35, no bonus ball. Draws daily.',
  },
  tx_texas_two_step: {
      start: '2001-01-01',
      mainMax: 35,
      specialMax: 35,
      mainPick: 4,
      label: '4/35 + 1/35',
      description: 'Four mains from 1–35 plus a separate 1–35 Bonus Ball.',
    },
};

/** Map any canonical or logical key to the EraGame we use for analysis (generator, stats, labels). */
export function resolveEraGame(game: GameKey | LogicalGameKey): EraGame {
  const g = String(game);
  const eraTable = CURRENT_ERA as Record<string, EraConfig>;

  // 1) Exact match: canonical era-backed game
  if (eraTable[g]) {
    return g as EraGame;
  }

  const gl = g.toLowerCase();

  // 2) NY — anchor everything to Take 5, except Lotto which has its own era
  if (gl.startsWith('ny_')) {
    if (g === 'ny_lotto') return 'ny_lotto';
    return 'ny_take5';
  }

  // 3) CA — digits and other CA logicals can lean on Fantasy 5
  if (gl.startsWith('ca_')) {
    if (g === 'ca_superlotto_plus') return 'ca_superlotto_plus';
    if (g === 'ca_fantasy5') return 'ca_fantasy5';
    return 'ca_fantasy5';
  }

  // 4) FL — we have several real era entries here, lean on those
  if (gl.startsWith('fl_')) {
    if (g === 'fl_lotto') return 'fl_lotto';
    if (g === 'fl_jackpot_triple_play') return 'fl_jackpot_triple_play';
    if (g === 'fl_fantasy5') return 'fl_fantasy5';
    // digits / cashpop → use the daily 5-ball as stable anchor
    return 'fl_fantasy5';
  }

  // 5) TX — use real entries when present, else Cash Five as the daily anchor
  if (gl.startsWith('tx_')) {
    if (g === 'tx_lotto_texas') return 'tx_lotto_texas';
    if (g === 'tx_cash5') return 'tx_cash5';
    if (g === 'tx_texas_two_step') return 'tx_texas_two_step';
    // tx_all_or_nothing, tx_pick3, tx_daily4 → stable daily anchor
    return 'tx_cash5';
  }

  // 6) Multi-state logicals should already be in CURRENT_ERA, but keep a fallback
  if (gl.startsWith('multi_') && eraTable[g]) {
    return g as EraGame;
  }

  // 7) Final safety net
  return 'multi_cash4life';
}

/** Return the current-era config for any (canonical or logical) key. */
export function getCurrentEraConfig(game: GameKey | LogicalGameKey): EraConfig {
  return CURRENT_ERA[resolveEraGame(game)];
}

/** Filter rows to the current era for the game (and collapse reps/underlyings consistently). */
export function filterRowsForCurrentEra(
  rows: LottoRow[],
  game: GameKey | LogicalGameKey
): LottoRow[] {
  const eraKey = resolveEraGame(game);
  const era = CURRENT_ERA[eraKey];
  return rows.filter(
    (r) => resolveEraGame(r.game) === eraKey && r.date >= era.start
  );
}

/** Friendly tooltip text describing the active era for a game (unchanged content). */
export function eraTooltipFor(game: GameKey | LogicalGameKey): string {
  const eraKey = resolveEraGame(game);
  const era = CURRENT_ERA[eraKey];
  const DISPLAY_NAME: Record<EraGame, string> = {
    multi_powerball: 'Powerball',
    multi_megamillions: 'Mega Millions',
    multi_cash4life: 'Cash4Life',
    ga_fantasy5: 'Fantasy 5 (GA)',
    ca_superlotto_plus: 'SuperLotto Plus',
    ca_fantasy5: 'Fantasy 5 (CA)',
    ny_take5: 'Take 5',
    ny_lotto: 'New York LOTTO',
    fl_fantasy5: 'Fantasy 5 (FL)',
    fl_lotto: 'Florida LOTTO',
    fl_jackpot_triple_play: 'Jackpot Triple Play',
    tx_lotto_texas: 'Lotto Texas',
    tx_cash5: 'Cash Five',
    tx_texas_two_step: 'Texas Two Step',
  };

  const name = DISPLAY_NAME[eraKey];
  return [
    `${name} (current era: ${era.label})`,
    `Effective date: ${era.start}`,
    era.description,
    'Analyses and ticket generation in LottoSmartPicker include ALL draws since this date and ignore earlier eras.',
  ].join('\n');
}
