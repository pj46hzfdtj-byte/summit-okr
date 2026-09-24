import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. 创建演示用户
  const passwordHash = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@summitokr.com' },
    update: {},
    create: {
      email: 'demo@summitokr.com',
      username: 'demo',
      passwordHash,
      preferredLocale: 'zh-CN',
      preferredTheme: 'light',
    },
  });
  console.log(`✅ Created user: ${user.email} (密码: password123)`);

  // 2. 创建愿景
  await prisma.vision.create({
    data: {
      userId: user.id,
      content: '成为一名独立全栈工程师，35 岁前实现职业自由',
      startAge: 30,
      endAge: 35,
    },
  });

  // 3. 创建目标节点树
  const rootGroup = await prisma.goalGroup.create({
    data: {
      userId: user.id,
      name: '2026 年度目标',
      color: '#409EFF',
      sortOrder: 0,
    },
  });

  const subGroup1 = await prisma.goalGroup.create({
    data: {
      userId: user.id,
      parentId: rootGroup.id,
      name: '技术提升',
      color: '#67C23A',
      sortOrder: 0,
    },
  });

  const subGroup2 = await prisma.goalGroup.create({
    data: {
      userId: user.id,
      parentId: rootGroup.id,
      name: '健康生活',
      color: '#F56C6C',
      sortOrder: 1,
    },
  });

  // 4. 创建一个目标（含 KR）
  const now = new Date();
  const startAt = new Date(now.getFullYear(), now.getMonth(), 1);
  const endAt = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);

  const objective = await prisma.objective.create({
    data: {
      userId: user.id,
      goalGroupId: subGroup1.id,
      title: '完成 Nest.js + Vue 全栈项目',
      color: '#409EFF',
      startAt,
      endAt,
      motivations: JSON.stringify(['为面试作品集积累项目', '掌握 Nest.js 后端架构']) as any,
      feasibilities: JSON.stringify(['每天可投入 2 小时', '已有 JS/TS 基础']) as any,
      status: 'in_progress',
    },
  });

  // 5. 为目标添加 3 个 KR
  const kr1 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      title: '完成 100 个 commit',
      initialValue: 0,
      targetValue: 100,
      calculationType: 'sum',
      weight: 40,
    },
  });

  const kr2 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      title: '代码覆盖率 80%',
      initialValue: 0,
      targetValue: 80,
      calculationType: 'final',
      weight: 30,
    },
  });

  const kr3 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      title: '完成 7 个核心模块',
      initialValue: 0,
      targetValue: 7,
      calculationType: 'sum',
      weight: 30,
    },
  });

  // 6. 给 KR1 添加几条记录
  for (let i = 1; i <= 15; i++) {
    await prisma.record.create({
      data: {
        keyResultId: kr1.id,
        value: 1,
        note: `第 ${i} 次 commit`,
        recordedAt: new Date(now.getTime() - (15 - i) * 86400000),
      },
    });
  }

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
