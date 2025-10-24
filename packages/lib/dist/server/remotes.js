// lib/server/remotes.ts  (or rename your file to this exact path)
import "server-only";
function pick(...candidates) {
    return candidates.find(Boolean);
}
function required(name, ...candidates) {
    const v = pick(...candidates);
    if (!v)
        throw new Error(`[remotes] Missing remote URL env for ${name}. Set LOTTO_REMOTE_CSV_URL_* or legacy key.`);
    return v;
}
export function remoteFor(game) {
    switch (game) {
        case "multi_powerball":
            return required("multi_powerball", process.env.LOTTO_REMOTE_CSV_URL_POWERBALL, process.env.MULTI_POWERBALL_REMOTE_CSV_URL);
        case "multi_megamillions":
            return required("multi_megamillions", process.env.LOTTO_REMOTE_CSV_URL_MEGAMILLIONS, process.env.MULTI_MEGAMILLIONS_REMOTE_CSV_URL);
        case "multi_cash4life":
            return required("multi_cash4life", process.env.LOTTO_REMOTE_CSV_URL_CASH4LIFE, process.env.MULTI_CASH4LIFE_REMOTE_CSV_URL);
        case "ga_fantasy5":
            return required("ga_fantasy5", process.env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5, process.env.GA_FANTASY5_REMOTE_CSV_URL);
    }
}
