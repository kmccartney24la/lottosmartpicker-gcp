// lib/server/remotes.ts
import "server-only";
import { z } from "zod";

export type GameKey =
  | "powerball"
  | "megamillions"
  | "ga_cash4life"
  | "ga_fantasy5";

const Env = z.object({
  // Unified (preferred)
  LOTTO_REMOTE_CSV_URL_POWERBALL: z.string().url().optional(),
  LOTTO_REMOTE_CSV_URL_MEGAMILLIONS: z.string().url().optional(),
  LOTTO_REMOTE_CSV_URL_GA_CASH4LIFE: z.string().url().optional(),
  LOTTO_REMOTE_CSV_URL_GA_FANTASY5: z.string().url().optional(),

  // Legacy fallbacks
  MULTI_POWERBALL_REMOTE_CSV_URL: z.string().url().optional(),
  MULTI_MEGAMILLIONS_REMOTE_CSV_URL: z.string().url().optional(),
  GA_CASH4LIFE_REMOTE_CSV_URL: z.string().url().optional(),
  GA_FANTASY5_REMOTE_CSV_URL: z.string().url().optional(),
});

const env = Env.parse({
  LOTTO_REMOTE_CSV_URL_POWERBALL: process.env.LOTTO_REMOTE_CSV_URL_POWERBALL,
  LOTTO_REMOTE_CSV_URL_MEGAMILLIONS: process.env.LOTTO_REMOTE_CSV_URL_MEGAMILLIONS,
  LOTTO_REMOTE_CSV_URL_GA_CASH4LIFE: process.env.LOTTO_REMOTE_CSV_URL_GA_CASH4LIFE,
  LOTTO_REMOTE_CSV_URL_GA_FANTASY5: process.env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5,

  MULTI_POWERBALL_REMOTE_CSV_URL: process.env.MULTI_POWERBALL_REMOTE_CSV_URL,
  MULTI_MEGAMILLIONS_REMOTE_CSV_URL: process.env.MULTI_MEGAMILLIONS_REMOTE_CSV_URL,
  GA_CASH4LIFE_REMOTE_CSV_URL: process.env.GA_CASH4LIFE_REMOTE_CSV_URL,
  GA_FANTASY5_REMOTE_CSV_URL: process.env.GA_FANTASY5_REMOTE_CSV_URL,
});

const pick = (...candidates: Array<string | undefined>) =>
  candidates.find(Boolean);

export function remoteFor(game: GameKey): string {
  switch (game) {
    case "powerball":
      return (
        pick(
          env.LOTTO_REMOTE_CSV_URL_POWERBALL,
          env.MULTI_POWERBALL_REMOTE_CSV_URL
        ) || fail("powerball")
      );
    case "megamillions":
      return (
        pick(
          env.LOTTO_REMOTE_CSV_URL_MEGAMILLIONS,
          env.MULTI_MEGAMILLIONS_REMOTE_CSV_URL
        ) || fail("megamillions")
      );
    case "ga_cash4life":
      return (
        pick(
          env.LOTTO_REMOTE_CSV_URL_GA_CASH4LIFE,
          env.GA_CASH4LIFE_REMOTE_CSV_URL
        ) || fail("ga_cash4life")
      );
    case "ga_fantasy5":
      return (
        pick(
          env.LOTTO_REMOTE_CSV_URL_GA_FANTASY5,
          env.GA_FANTASY5_REMOTE_CSV_URL
        ) || fail("ga_fantasy5")
      );
  }
}

function fail(game: string): never {
  throw new Error(
    `[remotes] Missing remote URL env for ${game}. Set LOTTO_REMOTE_CSV_URL_* or legacy key.`
  );
}

