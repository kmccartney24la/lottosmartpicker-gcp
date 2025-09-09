import 'server-only';
import type { GameKey } from '@lib/lotto';

const env = (k: string) => process.env[k] ?? null;

export function remoteUrlFor(game: GameKey): string | null {
  switch (game) {
    case 'powerball':
      return env('GA_POWERBALL_REMOTE_CSV_URL')    ?? env('MULTI_POWERBALL_REMOTE_CSV_URL');
    case 'megamillions':
      return env('GA_MEGAMILLIONS_REMOTE_CSV_URL') ?? env('MULTI_MEGAMILLIONS_REMOTE_CSV_URL');
    case 'ga_cash4life':
      return env('GA_CASH4LIFE_REMOTE_CSV_URL')    ?? env('MULTI_CASH4LIFE_REMOTE_CSV_URL');
    case 'ga_fantasy5':
      return env('GA_FANTASY5_REMOTE_CSV_URL')     ?? env('MULTI_FANTASY5_REMOTE_CSV_URL');
    default:
      return null;
  }
}

