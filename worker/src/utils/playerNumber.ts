const PLAYER_NUMBER_REGEX = /^\d{1,3}$/;

export function normalizePlayerNumber(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = String(value ?? '').trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!PLAYER_NUMBER_REGEX.test(trimmed)) {
    throw new Error('playerNumber must contain only digits and be up to 3 characters long');
  }

  return trimmed;
}
