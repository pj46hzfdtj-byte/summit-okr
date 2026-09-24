import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { Memo, CreateMemoDto, UpdateMemoDto } from '@summit-okr/api-types';

@Injectable()
export class MemoService {
  constructor(private readonly prisma: PrismaService) {}

  async listByOwner(userId: string, ownerType: string, ownerId: string): Promise<Memo[]> {
    return this.prisma.memo.findMany({
      where: { userId, ownerType, ownerId },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Memo[]>;
  }

  async create(userId: string, dto: CreateMemoDto): Promise<Memo> {
    return this.prisma.memo.create({
      data: { ...dto, userId },
    }) as unknown as Promise<Memo>;
  }

  async update(id: string, userId: string, dto: UpdateMemoDto): Promise<Memo> {
    const m = await this.prisma.memo.findFirst({ where: { id, userId } });
    if (!m) throw new NotFoundException('备忘不存在');
    return this.prisma.memo.update({ where: { id }, data: dto }) as unknown as Promise<Memo>;
  }

  async delete(id: string, userId: string): Promise<void> {
    const m = await this.prisma.memo.findFirst({ where: { id, userId } });
    if (!m) throw new NotFoundException('备忘不存在');
    await this.prisma.memo.delete({ where: { id } });
  }
}
