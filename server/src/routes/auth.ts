import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

authRouter.post('/register', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        status: 'PENDING', // Admin onayı gerekli
        role: 'USER',
      }
    });

    res.json({ message: 'Registration successful. Waiting for admin approval.', user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status !== 'APPROVED' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Account is pending approval or banned.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
    
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
