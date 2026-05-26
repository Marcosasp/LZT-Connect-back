import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { Prisma } from '@prisma/client';
import {
  IntegrationLogItemDto,
  IntegrationLogPageDto,
} from './dto/integration-log.dto';

export interface CreateIntegrationLogDto {
  saleId: string;
  attempt: number;
  status: 'success' | 'error';
  payload?: unknown;
  response?: unknown;
  error?: string;
}

@Injectable()
export class IntegrationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateIntegrationLogDto) {
    return this.prisma.integrationLog.create({
      data: {
        saleId: data.saleId,
        attempt: data.attempt,
        status: data.status,
        payload:
          data.payload !== undefined
            ? (data.payload as Prisma.InputJsonValue)
            : undefined,
        response:
          data.response !== undefined
            ? (data.response as Prisma.InputJsonValue)
            : undefined,
        error: data.error ?? null,
      },
    });
  }

  async findBySaleId(saleId: string) {
    return this.prisma.integrationLog.findMany({
      where: { saleId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async findBySaleIdPaginated(
    saleId: string,
    page: number,
    limit: number,
  ): Promise<IntegrationLogPageDto> {
    const skip = (page - 1) * limit;

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.integrationLog.findMany({
        where: { saleId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          timestamp: true,
          saleId: true,
          attempt: true,
          status: true,
          error: true,
          payload: true,
          response: true,
        },
      }),
      this.prisma.integrationLog.count({ where: { saleId } }),
    ]);

    const lastPage = Math.max(1, Math.ceil(total / limit));

    return {
      data: logs as IntegrationLogItemDto[],
      meta: { total, page, limit, lastPage },
    };
  }
}
