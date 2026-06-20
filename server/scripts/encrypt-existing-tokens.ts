import { prisma } from '../src/prisma';
import { encryptSecret, decryptSecret } from '../src/crypto';
import { logger } from '../src/logger';
import { config } from 'dotenv';
config();

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY required');
    process.exit(1);
  }
  const users = await prisma.user.findMany({ where: { telegramBotToken: { not: null } } });
  let encrypted = 0, skipped = 0;
  for (const u of users) {
    if (!u.telegramBotToken) continue;
    // decryptSecret returns plain text if not encrypted, ciphertext if encrypted
    const plain = decryptSecret(u.telegramBotToken);
    if (plain === u.telegramBotToken) {
      // was plain text, now encrypt
      await prisma.user.update({ where: { id: u.id }, data: { telegramBotToken: encryptSecret(plain) } });
      encrypted++;
    } else {
      skipped++;
    }
  }
  logger.info({ encrypted, skipped, total: users.length }, 'Telegram token backfill complete');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
