import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middlewares/authMiddleware';
import { validate, schemas } from '../middlewares/validation';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET as string;

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
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Account is pending approval or banned.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const expiresIn = rememberMe ? '30d' : '1d';
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { algorithm: 'HS256', expiresIn });

    // Update lastLogin on successful auth
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    }).catch((err) => console.error('lastLogin update failed:', err));

    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (error) {
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

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
