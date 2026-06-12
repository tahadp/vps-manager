const express = require('express');
const { vpsRouter } = require('./src/routes/vps');
const app = express();
app.use(express.json());

// mock auth
app.use((req, res, next) => {
  req.user = { id: 'test-user', role: 'ADMIN' };
  next();
});

app.use('/api/vps', vpsRouter);

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Server started on port ${port}`);
  
  // Create a real user in DB so foreign key constraint doesn't fail
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
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
  
  // Make test request
  const fetch = require('node-fetch');
  const res = await fetch(`http://localhost:${port}/api/vps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test',
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
