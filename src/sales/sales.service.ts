import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'nestjs-prisma';
import { IntegrationStatus, Prisma, TravelType } from '@prisma/client';
import {
  CreateWintourImportInput,
  WintourCustomerInput,
} from './dto/create-wintour-import.input';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Customer } from '../customers/entities/customer.entity';
import { WintourSoapService } from './wintour-soap.service';
import { IntegrationLogService } from './integration-log.service';
import { IntegrationMetricsDto } from './dto/integration-log.dto';

/** Cooldown mínimo entre tentativas de retry (2 minutos em ms). */
const RETRY_COOLDOWN_MS = 2 * 60 * 1000;

/** Backoff exponencial base em ms (base: 5 minutos × 2^attempt). */
const RETRY_BACKOFF_BASE_MS = 5 * 60 * 1000;

/** Limite máximo do backoff para evitar janelas muito longas (4 horas). */
const RETRY_BACKOFF_MAX_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  /** Impede execuções sobrepostas do cron de retry (re-entrancy guard). */
  private isCronRunning = false;

  constructor(
    private prisma: PrismaService,
    private readonly wintourSoapService: WintourSoapService,
    private readonly configService: ConfigService,
    private readonly integrationLogService: IntegrationLogService,
  ) {}

  private getIntegrationConfig() {
    const pin = process.env.WINTOUR_SOAP_PIN ?? 'xDIy1d9lSlTQZy7z7MP9zBKcAQ';
    const livre = process.env.WINTOUR_SOAP_LIVRE ?? '';

    if (!pin) {
      throw new ServiceUnavailableException(
        'Integracao Wintour nao configurada. Defina a variavel WINTOUR_SOAP_PIN.',
      );
    }

    return {
      pin,
      livre,
    };
  }

  private escapeXml(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return '';
    }

    return String(value)
      .replace(/&/g, '&#38;')
      .replace(/</g, '&#60;')
      .replace(/>/g, '&#62;')
      .replace(/"/g, '&#34;')
      .replace(/'/g, '&#39;')
      .replace(/[^\x20-\x7E]/g, (character) => `&#${character.charCodeAt(0)};`);
  }

  private formatDate(value?: Date | string | null) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      return value;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const day = `${parsed.getDate()}`.padStart(2, '0');
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  private formatTime(value?: Date | string | null) {
    if (!value) {
      return '';
    }

    if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) {
      return value;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const hours = `${parsed.getHours()}`.padStart(2, '0');
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private parseDate(value?: Date | string | null): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
      // Handle DD/MM/YYYY
      const dmvMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (dmvMatch) {
        const [, day, month, year] = dmvMatch;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }

      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private resolveSaleDateFromServices(
    servicesDetailsInput?: Record<string, unknown>,
  ): Date | null {
    const providedServicesDetails = this.isPlainObject(servicesDetailsInput)
      ? servicesDetailsInput
      : {};
    const providedTravel = this.isPlainObject(providedServicesDetails.travel)
      ? (providedServicesDetails.travel as Record<string, unknown>)
      : {};
    const providedDetails = this.isPlainObject(providedServicesDetails.details)
      ? (providedServicesDetails.details as Record<string, unknown>)
      : {};

    const travelSaleDate =
      typeof providedTravel.saleDate === 'string'
        ? providedTravel.saleDate
        : null;
    const detailsSaleDate =
      typeof providedDetails.saleDate === 'string'
        ? providedDetails.saleDate
        : null;

    return this.parseDate(travelSaleDate ?? detailsSaleDate);
  }

  private parseDateBoundary(
    value: string | undefined,
    boundary: 'start' | 'end',
  ): Date | undefined {
    if (!value) {
      return undefined;
    }

    const plainDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (plainDateMatch) {
      const [yearText, monthText, dayText] = plainDateMatch.slice(1);
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);

      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return undefined;
      }

      if (boundary === 'start') {
        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      }

      return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeStatusFilter(status?: string) {
    const normalized = String(status ?? '')
      .trim()
      .toLowerCase();

    if (
      normalized === 'approved' ||
      normalized === 'pending' ||
      normalized === 'canceled'
    ) {
      return normalized;
    }

    return undefined;
  }

  private normalizeSearchTerm(search?: string) {
    const normalized = String(search ?? '')
      .trim()
      .toLowerCase();
    return normalized || undefined;
  }

  private normalizeSortOption(sortBy?: string) {
    const normalized = String(sortBy ?? '')
      .trim()
      .toLowerCase();

    if (normalized.includes('recente')) return 'recentes';
    if (normalized.includes('antigo')) return 'antigos';
    if (normalized.includes('a-z') || normalized === 'az') return 'az';
    if (normalized.includes('z-a') || normalized === 'za') return 'za';

    return 'recentes';
  }

  private getSaleStatusGroupFromServicesData(
    servicesData: Prisma.JsonValue | null,
  ): 'approved' | 'pending' | 'canceled' {
    const data = (servicesData as Record<string, unknown> | null) ?? {};
    const rawStatus =
      typeof data.status === 'string' ? data.status.trim().toUpperCase() : '';

    if (
      rawStatus === 'APPROVED' ||
      rawStatus === 'EM_CHECKIN' ||
      rawStatus === 'EM CHECK-IN'
    ) {
      return 'approved';
    }

    if (
      rawStatus === 'CANCELED' ||
      rawStatus === 'CANCELLED' ||
      rawStatus === 'CANCELADA'
    ) {
      return 'canceled';
    }

    return 'pending';
  }

  private async getSaleIdsByHeaderId(
    headerId: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const sales = await tx.sale.findMany({
      select: {
        id: true,
        servicesData: true,
      },
    });

    return sales
      .filter((sale) => {
        const saleData =
          (sale.servicesData as Record<string, any> | null) ?? {};
        const details =
          (saleData.details as Record<string, any> | undefined) ?? {};
        return details.wintourHeaderId === headerId;
      })
      .map((sale) => sale.id);
  }

  private async getSalesByHeaderId(
    headerId: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<Array<{ id: string; retryCount: number }>> {
    const sales = await tx.sale.findMany({
      select: {
        id: true,
        retryCount: true,
        servicesData: true,
      },
    });

    return sales
      .filter((sale) => {
        const saleData =
          (sale.servicesData as Record<string, any> | null) ?? {};
        const details =
          (saleData.details as Record<string, any> | undefined) ?? {};
        return details.wintourHeaderId === headerId;
      })
      .map((sale) => ({
        id: sale.id,
        retryCount: sale.retryCount,
      }));
  }

  private resolveIntegrationFailureStatus(
    retryCount: number,
  ): IntegrationStatus {
    return retryCount >= 5
      ? IntegrationStatus.manual_pending
      : IntegrationStatus.error;
  }

  /**
   * Calcula o próximo instante permitido para retry com backoff exponencial.
   * attempt=1 → +5min, attempt=2 → +10min, attempt=3 → +20min … cap 4h.
   */
  private calcNextRetryAt(attemptNumber: number): Date {
    const backoffMs = Math.min(
      RETRY_BACKOFF_BASE_MS * Math.pow(2, attemptNumber - 1),
      RETRY_BACKOFF_MAX_MS,
    );
    return new Date(Date.now() + backoffMs);
  }

  private normalizeIntegrationStatus(
    value?: string | null,
  ): IntegrationStatus | null {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();

    if (normalized === IntegrationStatus.pending) {
      return IntegrationStatus.pending;
    }

    if (normalized === IntegrationStatus.processing) {
      return IntegrationStatus.processing;
    }

    if (normalized === IntegrationStatus.success) {
      return IntegrationStatus.success;
    }

    if (normalized === IntegrationStatus.error) {
      return IntegrationStatus.error;
    }

    if (normalized === IntegrationStatus.manual_pending) {
      return IntegrationStatus.manual_pending;
    }

    return null;
  }

  private async markSalesAsProcessing(
    headerId: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const sales = await this.getSalesByHeaderId(headerId, tx);

    if (!sales.length) {
      return;
    }

    await tx.sale.updateMany({
      where: {
        id: {
          in: sales.map((sale) => sale.id),
        },
      },
      data: {
        integrationStatus: IntegrationStatus.processing,
        lastIntegrationAt: new Date(),
      },
    });
  }

  private async markSalesAsSuccess(
    headerId: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const sales = await this.getSalesByHeaderId(headerId, tx);

    if (!sales.length) {
      return;
    }

    await tx.sale.updateMany({
      where: {
        id: {
          in: sales.map((sale) => sale.id),
        },
      },
      data: {
        integrationStatus: IntegrationStatus.success,
        retryCount: 0,
        lastErrorMessage: null,
        lastIntegrationAt: new Date(),
        nextRetryAt: null,
      },
    });
  }

  private async markSalesAsFailure(
    headerId: string,
    errorMessage: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const sales = await this.getSalesByHeaderId(headerId, tx);

    if (!sales.length) {
      return;
    }

    await Promise.all(
      sales.map(async (sale) => {
        const retryCount = sale.retryCount + 1;
        const nextRetryAt = this.calcNextRetryAt(retryCount);

        await tx.sale.update({
          where: {
            id: sale.id,
          },
          data: {
            integrationStatus: this.resolveIntegrationFailureStatus(retryCount),
            retryCount,
            lastErrorMessage: errorMessage,
            lastIntegrationAt: new Date(),
            nextRetryAt,
          },
        });
      }),
    );
  }

  private async getSaleIdsByFileNumber(
    nrArquivo: string,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    const sales = await tx.sale.findMany({
      select: {
        id: true,
        servicesData: true,
      },
    });

    return sales
      .filter((sale) => {
        const saleData =
          (sale.servicesData as Record<string, any> | null) ?? {};
        const details =
          (saleData.details as Record<string, any> | undefined) ?? {};
        return details.nr_arquivo === nrArquivo;
      })
      .map((sale) => sale.id);
  }

  private mapTravelType(value?: string | null): TravelType | undefined {
    if (!value) {
      return undefined;
    }

    if (
      value === 'ONE_WAY' ||
      value === 'ROUND_TRIP' ||
      value === 'MULTI_CITY'
    ) {
      return value;
    }

    if (value === 'Somente ida') return TravelType.ONE_WAY;
    if (value === 'Ida e volta') return TravelType.ROUND_TRIP;
    if (value === 'Multi-destino') return TravelType.MULTI_CITY;

    return undefined;
  }

  private tag(name: string, value?: unknown) {
    return `<${name}>${this.escapeXml(value)}</${name}>`;
  }

  private wrapItems<T>(
    container: string,
    items: T[] | undefined,
    buildItem: (item: T) => string,
  ) {
    if (!items?.length) {
      return '';
    }

    return `<${container}>${items.map(buildItem).join('')}</${container}>`;
  }

  private buildTicketXml(ticket: CreateWintourImportInput['tickets'][number]) {
    return `
      <bilhete>
        ${this.tag('idv_externo', ticket.idv_externo)}
        ${this.tag('id_posto_atendimento', ticket.id_posto_atendimento)}
        ${this.tag('posto_atendimento', ticket.posto_atendimento)}
        ${this.tag(
          'dt_interna_cadastro',
          this.formatDate(ticket.dt_interna_cadastro),
        )}
        ${this.tag('data_lancamento', this.formatDate(ticket.data_lancamento))}
        ${this.tag('codigo_produto', ticket.codigo_produto)}
        ${this.tag('fornecedor', ticket.fornecedor)}
        ${this.tag('prestador_svc', ticket.prestador_svc)}
        ${this.tag('num_bilhete', ticket.num_bilhete)}
        ${this.tag('localizador', ticket.localizador)}
        ${this.tag('tour_code', ticket.tour_code)}
        ${this.tag('forma_de_pagamento', ticket.forma_de_pagamento)}
        ${this.tag('cartao_mp', ticket.cartao_mp)}
        ${this.tag('cartao_cp', ticket.cartao_cp)}
        ${this.tag('conta_taxas_adicionais', ticket.conta_taxas_adicionais)}
        ${this.tag('conta_taxas_adicionais2', ticket.conta_taxas_adicionais2)}
        ${this.tag('cod_outras_txs', ticket.cod_outras_txs)}
        ${this.tag('cod_outras_txs2', ticket.cod_outras_txs2)}
        ${this.tag('cod_outras_txs3', ticket.cod_outras_txs3)}
        ${this.tag('cta_tx_emissao', ticket.cta_tx_emissao)}
        ${this.tag('ccustos_agencia', ticket.ccustos_agencia)}
        ${this.tag('moeda', ticket.moeda)}
        ${this.tag('emissor', ticket.emissor)}
        ${this.tag('promotor', ticket.promotor)}
        ${this.tag('gerente', ticket.gerente)}
        ${this.tag('cliente', ticket.cliente)}
        ${this.tag('ccustos_cliente', ticket.ccustos_cliente)}
        ${this.tag('numero_requisicao', ticket.numero_requisicao)}
        ${this.tag('data_requisicao', this.formatDate(ticket.data_requisicao))}
        ${this.tag('passageiro', ticket.passageiro)}
        ${this.tag('tipo_passageiro', ticket.tipo_passageiro)}
        ${this.tag('solicitante', ticket.solicitante)}
        ${this.tag('aprovador', ticket.aprovador)}
        ${this.tag('departamento', ticket.departamento)}
        ${this.tag('projeto', ticket.projeto)}
        ${this.tag('motivo_viagem', ticket.motivo_viagem)}
        ${this.tag('motivo_recusa', ticket.motivo_recusa)}
        ${this.tag('matricula', ticket.matricula)}
        ${this.tag('num_cc', ticket.num_cc)}
        ${this.tag('cod_autorizacao_cc', ticket.cod_autorizacao_cc)}
        ${this.tag('tipo_domest_inter', ticket.tipo_domest_inter)}
        ${this.tag('scdp', ticket.scdp)}
        ${this.tag('canal_captacao', ticket.canal_captacao)}
        ${this.tag('cta_du_rav', ticket.cta_du_rav)}
        ${this.tag('situacao_contabil', ticket.situacao_contabil)}
        ${this.tag('tipo_roteiro_aereo', ticket.tipo_roteiro_aereo)}
        ${this.tag('destino_rot_aereo', ticket.destino_rot_aereo)}
        ${this.tag('canal_venda', ticket.canal_venda)}
        ${this.tag('multi_ccustos_cli', ticket.multi_ccustos_cli)}
        ${this.wrapItems(
          'rateio_ccustos_cli',
          ticket.apportionments,
          (item) =>
            `<item>${this.tag(
              'ccustos_cliente',
              item.ccustos_cliente,
            )}${this.tag('percentual', item.percentual)}</item>`,
        )}
        ${this.tag('tipo_roteiro', ticket.tipo_roteiro)}
        ${this.tag('tarifa_net', ticket.tarifa_net)}
        ${this.tag('cid_dest_principal', ticket.cid_dest_principal)}
        ${this.tag('tipo_emissao', ticket.tipo_emissao)}
        ${this.tag('co2_kg', ticket.co2_kg)}
        ${this.wrapItems('vendas_originais', ticket.sales_origin, (item) =>
          this.tag('item', item.item),
        )}
        ${this.wrapItems(
          'bilhetes_conjugados',
          ticket.ticket_conjugate,
          (item) => this.tag('item', item.item),
        )}
        ${this.wrapItems(
          'valores',
          ticket.values,
          (item) =>
            `<item>${this.tag('codigo', item.codigo)}${this.tag(
              'valor',
              item.valor,
            )}${this.tag('valor_df', item.valor_df)}${this.tag(
              'valor_mp',
              item.valor_mp,
            )}</item>`,
        )}
        ${this.wrapItems(
          'vencimentos',
          ticket.expiry,
          (item) =>
            `<item>${this.tag('codigo', item.codigo)}${this.tag(
              'valor',
              this.formatDate(item.valor),
            )}</item>`,
        )}
        <roteiro>
          ${
            ticket.sections?.length
              ? `<aereo>${ticket.sections
                  .map(
                    (section) => `
              <trecho>
                ${this.tag('cia_iata', section.cia_iata)}
                ${this.tag('numero_voo', section.numero_voo)}
                ${this.tag('aeroporto_origem', section.aeroporto_origem)}
                ${this.tag('aeroporto_destino', section.aeroporto_destino)}
                ${this.tag(
                  'data_partida',
                  this.formatDate(section.data_partida),
                )}
                ${this.tag(
                  'hora_partida',
                  this.formatTime(section.hora_partida),
                )}
                ${this.tag(
                  'data_chegada',
                  this.formatDate(section.data_chegada),
                )}
                ${this.tag(
                  'hora_chegada',
                  this.formatTime(section.hora_chegada),
                )}
                ${this.tag('classe', section.classe)}
                ${this.tag('base_tarifaria', section.base_tarifaria)}
                ${this.tag('ticket_designator', section.ticket_designator)}
                ${this.tag('conexao_arp_partida', section.conexao_arp_partida)}
                ${this.tag('conexao_arp_chegada', section.conexao_arp_chegada)}
                ${this.tag('co2_kg', section.co2_kg)}
              </trecho>`,
                  )
                  .join('')}</aereo>`
              : ''
          }
          ${
            ticket.hotel
              ? `<hotel>
                ${this.tag('nr_apts', ticket.hotel.nr_apts)}
                ${this.tag('categ_apt', ticket.hotel.categ_apt)}
                ${this.tag('tipo_apt', ticket.hotel.tipo_apt)}
                ${this.tag(
                  'dt_check_in',
                  this.formatDate(ticket.hotel.dt_check_in),
                )}
                ${this.tag(
                  'dt_check_out',
                  this.formatDate(ticket.hotel.dt_check_out),
                )}
                ${this.tag('nr_hospedes', ticket.hotel.nr_hospedes)}
                ${this.tag('reg_alimentacao', ticket.hotel.reg_alimentacao)}
                ${this.tag('cod_tipo_pagto', ticket.hotel.cod_tipo_pagto)}
                ${this.tag(
                  'dt_confirmacao',
                  this.formatDate(ticket.hotel.dt_confirmacao),
                )}
                ${this.tag('confirmado_por', ticket.hotel.confirmado_por)}
              </hotel>`
              : ''
          }
          ${
            ticket.location
              ? `<locacao>
                ${this.tag('cidade_retirada', ticket.location.cidade_retirada)}
                ${this.tag('local_retirada', ticket.location.local_retirada)}
                ${this.tag(
                  'dt_retirada',
                  this.formatDate(ticket.location.dt_retirada),
                )}
                ${this.tag(
                  'hr_retirada',
                  this.formatTime(ticket.location.hr_retirada),
                )}
                ${this.tag('local_devolucao', ticket.location.local_devolucao)}
                ${this.tag(
                  'dt_devolucao',
                  this.formatDate(ticket.location.dt_devolucao),
                )}
                ${this.tag(
                  'hr_devolucao',
                  this.formatTime(ticket.location.hr_devolucao),
                )}
                ${this.tag('categ_veiculo', ticket.location.categ_veiculo)}
                ${this.tag('cod_tipo_pagto', ticket.location.cod_tipo_pagto)}
                ${this.tag(
                  'dt_confirmacao',
                  this.formatDate(ticket.location.dt_confirmacao),
                )}
                ${this.tag('confirmado_por', ticket.location.confirmado_por)}
              </locacao>`
              : ''
          }
          ${
            ticket.other
              ? `<outros><roteiro_texto>${this.tag(
                  'descricao',
                  ticket.other.descricao,
                )}</roteiro_texto></outros>`
              : ''
          }
          ${
            ticket.transfer
              ? `<transfer>
                <transfer_in>
                  ${this.tag(
                    'hotel_transfer_in',
                    ticket.transfer.hotel_transfer_in,
                  )}
                  ${this.tag(
                    'cia_iata_chegada',
                    ticket.transfer.cia_iata_chegada,
                  )}
                  ${this.tag(
                    'numero_voo_chegada',
                    ticket.transfer.numero_voo_chegada,
                  )}
                  ${this.tag(
                    'data_chegada_voo',
                    this.formatDate(ticket.transfer.data_chegada_voo),
                  )}
                  ${this.tag(
                    'hora_chegada_voo',
                    this.formatTime(ticket.transfer.hora_chegada_voo),
                  )}
                  ${this.tag(
                    'aeroporto_chegada',
                    ticket.transfer.aeroporto_chegada,
                  )}
                </transfer_in>
                <transfer_out>
                  ${this.tag(
                    'hotel_transfer_out',
                    ticket.transfer.hotel_transfer_out,
                  )}
                  ${this.tag(
                    'data_apanhar_pax',
                    this.formatDate(ticket.transfer.data_apanhar_pax),
                  )}
                  ${this.tag(
                    'hora_apanhar_pax',
                    this.formatTime(ticket.transfer.hora_apanhar_pax),
                  )}
                  ${this.tag(
                    'cia_iata_partida',
                    ticket.transfer.cia_iata_partida,
                  )}
                  ${this.tag(
                    'numero_voo_partida',
                    ticket.transfer.numero_voo_partida,
                  )}
                  ${this.tag(
                    'data_partida_voo',
                    this.formatDate(ticket.transfer.data_partida_voo),
                  )}
                  ${this.tag(
                    'hora_partida_voo',
                    this.formatTime(ticket.transfer.hora_partida_voo),
                  )}
                  ${this.tag(
                    'aeroporto_partida',
                    ticket.transfer.aeroporto_partida,
                  )}
                </transfer_out>
              </transfer>`
              : ''
          }
          ${
            ticket.package
              ? `<pacote>
                ${this.tag(
                  'cid_dest_principal',
                  ticket.package.cid_dest_principal,
                )}
                ${this.tag(
                  'data_inicio_pacote',
                  this.formatDate(ticket.package.data_inicio_pacote),
                )}
                ${this.tag(
                  'data_fim_pacote',
                  this.formatDate(ticket.package.data_fim_pacote),
                )}
                ${this.tag('descricao_pacote', ticket.package.descricao_pacote)}
              </pacote>`
              : ''
          }
          ${
            ticket.other_services
              ? `<outros_servicos>
                ${this.tag(
                  'cid_dest_principal',
                  ticket.other_services.cid_dest_principal,
                )}
                ${this.tag(
                  'data_inicio_outros_svcs',
                  this.formatDate(
                    ticket.other_services.data_inicio_outros_svcs,
                  ),
                )}
                ${this.tag(
                  'data_fim_outros_svcs',
                  this.formatDate(ticket.other_services.data_fim_outros_svcs),
                )}
                ${this.tag(
                  'descricao_outros_svcs',
                  ticket.other_services.descricao_outros_svcs,
                )}
              </outros_servicos>`
              : ''
          }
        </roteiro>
        ${this.tag('info_adicionais', ticket.info_adicionais)}
        ${this.tag('info_internas', ticket.info_internas)}
        ${
          ticket.customer
            ? `<dados_cliente>
              ${this.tag('acao_cli', ticket.customer.acao_cli)}
              ${this.tag('razao_social', ticket.customer.razao_social)}
              ${this.tag('tipo_endereco', ticket.customer.tipo_endereco)}
              ${this.tag('endereco', ticket.customer.endereco)}
              ${this.tag('numero', ticket.customer.numero)}
              ${this.tag('complemento', ticket.customer.complemento)}
              ${this.tag('bairro', ticket.customer.bairro)}
              ${this.tag('cep', ticket.customer.cep)}
              ${this.tag('cidade', ticket.customer.cidade)}
              ${this.tag('estado', ticket.customer.estado)}
              ${this.tag('tipo_fj', ticket.customer.tipo_fj)}
              ${this.tag('dt_nasc', this.formatDate(ticket.customer.dt_nasc))}
              ${this.tag('tel', ticket.customer.tel)}
              ${this.tag('celular', ticket.customer.celular)}
              ${this.tag('cpf_cnpj', ticket.customer.cpf_cnpj)}
              ${this.tag('insc_identidade', ticket.customer.insc_identidade)}
              ${this.tag('sexo', ticket.customer.sexo)}
              ${this.tag(
                'dt_cadastro',
                this.formatDate(ticket.customer.dt_cadastro),
              )}
              ${this.tag('email', ticket.customer.email)}
            </dados_cliente>`
            : ''
        }
      </bilhete>
    `;
  }

  private buildWintourXml(data: CreateWintourImportInput) {
    return `<?xml version="1.0" encoding="iso-8859-1"?>
<bilhetes>
  ${this.tag('nr_arquivo', data.nr_arquivo)}
  ${this.tag('data_geracao', data.data_geracao)}
  ${this.tag('hora_geracao', data.hora_geracao)}
  ${this.tag('nome_agencia', data.nome_agencia)}
  ${this.tag('versao_xml', data.versao_xml)}
  ${data.tickets.map((ticket) => this.buildTicketXml(ticket)).join('')}
</bilhetes>`;
  }

  private isIntegrationErrorMessage(value?: string) {
    if (!value) {
      return false;
    }

    const normalized = value.toUpperCase();
    return (
      normalized.includes('#ERRO#') ||
      normalized.includes('PIN INVALIDO') ||
      normalized.includes('PIN INVÁLIDO')
    );
  }

  private async sendToWintour(
    data: CreateWintourImportInput,
    context?: { headerId?: string },
  ) {
    const config = this.getIntegrationConfig();
    const xml = this.buildWintourXml(data);

    const arquivoBase64 = Buffer.from(xml, 'latin1').toString('base64');

    if (context?.headerId) {
      await this.markSalesAsProcessing(context.headerId);
    }

    try {
      const { rawResponse, resultValue } =
        await this.wintourSoapService.importarArquivo2({
          aPin: config.pin,
          aArquivo: arquivoBase64,
          aLivre: config.livre,
        });

      if (this.isIntegrationErrorMessage(resultValue)) {
        const error = new BadGatewayException({
          message: `Falha na integracao Wintour: ${
            resultValue || 'retorno invalido do servico SOAP'
          }`,
          raw_response: rawResponse,
          status_code: 502,
        });

        throw error;
      }

      if (context?.headerId) {
        await this.markSalesAsSuccess(context.headerId);
      }

      return {
        protocolo: resultValue,
        raw_response: rawResponse,
        xml_enviado: xml,
      };
    } catch (error) {
      if (context?.headerId) {
        const errorMessage =
          error instanceof BadGatewayException
            ? (() => {
                const response = error.getResponse();
                return typeof response === 'string'
                  ? response
                  : response
                  ? JSON.stringify(response)
                  : error.message;
              })()
            : error instanceof Error
            ? error.message
            : String(error);

        await this.markSalesAsFailure(context.headerId, errorMessage);
      }

      throw error;
    }
  }

  private async getLinkedCustomers(
    tickets: CreateWintourImportInput['tickets'],
  ) {
    const customerIds = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.customer_id)
          .filter((customerId): customerId is string => Boolean(customerId)),
      ),
    );

    const linkedCustomers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: {
            id: {
              in: customerIds,
            },
          },
        })
      : [];

    if (customerIds.length !== linkedCustomers.length) {
      throw new NotFoundException(
        'Um ou mais clientes informados nao foram encontrados.',
      );
    }

    return new Map(linkedCustomers.map((customer) => [customer.id, customer]));
  }

  private async getLinkedUsers(tickets: CreateWintourImportInput['tickets']) {
    const userIds = Array.from(
      new Set(
        tickets
          .map((ticket) => ticket.user_id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    const linkedUsers = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
        })
      : [];

    if (userIds.length !== linkedUsers.length) {
      throw new NotFoundException(
        'Um ou mais usuarios informados nao foram encontrados.',
      );
    }

    return new Map(linkedUsers.map((user) => [user.id, user]));
  }

  private normalizeDocument(value?: string | null) {
    return (value ?? '').replace(/\D/g, '');
  }

  private async findCustomerByDocument(document?: string | null) {
    const rawDocument = document?.trim();
    const normalizedDocument = this.normalizeDocument(document);
    const documentOptions = Array.from(
      new Set([rawDocument, normalizedDocument].filter(Boolean)),
    );

    if (!documentOptions.length) {
      return null;
    }

    return this.prisma.customer.findFirst({
      where: {
        OR: documentOptions.map((cpf) => ({ cpf })),
      },
    });
  }

  private async resolveTicketsWithCustomers(
    tickets: CreateWintourImportInput['tickets'],
    customerMap: Map<string, Customer>,
  ) {
    const documentCache = new Map<string, Customer | null>();

    return Promise.all(
      tickets.map(async (ticket) => {
        const linkedCustomer = ticket.customer_id
          ? customerMap.get(ticket.customer_id)
          : undefined;

        if (linkedCustomer) {
          return {
            ticket: {
              ...ticket,
              customer_id: linkedCustomer.id,
            },
            linkedCustomer,
          };
        }

        const documentKey = this.normalizeDocument(ticket.customer?.cpf_cnpj);

        if (!documentKey) {
          return {
            ticket,
            linkedCustomer: undefined,
          };
        }

        if (!documentCache.has(documentKey)) {
          const customer = await this.findCustomerByDocument(
            ticket.customer?.cpf_cnpj,
          );
          documentCache.set(documentKey, customer);
        }

        const customerByDocument = documentCache.get(documentKey) ?? null;

        return {
          ticket: {
            ...ticket,
            customer_id: customerByDocument?.id ?? ticket.customer_id,
          },
          linkedCustomer: customerByDocument ?? undefined,
        };
      }),
    );
  }

  private buildIntegrationPayload(
    data: CreateWintourImportInput,
    resolvedTickets: Array<{
      ticket: CreateWintourImportInput['tickets'][number];
      linkedCustomer?: Customer;
    }>,
  ): CreateWintourImportInput {
    return {
      ...data,
      tickets: resolvedTickets.map(({ ticket, linkedCustomer }) => {
        return {
          ...ticket,
          cliente: ticket.cliente ?? linkedCustomer?.nome_completo,
          customer:
            ticket.customer ??
            (linkedCustomer
              ? {
                  razao_social: linkedCustomer.nome_completo ?? undefined,
                  endereco: linkedCustomer.endereco ?? undefined,
                  bairro: linkedCustomer.bairro ?? undefined,
                  cep: linkedCustomer.cep ?? undefined,
                  cidade: linkedCustomer.cidade ?? undefined,
                  estado: linkedCustomer.estado ?? undefined,
                  celular: linkedCustomer.telefone_celular ?? undefined,
                  cpf_cnpj: linkedCustomer.cpf ?? undefined,
                  dt_cadastro: linkedCustomer.data_criacao_usuario ?? undefined,
                  email: linkedCustomer.email ?? undefined,
                }
              : undefined),
        };
      }),
    };
  }

  /**
   * Deriva a chave de idempotência do payload.
   * Usa os valores de `idv_externo` de todos os tickets (ordenados), ou
   * cai back para `nr_arquivo` quando nenhum ticket possui esse campo.
   * Garante que o mesmo conjunto de bilhetes não seja reenviado ao Wintour.
   */
  private buildIntegrationKey(payload: CreateWintourImportInput): string {
    const keys = payload.tickets
      .map((t) => t.idv_externo?.trim())
      .filter((k): k is string => Boolean(k))
      .sort();
    return keys.length > 0
      ? keys.join('|')
      : `nr_arquivo:${payload.nr_arquivo}`;
  }

  async createWintourImport(data: CreateWintourImportInput, userId?: string) {
    const {
      nr_arquivo,
      data_geracao,
      hora_geracao,
      nome_agencia,
      paymentDetails,
      selectedServices,
      servicesDetails,
      versao_xml,
      tickets,
    } = data;

    await this.getLinkedUsers(tickets);
    const customerMap = await this.getLinkedCustomers(tickets);
    const resolvedTickets = await this.resolveTicketsWithCustomers(
      tickets,
      customerMap,
    );
    const integrationPayload = this.buildIntegrationPayload(
      data,
      resolvedTickets,
    );

    const localResult = await this.prisma.$transaction(async (tx) => {
      const headersToDelete = await tx.wintourHeader.findMany({
        where: { nr_arquivo },
        select: { id: true },
      });

      for (const header of headersToDelete) {
        await tx.wintourTicket.deleteMany({
          where: { header_id: header.id },
        });
      }

      const saleIdsByFileNumber = await this.getSaleIdsByFileNumber(
        nr_arquivo,
        tx,
      );

      if (saleIdsByFileNumber.length > 0) {
        await tx.sale.deleteMany({
          where: { id: { in: saleIdsByFileNumber } },
        });
      }

      await tx.wintourHeader.deleteMany({
        where: { nr_arquivo },
      });

      const createdHeader = await tx.wintourHeader.create({
        data: {
          nr_arquivo,
          data_geracao,
          hora_geracao,
          nome_agencia,
          versao_xml,
          integration_status: 'pending',
          tickets: {
            create: resolvedTickets.map(({ ticket, linkedCustomer }) => {
              const customerSnapshot: WintourCustomerInput | undefined =
                ticket.customer ??
                (linkedCustomer
                  ? {
                      razao_social: linkedCustomer.nome_completo,
                      endereco: linkedCustomer.endereco,
                      bairro: linkedCustomer.bairro,
                      cep: linkedCustomer.cep,
                      cidade: linkedCustomer.cidade,
                      estado: linkedCustomer.estado,
                      celular: linkedCustomer.telefone_celular,
                      cpf_cnpj: linkedCustomer.cpf,
                      dt_cadastro:
                        this.parseDate(linkedCustomer.data_criacao_usuario) ||
                        undefined,
                      email: linkedCustomer.email,
                    }
                  : undefined);

              return {
                num_bilhete: ticket.num_bilhete,
                user_id: ticket.user_id || undefined,
                customer_id: ticket.customer_id || undefined,
                localizador: ticket.localizador,
                fornecedor: ticket.fornecedor,
                passageiro: ticket.passageiro,
                idv_externo: ticket.idv_externo,
                data_lancamento: this.parseDate(ticket.data_lancamento),
                codigo_produto: ticket.codigo_produto,
                forma_de_pagamento: ticket.forma_de_pagamento,
                cliente: ticket.cliente ?? linkedCustomer?.nome_completo,
                cid_dest_principal: ticket.cid_dest_principal,
                info_adicionais: ticket.info_adicionais,
                values: {
                  create: ticket.values?.map((v) => ({
                    codigo: v.codigo,
                    valor: v.valor,
                    valor_df: v.valor_df,
                    valor_mp: v.valor_mp,
                  })),
                },
                customer_data: customerSnapshot
                  ? {
                      create: {
                        razao_social: customerSnapshot.razao_social,
                        endereco: customerSnapshot.endereco,
                        bairro: customerSnapshot.bairro,
                        cep: customerSnapshot.cep,
                        cidade: customerSnapshot.cidade,
                        estado: customerSnapshot.estado,
                        celular: customerSnapshot.celular,
                        cpf_cnpj: customerSnapshot.cpf_cnpj,
                        dt_cadastro: this.parseDate(
                          customerSnapshot.dt_cadastro,
                        ),
                        email: customerSnapshot.email,
                      },
                    }
                  : undefined,
                sales_origins: {
                  create: ticket.sales_origin?.map((item) => ({
                    item: item.item,
                  })),
                },
                conjugates: {
                  create: ticket.ticket_conjugate?.map((item) => ({
                    item: item.item,
                  })),
                },
                location_data: ticket.location
                  ? {
                      create: {
                        cidade_retirada: ticket.location.cidade_retirada,
                        local_retirada: ticket.location.local_retirada,
                        dt_retirada: this.parseDate(
                          ticket.location.dt_retirada,
                        ),
                        local_devolucao: ticket.location.local_devolucao,
                        dt_devolucao: this.parseDate(
                          ticket.location.dt_devolucao,
                        ),
                        categ_veiculo: ticket.location.categ_veiculo,
                      },
                    }
                  : undefined,
                package_data: ticket.package
                  ? {
                      create: {
                        cid_dest_principal: ticket.package.cid_dest_principal,
                        data_inicio_pacote: this.parseDate(
                          ticket.package.data_inicio_pacote,
                        ),
                        data_fim_pacote: this.parseDate(
                          ticket.package.data_fim_pacote,
                        ),
                        descricao_pacote: ticket.package.descricao_pacote,
                      },
                    }
                  : undefined,
                other_services: ticket.other_services
                  ? {
                      create: {
                        cid_dest_principal:
                          ticket.other_services.cid_dest_principal,
                        data_inicio_outros_svcs: this.parseDate(
                          ticket.other_services.data_inicio_outros_svcs,
                        ),
                        data_fim_outros_svcs: this.parseDate(
                          ticket.other_services.data_fim_outros_svcs,
                        ),
                        descricao_outros_svcs:
                          ticket.other_services.descricao_outros_svcs,
                      },
                    }
                  : undefined,
              };
            }),
          },
        },
        include: {
          tickets: {
            include: {
              customer_record: true,
              customer_data: true,
              values: true,
            },
          },
        },
      });

      let createdSaleId: string | null = null;
      if (createdHeader.tickets?.length) {
        const result = await this.createSalesFromHeader(
          {
            id: createdHeader.id,
            tickets: createdHeader.tickets,
          },
          nome_agencia,
          nr_arquivo,
          paymentDetails,
          selectedServices,
          servicesDetails,
          userId,
          tx,
          integrationPayload,
        );
        createdSaleId = result.saleId;
      }

      return { header: createdHeader, saleId: createdSaleId };
    });

    const { header: localImport, saleId: createdSaleId } = localResult;
    const integrationKey = this.buildIntegrationKey(integrationPayload);

    // Idempotência: se outra venda com a mesma chave já foi integrada com
    // sucesso, marcamos esta como success sem reenviar ao Wintour.
    if (createdSaleId) {
      const duplicate = await this.prisma.sale.findFirst({
        where: {
          integrationKey,
          integrationStatus: IntegrationStatus.success,
          id: { not: createdSaleId },
        },
        select: { id: true },
      });

      if (duplicate) {
        this.logger.log(
          `[createWintourImport] Payload já integrado (key=${integrationKey}, ref=${duplicate.id}). Marcando ${createdSaleId} como success sem reenviar.`,
        );
        await this.prisma.sale.update({
          where: { id: createdSaleId },
          data: {
            integrationStatus: IntegrationStatus.success,
            retryCount: 0,
            lastErrorMessage: null,
            lastIntegrationAt: new Date(),
            nextRetryAt: null,
          },
        });
        await this.prisma.wintourHeader.update({
          where: { id: localImport.id },
          data: { integration_status: 'success' },
        });
        await this.integrationLogService.create({
          saleId: createdSaleId,
          attempt: 1,
          status: 'success',
          payload: integrationPayload,
          response: { idempotent: true, ref: duplicate.id },
        });
        const importacaoAtualizada =
          await this.prisma.wintourHeader.findUniqueOrThrow({
            where: { id: localImport.id },
            include: {
              tickets: {
                include: {
                  apportionments: true,
                  values: true,
                  expiry_dates: true,
                  air_data: { include: { sections: true } },
                  hotel_data: true,
                  customer_data: true,
                  sales_origins: true,
                  conjugates: true,
                  location_data: true,
                  package_data: true,
                  other_services: true,
                  transfer_data: true,
                  wintour_other: true,
                  user: true,
                  customer_record: true,
                },
              },
            },
          });
        return {
          importacao: importacaoAtualizada,
          integracao: {
            status: 'success',
            protocolo: null,
            raw_response: null,
            idempotent: true,
          },
        };
      }
    }

    try {
      const integration = await this.sendToWintour(integrationPayload, {
        headerId: localImport.id,
      });
      const importacaoAtualizada = await this.prisma.wintourHeader.update({
        where: {
          id: localImport.id,
        },
        data: {
          integration_status: 'success',
          integration_protocol: integration.protocolo,
          integration_raw_response: integration.raw_response,
        },
        include: {
          tickets: {
            include: {
              apportionments: true,
              values: true,
              expiry_dates: true,
              air_data: {
                include: {
                  sections: true,
                },
              },
              hotel_data: true,
              customer_data: true,
              sales_origins: true,
              conjugates: true,
              location_data: true,
              package_data: true,
              other_services: true,
              transfer_data: true,
              wintour_other: true,
              user: true,
              customer_record: true,
            },
          },
        },
      });

      if (createdSaleId) {
        await this.integrationLogService.create({
          saleId: createdSaleId,
          attempt: 1,
          status: 'success',
          payload: integrationPayload,
          response: {
            protocolo: integration.protocolo,
            raw_response: integration.raw_response,
          },
        });
      }

      return {
        importacao: importacaoAtualizada,
        integracao: {
          status: 'success',
          protocolo: integration.protocolo,
          raw_response: integration.raw_response,
        },
      };
    } catch (error) {
      const errorResponse =
        error instanceof BadGatewayException ? error.getResponse() : undefined;
      const serializedResponse =
        typeof errorResponse === 'string'
          ? errorResponse
          : errorResponse
          ? JSON.stringify(errorResponse)
          : error instanceof Error
          ? error.message
          : 'erro desconhecido';

      if (localImport?.id) {
        await this.prisma.wintourHeader.update({
          where: {
            id: localImport.id,
          },
          data: {
            integration_status: 'error',
            integration_raw_response: serializedResponse,
          },
        });
      }

      if (createdSaleId) {
        await this.integrationLogService.create({
          saleId: createdSaleId,
          attempt: 1,
          status: 'error',
          payload: integrationPayload,
          error: serializedResponse,
        });
      }

      this.logger.warn(
        `[createWintourImport] Integracao SOAP Wintour falhou para header ${localImport?.id}, mas a venda local foi mantida. Detalhes: ${serializedResponse}`,
      );

      const importacaoAtualizada =
        await this.prisma.wintourHeader.findUniqueOrThrow({
          where: {
            id: localImport.id,
          },
          include: {
            tickets: {
              include: {
                apportionments: true,
                values: true,
                expiry_dates: true,
                air_data: {
                  include: {
                    sections: true,
                  },
                },
                hotel_data: true,
                customer_data: true,
                sales_origins: true,
                conjugates: true,
                location_data: true,
                package_data: true,
                other_services: true,
                transfer_data: true,
                wintour_other: true,
                user: true,
                customer_record: true,
              },
            },
          },
        });

      return {
        importacao: importacaoAtualizada,
        integracao: {
          status: 'local_success',
          protocolo: localImport.id,
          raw_response: serializedResponse,
        },
      };
    }
  }

  async findAll({
    page = 1,
    limit = 10,
    startDate,
    endDate,
    status,
    search,
    sortBy,
    userId,
  }: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
    sortBy?: string;
    userId?: string;
  }) {
    console.log('Filtro de data recebido:', {
      startDate,
      endDate,
      status,
      search,
      sortBy,
      userId,
    });

    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.max(1, Number(limit) || 10);
    const normalizedStatus = this.normalizeStatusFilter(status);
    const normalizedSearch = this.normalizeSearchTerm(search);
    const normalizedSortBy = this.normalizeSortOption(sortBy);
    const startDateBoundary = this.parseDateBoundary(startDate, 'start');
    const endDateBoundary = this.parseDateBoundary(endDate, 'end');

    const saleDateRange: Prisma.DateTimeFilter = {};

    if (startDateBoundary) {
      saleDateRange.gte = startDateBoundary;
    }

    if (endDateBoundary) {
      saleDateRange.lte = endDateBoundary;
    }

    // Segurança: userId é obrigatório para isolar dados do usuário logado.
    // Nunca deve retornar vendas de outros usuários.
    if (!userId) {
      const emptySummary = {
        totalCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        cancelledCount: 0,
      };

      return {
        data: [],
        summary: emptySummary,
        meta: {
          total: 0,
          page: normalizedPage,
          limit: normalizedLimit,
          lastPage: 1,
          summary: {
            total: emptySummary.totalCount,
            pending: emptySummary.pendingCount,
            approved: emptySummary.approvedCount,
            canceled: emptySummary.cancelledCount,
          },
        },
      };
    }

    const where: Prisma.SaleWhereInput = {
      userId,
      ...(Object.keys(saleDateRange).length > 0
        ? {
            OR: [
              // Filtra pelo campo DATA DA VENDA quando disponível.
              { sale_date: { not: null, ...saleDateRange } },
              // Fallback para created_at quando sale_date não foi preenchido.
              { sale_date: null, created_at: saleDateRange },
            ],
          }
        : {}),
    };

    const prismaOrderBy: Prisma.SaleOrderByWithRelationInput[] =
      normalizedSortBy === 'antigos'
        ? [{ created_at: 'asc' }]
        : normalizedSortBy === 'recentes'
        ? [{ created_at: 'desc' }]
        : [{ sale_date: 'desc' }, { updated_at: 'desc' }];

    console.log('Filtro Final Prisma:', JSON.stringify(where));
    console.log('OrderBy Prisma aplicado:', JSON.stringify(prismaOrderBy));

    // ─────────────────────────────────────────────────────────────────────────────
    // ESTRATÉGIA DE PAGINAÇÃO: GRUPOS (não vendas individuais)
    // ─────────────────────────────────────────────────────────────────────────────
    // Grupos são virtuais (agrupados por wintourHeaderId ou sale.id).
    //
    // Fluxo:
    // 1. Buscar TODAS as vendas (com select limitado) para criar grupos.
    // 2. Agrupa vendas em memória por wintourHeaderId ?? sale.id.
    // 3. Ordena GRUPOS globalmente (por data ou nome de cliente).
    // 4. Filtra GRUPOS (por status e search).
    // 5. Aplicar OFFSET/LIMIT em nível de GRUPOS.
    // 6. Buscar dados completos apenas dos representantes da página.
    //
    // Por que não aplicar take/skip direto no Prisma?
    // Porque take/skip em Prisma pagina vendas individuais, não grupos.
    // Isso deixaria agrupamentos incompletos.
    // Exemplo: venda A+B mesmo grupo, take 10 skip 0 traz só A, grupo fica sem B.
    //
    // Otimizações aplicadas:
    // - select limitado na query inicial (5 campos)
    // - segunda query busca apenas dados dos representantes da página
    // ─────────────────────────────────────────────────────────────────────────────

    const [allSales, summaryRawTotal, summaryRawStatuses] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        orderBy: prismaOrderBy,
        select: {
          id: true,
          created_at: true,
          sale_date: true,
          updated_at: true,
          integrationStatus: true,
          retryCount: true,
          lastErrorMessage: true,
          lastIntegrationAt: true,
          servicesData: true,
          customer: {
            select: {
              razao_social: true,
              nome_completo: true,
              email: true,
              cpf: true,
            },
          },
        },
      }),
      this.prisma.sale.count({
        where: { userId },
      }),
      this.prisma.sale.findMany({
        where: { userId },
        select: {
          servicesData: true,
        },
      }),
    ]);

    const summary = summaryRawStatuses.reduce(
      (acc, sale) => {
        const statusGroup = this.getSaleStatusGroupFromServicesData(
          sale.servicesData,
        );

        if (statusGroup === 'approved') {
          acc.approvedCount += 1;
        } else if (statusGroup === 'canceled') {
          acc.cancelledCount += 1;
        } else {
          acc.pendingCount += 1;
        }

        return acc;
      },
      {
        totalCount: summaryRawTotal,
        pendingCount: 0,
        approvedCount: 0,
        cancelledCount: 0,
      },
    );

    const groups = new Map<
      string,
      {
        representativeId: string;
        totalValue: number;
        selectedServices: Set<string>;
        paymentMethods: Set<string>;
        statusGroup: 'approved' | 'pending' | 'canceled';
        searchText: string;
        customerName: string;
        latestSaleDate: Date | null;
        createdAt: Date | null;
      }
    >();

    const toSafeTimestamp = (value: Date | string | null | undefined) => {
      if (!value) return 0;
      const parsed = new Date(value).getTime();
      if (Number.isNaN(parsed)) return 0;
      // Ignore future dates to avoid invalid records pinning the top position.
      return parsed > Date.now() ? 0 : parsed;
    };

    for (const sale of allSales) {
      const data = (sale.servicesData as Record<string, any> | null) ?? {};
      const details = (data.details as Record<string, any> | undefined) ?? {};
      const groupKey = details.wintourHeaderId ?? sale.id;
      const saleTimestamp = Math.max(
        toSafeTimestamp(sale.sale_date),
        toSafeTimestamp(sale.updated_at),
        toSafeTimestamp(sale.created_at),
      );

      if (!groups.has(groupKey)) {
        const searchText = [
          sale.customer?.razao_social,
          sale.customer?.nome_completo,
          sale.customer?.email,
          sale.customer?.cpf,
        ]
          .map((value) =>
            String(value ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .join(' ');

        const detailsCustomerName = String(
          details.cliente ?? details.passageiro ?? '',
        ).trim();

        const customerName = String(
          sale.customer?.razao_social ??
            sale.customer?.nome_completo ??
            detailsCustomerName,
        ).trim();

        const latestSaleDate = saleTimestamp ? new Date(saleTimestamp) : null;

        groups.set(groupKey, {
          representativeId: sale.id,
          totalValue: 0,
          selectedServices: new Set<string>(),
          paymentMethods: new Set<string>(),
          statusGroup: this.getSaleStatusGroupFromServicesData(
            sale.servicesData,
          ),
          searchText,
          customerName,
          latestSaleDate,
          createdAt: sale.created_at ?? null,
        });
      }

      const group = groups.get(groupKey)!;

      const vendaData = toSafeTimestamp(sale.created_at);
      const dataAtualGrupo = group.latestSaleDate
        ? toSafeTimestamp(group.latestSaleDate)
        : 0;

      if (vendaData > dataAtualGrupo) {
        group.latestSaleDate = sale.created_at
          ? new Date(sale.created_at)
          : null;
      } else if (saleTimestamp > dataAtualGrupo) {
        group.latestSaleDate = new Date(saleTimestamp);
      }

      if (!group.customerName) {
        const fallbackCustomerName = String(
          sale.customer?.razao_social ??
            sale.customer?.nome_completo ??
            details.cliente ??
            details.passageiro ??
            '',
        ).trim();

        if (fallbackCustomerName) {
          group.customerName = fallbackCustomerName;
        }
      }

      const currentTotal = Number(details.totalValue ?? 0);
      if (Number.isFinite(currentTotal)) {
        group.totalValue += currentTotal;
      }

      const selectedServices = Array.isArray(data.selectedServices)
        ? (data.selectedServices as unknown[])
            .map((value) => String(value ?? '').trim())
            .filter(Boolean)
        : [];

      for (const service of selectedServices) {
        group.selectedServices.add(service);
      }

      const paymentMethod = String(details.paymentMethod ?? '').trim();
      if (paymentMethod) {
        group.paymentMethods.add(paymentMethod);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ORDENAÇÃO DE GRUPOS (global, antes de paginação)
    // ─────────────────────────────────────────────────────────────────────────────
    const groupEntries = Array.from(groups.entries());

    const sortedAndFilteredGroups = groupEntries.filter(([, group]) => {
      const matchesStatus = normalizedStatus
        ? group.statusGroup === normalizedStatus
        : true;
      const matchesSearch = normalizedSearch
        ? group.searchText.includes(normalizedSearch)
        : true;

      return matchesStatus && matchesSearch;
    });

    sortedAndFilteredGroups.sort(
      ([leftKey, leftGroup], [rightKey, rightGroup]) => {
        const parseToTimestamp = (group: any) => {
          const dateVal = group.latestSaleDate || group.createdAt;
          if (!dateVal) return 0;
          const parsed = new Date(dateVal).getTime();
          return isNaN(parsed) ? 0 : parsed;
        };

        const leftTimestamp = parseToTimestamp(leftGroup);
        const rightTimestamp = parseToTimestamp(rightGroup);

        if (normalizedSortBy === 'az') {
          const byName = leftGroup.customerName.localeCompare(
            rightGroup.customerName,
            'pt-BR',
            { sensitivity: 'base' },
          );
          return byName || rightTimestamp - leftTimestamp;
        }

        if (normalizedSortBy === 'za') {
          const byName = rightGroup.customerName.localeCompare(
            leftGroup.customerName,
            'pt-BR',
            { sensitivity: 'base' },
          );
          return byName || rightTimestamp - leftTimestamp;
        }

        if (normalizedSortBy === 'antigos') {
          return leftTimestamp - rightTimestamp; // Mais antigo primeiro (Crescente)
        }

        if (normalizedSortBy === 'recentes') {
          return rightTimestamp - leftTimestamp; // Mais recente primeiro (Decrescente)
        }

        // Fallback padrão: Mais recente primeiro
        return rightTimestamp - leftTimestamp;
      },
    );

    // ─────────────────────────────────────────────────────────────────────────────
    // PAGINAÇÃO EM NÍVEL DE GRUPOS (offset/limit aplicado em memória após ordenação)
    // ─────────────────────────────────────────────────────────────────────────────
    const total = sortedAndFilteredGroups.length;
    const offset = (normalizedPage - 1) * normalizedLimit;
    const paginatedGroupEntries = sortedAndFilteredGroups.slice(
      offset,
      offset + normalizedLimit,
    );

    const pageGroupKeys = paginatedGroupEntries.map(([groupKey]) => groupKey);
    const representativeIds = pageGroupKeys
      .map((key) => groups.get(key)?.representativeId)
      .filter((value): value is string => Boolean(value));

    const representativeRows = representativeIds.length
      ? await this.prisma.sale.findMany({
          where: { id: { in: representativeIds } },
          include: {
            customer: true,
            passengers: true,
          },
        })
      : [];

    const representativeById = new Map(
      representativeRows.map((row) => [row.id, row]),
    );

    const sales = pageGroupKeys
      .map((groupKey) => {
        const group = groups.get(groupKey);
        if (!group) {
          return null;
        }

        const representative = representativeById.get(group.representativeId);
        if (!representative) {
          return null;
        }

        const sourceData =
          (representative.servicesData as Record<string, any> | null) ?? {};
        const sourceDetails =
          (sourceData.details as Record<string, any> | undefined) ?? {};

        return {
          ...representative,
          servicesData: {
            ...sourceData,
            selectedServices: Array.from(group.selectedServices),
            details: {
              ...sourceDetails,
              totalValue: group.totalValue,
              paymentMethod: Array.from(group.paymentMethods).join(', '),
            },
          },
        };
      })
      .filter((sale): sale is NonNullable<typeof sale> => Boolean(sale));

    return {
      data: sales,
      summary,
      meta: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        lastPage: Math.ceil(total / normalizedLimit) || 1,
        summary: {
          total: summary.totalCount,
          pending: summary.pendingCount,
          approved: summary.approvedCount,
          canceled: summary.cancelledCount,
        },
      },
    };
  }

  async findOne(id: string) {
    this.logger.log(`Backend buscando venda com ID: ${id}`);
    console.log('Backend buscando venda com ID:', id);

    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        passengers: true,
      },
    });

    if (!sale) {
      this.logger.warn(`Venda com id '${id}' não encontrada no banco.`);
      console.warn(`Venda com id '${id}' não encontrada no banco.`);
      throw new NotFoundException(`Venda com id '${id}' não encontrada.`);
    }

    this.logger.log(`Venda encontrada: ${id}`);
    return {
      ...sale,
      passengers: sale.passengers.map(
        ({ id: passId, created_at, updated_at, saleId, fullName }) => ({
          id: passId,
          created_at,
          updated_at,
          sale_id: saleId,
          full_name: fullName,
        }),
      ),
    };
  }

  async update(id: string, data: UpdateSaleDto) {
    const existingSale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        passengers: true,
      },
    });

    if (!existingSale) {
      throw new NotFoundException(`Venda com id '${id}' não encontrada.`);
    }

    const currentServicesData = this.isPlainObject(existingSale.servicesData)
      ? existingSale.servicesData
      : {};
    const currentDetails = this.isPlainObject(currentServicesData.details)
      ? currentServicesData.details
      : {};
    const providedServicesDetails = this.isPlainObject(data.servicesDetails)
      ? data.servicesDetails
      : undefined;
    const providedDetails = this.isPlainObject(providedServicesDetails?.details)
      ? providedServicesDetails.details
      : undefined;
    const currentSelectedServices = Array.isArray(
      currentServicesData.selectedServices,
    )
      ? currentServicesData.selectedServices
      : [];
    const nextSelectedServices =
      data.selectedServices ?? currentSelectedServices;

    const nextServicesData =
      providedServicesDetails !== undefined ||
      data.selectedServices !== undefined
        ? {
            ...(providedServicesDetails ?? currentServicesData),
            selectedServices: nextSelectedServices,
            details: {
              ...currentDetails,
              ...(providedDetails ?? {}),
            },
          }
        : undefined;
    const nextDetails =
      nextServicesData && this.isPlainObject(nextServicesData.details)
        ? nextServicesData.details
        : currentDetails;
    const wintourHeaderId =
      typeof nextDetails.wintourHeaderId === 'string'
        ? nextDetails.wintourHeaderId
        : null;
    const wintourTicketUpdateData: Prisma.WintourTicketUncheckedUpdateManyInput =
      {};

    if (data.customerId) {
      wintourTicketUpdateData.customer_id = data.customerId;
    }

    if (typeof data.travelData?.destination === 'string') {
      wintourTicketUpdateData.cid_dest_principal = data.travelData.destination;
    }

    const paymentMethod = nextDetails.paymentMethod;
    if (typeof paymentMethod === 'string') {
      wintourTicketUpdateData.forma_de_pagamento = paymentMethod;
    }

    const customerName = nextDetails.cliente;
    if (typeof customerName === 'string') {
      wintourTicketUpdateData.cliente = customerName;
    }

    if (
      nextSelectedServices.length === 1 &&
      typeof nextSelectedServices[0] === 'string'
    ) {
      wintourTicketUpdateData.codigo_produto = nextSelectedServices[0];
    }

    const nextTravelType = this.mapTravelType(data.travelData?.travelType);

    const updatePayload: Prisma.SaleUpdateInput = {
      customer: data.customerId
        ? {
            connect: { id: data.customerId },
          }
        : undefined,
      sale_date: data.travelData?.saleDate
        ? new Date(data.travelData.saleDate)
        : undefined,
      origin: data.travelData?.origin,
      destination: data.travelData?.destination,
      departureDate: data.travelData?.departureDate
        ? new Date(data.travelData.departureDate)
        : undefined,
      returnDate:
        data.travelData && 'returnDate' in data.travelData
          ? data.travelData.returnDate
            ? new Date(data.travelData.returnDate)
            : null
          : undefined,
      travelType: nextTravelType,
      servicesData: nextServicesData as Prisma.InputJsonValue | undefined,
    };

    return this.prisma.$transaction(async (tx) => {
      const updatedSale = await tx.sale.update({
        where: { id },
        data: updatePayload,
      });

      // Editing a grouped Wintour sale must replace previous grouped rows,
      // avoiding total accumulation from duplicated rows in list aggregation.
      if (wintourHeaderId) {
        const salesWithHeader = await tx.sale.findMany({
          select: {
            id: true,
            servicesData: true,
          },
        });

        const duplicateSaleIds = salesWithHeader
          .filter((saleRow) => {
            const saleData =
              (saleRow.servicesData as Record<string, any> | null) ?? {};
            const details =
              (saleData.details as Record<string, any> | undefined) ?? {};
            return (
              details.wintourHeaderId === wintourHeaderId &&
              saleRow.id !== updatedSale.id
            );
          })
          .map((saleRow) => saleRow.id);

        if (duplicateSaleIds.length > 0) {
          await tx.sale.deleteMany({
            where: {
              id: { in: duplicateSaleIds },
            },
          });
        }
      }

      if (data.passengers) {
        await tx.passenger.deleteMany({ where: { saleId: id } });

        if (data.passengers.length > 0) {
          await tx.passenger.createMany({
            data: data.passengers.map((passenger) => ({
              saleId: id,
              fullName: passenger.name,
            })),
          });
        }
      }

      if (wintourHeaderId && Object.keys(wintourTicketUpdateData).length > 0) {
        await tx.wintourTicket.updateMany({
          where: { header_id: wintourHeaderId },
          data: wintourTicketUpdateData,
        });
      }

      return tx.sale.findUnique({
        where: { id: updatedSale.id },
        include: {
          customer: true,
          passengers: true,
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      select: { id: true, servicesData: true },
    });

    if (!sale) {
      throw new NotFoundException(`Venda com id '${id}' não encontrada.`);
    }

    const servicesData = sale.servicesData as {
      details?: { wintourHeaderId?: string };
    } | null;
    const wintourHeaderId = servicesData?.details?.wintourHeaderId ?? null;

    await this.prisma.$transaction(async (tx) => {
      // Exclui o WintourHeader vinculado (cascade apaga WintourTicket e todos
      // os seus filhos via onDelete: Cascade definido no schema)
      if (wintourHeaderId) {
        await tx.wintourHeader.deleteMany({
          where: { id: wintourHeaderId },
        });
      }

      // Exclui a Sale (cascade apaga Passenger via onDelete: Cascade no schema)
      await tx.sale.delete({ where: { id } });
    });
  }

  async createSaleWithCustomerTriage(
    saleData: {
      customerId?: string;
      cpf?: string;
      cpfCnpj?: string;
      customerData?: any;
      origin: string;
      destination: string;
      departureDate: Date | string;
      returnDate?: Date | string;
      travelType: string;
      servicesData?: any;
      paymentMethod?: string;
      totalValue?: number;
      travelData?: {
        origin?: string;
        destination?: string;
        departureDate?: string;
        returnDate?: string;
        travelType?: string;
      };
      servicesDetails?: Record<string, unknown>;
      selectedServices?: string[];
    },
    userId: string,
  ): Promise<{ sale: any; customerSource: 'local' | 'global' | 'new' }> {
    const requestUserId = String(userId ?? '').trim();

    if (!requestUserId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    const normalizedSaleData = {
      ...saleData,
      origin: saleData.origin ?? saleData.travelData?.origin ?? '',
      destination:
        saleData.destination ?? saleData.travelData?.destination ?? '',
      departureDate:
        saleData.departureDate ?? saleData.travelData?.departureDate ?? null,
      returnDate: saleData.returnDate ?? saleData.travelData?.returnDate,
      travelType:
        saleData.travelType ?? saleData.travelData?.travelType ?? 'ONE_WAY',
      cpfCnpj: saleData.cpfCnpj ?? saleData.cpf,
      servicesData: saleData.servicesData ?? saleData.servicesDetails,
    };

    if (!normalizedSaleData.origin || !normalizedSaleData.destination) {
      throw new BadRequestException('Origem e destino são obrigatórios.');
    }

    if (!normalizedSaleData.departureDate) {
      throw new BadRequestException('Data de ida é obrigatória.');
    }

    const departureDate =
      normalizedSaleData.departureDate instanceof Date
        ? normalizedSaleData.departureDate
        : new Date(normalizedSaleData.departureDate);

    if (Number.isNaN(departureDate.getTime())) {
      throw new BadRequestException('Data de ida inválida.');
    }

    const returnDate = normalizedSaleData.returnDate
      ? normalizedSaleData.returnDate instanceof Date
        ? normalizedSaleData.returnDate
        : new Date(normalizedSaleData.returnDate)
      : undefined;

    if (returnDate && Number.isNaN(returnDate.getTime())) {
      throw new BadRequestException('Data de retorno inválida.');
    }

    const saleDateInput = (saleData as any)?.travelData?.saleDate;
    const saleDate = saleDateInput ? new Date(saleDateInput) : departureDate;
    const resolvedSaleDate = Number.isNaN(saleDate.getTime())
      ? departureDate
      : saleDate;

    let customerId = saleData.customerId;
    let customerSource: 'local' | 'global' | 'new' = 'local';

    if (customerId) {
      const existingCustomer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!existingCustomer) {
        throw new NotFoundException(
          `Cliente com id '${customerId}' não encontrado.`,
        );
      }

      const hasLink = requestUserId
        ? await this.prisma.userCustomer.findUnique({
            where: {
              userId_customerId: { userId: requestUserId, customerId },
            },
            select: { id: true },
          })
        : null;

      customerSource = hasLink ? 'local' : 'global';

      if (!hasLink && requestUserId) {
        await this.prisma.userCustomer.create({
          data: { userId: requestUserId, customerId },
        });
      }
    }

    if (!customerId) {
      const rawCpf = String(normalizedSaleData.cpfCnpj ?? '').trim();
      const normalizedCpf = this.normalizeDocument(rawCpf);
      const cpfCandidates = Array.from(
        new Set([rawCpf, normalizedCpf].filter(Boolean)),
      );

      const customerByCpf = cpfCandidates.length
        ? await this.prisma.customer.findFirst({
            where: {
              OR: cpfCandidates.map((cpf) => ({ cpf })),
            },
            select: {
              id: true,
            },
          })
        : null;

      if (customerByCpf) {
        customerId = customerByCpf.id;

        const hasLink = requestUserId
          ? await this.prisma.userCustomer.findUnique({
              where: {
                userId_customerId: {
                  userId: requestUserId,
                  customerId: customerByCpf.id,
                },
              },
              select: { id: true },
            })
          : null;

        customerSource = hasLink ? 'local' : 'global';

        // Vincula cliente ao usuário atual quando ainda não existe vínculo.
        if (!hasLink && requestUserId) {
          await this.prisma.userCustomer.create({
            data: { userId: requestUserId, customerId: customerByCpf.id },
          });
        }
      } else {
        const customerData = this.isPlainObject(saleData.customerData)
          ? saleData.customerData
          : {};
        const servicesData = this.isPlainObject(normalizedSaleData.servicesData)
          ? normalizedSaleData.servicesData
          : {};
        const details = this.isPlainObject(servicesData.details)
          ? servicesData.details
          : {};

        if (!normalizedCpf) {
          throw new BadRequestException(
            'CPF/CNPJ é obrigatório para criar cliente novo.',
          );
        }

        const nomeCompleto = String(
          customerData.nome_completo ??
            customerData.razao_social ??
            details.cliente ??
            details.passageiro ??
            '',
        ).trim();

        if (!nomeCompleto) {
          throw new BadRequestException(
            'Nome do cliente é obrigatório para criar cliente novo.',
          );
        }

        const createdCustomer = await this.prisma.customer.create({
          data: {
            nome_completo: nomeCompleto,
            razao_social:
              String(customerData.razao_social ?? '').trim() || null,
            cpf: normalizedCpf,
            email:
              String(customerData.email ?? '').trim() ||
              `${normalizedCpf}@pending.local`,
            telefone_celular:
              String(customerData.telefone_celular ?? '').trim() ||
              '00000000000',
            endereco: String(customerData.endereco ?? '').trim() || 'N/A',
            cep: String(customerData.cep ?? '').trim() || '00000000',
            logradouro: String(customerData.logradouro ?? '').trim() || 'N/A',
            bairro: String(customerData.bairro ?? '').trim() || 'N/A',
            cidade: String(customerData.cidade ?? '').trim() || 'N/A',
            estado: String(customerData.estado ?? '').trim() || 'N/A',
          },
          select: { id: true },
        });

        if (requestUserId) {
          await this.prisma.userCustomer.create({
            data: { userId: requestUserId, customerId: createdCustomer.id },
          });
        }

        customerId = createdCustomer.id;
        customerSource = 'new';
      }
    }

    if (!customerId) {
      throw new BadRequestException(
        'Não foi possível resolver o cliente da venda.',
      );
    }

    const providedServicesData = this.isPlainObject(
      normalizedSaleData.servicesData,
    )
      ? normalizedSaleData.servicesData
      : {};
    const providedDetails = this.isPlainObject(providedServicesData.details)
      ? providedServicesData.details
      : {};
    const providedTravel = this.isPlainObject(providedServicesData.travel)
      ? providedServicesData.travel
      : {};
    const normalizedSelectedServices = Array.isArray(saleData.selectedServices)
      ? saleData.selectedServices
          .map((service) => String(service ?? '').trim())
          .filter(Boolean)
      : [];
    const resolvedTravelType =
      this.mapTravelType(normalizedSaleData.travelType) ?? TravelType.ONE_WAY;

    const resolvedPaymentMethod =
      typeof saleData.paymentMethod === 'string' &&
      saleData.paymentMethod.trim().length > 0
        ? saleData.paymentMethod.trim()
        : String(providedDetails.paymentMethod ?? '').trim();

    const resolvedTotalValue =
      typeof saleData.totalValue === 'number' &&
      Number.isFinite(saleData.totalValue)
        ? saleData.totalValue
        : Number(providedDetails.totalValue ?? 0) || 0;

    // TODO: O status será atualizado via Lambda de faturamento do Wintour.
    // Regra obrigatória: nenhuma venda nasce aprovada neste fluxo,
    // independentemente de customerSource, servicesData recebido ou herança de tickets.
    const forcedStatus = 'PENDING';

    const nextServicesData = {
      ...providedServicesData,
      selectedServices: normalizedSelectedServices,
      travel:
        Object.keys(providedTravel).length > 0
          ? providedTravel
          : {
              origin: normalizedSaleData.origin,
              destination: normalizedSaleData.destination,
              departureDate: departureDate.toISOString(),
              returnDate: returnDate?.toISOString(),
              travelType: resolvedTravelType,
              saleDate: resolvedSaleDate.toISOString(),
            },
      details: {
        ...providedDetails,
        paymentMethod: resolvedPaymentMethod,
        totalValue: resolvedTotalValue,
      },
      // Força status PENDING no payload persistido (top-level servicesData.status).
      status: forcedStatus,
    };

    const createdSale = await this.prisma.sale.create({
      data: {
        customerId,
        userId: requestUserId,
        customerSource,
        integrationStatus: IntegrationStatus.pending,
        retryCount: 0,
        lastErrorMessage: null,
        lastIntegrationAt: null,
        sale_date: resolvedSaleDate,
        origin: normalizedSaleData.origin,
        destination: normalizedSaleData.destination,
        departureDate,
        returnDate,
        travelType: resolvedTravelType,
        servicesData: nextServicesData as Prisma.InputJsonValue,
        passengers: Array.isArray((saleData as any).passengers)
          ? {
              create: (saleData as any).passengers
                .map((passenger: { name?: string }) =>
                  String(passenger?.name ?? '').trim(),
                )
                .filter(Boolean)
                .map((fullName: string) => ({ fullName })),
            }
          : undefined,
      },
      include: {
        customer: true,
        passengers: true,
      },
    });

    return {
      sale: createdSale,
      customerSource,
    };
  }

  async updateSaleStatusFromWintour(
    saleId: string,
    status: string,
    errorMessage?: string,
  ): Promise<any> {
    const existingSale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        retryCount: true,
        lastErrorMessage: true,
      },
    });

    if (!existingSale) {
      throw new NotFoundException(`Venda com id '${saleId}' não encontrada.`);
    }

    const normalizedStatus = this.normalizeIntegrationStatus(status);
    const now = new Date();
    const updateData: Prisma.SaleUpdateInput = {
      lastIntegrationAt: now,
    };

    if (normalizedStatus === IntegrationStatus.success) {
      updateData.integrationStatus = IntegrationStatus.success;
      updateData.retryCount = 0;
      updateData.lastErrorMessage = null;
    } else if (normalizedStatus === IntegrationStatus.processing) {
      updateData.integrationStatus = IntegrationStatus.processing;
    } else if (normalizedStatus === IntegrationStatus.pending) {
      updateData.integrationStatus = IntegrationStatus.pending;
    } else {
      const retryCount = existingSale.retryCount + 1;
      updateData.integrationStatus =
        this.resolveIntegrationFailureStatus(retryCount);
      updateData.retryCount = retryCount;
      updateData.lastErrorMessage =
        errorMessage ?? existingSale.lastErrorMessage ?? status;
    }

    return this.prisma.sale.update({
      where: { id: saleId },
      data: updateData,
    });
  }

  async findIntegrationIssues(page = 1, limit = 10, sinceDate?: Date) {
    const skip = (page - 1) * limit;

    const baseWhere = {
      integrationStatus: {
        in: [IntegrationStatus.error, IntegrationStatus.manual_pending],
      },
      ...(sinceDate ? { lastIntegrationAt: { gte: sinceDate } } : {}),
    };

    const [sales, total, metrics] = await Promise.all([
      this.prisma.sale.findMany({
        where: baseWhere,
        include: {
          customer: {
            select: {
              id: true,
              nome_completo: true,
              cpf: true,
              email: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          lastIntegrationAt: 'desc',
        },
      }),
      this.prisma.sale.count({ where: baseWhere }),
      this.getIntegrationMetrics(),
    ]);

    const lastPage = Math.ceil(total / limit);

    return {
      data: sales.map((sale) => ({
        id: sale.id,
        customer: sale.customer,
        retryCount: sale.retryCount,
        lastErrorMessage: sale.lastErrorMessage,
        lastIntegrationAt: sale.lastIntegrationAt,
        integrationStatus: sale.integrationStatus,
        nextRetryAt: sale.nextRetryAt,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage,
      },
      metrics,
    };
  }

  async getIntegrationMetrics(): Promise<IntegrationMetricsDto> {
    const MAX_AUTO_RETRIES = 5;

    const [statusGroups, retryAgg, oldestIssue, retryableCount] =
      await Promise.all([
        // Contagem por status em uma única query
        this.prisma.sale.groupBy({
          by: ['integrationStatus'],
          where: {
            integrationStatus: {
              in: [IntegrationStatus.error, IntegrationStatus.manual_pending],
            },
          },
          _count: { id: true },
        }),
        // Média de retryCount (aggregate em todas as vendas com problema)
        this.prisma.sale.aggregate({
          where: {
            integrationStatus: {
              in: [IntegrationStatus.error, IntegrationStatus.manual_pending],
            },
          },
          _avg: { retryCount: true },
        }),
        // Venda mais antiga ainda com problema (menor lastIntegrationAt)
        this.prisma.sale.findFirst({
          where: {
            integrationStatus: {
              in: [IntegrationStatus.error, IntegrationStatus.manual_pending],
            },
            lastIntegrationAt: { not: null },
          },
          orderBy: { lastIntegrationAt: 'asc' },
          select: { lastIntegrationAt: true },
        }),
        // Quantas podem ainda ser reprocessadas automaticamente
        this.prisma.sale.count({
          where: {
            integrationStatus: IntegrationStatus.error,
            retryCount: { lt: MAX_AUTO_RETRIES },
          },
        }),
      ]);

    const errorCount =
      statusGroups.find((g) => g.integrationStatus === IntegrationStatus.error)
        ?._count.id ?? 0;
    const manualPendingCount =
      statusGroups.find(
        (g) => g.integrationStatus === IntegrationStatus.manual_pending,
      )?._count.id ?? 0;

    return {
      errorCount,
      manualPendingCount,
      totalIssues: errorCount + manualPendingCount,
      retryableCount,
      avgRetryCount: Math.round((retryAgg._avg.retryCount ?? 0) * 10) / 10,
      oldestIssueAt: oldestIssue?.lastIntegrationAt ?? null,
    };
  }

  private buildMinimalWintourPayload(
    sale: any,
    customer: any,
    nrArquivo: string,
  ): CreateWintourImportInput {
    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(
      now.getMonth() + 1
    )
      .toString()
      .padStart(2, '0')}/${now.getFullYear()}`;
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const servicesData =
      (sale.servicesData as Record<string, any> | null) ?? {};
    const details =
      (servicesData.details as Record<string, any> | undefined) ?? {};
    const travel =
      (servicesData.travel as Record<string, any> | undefined) ?? {};

    return {
      nr_arquivo: nrArquivo,
      data_geracao: details.data_geracao || formattedDate,
      hora_geracao: details.hora_geracao || formattedTime,
      nome_agencia: details.nome_agencia || 'RETRY',
      versao_xml: details.versao_xml || 4,
      tickets: [
        {
          customer_id: sale.customerId,
          cliente: customer.nome_completo,
          passageiro: customer.nome_completo,
          cid_dest_principal: sale.destination,
          data_lancamento: sale.departureDate,
          codigo_produto: details.codigo_produto,
          forma_de_pagamento: details.forma_de_pagamento,
          values: [
            {
              codigo: 'TOTAL',
              valor: details.totalValue || 0,
            },
          ],
          customer: {
            razao_social: customer.nome_completo,
            endereco: customer.endereco,
            bairro: customer.bairro,
            cep: customer.cep,
            cidade: customer.cidade,
            estado: customer.estado,
            celular: customer.telefone_celular,
            cpf_cnpj: customer.cpf,
            email: customer.email,
            dt_cadastro: customer.data_criacao_usuario,
          },
        },
      ],
    };
  }

  async retryWintourIntegration(saleId: string): Promise<any> {
    // ── Passo 1: leitura para validação e coleta de payload/customer ──────────
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { customer: true },
    });

    if (!sale) {
      throw new NotFoundException(`Venda com id '${saleId}' não encontrada.`);
    }

    // Valida se a venda está em um status que permite retry
    const retryableStatuses: IntegrationStatus[] = [
      IntegrationStatus.error,
      IntegrationStatus.manual_pending,
    ];
    if (!retryableStatuses.includes(sale.integrationStatus)) {
      // Já em execução → conflito de concorrência
      if (sale.integrationStatus === IntegrationStatus.processing) {
        throw new ConflictException(
          'Integração já está em andamento para esta venda.',
        );
      }
      throw new BadRequestException(
        `Venda com status '${sale.integrationStatus}' não pode ser reprocessada. ` +
          'Apenas vendas com status error ou manual_pending podem ser reprocessadas.',
      );
    }

    // Proteção contra retry looping: verifica cooldown mínimo de 2 minutos
    if (sale.lastIntegrationAt) {
      const msSinceLast = Date.now() - sale.lastIntegrationAt.getTime();
      if (msSinceLast < RETRY_COOLDOWN_MS) {
        const remainingSec = Math.ceil(
          (RETRY_COOLDOWN_MS - msSinceLast) / 1000,
        );
        throw new BadRequestException(
          `Aguarde ${remainingSec}s antes de reprocessar novamente (cooldown de 2 minutos entre tentativas).`,
        );
      }
    }

    // Verifica nextRetryAt se definido (agendamento de backoff)
    if (sale.nextRetryAt && sale.nextRetryAt > new Date()) {
      const remainingSec = Math.ceil(
        (sale.nextRetryAt.getTime() - Date.now()) / 1000,
      );
      throw new BadRequestException(
        `Venda agendada para retry em ${remainingSec}s. Aguarde antes de reprocessar manualmente.`,
      );
    }

    // ── Passo 2: payload (antes do claim para viabilizar checagem de idempotência) ──
    let payload: CreateWintourImportInput;
    if (
      sale.integrationPayload &&
      typeof sale.integrationPayload === 'object'
    ) {
      payload = sale.integrationPayload as unknown as CreateWintourImportInput;
    } else {
      const nrArquivo = `RETRY_${saleId}_${Date.now()}`;
      payload = this.buildMinimalWintourPayload(sale, sale.customer, nrArquivo);
    }

    // ── Passo 3: idempotência via idv_externo ─────────────────────────────────────
    // Se outro sale com a mesma chave de integração (idv_externo dos tickets)
    // já foi enviado ao Wintour com sucesso, marcamos este como success sem
    // repetir a chamada SOAP.
    const integrationKey = this.buildIntegrationKey(payload);
    const duplicate = await this.prisma.sale.findFirst({
      where: {
        integrationKey,
        integrationStatus: IntegrationStatus.success,
      },
      select: { id: true },
    });

    if (duplicate) {
      this.logger.log(
        `[retryWintourIntegration] Payload idempotente (key=${integrationKey}, ref=${duplicate.id}). Marcando ${saleId} como success sem reenviar.`,
      );
      await this.prisma.sale.update({
        where: { id: saleId },
        data: {
          integrationStatus: IntegrationStatus.success,
          retryCount: 0,
          lastErrorMessage: null,
          lastIntegrationAt: new Date(),
          nextRetryAt: null,
          integrationKey,
        },
      });
      await this.integrationLogService.create({
        saleId,
        attempt: sale.retryCount + 1,
        status: 'success',
        payload,
        response: { idempotent: true, ref: duplicate.id },
      });
      return this.findOne(saleId);
    }

    // ── Passo 4: claim atômico ────────────────────────────────────────────────
    // Faz UPDATE somente se o status ainda for error/manual_pending.
    // Se outra requisição concorrente já tiver alterado para processing,
    // o count retorna 0 e abortamos sem efeito colateral.
    const claimed = await this.prisma.sale.updateMany({
      where: {
        id: saleId,
        integrationStatus: { in: retryableStatuses },
      },
      data: {
        integrationStatus: IntegrationStatus.processing,
        lastIntegrationAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException(
        'Integração já está em andamento para esta venda (requisição concorrente detectada).',
      );
    }

    // ── Passo 5: envio ao Wintour ────────────────────────────────────────────
    try {
      // Tenta integração com Wintour
      const integrationResult = await this.sendToWintour(payload, {
        headerId: undefined,
      });

      // Marca como success
      await this.prisma.sale.update({
        where: { id: saleId },
        data: {
          integrationStatus: IntegrationStatus.success,
          retryCount: 0,
          lastErrorMessage: null,
          lastIntegrationAt: new Date(),
          nextRetryAt: null,
          integrationKey,
        },
      });

      await this.integrationLogService.create({
        saleId,
        attempt: sale.retryCount + 1,
        status: 'success',
        payload,
        response: {
          protocolo: integrationResult.protocolo,
          raw_response: integrationResult.raw_response,
        },
      });

      this.logger.log(
        `[retryWintourIntegration] Venda ${saleId} reprocessada com sucesso.`,
      );

      return this.findOne(saleId);
    } catch (error) {
      const errorMessage =
        error instanceof BadGatewayException
          ? (() => {
              const response = error.getResponse();
              return typeof response === 'string'
                ? response
                : response
                ? JSON.stringify(response)
                : error.message;
            })()
          : error instanceof Error
          ? error.message
          : String(error);

      // Incrementa retry count e determina novo status
      const currentSale = await this.prisma.sale.findUnique({
        where: { id: saleId },
        select: { retryCount: true },
      });

      const newRetryCount = (currentSale?.retryCount ?? 0) + 1;
      const newStatus = this.resolveIntegrationFailureStatus(newRetryCount);
      const nextRetryAt = this.calcNextRetryAt(newRetryCount);

      await this.prisma.sale.update({
        where: { id: saleId },
        data: {
          integrationStatus: newStatus,
          retryCount: newRetryCount,
          lastErrorMessage: errorMessage,
          lastIntegrationAt: new Date(),
          nextRetryAt,
        },
      });

      await this.integrationLogService.create({
        saleId,
        attempt: newRetryCount,
        status: 'error',
        payload,
        error: errorMessage,
      });

      this.logger.error(
        `[retryWintourIntegration] Venda ${saleId} falhou no retry. Tentativa ${newRetryCount}. Erro: ${errorMessage}`,
      );

      throw error;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleIntegrationRetry() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const wintourRetryConfig = this.configService.get('wintourRetry');

    if (!wintourRetryConfig?.enabled) {
      return;
    }

    // Re-entrancy guard: descarta o ciclo se o anterior ainda estiver rodando.
    if (this.isCronRunning) {
      this.logger.warn(
        '[scheduleIntegrationRetry] Ciclo anterior ainda em execução. Pulando este disparo.',
      );
      return;
    }

    this.isCronRunning = true;

    try {
      const startTime = Date.now();
      this.logger.debug(
        '[scheduleIntegrationRetry] Iniciando verificação de vendas com erro para retry automático.',
      );

      const maxRetries = wintourRetryConfig.maxRetries ?? 5;
      const maxSalesPerCycle = wintourRetryConfig.maxSalesPerCycle ?? 10;

      const now = new Date();

      // Busca vendas com status "error", retryCount < maxRetries e nextRetryAt vencido (ou nulo)
      const failedSales = await this.prisma.sale.findMany({
        where: {
          integrationStatus: IntegrationStatus.error,
          retryCount: { lt: maxRetries },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        select: {
          id: true,
          retryCount: true,
          lastIntegrationAt: true,
          nextRetryAt: true,
        },
        take: maxSalesPerCycle,
      });

      if (!failedSales.length) {
        this.logger.debug(
          '[scheduleIntegrationRetry] Nenhuma venda com erro para reprocessar.',
        );
        return;
      }

      let successCount = 0;
      let failureCount = 0;

      for (const sale of failedSales) {
        try {
          await this.retryWintourIntegration(sale.id);
          successCount++;
          this.logger.log(
            `[scheduleIntegrationRetry] ✓ Venda ${sale.id} reprocessada com sucesso.`,
          );
        } catch (error) {
          failureCount++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[scheduleIntegrationRetry] ✗ Falha ao reprocessar venda ${sale.id}: ${errorMsg}`,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `[scheduleIntegrationRetry] Ciclo concluído: ${successCount} sucesso, ${failureCount} falha, ${duration}ms total.`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[scheduleIntegrationRetry] Erro crítico no agendador: ${errorMsg}`,
      );
    } finally {
      this.isCronRunning = false;
    }
  }

  private async createSalesFromHeader(
    header: {
      id: string;
      tickets: Array<{
        id: string;
        customer_id: string | null;
        customerId?: string | null;
        customer_record: { id: string } | null;
        customer_data: { cpf_cnpj: string | null } | null;
        cid_dest_principal: string | null;
        data_lancamento: Date | null;
        codigo_produto: string | null;
        forma_de_pagamento: string | null;
        cliente: string | null;
        passageiro: string | null;
        values: Array<{ codigo: string; valor: number }>;
      }>;
    },
    nomeAgencia: string,
    nrArquivo: string,
    paymentDetails?: {
      paymentMethod?: string;
      totalValue?: number;
      entryValue?: number;
      installments?: string;
      installmentValue?: number;
      notes?: string;
      cardBrand?: string;
    },
    selectedServicesInput?: string[],
    servicesDetailsInput?: Record<string, unknown>,
    userId?: string,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
    integrationPayload?: CreateWintourImportInput,
  ): Promise<{ created: number; saleId: string | null }> {
    let created = 0;
    let skipped = 0;
    let createdSaleId: string | null = null;

    let customerId: string | null = null;
    let destination = '';
    let departureDate: Date | null = null;
    let saleDate: Date | null =
      this.resolveSaleDateFromServices(servicesDetailsInput);
    let customerName = '';
    let totalValue = 0;
    const selectedServices = new Set<string>();
    const paymentMethods = new Set<string>();
    const providedServicesDetails = this.isPlainObject(servicesDetailsInput)
      ? servicesDetailsInput
      : {};
    const providedDetails = this.isPlainObject(providedServicesDetails.details)
      ? (providedServicesDetails.details as Record<string, unknown>)
      : {};
    const providedTravel = this.isPlainObject(providedServicesDetails.travel)
      ? (providedServicesDetails.travel as Record<string, unknown>)
      : {};
    const normalizedSelectedServices = Array.isArray(selectedServicesInput)
      ? selectedServicesInput
          .map((service) => String(service ?? '').trim())
          .filter(Boolean)
      : [];

    for (const ticket of header.tickets) {
      try {
        let resolvedCustomerId: string | null =
          ticket.customer_id ??
          ticket.customerId ??
          ticket.customer_record?.id ??
          null;

        if (!resolvedCustomerId && ticket.customer_data?.cpf_cnpj) {
          const rawDocument = ticket.customer_data.cpf_cnpj;
          const normalizedDocument = this.normalizeDocument(rawDocument);
          const customer = await this.findCustomerByDocument(rawDocument);

          resolvedCustomerId = customer?.id ?? null;

          if (resolvedCustomerId) {
            this.logger.log(
              `[createSalesFromHeader] Ticket ${
                ticket.id
              } resolveu customer por documento=${
                normalizedDocument || rawDocument
              }`,
            );
          }
        }

        if (!resolvedCustomerId) {
          skipped++;
          this.logger.warn(
            `[createSalesFromHeader] Ticket ${ticket.id} ignorado: customer_id nao resolvido`,
          );
          continue;
        }

        customerId = customerId ?? resolvedCustomerId;
        destination = destination || ticket.cid_dest_principal || '';
        customerName =
          customerName || ticket.cliente || ticket.passageiro || '';

        if (ticket.data_lancamento) {
          departureDate = departureDate
            ? new Date(
                Math.min(
                  departureDate.getTime(),
                  ticket.data_lancamento.getTime(),
                ),
              )
            : ticket.data_lancamento;

          saleDate = saleDate ?? ticket.data_lancamento;
        }

        const ticketTotal =
          ticket.values.find((value) => value.codigo === 'TOTAL')?.valor ?? 0;
        totalValue += ticketTotal;

        if (ticket.codigo_produto) {
          selectedServices.add(ticket.codigo_produto);
        }

        if (ticket.forma_de_pagamento) {
          paymentMethods.add(ticket.forma_de_pagamento);
        }
      } catch (error) {
        skipped++;
        this.logger.error(
          `[createSalesFromHeader] Erro ao processar ticket ${ticket.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (customerId) {
      const resolvedTotalValue =
        typeof paymentDetails?.totalValue === 'number' &&
        Number.isFinite(paymentDetails.totalValue)
          ? paymentDetails.totalValue
          : totalValue;
      const resolvedPaymentMethod =
        typeof paymentDetails?.paymentMethod === 'string' &&
        paymentDetails.paymentMethod.trim().length > 0
          ? paymentDetails.paymentMethod.trim()
          : Array.from(paymentMethods).join(', ');
      const resolvedSelectedServices =
        normalizedSelectedServices.length > 0
          ? normalizedSelectedServices
          : Array.from(selectedServices);
      // TODO: O status será atualizado via Lambda de faturamento do Wintour dentro deste bloco também.
      const forcedStatus = 'PENDING';

      const createdSale = await prismaClient.sale.create({
        data: {
          userId: userId ?? undefined,
          customerId,
          integrationStatus: IntegrationStatus.pending,
          retryCount: 0,
          lastErrorMessage: null,
          lastIntegrationAt: null,
          integrationPayload: integrationPayload
            ? (integrationPayload as unknown as Prisma.InputJsonValue)
            : null,
          integrationKey: integrationPayload
            ? this.buildIntegrationKey(integrationPayload)
            : null,
          sale_date: saleDate ?? departureDate ?? new Date(),
          origin: nomeAgencia ?? '',
          destination,
          departureDate: departureDate ?? new Date(),
          travelType: 'ONE_WAY',
          servicesData: {
            ...providedServicesDetails,
            travel:
              Object.keys(providedTravel).length > 0
                ? providedTravel
                : {
                    origin: nomeAgencia ?? '',
                    destination,
                    departureDate: departureDate
                      ? departureDate.toISOString()
                      : undefined,
                    returnDate: undefined,
                    travelType: 'ONE_WAY',
                  },
            status: forcedStatus,
            selectedServices: resolvedSelectedServices,
            details: {
              ...providedDetails,
              totalValue: resolvedTotalValue,
              paymentMethod: resolvedPaymentMethod,
              entryValue:
                typeof paymentDetails?.entryValue === 'number' &&
                Number.isFinite(paymentDetails.entryValue)
                  ? paymentDetails.entryValue
                  : 0,
              installments: paymentDetails?.installments ?? '',
              installmentValue:
                typeof paymentDetails?.installmentValue === 'number' &&
                Number.isFinite(paymentDetails.installmentValue)
                  ? paymentDetails.installmentValue
                  : 0,
              notes: paymentDetails?.notes ?? '',
              cardBrand: paymentDetails?.cardBrand ?? '',
              cliente: customerName,
              nr_arquivo: nrArquivo,
              wintourHeaderId: header.id,
            },
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      createdSaleId = createdSale.id;
      created = 1;
    }

    this.logger.log(
      `[createSalesFromHeader] Header ${header.id}: sales criadas=${created}, ignoradas=${skipped}`,
    );

    return { created, saleId: createdSaleId };
  }
}
