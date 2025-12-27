import type { AppBindings } from '../types';

interface RateLimitConfig {
    hourlyLimit: number;
    dailyLimit: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    hourlyLimit: 20,   // 20 uploads por hora
    dailyLimit: 100    // 100 uploads por dia
};

/**
 * Verifica se um usuário excedeu seus limites de upload
 * Retorna { allowed: true } se permitido, ou { allowed: false, message: string } se bloqueado
 */
export async function checkRateLimit(
    env: AppBindings,
    userId: string,
    config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ allowed: boolean; message?: string }> {
    const now = new Date();
    const hourKey = `rate-limit:${userId}:${now.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH
    const dayKey = `rate-limit:${userId}:${now.toISOString().slice(0, 10)}`;  // YYYY-MM-DD

    try {
        // Verificar limite por hora
        const hourData = await env.VOLLEY_DATA.get(hourKey);
        const hourCount = hourData ? parseInt(await hourData.text()) : 0;

        if (hourCount >= config.hourlyLimit) {
            return {
                allowed: false,
                message: `Limite de ${config.hourlyLimit} uploads por hora excedido. Tente novamente em alguns minutos.`
            };
        }

        // Verificar limite por dia
        const dayData = await env.VOLLEY_DATA.get(dayKey);
        const dayCount = dayData ? parseInt(await dayData.text()) : 0;

        if (dayCount >= config.dailyLimit) {
            return {
                allowed: false,
                message: `Limite de ${config.dailyLimit} uploads por dia excedido. Tente novamente amanhã.`
            };
        }

        return { allowed: true };
    } catch (error) {
        console.error('[checkRateLimit] Error checking rate limit:', error);
        // Em caso de erro, permitir (fail open) para não bloquear usuários legítimos
        return { allowed: true };
    }
}

/**
 * Incrementa os contadores de rate limit após upload bem-sucedido
 */
export async function incrementRateLimit(env: AppBindings, userId: string): Promise<void> {
    const now = new Date();
    const hourKey = `rate-limit:${userId}:${now.toISOString().slice(0, 13)}`;
    const dayKey = `rate-limit:${userId}:${now.toISOString().slice(0, 10)}`;

    try {
        // Incrementar contador por hora
        const hourData = await env.VOLLEY_DATA.get(hourKey);
        const hourCount = hourData ? parseInt(await hourData.text()) : 0;
        await env.VOLLEY_DATA.put(hourKey, String(hourCount + 1), {
            httpMetadata: { contentType: 'text/plain' },
            // Expira em 2 horas
            customMetadata: { expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString() }
        });

        // Incrementar contador por dia
        const dayData = await env.VOLLEY_DATA.get(dayKey);
        const dayCount = dayData ? parseInt(await dayData.text()) : 0;
        await env.VOLLEY_DATA.put(dayKey, String(dayCount + 1), {
            httpMetadata: { contentType: 'text/plain' },
            // Expira em 2 dias
            customMetadata: { expiresAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        });
    } catch (error) {
        console.error('[incrementRateLimit] Error incrementing rate limit:', error);
        // Não lançar erro - continuar mesmo se falhar
    }
}

/**
 * Valida o tamanho do arquivo
 */
export function validateFileSize(sizeBytes: number, maxSizeMB: number = 10): { valid: boolean; message?: string } {
    const maxBytes = maxSizeMB * 1024 * 1024;

    if (sizeBytes > maxBytes) {
        return {
            valid: false,
            message: `Arquivo muito grande. Tamanho máximo permitido: ${maxSizeMB}MB`
        };
    }

    return { valid: true };
}
