import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth'; //ainda nao usadooo!!!!

const dvwRouter = new Hono<AppEnv>();

// Helper to decompress and read file from R2
async function getDecompressedFileContent(c: Context<AppEnv>, fileKey: string): Promise<string> {
    const object = await c.env.VOLLEY_DATA.get(fileKey);
    if (!object || !object.body) {
        throw new Error('File not found or empty');
    }

    const decompressionStream = new DecompressionStream('gzip');
    // Cast to any to avoid strict type mismatch between ReadableStream<Uint8Array> and WritableStream<BufferSource>
    const decompressedStream = object.body.pipeThrough(decompressionStream as any);
    const fileBuffer = await new Response(decompressedStream).arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);

    // Handle large files by processing in chunks to avoid stack overflow
    let binary = '';
    const len = uint8Array.byteLength;
    const chunkSize = 32768; // 32KB chunks

    for (let i = 0; i < len; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

// List all uploaded DVW files
dvwRouter.get('/files', async (c) => {
    try {
        const listed = await c.env.VOLLEY_DATA.list({ prefix: 'raw/' });
        const files = listed.objects
            .filter(obj => obj.key.toLowerCase().endsWith('.dvw'))
            .map(obj => ({
                key: obj.key,
                uploaded: obj.uploaded,
                size: obj.size
            }));
        return c.json(files);
    } catch (error) {
        console.error('List Files Error:', error);
        return c.json({ message: 'Failed to list files', error: String(error) }, 500);
    }
});

// Upload DVW file (Compress and Save to R2)
dvwRouter.post('/upload', async (c) => {
    try {
        const formData = await c.req.parseBody();
        const file = formData['file'];

        if (!file || !(file instanceof File)) {
            return c.json({ message: 'File is required' }, 400);
        }

        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `raw/${safeFilename}`;

        // Compress stream
        const compressionStream = new CompressionStream('gzip');
        const compressedStream = file.stream().pipeThrough(compressionStream);

        // Buffer the compressed content to get a known length for R2 upload
        const compressedBuffer = await new Response(compressedStream).arrayBuffer();

        await c.env.VOLLEY_DATA.put(fileKey, compressedBuffer, {
            httpMetadata: {
                contentType: 'application/octet-stream', // Compressed binary
                contentEncoding: 'gzip'
            },
            customMetadata: {
                originalName: file.name
            }
        });

        return c.json({
            message: 'File uploaded and compressed successfully',
            fileKey: fileKey
        });

    } catch (error) {
        console.error('Upload Error:', error);
        return c.json({ message: 'Internal Upload Error', error: String(error) }, 500);
    }
});

// Proxy to R service for Player Actions (Reads from R2)
dvwRouter.post('/player-actions', async (c) => {
    try {
        const body = await c.req.json();
        const { fileKey, team, number } = body;

        if (!fileKey || !team || !number) {
            return c.json({ message: 'fileKey, team, and number are required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        const base64Content = await getDecompressedFileContent(c, fileKey);

        const payload = {
            filename: fileKey.split('/').pop() || 'file.dvw',
            file_content: base64Content,
            team: team,
            number: number
        };

        const rResponse = await fetch(`${c.env.R_PARSER_URL}/player-actions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            return c.json({ message: 'Failed to extract actions from R service', details: errText }, 502);
        }

        const actions = await rResponse.json();
        return c.json(actions);

    } catch (error) {
        console.error('Player Actions Proxy Error:', error);
        return c.json({ message: 'Internal Proxy Error', error: String(error) }, 500);
    }
});

// Proxy to R service for Player Actions by Skill
dvwRouter.post('/player-actions-by-skill', async (c) => {
    try {
        const body = await c.req.json();
        const { fileKey, team, number } = body;

        if (!fileKey || !team || !number) {
            return c.json({ message: 'fileKey, team, and number are required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        const base64Content = await getDecompressedFileContent(c, fileKey);

        const payload = {
            filename: fileKey.split('/').pop() || 'file.dvw',
            file_content: base64Content,
            team: team,
            number: number
        };

        const rResponse = await fetch(`${c.env.R_PARSER_URL}/player-actions-by-skill`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            return c.json({ message: 'Failed to extract grouped actions from R service', details: errText }, 502);
        }

        const actions = await rResponse.json();
        return c.json(actions);

    } catch (error) {
        console.error('Player Actions By Skill Proxy Error:', error);
        return c.json({ message: 'Internal Proxy Error', error: String(error) }, 500);
    }
});

dvwRouter.post('/raw-plays', async (c) => {
    try {
        const body = await c.req.json();
        const { fileKey } = body;

        if (!fileKey) {
            return c.json({ message: 'fileKey is required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        const base64Content = await getDecompressedFileContent(c, fileKey);

        const payload = {
            filename: fileKey.split('/').pop() || 'file.dvw',
            file_content: base64Content
        };

        const rResponse = await fetch(`${c.env.R_PARSER_URL}/raw-plays`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            return c.json({ message: 'Failed to extract raw plays from R service', details: errText }, 502);
        }

        const plays = await rResponse.json();
        return c.json(plays);

    } catch (error) {
        console.error('Raw Plays Proxy Error:', error);
        return c.json({ message: 'Internal Proxy Error', error: String(error) }, 500);
    }
});

dvwRouter.post('/meta', async (c) => {
    try {
        const body = await c.req.json();
        const { fileKey } = body;

        if (!fileKey) {
            return c.json({ message: 'fileKey is required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        const base64Content = await getDecompressedFileContent(c, fileKey);

        const payload = {
            filename: fileKey.split('/').pop() || 'file.dvw',
            file_content: base64Content
        };

        const rResponse = await fetch(`${c.env.R_PARSER_URL}/meta`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            return c.json({ message: 'Failed to extract meta data from R service', details: errText }, 502);
        }

        const meta = await rResponse.json();
        return c.json(meta);

    } catch (error) {
        console.error('Meta Proxy Error:', error);
        return c.json({ message: 'Internal Proxy Error', error: String(error) }, 500);
    }
});

dvwRouter.post('/meta/filtered', async (c) => {
    try {
        const body = await c.req.json();
        const { fileKey } = body;

        if (!fileKey) {
            return c.json({ message: 'fileKey is required' }, 400);
        }
        if (!c.env.R_PARSER_URL) {
            return c.json({ message: 'R_PARSER_URL not configured' }, 500);
        }

        const base64Content = await getDecompressedFileContent(c, fileKey);

        const payload = {
            filename: fileKey.split('/').pop() || 'file.dvw',
            file_content: base64Content
        };

        const rResponse = await fetch(`${c.env.R_PARSER_URL}/meta/filtered`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!rResponse.ok) {
            const errText = await rResponse.text();
            return c.json({ message: 'Failed to extract filtered meta data from R service', details: errText }, 502);
        }

        const meta = await rResponse.json();
        return c.json(meta);

    } catch (error) {
        console.error('Filtered Meta Proxy Error:', error);
        return c.json({ message: 'Internal Proxy Error', error: String(error) }, 500);
    }
});

export function registerDvwRoutes(app: Hono<AppEnv>) {
    app.route('/dvw', dvwRouter);
}
