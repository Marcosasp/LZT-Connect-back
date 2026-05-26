import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
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
import { IntegrationLogService } from './integration-log.service';
import { WintourImportResponse } from './entities/wintour.entity';
import { CreateSaleByCpfDto } from './dto/create-sale-by-cpf.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateWintourImportInput } from './dto/create-wintour-import.input';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { IntegrationMetricsDto } from './dto/integration-log.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly integrationLogService: IntegrationLogService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar vendas (WintourHeaders paginados)' })
  async findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Req() request?: any,
  ) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    console.log('Query recebida no controller /sales:', {
      page,
      limit,
      startDate,
      endDate,
      status,
      search,
      sortBy,
      userId,
    });

    return this.salesService.findAll({
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 10)),
      startDate,
      endDate,
      status,
      search,
      sortBy,
      userId,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Buscar uma venda pelo ID' })
  @ApiResponse({ status: 200, description: 'Venda encontrada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post('import-wintour')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Importar dados do Wintour (vendas)' })
  @ApiResponse({ status: 201, type: WintourImportResponse })
  async importSales(
    @Body(new ValidationPipe({ transform: true, whitelist: false }))
    data: CreateWintourImportInput,
    @Req() request?: any,
  ): Promise<WintourImportResponse> {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    return this.salesService.createWintourImport(data, userId);
  }

  @Post('create-with-triage')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Criar venda com triagem de cliente (local/global)',
  })
  @ApiResponse({
    status: 201,
    description:
      'Venda criada com status PENDING e informação da origem do cliente.',
  })
  @ApiResponse({ status: 400, description: 'Dados da venda inválidos.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async createWithTriage(
    @Body(new ValidationPipe({ transform: true, whitelist: false }))
    data: CreateSaleDto | CreateSaleByCpfDto,
    @Req() request?: any,
  ) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return this.salesService.createSaleWithCustomerTriage(data as any, userId);
  }

  @Patch('webhook/wintour-status')
  @ApiOperation({ summary: 'Webhook para atualização de status via Wintour' })
  @ApiResponse({ status: 200, description: 'Status da venda atualizado.' })
  async updateWintourStatusWebhook(
    @Body()
    body: {
      saleId: string;
      newStatus: string;
      errorMessage?: string;
    },
    @Headers('x-wintour-secret') wintourSecret?: string,
  ) {
    // TODO: Implementar validação de API KEY para garantir que apenas a Lambda do Wintour chame este endpoint.
    const expectedSecret = process.env.WINTOUR_WEBHOOK_SECRET;

    if (expectedSecret && wintourSecret !== expectedSecret) {
      throw new UnauthorizedException('Webhook não autorizado.');
    }

    const { saleId, newStatus } = body;

    const updatedSale = await this.salesService.updateSaleStatusFromWintour(
      saleId,
      newStatus,
      body.errorMessage,
    );

    console.log(
      `[Wintour Webhook] Venda ${saleId} atualizada para ${newStatus}.`,
    );

    return {
      success: true,
      saleId,
      status: newStatus,
      sale: updatedSale,
    };
  }

  @Get('integration-issues')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Listar vendas com problemas de integração',
    description:
      'Retorna lista paginada de vendas com status error ou manual_pending, ' +
      'acompanhada de métricas de dashboard (contagens, média de tentativas, etc).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Lista paginada de vendas com problema + métricas de integração.',
    schema: {
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            lastPage: { type: 'number' },
          },
        },
        metrics: { $ref: '#/components/schemas/IntegrationMetricsDto' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async findIntegrationIssues(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('days') days = '',
  ) {
    const daysNum = parseInt(days, 10);
    const sinceDate =
      daysNum === 7 || daysNum === 30
        ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000)
        : undefined;

    return this.salesService.findIntegrationIssues(
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 10)),
      sinceDate,
    );
  }

  @Get('integration-metrics')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Métricas de integração para dashboard',
    description:
      'Retorna contagens e estatísticas de integração em tempo real: ' +
      'vendas com erro, aguardando intervenção manual, reprocessáveis e média de tentativas.',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas de integração.',
    type: IntegrationMetricsDto,
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async getIntegrationMetrics(): Promise<IntegrationMetricsDto> {
    return this.salesService.getIntegrationMetrics();
  }

  @Post(':id/retry-integration')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Reprocessar integração Wintour para uma venda com erro',
  })
  @ApiResponse({
    status: 200,
    description:
      'Venda reprocessada com sucesso. Retorna status atualizado da venda.',
  })
  @ApiResponse({
    status: 400,
    description: 'Venda não pode ser reprocessada neste status.',
  })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async retryIntegration(@Param('id') id: string) {
    return this.salesService.retryWintourIntegration(id);
  }

  @Get(':id/integration-logs')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Listar logs de integração de uma venda (paginado)',
    description:
      'Retorna histórico completo de tentativas de integração Wintour para a venda, ordenado do mais recente para o mais antigo.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de logs de integração.',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async getIntegrationLogs(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.integrationLogService.findBySaleIdPaginated(
      id,
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 10)),
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir uma venda pelo ID' })
  @ApiResponse({ status: 204, description: 'Venda excluída com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.salesService.remove(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Atualizar uma venda pelo ID' })
  @ApiResponse({ status: 200, description: 'Venda atualizada com sucesso.' })
  @ApiResponse({ status: 404, description: 'Venda não encontrada.' })
  @ApiResponse({ status: 401, description: 'Não autorizado.' })
  async update(@Param('id') id: string, @Body() data: UpdateSaleDto) {
    return this.salesService.update(id, data);
  }
}
