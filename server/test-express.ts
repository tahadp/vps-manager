import express from 'express';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'testsecret';

import { vpsRouter } from './src/routes/vps';
import { prisma } from './src/prisma';

const app = express();
app.use(express.json());

app.use('/api/vps', vpsRouter);

const server = app.listen(0, async () => {
  const port = (server.address() as any).port;
  console.log(`Server started on port ${port}`);
  
  let user = await prisma.user.findFirst();
  if (!user) {
      user = await prisma.user.create({
          data: {
              email: "test@example.com",
              password: "pwd",
              role: "ADMIN"
          }
      });
  }
  const token = jwt.sign({ id: user.id, role: 'ADMIN', email: user.email }, process.env.JWT_SECRET as string);
  
  const res = await fetch(`http://localhost:${port}/api/vps`, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'Test Express',
      os: 'Windows Server 2022',
      userId: user.id
    })
  });
  
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
  
  server.close();
  await prisma.$disconnect();
});
