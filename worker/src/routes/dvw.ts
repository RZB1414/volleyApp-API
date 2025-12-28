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
        const file = formData['file'];
        if (!file || !(file instanceof File)) {
            return c.json({ message: 'File is required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }
        // Sanitize filename
        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        console.log(`Sending file to R: ${safeFilename} (Size: ${file.size} bytes)`);
        // --- KEY FIX: Use standard File object if possible, or ensure Blob has name ---
        const rFormData = new FormData();

        // Read file content
        const fileContent = await file.arrayBuffer();

        // Create a File-like object (or Blob with filename in append)
        // Note: In some environments 'File' constructor is preferred over 'Blob' for multipart
        const fileBlob = new Blob([fileContent], { type: 'text/plain' });

        // Critical: Append with filename to ensure Content-Disposition header is set correctly
        rFormData.append('file', fileBlob, safeFilename);
        console.log(`Posting to ${c.env.R_PARSER_URL}...`);
        const rResponse = await fetch(c.env.R_PARSER_URL, {
            method: 'POST',
            body: rFormData,
            // DO NOT set Content-Type header manually here; fetch will generate the boundary
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
