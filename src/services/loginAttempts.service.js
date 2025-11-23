const FAILURE_THRESHOLD = Number.parseInt(process.env.AUTH_FAILURE_THRESHOLD ?? '5', 10);
const BLOCK_DURATION_MS = Number.parseInt(
  process.env.AUTH_BLOCK_DURATION_MS ?? String(15 * 60 * 1000),
  10
);

const attemptsByIp = new Map();

function getEntry(ip) {
  if (!attemptsByIp.has(ip)) {
    attemptsByIp.set(ip, { count: 0, blockedUntil: 0 });
  }

  return attemptsByIp.get(ip);
}

export function isIpBlocked(ip) {
  const entry = getEntry(ip);
  const now = Date.now();
  if (entry.blockedUntil > now) {
    return true;
  }

  if (entry.blockedUntil && entry.blockedUntil <= now) {
    entry.count = 0;
    entry.blockedUntil = 0;
  }

  return false;
}

export function registerFailure(ip) {
  const entry = getEntry(ip);
  entry.count += 1;

  if (entry.count >= FAILURE_THRESHOLD) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
}

export function registerSuccess(ip) {
  const entry = getEntry(ip);
  entry.count = 0;
  entry.blockedUntil = 0;
}
