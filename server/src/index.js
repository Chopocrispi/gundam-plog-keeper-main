const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use(cookieParser());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Helper: create session cookie
async function createSessionForUser(user) {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: sessionId, userId: user.id, expiresAt } });
  return { sessionId, expiresAt };
}

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'missing idToken' });
  if (!googleClient) return res.status(500).json({ error: 'server not configured with GOOGLE_CLIENT_ID' });

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ error: 'invalid token' });

    const sub = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    // Upsert user by provider/providerId
    let user = await prisma.user.findFirst({ where: { provider: 'google', providerId: sub } });
    if (!user) {
      // Try to match by email first
      if (email) {
        user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
      }
    }

    if (!user) {
      user = await prisma.user.create({ data: { userId: `google:${sub}`, displayName: name, email, provider: 'google', providerId: sub, avatarUrl: picture } });
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data: { displayName: name, email, avatarUrl: picture, provider: 'google', providerId: sub } });
    }

    const { sessionId, expiresAt } = await createSessionForUser(user);
    res.cookie('sid', sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 });
    res.json({ user: { id: user.id, userId: user.userId, displayName: user.displayName, email: user.email } });
  } catch (e) {
    console.error('google auth error', e);
    res.status(500).json({ error: 'google auth failed' });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  const sid = req.cookies.sid;
  if (sid) {
    await prisma.session.deleteMany({ where: { id: sid } }).catch(() => {});
    res.clearCookie('sid');
  }
  res.json({ ok: true });
});

// auth middleware
app.use(async (req, res, next) => {
  const sid = req.cookies.sid;
  if (!sid) { req.user = null; return next(); }
  const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } }).catch(() => null);
  if (!session) { req.user = null; return next(); }
  if (new Date(session.expiresAt) < new Date()) { req.user = null; return next(); }
  req.user = session.user;
  next();
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  res.json({ user: { id: u.id, userId: u.userId, displayName: u.displayName, email: u.email, avatarUrl: u.avatarUrl } });
});

app.get('/api/models', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not authenticated' });
  const models = await prisma.model.findMany({ where: { userId: req.user.id } });
  res.json(models);
});

app.post('/api/models', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not authenticated' });
  const data = req.body;
  const model = await prisma.model.create({ data: { ...data, userId: req.user.id } });
  res.json(model);
});

// migrate local models (array of models in body.models)
app.post('/api/migrate-local', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not authenticated' });
  const models = req.body.models || [];
  const created = [];
  for (const m of models) {
    created.push(await prisma.model.create({ data: { userId: req.user.id, name: m.name || 'Untitled', grade: m.grade || 'Other', series: m.series || '', buildStatus: m.buildStatus || 'Unbuilt', notes: m.notes || '', imageUrl: m.imageUrl || '' } }));
  }
  res.json({ created });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log('Server listening on', port));
