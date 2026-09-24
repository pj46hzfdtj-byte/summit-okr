import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { DataExportService } from './data-export.service';

@ApiTags('数据管理 Data')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('data')
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  @Get('export')
  @ApiOperation({ summary: '导出全量数据为 JSON' })
  async exportData(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const data = await this.service.exportAll(user.sub);
    const filename = `summit-okr-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  @Post('import')
  @ApiOperation({ summary: '导入 JSON 数据' })
  @ApiQuery({ name: 'conflict', enum: ['skip', 'overwrite'], required: false })
  async importData(
    @CurrentUser() user: JwtPayload,
    @Body() data: any,
    @Query('conflict') conflict: 'skip' | 'overwrite' = 'skip',
  ) {
    return this.service.importAll(user.sub, data, conflict);
  }
}
