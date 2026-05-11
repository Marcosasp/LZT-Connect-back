import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { Prisma, TravelType } from '@prisma/client';
import {
  CreateWintourImportInput,
  WintourCustomerInput,
} from './dto/create-wintour-import.input';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Customer } from '../customers/entities/customer.entity';
import { WintourSoapService } from './wintour-soap.service';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly wintourSoapService: WintourSoapService,
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

  private async sendToWintour(data: CreateWintourImportInput) {
    const config = this.getIntegrationConfig();
    const xml = this.buildWintourXml(data);

    const arquivoBase64 = Buffer.from(xml, 'latin1').toString('base64');

    const { rawResponse, resultValue } =
      await this.wintourSoapService.importarArquivo2({
        aPin: config.pin,
        aArquivo: arquivoBase64,
        aLivre: config.livre,
      });

    if (this.isIntegrationErrorMessage(resultValue)) {
      throw new BadGatewayException({
        message: `Falha na integracao Wintour: ${
          resultValue || 'retorno invalido do servico SOAP'
        }`,
        raw_response: rawResponse,
        status_code: 502,
      });
    }

    return {
      protocolo: resultValue,
      raw_response: rawResponse,
      xml_enviado: xml,
    };
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

  async createWintourImport(data: CreateWintourImportInput) {
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

    const localImport = await this.prisma.$transaction(async (tx) => {
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

      if (createdHeader.tickets?.length) {
        await this.createSalesFromHeader(
          {
            id: createdHeader.id,
            tickets: createdHeader.tickets,
          },
          nome_agencia,
          nr_arquivo,
          paymentDetails,
          selectedServices,
          servicesDetails,
          tx,
        );
      }

      return createdHeader;
    });

    try {
      const integration = await this.sendToWintour(integrationPayload);
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
    userId,
  }: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    userId?: string;
  }) {
    console.log('Filtro de data recebido:', { startDate, endDate, userId });

    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.max(1, Number(limit) || 10);
    const skip = (normalizedPage - 1) * normalizedLimit;
    const startDateBoundary = this.parseDateBoundary(startDate, 'start');
    const endDateBoundary = this.parseDateBoundary(endDate, 'end');

    const saleDateRange: Prisma.DateTimeFilter = {};

    if (startDateBoundary) {
      saleDateRange.gte = startDateBoundary;
    }

    if (endDateBoundary) {
      saleDateRange.lte = endDateBoundary;
    }

    const where: Prisma.SaleWhereInput = {
      ...(Object.keys(saleDateRange).length > 0
        ? {
            sale_date: saleDateRange,
          }
        : {}),
    };

    console.log('Filtro Final Prisma:', JSON.stringify(where));

    // Build groups in descending sale_date order so pagination follows the manual sale date.
    const allSales = await this.prisma.sale.findMany({
      where,
      orderBy: [{ sale_date: 'desc' }, { updated_at: 'desc' }],
      select: {
        id: true,
        servicesData: true,
      },
    });

    const filteredCount = await this.prisma.sale.count({ where });

    const groups = new Map<
      string,
      {
        representativeId: string;
        totalValue: number;
        selectedServices: Set<string>;
        paymentMethods: Set<string>;
      }
    >();

    for (const sale of allSales) {
      const data = (sale.servicesData as Record<string, any> | null) ?? {};
      const details = (data.details as Record<string, any> | undefined) ?? {};
      const groupKey = details.wintourHeaderId ?? sale.id;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          representativeId: sale.id,
          totalValue: 0,
          selectedServices: new Set<string>(),
          paymentMethods: new Set<string>(),
        });
      }

      const group = groups.get(groupKey)!;
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

    const orderedGroupKeys = Array.from(groups.keys());
    const total = filteredCount;
    const pageGroupKeys = orderedGroupKeys.slice(skip, skip + normalizedLimit);
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
      meta: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        lastPage: Math.ceil(total / normalizedLimit) || 1,
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
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    let created = 0;
    let skipped = 0;

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
      const status = resolvedTotalValue > 0 ? 'APPROVED' : 'PENDING';

      await prismaClient.sale.create({
        data: {
          customerId,
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
            status,
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
      });
      created = 1;
    }

    this.logger.log(
      `[createSalesFromHeader] Header ${header.id}: sales criadas=${created}, ignoradas=${skipped}`,
    );

    return created;
  }
}
