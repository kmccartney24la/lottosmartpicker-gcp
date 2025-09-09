// lib/server/remotes.ts
import 'server-only';
import type { GameKey } from '@lib/lotto';

export function remoteUrlFor(game: GameKey): string | null {
  switch (game) {
    case 'powerball':     return process.env.GA_POWERBALL_REMOTE_CSV_URL ?? null;
    case 'megamillions':  return process.env.GA_MEGAMILLIONS_REMOTE_CSV_URL ?? null;
    case 'ga_cash4life':  return process.env.GA_CASH4LIFE_REMOTE_CSV_URL ?? null;
    case 'ga_fantasy5':   return process.env.GA_FANTASY5_REMOTE_CSV_URL ?? null;
    default: return null;
  }
}
