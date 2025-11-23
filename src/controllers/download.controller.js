import { createDownloadToken, consumeDownloadToken } from '../services/token.service.js';

export async function generateDownloadLink(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ message: 'fileName is required' });
    }

    const { token } = await createDownloadToken({
      userId: req.user.id,
      fileName
    });

    return res.status(201).json({
      url: `/download/use/${token}`,
      expiresInSeconds: Number.parseInt(process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? '300', 10)
    });
  } catch (error) {
    return next(error);
  }
}

export async function useDownloadLink(req, res, next) {
  try {
    const { token } = req.params;

    const result = await consumeDownloadToken(token);

    if (result.status === 'not_found') {
      return res.status(404).json({ message: 'Token not found' });
    }

    if (result.status === 'already_used') {
      return res.status(409).json({ message: 'Token already used' });
    }

    if (result.status === 'expired') {
      return res.status(410).json({ message: 'Token expired' });
    }

    if (result.status !== 'ok') {
      return res.status(400).json({ message: 'Token invalid' });
    }

    return res.redirect(result.presignedUrl);
  } catch (error) {
    return next(error);
  }
}
