import { apiPathForUnderlying } from './paths.js';
import { parseFlexibleCsv } from './parse.js';
export async function fetchNyLottoExtendedRows() {
    const url = apiPathForUnderlying('ny_nylotto');
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const csv = await res.text();
    const flex = parseFlexibleCsv(csv); // ascending
    return flex.map(fr => {
        const vals = (fr.values || []).filter(Number.isFinite).map(Number);
        const mains = vals.slice(0, 6);
        const bonus = Number.isFinite(fr.special) ? fr.special : (Number.isFinite(vals[6]) ? vals[6] : NaN);
        return (mains.length === 6 && Number.isFinite(bonus))
            ? { date: fr.date, mains, bonus: bonus }
            : null;
    }).filter(Boolean);
}
