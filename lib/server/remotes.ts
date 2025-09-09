// lib/server/remotes.ts  (or rename your file to this exact path)
import "server-only";

export type GameKey =
  | "powerball"
  | "megamillions"
  | "ga_cash4life"
  | "ga_fantasy5";

function pick<T extends string | undefined>(...candidates: T[]) {
  return candidates.find(Boolean);
}

function required(name: string, ...candidates: Array<string | undefined>): string {
  const v = pick(...candidates);
  if (!v) throw new Error(`[remotes] Missing remote URL env for ${name}. Set LOTTO_REMOTE_CSV_URL_* or legacy key.`);
  return v;
}

export function remoteFor(game: GameKey): string {
  switch (game) {
    case "powerball":
      return required(
        "powerball",
        process.env.LOTTO_REMOTE_CSV_URL_POWERBALL,
        process.env.MULTI_POWERBALL_REMOTE_CSV_URL
      );
    case "megamillions":
      return required(
        "megamillions",
        process.env.LOTTO_REMOTE_CSV_URL_MEGAMILLIONS,
        process.env.MULTI_MEGAMILLIONS_REMOTE_CSV_URL
      );
    case "ga_cash4life":
      return required(
        "ga_cash4life",
        process.env.LOTTO_REMOTE_CSV_URL_GA_CASH4LIFE,
        process.env.GA_CASH4LIFE_REMOTE_CSV_URL
      );
    case "ga_fantasy5":
      return required(
        "ga_fantasy5",
        process.env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5,
        process.env.GA_FANTASY5_REMOTE_CSV_URL
      );
  }
}
