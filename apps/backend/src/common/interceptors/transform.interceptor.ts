import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '@summit-okr/api-types';
import { BYPASS_RESPONSE_KEY } from '../decorators/bypass-response.decorator';

/**
 * 全局响应拦截器
 * 统一成功响应格式：{ code, message, data }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // 标记了 bypass 的端点直接返回原始数据（如 Swagger 流等）
        const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_RESPONSE_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
        if (bypass) return data;

        return {
          code: 0,
          message: 'success',
          data,
        };
      }),
    );
  }
}
