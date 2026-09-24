import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiResponse } from '@summit-okr/api-types';

/**
 * 全局异常过滤器
 * 统一处理 HTTP 异常、Prisma 异常、未知异常的响应格式
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let code: number;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status;
      const resp = exception.getResponse();
      message =
        typeof resp === 'string'
          ? resp
          : (resp as any).message || exception.message;
      if (Array.isArray(message)) message = message[0];
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapping: Record<string, { status: number; message: string }> = {
        P2002: {
          status: HttpStatus.CONFLICT,
          message: '数据已存在（唯一约束冲突）',
        },
        P2025: {
          status: HttpStatus.NOT_FOUND,
          message: '记录不存在',
        },
        P2003: {
          status: HttpStatus.BAD_REQUEST,
          message: '存在外键依赖，无法删除',
        },
      };
      const m = mapping[exception.code] || {
        status: HttpStatus.BAD_REQUEST,
        message: `数据库错误: ${exception.code}`,
      };
      status = m.status;
      code = m.status;
      message = m.message;
      this.logger.error(
        `Prisma ${exception.code} meta: ${JSON.stringify(exception.meta)}`,
      );
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = HttpStatus.BAD_REQUEST;
      message = '数据校验失败';
      this.logger.error(exception.message);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = HttpStatus.INTERNAL_SERVER_ERROR;
      message = '服务器内部错误';
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.stack : JSON.stringify(exception)}`,
      );
    }

    const body: ApiResponse<null> = { code, message, data: null };

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status} ${message}`);
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} ${message}`);
    }

    response.status(status).json(body);
  }
}
