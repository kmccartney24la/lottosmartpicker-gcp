import { openAndReady, saveDebug } from "./_util.js";
const TOP_PRIZES_URL = "https://www.galottery.com/en-us/games/scratchers/scratchers-top-prizes-claimed.html";
const toMoney = (s) => {
    if (!s)
        return undefined;
    const m = s.replace(/[^\d.]/g, "");
    return m ? Number(m) : undefined;
};
const toInt = (s) => {
    if (!s)
        return undefined;
    const m = s.replace(/[^\d]/g, "");
    return m ? Number(m) : undefined;
};
export async function fetchTopPrizes(context) {
    const page = await context.newPage();
    try {
        await openAndReady(page, TOP_PRIZES_URL);
        // Prefer the concrete tbody the site uses; we’ll still fall back to text-mode if needed.
        await page.waitForSelector("#snapContent", { timeout: 12_000 }).catch(() => { });
        await page.waitForSelector("#tabledata tr", { timeout: 15_000 }).catch(() => { });
        const { rows, lastUpdated } = await page.evaluate(() => {
            const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
            const host = (document.querySelector("#snapContent") || document.body);
            // 1) Try reading the structured table first (#tabledata lives under the table we want)
            const readFromTable = () => {
                const tbody = host.querySelector("#tabledata");
                const table = tbody ? tbody.closest?.("table") : null;
                if (!tbody || !table)
                    return { rows: [], lastUpdated: undefined };
                const cap = table.querySelector?.("caption")?.textContent || "";
                const mCap = cap.match(/data\s+as\s+of\s+(.+)/i);
                const lastUpdated = mCap ? norm(mCap[1]) : undefined;
                const trs = Array.from(tbody.querySelectorAll?.("tr") || []).filter((tr) => !tr.classList?.contains("thead"));
                const rows = trs.map((tr) => {
                    const tds = Array.from(tr.querySelectorAll?.("td") || []);
                    const val = (i) => norm(tds[i]?.textContent || "");
                    const gn = (val(0).match(/\d{3,5}/) || [])[0];
                    if (!gn)
                        return null;
                    return {
                        gameNumber: Number(gn),
                        gameName: val(1) || `Game #${gn}`,
                        price: val(2),
                        topPrizeValue: val(3),
                        claimed: val(4),
                        total: val(5),
                    };
                }).filter(Boolean);
                return { rows, lastUpdated };
            };
            // 2) Fallback: parse innerText if table parsing yields nothing (tabs between cells)
            const readFromText = () => {
                const raw = host.innerText || host.textContent || "";
                const lines = raw.split(/\n+/).map((s) => s.replace(/\s+$/g, ""));
                let start = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (/game\s*number/i.test(lines[i]) && /top\s*prize/i.test(lines[i])) {
                        start = i;
                        break;
                    }
                }
                if (start < 0)
                    return { rows: [], lastUpdated: undefined };
                const out = [];
                for (let i = start + 1; i < lines.length; i++) {
                    const L = lines[i];
                    if (/^\*/.test(L))
                        break; // footnotes reached
                    const cells = L.split(/\t+/);
                    if (cells.length < 6)
                        continue;
                    const [cGame, cName, cPrice, cTop, cClaim, cTotal] = cells.map((x) => x.trim());
                    if (!/^\d{3,5}$/.test(cGame))
                        continue;
                    out.push({
                        gameNumber: Number(cGame),
                        gameName: cName || `Game #${cGame}`,
                        price: cPrice,
                        topPrizeValue: cTop,
                        claimed: cClaim,
                        total: cTotal,
                    });
                }
                // lastUpdated fallback: scan any “Data as of …” text under host
                let lastUpdated;
                const nodes = Array.from(host.querySelectorAll?.("*:not(script):not(style)") || []);
                for (const el of nodes) {
                    const t = norm(el.textContent || "");
                    const m = t.match(/data\s+as\s+of\s+(.+?)$/i);
                    if (m) {
                        lastUpdated = norm(m[1]);
                        break;
                    }
                }
                return { rows: out, lastUpdated };
            };
            const t = readFromTable();
            if (t.rows.length)
                return t;
            return readFromText();
        });
        if (!rows?.length) {
            await saveDebug(page, `_debug_top_prizes`);
            return new Map();
        }
        // Build final map, keeping the row with the largest top prize per game.
        const map = new Map();
        for (const r of rows) {
            const price = toMoney(r.price);
            const topVal = toMoney(r.topPrizeValue);
            const claimed = toInt(r.claimed) ?? 0;
            const total = toInt(r.total);
            const remaining = typeof total === "number" ? Math.max(total - claimed, 0) : undefined;
            const next = {
                gameNumber: r.gameNumber,
                gameName: r.gameName,
                price,
                topPrizeValue: topVal,
                originalTopPrizes: total,
                topPrizesRemaining: remaining,
                lastUpdated,
            };
            const prev = map.get(r.gameNumber);
            if (!prev) {
                map.set(r.gameNumber, next);
            }
            else {
                const prevVal = prev.topPrizeValue ?? -Infinity;
                const nextVal = next.topPrizeValue ?? -Infinity;
                if (nextVal > prevVal)
                    map.set(r.gameNumber, next);
            }
        }
        return map;
    }
    catch {
        await saveDebug(page, `_debug_top_prizes`);
        return new Map();
    }
    finally {
        await page.close().catch(() => { });
    }
}
