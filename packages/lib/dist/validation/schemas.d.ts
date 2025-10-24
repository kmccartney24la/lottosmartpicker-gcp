import { z } from 'zod';
export declare const scratchersQuerySchema: z.ZodObject<{
    minPrice: z.ZodPipe<z.ZodTransform<number | undefined, unknown>, z.ZodOptional<z.ZodNumber>>;
    maxPrice: z.ZodPipe<z.ZodTransform<number | undefined, unknown>, z.ZodOptional<z.ZodNumber>>;
    minTopPrizeAvailability: z.ZodPipe<z.ZodTransform<number | undefined, unknown>, z.ZodOptional<z.ZodNumber>>;
    minTopPrizesRemaining: z.ZodPipe<z.ZodTransform<number | undefined, unknown>, z.ZodOptional<z.ZodNumber>>;
    search: z.ZodOptional<z.ZodString>;
    lifecycle: z.ZodOptional<z.ZodEnum<{
        new: "new";
        continuing: "continuing";
    }>>;
    sortBy: z.ZodOptional<z.ZodEnum<{
        best: "best";
        adjusted: "adjusted";
        odds: "odds";
        topPrizeValue: "topPrizeValue";
        topPrizesRemain: "topPrizesRemain";
        price: "price";
        launch: "launch";
    }>>;
}, z.core.$strip>;
export type ScratchersQuery = z.infer<typeof scratchersQuerySchema>;
export declare const diagRemotesQuerySchema: z.ZodObject<{}, z.core.$strip>;
