import crypto from 'crypto';

export function telegramAuthMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'invalid_init_data' });

  // 1. Parse URL-encoded pairs
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return res.status(401).json({ error: 'invalid_init_data' });

  // 2. Build data-check-string: sort all pairs except hash, join with \n
  const entries = [];
  for (const [key, val] of params.entries()) {
    if (key !== 'hash') entries.push(`${key}=${val}`);
  }
  entries.sort();
  const dataCheckString = entries.join('\n');

  // 3. Compute expected hash
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN ?? '')
    .digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // 4. Compare (constant-time to prevent timing oracle)
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const receivedBuf = Buffer.from(hash.length === expectedHash.length ? hash : '', 'hex');
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return res.status(401).json({ error: 'invalid_init_data' });
  }

  // 5. Check auth_date (must be within 24 hours, reject future-dated tokens)
  const authDate = parseInt(params.get('auth_date'), 10);
  const MAX_AUTH_AGE_SECONDS = 86400;
  const now = Math.floor(Date.now() / 1000);
  const age = now - authDate;
  if (!authDate || age < -60 || age > MAX_AUTH_AGE_SECONDS) {
    return res.status(401).json({ error: 'init_data_expired' });
  }

  // 6. Parse user and check whitelist
  let user;
  try {
    user = JSON.parse(params.get('user'));
  } catch {
    return res.status(401).json({ error: 'invalid_init_data' });
  }
  if (!user || typeof user.id !== 'number') {
    return res.status(401).json({ error: 'invalid_init_data' });
  }

  const allowedIds = (process.env.TELEGRAM_ALLOWED_IDS || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(Boolean);

  if (!allowedIds.includes(user.id)) {
    return res.status(401).json({ error: 'not_authorized' });
  }

  req.telegramUser = user;
  next();
}
