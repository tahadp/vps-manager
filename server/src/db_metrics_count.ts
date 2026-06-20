import { prisma } from './prisma';

async function main() {
  const vpsId = '19bbae9b-7fc0-4eb6-8426-8c5f66f4f95a';
  const totalCount = await prisma.historicalMetric.count({ where: { vpsId } });
  console.log('Total metrics for VPS:', totalCount);

  const hours1 = new Date(Date.now() - 1 * 60 * 60 * 1000);
  const count1h = await prisma.historicalMetric.count({ where: { vpsId, timestamp: { gte: hours1 } } });
  console.log('Metrics in last 1 hour:', count1h);

  const latest = await prisma.historicalMetric.findMany({
    where: { vpsId },
    orderBy: { timestamp: 'desc' },
    take: 5
  });
  console.log('Latest metrics for VPS:', JSON.stringify(latest, null, 2));
}

main().catch(console.error);
