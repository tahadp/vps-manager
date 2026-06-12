import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@tahatoprak.me';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  
  const existingAdmin = await prisma.user.findFirst({
    where: { email }
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'ADMIN',
        status: 'APPROVED'
      }
    });
    console.log(`[Seed] Admin user created: ${email}`);
  } else {
    console.log(`[Seed] Admin user already exists: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
