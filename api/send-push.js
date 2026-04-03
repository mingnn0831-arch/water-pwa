import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:' + process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { kv } = await import('@vercel/kv');
    const keys = await kv.keys('sub:*');

    if (!keys.length) return res.status(200).json({ sent: 0 });

    let sent = 0;
    const now = Date.now();

    await Promise.allSettled(keys.map(async key => {
      const raw = await kv.get(key);
      if (!raw) return;

      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const { subscription, interval, wakeMin, sleepMin, lastSentAt } = record;

      if (lastSentAt && (now - lastSentAt) < (interval * 60 * 1000 - 60000)) return;

      const nowDate = new Date();
      const curMin = nowDate.getHours() * 60 + nowDate.getMinutes();
      const inWindow = sleepMin > wakeMin
        ? (curMin >= wakeMin && curMin < sleepMin)
        : (curMin >= wakeMin || curMin < sleepMin);

      if (!inWindow) return;

      const payload = JSON.stringify({
        title: '물 마실 시간이에요!',
        body: '지금 물 한 잔 마셔요. 건강한 하루를 위해!',
        wakeMin,
        sleepMin,
      });

      await webpush.sendNotification(subscription, payload);
      record.lastSentAt = now;
      await kv.set(key, JSON.stringify(record), { ex: 60 * 60 * 24 * 30 });
      sent++;
    }));

    return res.status(200).json({ sent });
  } catch (e) {
    console.error('send-push error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
