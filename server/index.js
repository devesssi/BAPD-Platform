import express from 'express';
import { createClient } from '@libsql/client';
import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDbPath = path.relative(process.cwd(), path.join(__dirname, 'bapd.sqlite')).split(path.sep).join('/');
const databaseUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_DB_URL || `file:${localDbPath}`;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || undefined;
if (process.env.VERCEL === '1' && !process.env.TURSO_DATABASE_URL && !process.env.TURSO_DB_URL) {
  throw new Error('Configure TURSO_DATABASE_URL or TURSO_DB_URL for the Vercel deployment.');
}
const db = createClient({ url: databaseUrl, authToken: tursoAuthToken });
const rowObjects = result => result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]])));
const all = async (sql, ...args) => rowObjects(await db.execute({ sql, args }));
const one = async (sql, ...args) => (await all(sql, ...args))[0];

async function initializeDatabase() {
  await db.execute('PRAGMA foreign_keys=ON');
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, age INTEGER, gender TEXT, weight_category TEXT, club TEXT, coach TEXT, status TEXT NOT NULL DEFAULT 'Pending', points INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, age_group TEXT, is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS tournaments(id INTEGER PRIMARY KEY, name TEXT NOT NULL, tournament_date TEXT NOT NULL, deadline TEXT, venue TEXT, category TEXT, description TEXT, status TEXT DEFAULT 'Upcoming', is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY, player_id INTEGER REFERENCES players(id) ON DELETE CASCADE, tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE, created_at TEXT DEFAULT CURRENT_TIMESTAMP, is_demo INTEGER NOT NULL DEFAULT 0, UNIQUE(player_id,tournament_id));
    CREATE TABLE IF NOT EXISTS player_accounts(clerk_user_id TEXT PRIMARY KEY, player_id INTEGER UNIQUE REFERENCES players(id) ON DELETE CASCADE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS news(id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, source_url TEXT, is_demo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS contact_messages(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);

  // Bring older local SQLite databases up to the current schema without replacing user data.
  const migrations = [
    ['players', 'age_group', 'TEXT'],
    ['players', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['tournaments', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['registrations', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['news', 'source_url', 'TEXT'],
    ['news', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [table, column, definition] of migrations) {
    const columns = await all(`PRAGMA table_info(${table})`);
    if (!columns.some(item => item.name === column)) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  const realStory = 'Palghar boxer Sana Gonsalvis was listed in Maharashtra’s team for the first BFI Sub-Junior Girls National Boxing Championship in 2018, in the 60 kg category. Neha Mhatre of Palghar was listed as team manager.';
  const seedStatements = [{
    sql: 'INSERT INTO news(title,body,source_url) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM news WHERE title=?)',
    args: ['Palghar at the national championships', realStory, 'https://timesofindia.indiatimes.com/sports/more-sports/others/nagpur-to-host-bfis-1st-sub-junior-girls-boxing-nationals/articleshow/65589773.cms', 'Palghar at the national championships'],
  }];
  const demoPlayers = [
    ['Aarav Patil','aarav.patil@demo.bapd.invalid',19,'Male','60 kg','Palghar Boxing Club','Coach R. Jadhav','Approved','Senior',128],
    ["Anaya D'Souza",'anaya.dsouza@demo.bapd.invalid',17,'Female','60 kg','Vasai Fight Academy','Coach M. Fernandes','Approved','Youth',116],
    ['Irfan Shaikh','irfan.shaikh@demo.bapd.invalid',21,'Male','67 kg','Boisar Boxing Centre','Coach S. Khan','Approved','Senior',104],
    ['Meera More','meera.more@demo.bapd.invalid',16,'Female','54 kg','Dahanu Youth Sports','Coach P. More','Approved','Youth',93],
    ['Rohan Gharat','rohan.gharat@demo.bapd.invalid',18,'Male','57 kg','Palghar Boxing Club','Coach R. Jadhav','Approved','Youth',86],
    ['Ayesha Khan','ayesha.khan@demo.bapd.invalid',20,'Female','65 kg','Vasai Fight Academy','Coach M. Fernandes','Approved','Senior',78],
    ['Nikhil Bhoir','nikhil.bhoir@demo.bapd.invalid',15,'Male','52 kg','Boisar Boxing Centre','Coach S. Khan','Approved','Youth',64],
    ['Priya Wagh','priya.wagh@demo.bapd.invalid',22,'Female','57 kg','Dahanu Youth Sports','Coach P. More','Approved','Senior',58],
    ['Kabir Raut','kabir.raut@demo.bapd.invalid',17,'Male','63 kg','Jawhar Sports Club','Coach V. Raut','Pending','Youth',0],
    ['Tara Fernandes','tara.fernandes@demo.bapd.invalid',16,'Female','51 kg','Vasai Fight Academy','Coach M. Fernandes','Pending','Youth',0],
    ['Dev Pawar','dev.pawar@demo.bapd.invalid',19,'Male','71 kg','Mokhada Boxing Group','Coach A. Pawar','Pending','Senior',0],
  ];
  const playerSql = `INSERT INTO players(name,email,age,gender,weight_category,club,coach,status,age_group,points,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,1)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,age=excluded.age,gender=excluded.gender,weight_category=excluded.weight_category,club=excluded.club,coach=excluded.coach,status=excluded.status,age_group=excluded.age_group,points=excluded.points,is_demo=1`;
  for (const row of demoPlayers) seedStatements.push({ sql: playerSql, args: row });

  const demoEvents = [
    ['Palghar District Novice Boxing Meet','2026-11-22','2026-11-15','Palghar Sports Complex','District','A sample district meet for emerging boxers across Palghar.','Upcoming'],
    ['Vasai Winter Open','2026-12-13','2026-12-05','Vasai Municipal Sports Ground','Open','A sample open-card event with youth and senior divisions.','Upcoming'],
    ['Palghar Youth Boxing League','2027-01-17','2027-01-10','Boisar Indoor Stadium','Youth','A sample youth fixture for clubs in the district.','Upcoming'],
  ];
  const eventSql = `INSERT INTO tournaments(name,tournament_date,deadline,venue,category,description,status,is_demo)
    SELECT ?,?,?,?,?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM tournaments WHERE name=?)`;
  for (const row of demoEvents) seedStatements.push({ sql: eventSql, args: [...row, row[0]] });

  const demoStories = [
    ['DEMO · Club spotlight: training together','A sample journal entry about clubs sharing coaching time, conditioning ideas and safe sparring practice.'],
    ['DEMO · Three habits for a strong first round','A sample coaching note: listen to your corner, keep your guard disciplined and pace yourself between exchanges.'],
    ['DEMO · Youth squad begins winter camp','A sample announcement for a district youth training camp ahead of the winter fixture calendar.'],
  ];
  for (const [title, body] of demoStories) seedStatements.push({
    sql: 'INSERT INTO news(title,body,is_demo) SELECT ?,?,1 WHERE NOT EXISTS(SELECT 1 FROM news WHERE title=?)',
    args: [title, body, title],
  });
  await db.batch(seedStatements, 'write');

  const entries = [
    ['aarav.patil@demo.bapd.invalid','Palghar District Novice Boxing Meet'],
    ['anaya.dsouza@demo.bapd.invalid','Palghar District Novice Boxing Meet'],
    ['irfan.shaikh@demo.bapd.invalid','Palghar District Novice Boxing Meet'],
    ['meera.more@demo.bapd.invalid','Vasai Winter Open'],
    ['rohan.gharat@demo.bapd.invalid','Vasai Winter Open'],
    ['ayesha.khan@demo.bapd.invalid','Palghar Youth Boxing League'],
  ];
  const demoIds = await all(`SELECT p.id player_id,p.email,t.id tournament_id,t.name event_name
    FROM players p CROSS JOIN tournaments t
    WHERE p.email IN (${entries.map(() => '?').slice(0, 6).join(',')})
      AND t.name IN (${demoEvents.map(() => '?').join(',')})`,
    ...entries.map(([email]) => email), ...demoEvents.map(([name]) => name));
  const entryKeys = new Set(entries.map(([email, eventName]) => `${email}|${eventName}`));
  const entryStatements = demoIds
    .filter(item => entryKeys.has(`${item.email}|${item.event_name}`))
    .map(item => ({ sql: 'INSERT OR IGNORE INTO registrations(player_id,tournament_id,is_demo) VALUES(?,?,1)', args: [item.player_id, item.tournament_id] }));
  if (entryStatements.length) await db.batch(entryStatements, 'write');
}

await initializeDatabase();

const app = express();
const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && clerkPublishableKey);
if (clerkConfigured) app.use(clerkMiddleware({ publishableKey: clerkPublishableKey, secretKey: process.env.CLERK_SECRET_KEY }));
app.use(express.json());
if (clerkConfigured) app.use('/api', async (req, res, next) => {
  const publicRead = req.method === 'GET' && req.path.startsWith('/public/');
  const publicWrite = req.method === 'POST' && ['/contact','/chat','/public/apply','/public/register'].includes(req.path);
  const playerRoute = req.path.startsWith('/player/');
  if (publicRead || publicWrite) return next();
  const auth = getAuth(req);
  if (!auth.isAuthenticated) return res.status(401).json({ error: 'Sign in to use the BAPD workspace.' });
  if (playerRoute) return next();

  const allowedIds = (process.env.CLERK_ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
  let isAdmin = allowedIds.includes(auth.userId);
  const allowedEmails = (process.env.CLERK_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!isAdmin && allowedEmails.length) {
    try {
      const user = await clerkClient.users.getUser(auth.userId);
      const verifiedEmails = (user.emailAddresses || [])
        .filter(item => item.verification?.status === 'verified')
        .map(item => item.emailAddress.toLowerCase());
      isAdmin = allowedEmails.some(email => verifiedEmails.includes(email));
    } catch {
      return res.status(503).json({ error: 'Could not verify your admin account right now. Please try again.' });
    }
  }
  if (!isAdmin) return res.status(403).json({ error: 'Your account needs administrator access. Add its Clerk user ID or verified email to the admin allowlist in .env.local, then restart the server.' });
  next();
});

const run = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const count = async sql => Number((await one(sql)).n || 0);

app.get('/api/summary', run(async (_req, res) => {
  const [players, pending, tournaments, registrations] = await Promise.all([
    count("SELECT COUNT(*) n FROM players WHERE status='Approved'"),
    count("SELECT COUNT(*) n FROM players WHERE status='Pending'"),
    count("SELECT COUNT(*) n FROM tournaments WHERE status='Upcoming'"),
    count('SELECT COUNT(*) n FROM registrations'),
  ]);
  res.json({ players, pending, tournaments, registrations });
}));
app.get('/api/players', run(async (_req, res) => res.json(await all('SELECT * FROM players ORDER BY id DESC'))));
app.post('/api/players', run(async (req, res) => {
  const { name, email, age, gender, weight_category, club, coach } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  try {
    const result = await db.execute({ sql: 'INSERT INTO players(name,email,age,gender,weight_category,club,coach) VALUES(?,?,?,?,?,?,?)', args: [name,email,age||null,gender||'Other',weight_category||'',club||'',coach||''] });
    res.status(201).json(await one('SELECT * FROM players WHERE id=?', result.lastInsertRowid));
  } catch { res.status(409).json({ error: 'That email is already registered.' }); }
}));
app.patch('/api/players/:id/status', run(async (req, res) => {
  if (!['Approved','Rejected','Pending'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
  await db.execute({ sql: 'UPDATE players SET status=? WHERE id=?', args: [req.body.status, req.params.id] });
  res.json(await one('SELECT * FROM players WHERE id=?', req.params.id) || {});
}));
app.get('/api/tournaments', run(async (_req, res) => res.json(await all('SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id=t.id) registrants FROM tournaments t ORDER BY tournament_date'))));
app.post('/api/tournaments', run(async (req, res) => {
  const { name, tournament_date, deadline, venue, category, description } = req.body;
  if (!name || !tournament_date) return res.status(400).json({ error: 'Tournament name and date are required.' });
  const result = await db.execute({ sql: 'INSERT INTO tournaments(name,tournament_date,deadline,venue,category,description) VALUES(?,?,?,?,?,?)', args: [name,tournament_date,deadline||null,venue||'',category||'Open',description||''] });
  res.status(201).json(await one('SELECT * FROM tournaments WHERE id=?', result.lastInsertRowid));
}));
app.delete('/api/tournaments/:id', run(async (req, res) => { await db.execute({ sql: 'DELETE FROM tournaments WHERE id=?', args: [req.params.id] }); res.status(204).end(); }));
app.get('/api/registrations', run(async (_req, res) => res.json(await all('SELECT r.id,r.created_at,p.name player,p.email,t.name tournament,t.tournament_date FROM registrations r JOIN players p ON p.id=r.player_id JOIN tournaments t ON t.id=r.tournament_id ORDER BY r.id DESC'))));
app.post('/api/registrations', run(async (req, res) => {
  const { player_id, tournament_id } = req.body;
  const player = await one('SELECT * FROM players WHERE id=?', player_id);
  if (!player || player.status !== 'Approved') return res.status(403).json({ error: 'Only approved players can register.' });
  try {
    const result = await db.execute({ sql: 'INSERT INTO registrations(player_id,tournament_id) VALUES(?,?)', args: [player_id,tournament_id] });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Registration confirmed.' });
  } catch { res.status(409).json({ error: 'This player is already registered for that tournament.' }); }
}));
app.get('/api/news', run(async (_req, res) => res.json(await all('SELECT * FROM news ORDER BY created_at DESC'))));
app.get('/api/public/players', run(async (_req, res) => res.json(await all("SELECT id,name,age,gender,weight_category,club,coach,points FROM players WHERE status='Approved' ORDER BY points DESC,name"))));
app.get('/api/public/tournaments', run(async (_req, res) => res.json(await all("SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id=t.id) registrants FROM tournaments t ORDER BY tournament_date"))));
app.get('/api/public/rankings', run(async (_req, res) => res.json(await all("SELECT p.id,p.name,p.club,p.weight_category,p.age_group,p.points FROM players p WHERE p.status='Approved' ORDER BY p.points DESC,p.name"))));
app.get('/api/public/news', run(async (_req, res) => res.json(await all('SELECT id,title,body,created_at,source_url,is_demo FROM news ORDER BY created_at DESC'))));
app.get('/api/public/meta', run(async (_req, res) => {
  const value = await one('SELECT EXISTS(SELECT 1 FROM players WHERE is_demo=1 UNION ALL SELECT 1 FROM tournaments WHERE is_demo=1 UNION ALL SELECT 1 FROM news WHERE is_demo=1) value');
  res.json({ demoContent: Number(value.value) === 1 });
}));
app.post('/api/public/apply', run(async (req, res) => {
  const { name, email, age, gender, weight_category, club, coach } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
  try {
    const result = await db.execute({ sql: 'INSERT INTO players(name,email,age,gender,weight_category,club,coach) VALUES(?,?,?,?,?,?,?)', args: [name,email,age||null,gender||'Other',weight_category||'',club||'',coach||''] });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Application received. The association will review your profile.' });
  } catch { res.status(409).json({ error: 'An application with this email already exists.' }); }
}));
app.post('/api/public/register', run(async (req, res) => {
  const { player_id, tournament_id } = req.body;
  const player = await one('SELECT id,status FROM players WHERE id=?', player_id);
  const tournament = await one('SELECT id,status,deadline FROM tournaments WHERE id=?', tournament_id);
  if (!player || player.status !== 'Approved') return res.status(403).json({ error: 'Only approved boxers can enter an event.' });
  if (!tournament || tournament.status !== 'Upcoming') return res.status(400).json({ error: 'This fixture is not accepting entries.' });
  if (tournament.deadline && tournament.deadline < new Date().toISOString().slice(0,10)) return res.status(400).json({ error: 'The entry deadline has passed.' });
  try {
    const result = await db.execute({ sql: 'INSERT INTO registrations(player_id,tournament_id) VALUES(?,?)', args: [player_id,tournament_id] });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Event entry received. Good luck in the ring.' });
  } catch { res.status(409).json({ error: 'This boxer is already entered in that event.' }); }
}));
app.get('/api/player/me', run(async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const profile = await one('SELECT p.id,p.name,p.email,p.age,p.weight_category,p.club,p.coach,p.status,p.points FROM player_accounts a JOIN players p ON p.id=a.player_id WHERE a.clerk_user_id=?', userId);
    if (!profile) return res.status(404).json({ error: 'No boxer profile is connected to this account yet.' });
    res.json(profile);
  } catch { res.status(401).json({ error: 'Please sign in to continue.' }); }
}));
app.post('/api/player/link', run(async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await clerkClient.users.getUser(userId);
    const verified = (user.emailAddresses || []).filter(item => item.verification?.status === 'verified').map(item => item.emailAddress.toLowerCase());
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!verified.includes(email)) return res.status(403).json({ error: 'Use a verified email address on your Clerk account.' });
    const player = await one('SELECT * FROM players WHERE lower(email)=? AND status=?', email, 'Approved');
    if (!player) return res.status(404).json({ error: 'No approved boxer profile matches that email.' });
    const existing = await one('SELECT clerk_user_id FROM player_accounts WHERE player_id=?', player.id);
    if (existing && existing.clerk_user_id !== userId) return res.status(409).json({ error: 'This boxer profile is already connected to another account.' });
    await db.execute({ sql: 'INSERT INTO player_accounts(clerk_user_id,player_id) VALUES(?,?) ON CONFLICT(clerk_user_id) DO UPDATE SET player_id=excluded.player_id', args: [userId, player.id] });
    res.json({ id: player.id, name: player.name, email: player.email, age: player.age, weight_category: player.weight_category, club: player.club, coach: player.coach, status: player.status, points: player.points });
  } catch { res.status(500).json({ error: 'Could not connect your boxer profile.' }); }
}));
app.post('/api/contact', run(async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Please complete all fields.' });
  await db.execute({ sql: 'INSERT INTO contact_messages(name,email,message) VALUES(?,?,?)', args: [name,email,message] });
  res.status(201).json({ message: 'Thanks - your message has been received.' });
}));
app.get('/api/contact', run(async (_req, res) => res.json(await all('SELECT * FROM contact_messages ORDER BY id DESC'))));
app.post('/api/chat', run(async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Write a question first.' });
  if (!process.env.GROQ_API_KEY) return res.json({ reply: 'The AI assistant is in demo mode. Ask the association about upcoming tournaments, player registration, approvals, or rankings. Add GROQ_API_KEY to .env to enable Groq responses.' });
  const upcoming = await all("SELECT name,tournament_date,venue,category FROM tournaments WHERE status='Upcoming' ORDER BY tournament_date LIMIT 8");
  const leaders = await all("SELECT name,club,weight_category,points FROM players WHERE status='Approved' ORDER BY points DESC,name LIMIT 5");
  const demo = await one('SELECT EXISTS(SELECT 1 FROM players WHERE is_demo=1 UNION ALL SELECT 1 FROM tournaments WHERE is_demo=1 UNION ALL SELECT 1 FROM news WHERE is_demo=1) value');
  const context = { today: new Date().toISOString().slice(0,10), upcomingFixtures: upcoming, publicRankings: leaders };
  const system = `You are the friendly BAPD Boxing Association of Palghar District assistant. Answer concisely and use the current app data below for tournament and ranking questions. Do not invent official results, schedules, fees, or contact details. If a requested detail is absent, say it is not listed and suggest contacting the association. ${Number(demo.value)===1?'The site currently contains sample preview names, points, and fixtures. Clearly say they are sample data whenever you refer to them; never present them as real or official.':''} For medical or injury questions, do not diagnose; refer the person to a qualified coach or clinician. Current public app data: ${JSON.stringify(context)}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', messages: [{ role: 'system', content: system }, { role: 'user', content: message }], temperature: 0.5 }),
  });
  const data = await response.json();
  if (!response.ok) return res.status(502).json({ error: 'The assistant is temporarily unavailable. Check the Groq API key and try again.' });
  res.json({ reply: data.choices?.[0]?.message?.content || 'I could not form a response.' });
}));

if (process.env.VERCEL !== '1') {
  const dist = path.resolve(__dirname, '../dist');
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const deployedIndex = path.resolve(process.cwd(), 'public/index.html');
  app.get('/', (_req, res) => res.sendFile(deployedIndex));
}
app.use((err, _req, res, _next) => {
  console.error('BAPD request failed:', err?.message || 'unknown error');
  if (!res.headersSent) res.status(500).json({ error: 'The request could not be completed.' });
});

export default app;
