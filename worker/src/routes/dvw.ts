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

// Upload and Process DVW file
dvwRouter.post('/process', requireAuth, async (c) => {
    try {
        const formData = await c.req.parseBody();
        const file = formData['file']; // Assuming the field name is 'file'

        if (!file || !(file instanceof File)) {
            return c.json({ message: 'File is required' }, 400);
        }

        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        // 1. Send to R Parser Service
        const rFormData = new FormData();
        rFormData.append('file', file);

        console.log(`Sending file ${file.name} to R Parser at ${c.env.R_PARSER_URL}`);

        const rResponse = await fetch(c.env.R_PARSER_URL, {
            method: 'POST',
            body: rFormData
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            console.error('R Parser Error:', errText);
            return c.json({ message: 'Failed to parse file via R service', details: errText }, 502);
        }

        const rawData = await rResponse.json();

        // 2. Transform / Normalize
        const matchReport = transformDvwToMatchReport(rawData);

        // 3. Save Processed JSON to R2
        const r2 = c.env.VOLLEY_DATA;
        const processedFilename = file.name.replace(/\.dvw$/i, '') + '_processed.json';

        // Also save the Raw JSON for debugging/backup if desired
        const rawFilename = file.name.replace(/\.dvw$/i, '') + '_raw.json';
        await r2.put(`raw/${rawFilename}`, JSON.stringify(rawData), {
            httpMetadata: { contentType: 'application/json' }
        });

        await r2.put(`processed/${processedFilename}`, JSON.stringify(matchReport), {
            httpMetadata: { contentType: 'application/json' }
        });

        return c.json({
            message: 'Processed successfully',
            processedFile: processedFilename,
            report: matchReport
        });

    } catch (error) {
        console.error('Processing error:', error);
        return c.json({ message: 'Internal Processing Error', error: String(error) }, 500);
    }
});

export function registerDvwRoutes(app: Hono<AppEnv>) {
    app.route('/dvw', dvwRouter);
}
