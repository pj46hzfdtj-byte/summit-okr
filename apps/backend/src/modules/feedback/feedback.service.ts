import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface CreateFeedbackDto {
  type: string; // bug | suggestion | other
  content: string;
  contact?: string;
}

export interface Feedback {
  id: string;
  userId: string;
  type: string;
  content: string;
  contact: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateFeedbackDto): Promise<Feedback> {
    return this.prisma.feedback.create({
      data: { ...dto, userId },
    }) as unknown as Promise<Feedback>;
  }

  async listByUser(userId: string): Promise<Feedback[]> {
    return this.prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<Feedback[]>;
  }
}
