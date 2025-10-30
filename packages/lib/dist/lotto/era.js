/** Map any GameKey to the EraGame we use for analysis (generator, stats, labels). */
export function resolveEraGame(game) {
    // Twice-daily Take 5 representatives & underlying collapse to 'ny_take5'
    if (game === 'ny_take5' || game === 'ny_take5_midday' || game === 'ny_take5_evening')
        return 'ny_take5';
    // Florida Fantasy 5 (midday/evening) collapse to 'fl_fantasy5'
    if (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening')
        return 'fl_fantasy5';
    // NY Lotto maps to its own era (6 + Bonus)
    if (game === 'ny_lotto' || game === 'ny_nylotto')
        return 'ny_lotto';
    // NEW: CA Fantasy 5 is canonical 5/39
    if (game === 'ca_fantasy5')
        return 'ca_fantasy5';
    // All these are already EraGame members
    if (game === 'multi_powerball' ||
        game === 'multi_megamillions' ||
        game === 'multi_cash4life' ||
        game === 'ga_fantasy5' ||
        game === 'ca_superlotto_plus' ||
        game === 'fl_lotto' ||
        game === 'fl_jackpot_triple_play' ||
        game === 'tx_lotto_texas' ||
        game === 'tx_cash5') {
        return game;
    }
    // Fallback: use Cash4Life era (safe, 5+1) if someone passes a non-era NY key by mistake.
    return 'multi_cash4life';
}
/* ---------------- Era definitions (CURRENT ERA ONLY) ----------------
   We always analyze/generate using the current matrices:
   - Powerball:    5/69 + 1/26 since 2015-10-07
   - Mega Millions:5/70 + 1/24 since 2025-04-08
-------------------------------------------------------------------*/
export const CURRENT_ERA = {
    multi_powerball: {
        start: '2015-10-07',
        mainMax: 69,
        specialMax: 26,
        mainPick: 5,
        label: '5/69 + 1/26',
        description: 'Powerball’s current matrix took effect on Oct 7, 2015: 5 mains from 1–69 and Powerball 1–26 (changed from 59/35).',
    },
    multi_megamillions: {
        start: '2025-04-08',
        mainMax: 70,
        specialMax: 24,
        mainPick: 5,
        label: '5/70 + 1/24',
        description: 'Mega Millions’ current matrix took effect on Apr 8, 2025: 5 mains from 1–70 and Mega Ball 1–24 (reduced from 25).',
    },
    multi_cash4life: {
        start: '2014-06-16',
        mainMax: 60,
        specialMax: 4,
        mainPick: 5,
        label: '5/60 + Cash Ball 1/4',
        description: 'Cash4Life: 5 mains from 1–60 and Cash Ball 1–4. Daily draws at 9:00 p.m. ET. Matrix stable since 2014.',
    },
    ga_fantasy5: {
        start: '2019-04-25',
        mainMax: 42,
        specialMax: 0,
        mainPick: 5,
        label: '5/42 (no bonus)',
        description: 'Fantasy 5: 5 mains from 1–42, no bonus ball. Daily draws at 11:34 p.m. ET.',
    },
    ny_take5: {
        start: '1992-01-17',
        mainMax: 39,
        specialMax: 0,
        mainPick: 5,
        label: '5/39 (no bonus)',
        description: 'NY Take 5: 5 mains from 1–39, no bonus ball. Draws twice daily (midday/evening).',
    },
    ny_lotto: {
        start: '2001-09-12',
        mainMax: 59,
        specialMax: 59, // use the same domain for the Bonus UI
        mainPick: 6, // six mains
        label: '6/59 + Bonus (1–59)',
        description: 'NY Lotto: 6 mains from 1–59 plus a Bonus ball (also 1–59). Jackpot odds = C(59,6); Bonus used for 2nd prize.',
    },
    fl_lotto: {
        start: '1999-10-24',
        mainMax: 53,
        specialMax: 53, // store the 6th main in `special` (schema compatibility)
        mainPick: 6, // six mains
        label: '6/53 (no bonus; 6th stored as special)',
        description: 'Florida LOTTO: 6 mains from 1–53. We store the 6th main in “special” to match the 5+special CSV schema. Double Play rows are excluded.',
    },
    fl_jackpot_triple_play: {
        start: '2019-01-30',
        mainMax: 46,
        specialMax: 46, // store 6th main in `special`
        mainPick: 6,
        label: '6/46 (no bonus; 6th stored as special)',
        description: 'Florida Jackpot Triple Play: 6 mains from 1–46, no bonus ball. We store the 6th main in “special” to match the canonical 5+special schema.',
    },
    fl_fantasy5: {
        start: '1999-04-25',
        mainMax: 36,
        specialMax: 0,
        mainPick: 5,
        label: '5/36 (no bonus)',
        description: 'Florida Fantasy 5: 5 mains from 1–36, no bonus ball. Midday & Evening draws; rows before 1999-04-25 are excluded.',
    },
    ca_superlotto_plus: {
        start: '2000-06-01',
        mainMax: 47,
        specialMax: 27,
        mainPick: 5,
        label: '5/47 + Mega 1/27',
        description: 'California SuperLotto Plus: 5 mains from 1–47 and a Mega number 1–27. Draws Wed & Sat; matrix in place since June 2000.',
    },
    ca_fantasy5: {
        start: '1992-01-01',
        mainMax: 39,
        specialMax: 0,
        mainPick: 5,
        label: '5/39 (no bonus)',
        description: 'California Fantasy 5: 5 mains from 1–39, no bonus ball. Daily draws; entry closes at 6:30 p.m. PT.',
    },
    tx_lotto_texas: {
        start: '2006-04-19',
        mainMax: 54,
        specialMax: 54, // store the 6th main in `special`
        mainPick: 6,
        label: '6/54 (no bonus; 6th stored as special)',
        description: 'Lotto Texas: 6 mains from 1–54. We store the 6th main in “special” to match the 5+special CSV schema.',
    },
    tx_cash5: {
        start: '2018-09-23',
        mainMax: 35,
        specialMax: 0,
        mainPick: 5,
        label: '5/35 (no bonus)',
        description: 'Texas Cash Five: 5 mains from 1–35, no bonus ball. Draws daily.',
    },
};
/** Return the current-era config for any (canonical or rep) GameKey. */
export function getCurrentEraConfig(game) {
    return CURRENT_ERA[resolveEraGame(game)];
}
/** Filter rows to the current era for the game (and collapse reps/underlyings consistently). */
export function filterRowsForCurrentEra(rows, game) {
    const eraKey = resolveEraGame(game);
    const era = CURRENT_ERA[eraKey];
    // Accept any row whose game resolves to the same era group & falls on/after start.
    return rows.filter(r => resolveEraGame(r.game) === eraKey && r.date >= era.start);
}
/** Friendly tooltip text describing the active era for a game (unchanged content). */
export function eraTooltipFor(game) {
    const era = CURRENT_ERA[resolveEraGame(game)];
    const name = game === 'multi_powerball' ? 'Powerball' :
        game === 'multi_megamillions' ? 'Mega Millions' :
            game === 'multi_cash4life' ? 'Cash4Life (GA)' :
                game === 'ca_superlotto_plus' ? 'SuperLotto Plus (CA)' :
                    game === 'ca_fantasy5' ? 'Fantasy 5 (CA)' :
                        (game === 'fl_fantasy5_midday' || game === 'fl_fantasy5_evening') ? 'Fantasy 5 (FL)' :
                            'Fantasy 5 (GA)';
    return [
        `${name} (current era: ${era.label})`,
        `Effective date: ${era.start}`,
        era.description,
        'Analyses and ticket generation in LottoSmartPicker include ALL draws since this date and ignore earlier eras.',
    ].join('\n');
}
