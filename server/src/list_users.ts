import { prisma } from './prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      status: true,
      tier: true,
      createdAt: true,
      lastLogin: true,
      tokenVersion: true
    }
  });
  console.log('Registered Users:', JSON.stringify(users, null, 2));
}

main().catch(console.error);
