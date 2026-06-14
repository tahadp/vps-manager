import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { validate, schemas } from '../middlewares/validation';
import { logAudit } from '../middlewares/audit';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET as string;

const ACCESS_TOKEN_TTL = '1d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_PATH = '/api/auth/refresh';

// Pre-computed bcrypt hash used to keep login response time constant when the
// user does not exist. Prevents trivial user-enumeration via timing.
const DUMMY_BCRYPT_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.7q8Q3xVjCkjF7w6I0m0e6gEa6F1q';

const isProd = process.env.NODE_ENV === 'production';

const baseCookieOptions = {
  httpOnly: true as const,
  secure: isProd,
  sameSite: 'strict' as const,
  path: '/'
};

function signToken(user: { id: string; role: string; email: string; tokenVersion: number }, rememberMe?: boolean): string {
  const expiresIn = rememberMe ? '30d' : ACCESS_TOKEN_TTL;
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, tv: user.tokenVersion },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn }
  );
}

function setAuthCookie(res: any, token: string, rememberMe: boolean) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('auth-token', token, { ...baseCookieOptions, maxAge });
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueRefreshToken(res: any, userId: string, rememberMe: boolean) {
  if (!rememberMe) return;
  const raw = crypto.randomBytes(64).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    }
  });
  res.cookie('refresh-token', raw, {
    ...baseCookieOptions,
    path: REFRESH_TOKEN_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS
  });
}

authRouter.get('/csrf-token', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return res.json({ csrfToken: null });
  }
  let token = req.cookies?.['XSRF-TOKEN'];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  res.json({ csrfToken: token });
});

authRouter.post('/register', validate(schemas.register), async (req, res) => {
  const { email, username, password } = req.body;

  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(username ? [{ username }] : [])
        ]
      }
    });
    if (existing) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        status: 'PENDING',
        role: 'USER',
      }
    });

    res.json({ message: 'Registration successful. Waiting for admin approval.', user: { id: user.id, email: user.email, username: user.username } });
  } catch (error) {
    (req as any).log?.error({ err: error }, 'Register failed with internal error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/login', validate(schemas.login), async (req, res) => {
  const { email, username, identifier, password, rememberMe } = req.body;
  const loginIdentifier = identifier || email || username;

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });
    if (!user) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Account is pending approval or banned.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAudit({ userId: user.id, action: 'LOGIN_FAIL', target: user.id });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user, !!rememberMe);
    setAuthCookie(res, token, !!rememberMe);
    await issueRefreshToken(res, user.id, !!rememberMe);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    }).catch((err) => console.error('lastLogin update failed:', err));

    await logAudit({ userId: user.id, action: 'LOGIN_OK', target: user.id });

    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (error) {
    (req as any).log?.error({ err: error }, 'Login failed with internal error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const raw = req.cookies?.['refresh-token'];
    if (!raw) return res.status(401).json({ error: 'No refresh token' });

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(raw) },
      include: { user: true }
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const rememberMe = stored.expiresAt.getTime() - Date.now() > 25 * 24 * 60 * 60 * 1000;

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });

    const newRaw = crypto.randomBytes(64).toString('hex');
    await prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
      }
    });
    res.cookie('refresh-token', newRaw, {
      ...baseCookieOptions,
      path: REFRESH_TOKEN_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS
    });

    const accessToken = signToken(stored.user, rememberMe);
    setAuthCookie(res, accessToken, rememberMe);
    res.json({ success: true });
  } catch (error) {
    (req as any).log?.error({ err: error }, 'Token refresh failed with internal error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('auth-token', { path: '/' });
  res.clearCookie('XSRF-TOKEN', { path: '/' });
  res.clearCookie('refresh-token', { path: REFRESH_TOKEN_PATH });
  res.json({ success: true });
});

authRouter.post('/logout-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } }
      })
    ]);
    await logAudit({ userId, action: 'LOGOUT_ALL', target: userId });
    res.clearCookie('auth-token', { path: '/' });
    res.clearCookie('XSRF-TOKEN', { path: '/' });
    res.clearCookie('refresh-token', { path: REFRESH_TOKEN_PATH });
    res.json({ success: true });
  } catch (error) {
    (req as any).log?.error({ err: error }, 'Logout all failed with internal error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/change-password', requireAuth, validate(schemas.changePassword), async (req: AuthRequest, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid old password' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 }
      }
    });

    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    const token = signToken(updated);
    setAuthCookie(res, token, false);

    await logAudit({ userId, action: 'PASSWORD_CHANGE', target: userId });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    (req as any).log?.error({ err: error }, 'Password change failed with internal error');
    res.status(500).json({ error: 'Internal server error' });
  }
});
