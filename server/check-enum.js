const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  try {
    const result = await p.$queryRawUnsafe(`SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OsType')`);
    console.log('OsType enum values:', result);
  } catch(e) {
    console.log('Error:', e.message);
    // Try creating the enum
    try {
      await p.$executeRawUnsafe(`CREATE TYPE "OsType" AS ENUM ('LINUX', 'WINDOWS')`);
      console.log('OsType enum created');
    } catch(e2) {
      console.log('Enum create result:', e2.message);
    }
  } finally {
    await p.$disconnect();
  }
}

run();
