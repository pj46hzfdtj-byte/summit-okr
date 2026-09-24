const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const cols = await p.$queryRawUnsafe('PRAGMA table_info(goal_groups)');
    console.log('goal_groups:', cols.map((c) => c.name).join(','));
    const ocols = await p.$queryRawUnsafe('PRAGMA table_info(objectives)');
    console.log('objectives:', ocols.map((c) => c.name).join(','));
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    await p.$disconnect();
  }
})();
