export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function buildErrorBody(error: unknown) {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      details: error.details ?? null
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message
    };
  }

  return { message: 'Unexpected error' };
}
