import { z } from 'zod';
import { SortKey } from '../scratchers';

const SORT_KEYS: SortKey[] = [
  'best',
  'adjusted',
  'odds',
  'topPrizeValue',
  'topPrizesRemain',
  'price',
  'launch',
];

export const scratchersQuerySchema = z.object({
  minPrice: z.preprocess(
    (a) => a === undefined || a === '' ? undefined : parseFloat(String(a)),
    z.number().min(0).optional()
  ),
  maxPrice: z.preprocess(
    (a) => a === undefined || a === '' ? undefined : parseFloat(String(a)),
    z.number().min(0).optional()
  ),
  minTopPrizeAvailability: z.preprocess(
    (a) => a === undefined || a === '' ? undefined : parseFloat(String(a)),
    z.number().min(0).max(1).optional()
  ),
  minTopPrizesRemaining: z.preprocess(
    (a) => a === undefined || a === '' ? undefined : parseInt(String(a), 10),
    z.number().min(0).optional()
  ),
  search: z.string().trim().optional(),
  lifecycle: z.enum(['new', 'continuing']).optional(),
  sortBy: z.enum(SORT_KEYS).optional(),
});

export type ScratchersQuery = z.infer<typeof scratchersQuerySchema>;

export const diagRemotesQuerySchema = z.object({});

// Add other API schemas as needed