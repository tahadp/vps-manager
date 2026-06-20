import { prisma } from './prisma';
import bcrypt from 'bcrypt';

async function main() {
  const email = process.argv[2] || 'admin@admin.com';
  const password = process.argv[3] || 'AdminPass123!';
  const username = process.argv[4] || 'admin';

  if (!email || !password) {
    console.error('Usage: npx ts-node src/create_admin.ts <email> <password> [username]');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        ...(username ? [{ username }] : [])
      ]
    }
  });

  if (existing) {
    console.log(`User "${email}" already exists. Promoting to APPROVED and ADMIN...`);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        status: 'APPROVED',
        role: 'ADMIN'
      }
    });
    console.log('User promoted successfully:', JSON.stringify({ id: updated.id, email: updated.email, role: updated.role, status: updated.status }, null, 2));
  } else {
    console.log(`Creating new admin user: ${email}...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        status: 'APPROVED',
        role: 'ADMIN'
      }
    });
    console.log('Admin user created successfully:', JSON.stringify({ id: user.id, email: user.email, role: user.role, status: user.status }, null, 2));
  }
}

main().catch(console.error);
