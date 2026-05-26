import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IntegrationLogItemDto {
  @ApiProperty({ example: 'clxyz123' })
  id: string;

  @ApiProperty({ example: '2026-05-18T14:30:00.000Z' })
  timestamp: Date;

  @ApiProperty({ example: 'sale-abc' })
  saleId: string;

  @ApiProperty({ example: 2 })
  attempt: number;

  @ApiProperty({ example: 'error', enum: ['success', 'error'] })
  status: string;

  @ApiPropertyOptional({ example: 'SOAP Timeout após 30s' })
  error: string | null;

  @ApiPropertyOptional({
    description: 'Payload enviado ao Wintour',
    type: 'object',
  })
  payload: unknown;

  @ApiPropertyOptional({
    description: 'Resposta recebida do Wintour',
    type: 'object',
  })
  response: unknown;
}

export class IntegrationLogMetaDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 2 })
  lastPage: number;
}

export class IntegrationLogPageDto {
  @ApiProperty({ type: [IntegrationLogItemDto] })
  data: IntegrationLogItemDto[];

  @ApiProperty({ type: IntegrationLogMetaDto })
  meta: IntegrationLogMetaDto;
}

export class IntegrationMetricsDto {
  @ApiProperty({ description: 'Vendas com status error', example: 12 })
  errorCount: number;

  @ApiProperty({
    description: 'Vendas aguardando intervenção manual',
    example: 3,
  })
  manualPendingCount: number;

  @ApiProperty({
    description: 'Total de vendas com problemas (error + manual_pending)',
    example: 15,
  })
  totalIssues: number;

  @ApiProperty({
    description:
      'Vendas com status error que ainda podem ser reprocessadas automaticamente (retryCount < maxRetries)',
    example: 8,
  })
  retryableCount: number;

  @ApiProperty({
    description: 'Média de tentativas entre as vendas com problemas',
    example: 2.4,
  })
  avgRetryCount: number;

  @ApiPropertyOptional({
    description:
      'Timestamp da integração mais antiga com problema ainda não resolvido',
    example: '2026-05-10T08:00:00.000Z',
  })
  oldestIssueAt: Date | null;
}
