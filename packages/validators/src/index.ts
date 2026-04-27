import { z } from "zod";

export const envSchema = z.object({
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    POSTGRES_URL: z.string().url().optional().or(z.literal("")),
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;
