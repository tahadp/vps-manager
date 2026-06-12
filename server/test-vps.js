const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "test@example.com",
          password: "password123",
          role: "ADMIN"
        }
      });
    }
    const osEnum = "Windows Server 2022".toUpperCase().includes('WINDOW') ? 'WINDOWS' : 'LINUX';
    const createData = { name: "Test VPS", ipAddress: "Pending", os: osEnum, userId: user.id };
    
    console.log("Creating with:", createData);
    const newVps = await prisma.vps.create({ data: createData });
    console.log("Success:", newVps);
    
    await prisma.vps.delete({ where: { id: newVps.id } });
  } catch (err) {
    console.error("Prisma Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
