import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { WintourImportResponse } from './entities/wintour.entity';
import { CreateWintourImportInput } from './dto/create-wintour-import.input';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vendas (WintourHeaders paginados)' })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() request?: any,
  ) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    console.log('Query recebida no controller /sales:', {
      page,
      limit,
      startDate,
      endDate,
      userId,
    });

    return this.salesService.findAll({
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 10)),
      startDate,
      endDate,
      userId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar uma venda pelo ID' })
  @ApiResponse({ status: 200, description: 'Venda encontrada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post('import-wintour')
  @ApiOperation({ summary: 'Importar dados do Wintour (vendas)' })
  @ApiResponse({ status: 201, type: WintourImportResponse })
  async importSales(
    @Body(new ValidationPipe({ transform: true, whitelist: false }))
    data: CreateWintourImportInput,
  ): Promise<WintourImportResponse> {
    return this.salesService.createWintourImport(data);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir uma venda pelo ID' })
  @ApiResponse({ status: 204, description: 'Venda excluída com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.salesService.remove(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar uma venda pelo ID' })
  @ApiResponse({ status: 200, description: 'Venda atualizada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async update(@Param('id') id: string, @Body() data: UpdateSaleDto) {
    return this.salesService.update(id, data);
  }
}
