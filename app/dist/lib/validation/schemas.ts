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
    (a) => parseFloat(z.string().parse(a)),
    z.number().min(0).optional()
  ),
  maxPrice: z.preprocess(
    (a) => parseFloat(z.string().parse(a)),
    z.number().min(0).optional()
  ),
  minTopPrizeAvailability: z.preprocess(
    (a) => parseFloat(z.string().parse(a)),
    z.number().min(0).max(1).optional()
  ),
  minTopPrizesRemaining: z.preprocess(
    (a) => parseInt(z.string().parse(a), 10),
    z.number().min(0).optional()
  ),
  search: z.string().trim().optional(),
  lifecycle: z.enum(['new', 'continuing']).optional(),
  sortBy: z.enum(SORT_KEYS).optional(),
});

export type ScratchersQuery = z.infer<typeof scratchersQuerySchema>;

export const diagRemotesQuerySchema = z.object({});

// Add other API schemas as needed