// Lesbos: yönetici onay API'si (Express + SQLite)
// Akış: üye talep açar -> kayıt `pending` -> Make.com webhook'una bildirim -> Telegram "Onayla"
//       -> Make HTTP modülü POST /api/approve -> kayıt `approved`.
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';

const { PORT = 3000, MAKE_WEBHOOK_URL, APPROVE_API_KEY, ALLOWED_ORIGIN } = process.env;
if (!MAKE_WEBHOOK_URL || !APPROVE_API_KEY) {
  console.error('MAKE_WEBHOOK_URL ve APPROVE_API_KEY ortam değişkenleri zorunludur.');
  process.exit(1);
}

const db = new Database(process.env.DB_FILE || 'lesbos.db');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS requests (
  id          TEXT PRIMARY KEY,
  user_name   TEXT NOT NULL,
  expert_name TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('sohbet','randevu')),
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at  TEXT
)`);
const insert = db.prepare('INSERT INTO requests (id,user_name,expert_name,type,details) VALUES (?,?,?,?,?)');
const byId   = db.prepare('SELECT id, status FROM requests WHERE id = ?');
const decide = db.prepare("UPDATE requests SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'");

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const sameKey = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Make.com'a bildirim (3 deneme)
async function notifyMake(payload) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) return;
      console.error(`Make webhook ${r.status} (deneme ${i})`);
    } catch (e) { console.error('Make webhook hatası:', e.message); }
    await new Promise(r => setTimeout(r, 1000 * i));
  }
}

// 1) Site -> talep oluştur (kayıt her zaman `pending` başlar)
app.post('/api/requests',
  cors({ origin: ALLOWED_ORIGIN || false }),
  rateLimit({ windowMs: 60_000, limit: 10 }),
  (req, res) => {
    const userName = str(req.body.userName, 80);
    const expertName = str(req.body.expertName, 120);
    const type = req.body.type;
    const details = str(req.body.details, 1000);
    if (!userName || !expertName || !['sohbet', 'randevu'].includes(type)) {
      return res.status(400).json({ error: 'userName, expertName ve type (sohbet|randevu) zorunludur.' });
    }
    const requestId = crypto.randomUUID();
    insert.run(requestId, userName, expertName, type, details);
    res.status(201).json({ requestId, status: 'pending' });
    notifyMake({ requestId, userName, expertName, type, details }); // yanıtı bekletmez
  });

// 2) Site -> durum sorgula (yalnızca durum döner)
app.get('/api/requests/:id',
  cors({ origin: ALLOWED_ORIGIN || false }),
  rateLimit({ windowMs: 60_000, limit: 60 }),
  (req, res) => {
    const row = byId.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Talep bulunamadı.' });
    res.json({ requestId: row.id, status: row.status });
  });

// 3) Make.com HTTP modülü -> onay / ret (x-api-key zorunlu)
app.post('/api/approve', rateLimit({ windowMs: 60_000, limit: 60 }), (req, res) => {
  if (!sameKey(req.get('x-api-key'), APPROVE_API_KEY)) {
    return res.status(401).json({ error: 'Yetkisiz.' });
  }
  const requestId = str(req.body.requestId, 64);
  const status = req.body.status === 'rejected' ? 'rejected' : 'approved'; // varsayılan: approved
  const row = byId.get(requestId);
  if (!row) return res.status(404).json({ error: 'Talep bulunamadı.' });
  if (row.status !== 'pending') return res.json({ requestId, status: row.status, changed: false }); // tekrar basılan buton zararsız
  decide.run(status, requestId);
  res.json({ requestId, status, changed: true });
});

app.get('/health', (_, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Lesbos onay API'si :${PORT} portunda`));
