import { SetMetadata } from '@nestjs/common';

export const BYPASS_RESPONSE_KEY = 'bypass_response';

/**
 * 标记此端点不经过 TransformInterceptor 包装，直接返回原始数据
 * 用于文件流、健康检查等特殊场景
 */
export const BypassResponse = () => SetMetadata(BYPASS_RESPONSE_KEY, true);
