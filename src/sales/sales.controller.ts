import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { WintourImportResponse } from './entities/wintour.entity';
import { CreateWintourImportInput } from './dto/create-wintour-import.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('import-wintour')
  @ApiOperation({ summary: 'Importar dados do Wintour (vendas)' })
  @ApiResponse({ status: 201, type: WintourImportResponse })
  async importSales(
    @Body() data: CreateWintourImportInput,
  ): Promise<WintourImportResponse> {
    return this.salesService.createWintourImport(data);
  }
}
