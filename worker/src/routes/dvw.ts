import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';
import { transformDvwToMatchReport } from '../services/dvwTransform';
import { insertMatchReport } from '../services/matchReport.service';

const dvwRouter = new Hono<AppEnv>();

const processSchema = z.object({
    filename: z.string().min(1, "Filename is required"),
    matchId: z.string().uuid().optional() // Optional override
});

// Trigger processing of a Raw DVW JSON file in R2
dvwRouter.post('/process', requireAuth, async (c) => {
    try {
        const body = await c.req.json();
        const { filename } = processSchema.parse(body);

        const r2 = c.env.VOLLEY_DATA;

        // 1. Read Raw JSON from R2
        const object = await r2.get(`raw/${filename}`);
        if (!object) {
            return c.json({ message: 'File not found in R2 (raw/)' }, 404);
        }

        const rawData = await object.json();

        // 2. Transform / Normalize
        const matchReport = transformDvwToMatchReport(rawData);

        // 3. Save Processed JSON to R2
        const processedFilename = filename.replace('.json', '_processed.json');
        await r2.put(`processed/${processedFilename}`, JSON.stringify(matchReport), {
            httpMetadata: { contentType: 'application/json' }
        });

        // 4. Insert into Database (Match Reports)
        // We need an ownerId. Assuming auth user.
        // const user = c.get('user'); // Assuming middleware sets this (need to check type safety)
        // user is available via getRequestUser usually or c.var.user if defined

        // For now, returning the report to verify
        return c.json({
            message: 'Processed successfully',
            processedFile: processedFilename,
            report: matchReport
        });

    } catch (error) {
        console.error('Processing error:', error);
        if (error instanceof z.ZodError) {
            return c.json({ message: 'Invalid payload', errors: error.flatten() }, 400);
        }
        return c.json({ message: 'Internal Processing Error' }, 500);
    }
});

export function registerDvwRoutes(app: Hono<AppEnv>) {
    app.route('/dvw', dvwRouter);
}
