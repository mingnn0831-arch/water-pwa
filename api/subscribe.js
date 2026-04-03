import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:' + process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, interval, wakeMin, sleepMin } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Missing subscription' });

  try {
    const { kv } = await import('@vercel/kv');

    const record = {
      subscription,
      interval: interval || 60,
      wakeMin:  wakeMin  || 420,
      sleepMin: sleepMin || 1410,
      updatedAt: Date.now(),
    };

    const key = 'sub:' + Buffer.from(subscription.endpoint).toString('base64').slice(0, 40);
    await kv.set(key, JSON.stringify(record), { ex: 60 * 60 * 24 * 30 });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('subscribe error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
