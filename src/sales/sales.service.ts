import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { CreateWintourImportInput } from './dto/create-wintour-import.input';
import { Customer } from '../customers/entities/customer.entity';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  private getIntegrationConfig() {
    const url =
      process.env.WINTOUR_SOAP_URL ??
      'https://www.digirotas.com/HubInterfacesSoap/soap/IHubInterfaces';
    const pin = process.env.WINTOUR_SOAP_PIN ?? 'xDIy1d9lSlTQZy7z7MP9zBKcAQ';
    const livre = process.env.WINTOUR_SOAP_LIVRE ?? '';
    const namespace =
      process.env.WINTOUR_SOAP_NAMESPACE ?? 'http://tempuri.org/';
    const soapAction =
      process.env.WINTOUR_SOAP_ACTION ?? `${namespace}importaArquivo2`;

    if (!pin) {
      throw new ServiceUnavailableException(
        'Integracao Wintour nao configurada. Defina a variavel WINTOUR_SOAP_PIN.',
      );
    }

    return {
      url,
      pin,
      livre,
      namespace,
      soapAction,
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

  private buildSoapEnvelope(
    pin: string,
    arquivoBase64: string,
    livre: string,
    namespace: string,
  ) {
    return `<?xml version="1.0" encoding="utf-8"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${namespace}">
      <soapenv:Header/>
      <soapenv:Body>
        <web:importaArquivo2>
          <web:aPin>${pin}</web:aPin>
          <web:aArquivo>${arquivoBase64}</web:aArquivo>
          <web:aLivre>${livre}</web:aLivre>
        </web:importaArquivo2>
      </soapenv:Body>
    </soapenv:Envelope>`;
  }

  private extractSoapValue(xml: string, tagName: string) {
    const regex = new RegExp(
      `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      'i',
    );
    const match = xml.match(regex);
    return match?.[1]?.trim();
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

    const envelope = this.buildSoapEnvelope(
      config.pin,
      arquivoBase64,
      config.livre,
      config.namespace,
    );

    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: config.soapAction,
      },
      body: envelope,
    });

    const rawResponse = await response.text();
    const faultString = this.extractSoapValue(rawResponse, 'faultstring');
    const resultValue =
      this.extractSoapValue(rawResponse, 'importaArquivo2Result') ??
      this.extractSoapValue(rawResponse, 'return') ??
      rawResponse;

    if (
      !response.ok ||
      faultString ||
      this.isIntegrationErrorMessage(resultValue)
    ) {
      throw new BadGatewayException({
        message: `Falha na integracao Wintour: ${
          (faultString ??
            (this.isIntegrationErrorMessage(resultValue)
              ? resultValue
              : undefined) ??
            response.statusText) ||
          'erro desconhecido'
        }`,
        raw_response: rawResponse,
        status_code: response.status,
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

  private buildIntegrationPayload(
    data: CreateWintourImportInput,
    customerMap: Map<string, Customer>,
  ): CreateWintourImportInput {
    return {
      ...data,
      tickets: data.tickets.map((ticket) => {
        const linkedCustomer = ticket.customer_id
          ? customerMap.get(ticket.customer_id)
          : undefined;

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
      versao_xml,
      tickets,
    } = data;
    await this.getLinkedUsers(tickets);
    const customerMap = await this.getLinkedCustomers(tickets);
    const integrationPayload = this.buildIntegrationPayload(data, customerMap);

    const localImport = await this.prisma.wintourHeader.create({
      data: {
        nr_arquivo,
        data_geracao,
        hora_geracao,
        nome_agencia,
        versao_xml,
        integration_status: 'pending',
        tickets: {
          create: tickets.map((ticket) => {
            const linkedCustomer = ticket.customer_id
              ? customerMap.get(ticket.customer_id)
              : undefined;

            const customerSnapshot =
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
              id_posto_atendimento: ticket.id_posto_atendimento,
              posto_atendimento: ticket.posto_atendimento,
              dt_interna_cadastro: this.parseDate(ticket.dt_interna_cadastro),
              data_lancamento: this.parseDate(ticket.data_lancamento),
              codigo_produto: ticket.codigo_produto,
              prestador_svc: ticket.prestador_svc,
              tour_code: ticket.tour_code,
              forma_de_pagamento: ticket.forma_de_pagamento,
              cartao_mp: ticket.cartao_mp,
              cartao_cp: ticket.cartao_cp,
              conta_taxas_adicionais: ticket.conta_taxas_adicionais,
              conta_taxas_adicionais2: ticket.conta_taxas_adicionais2,
              cod_outras_txs: ticket.cod_outras_txs,
              cod_outras_txs2: ticket.cod_outras_txs2,
              cod_outras_txs3: ticket.cod_outras_txs3,
              cta_tx_emissao: ticket.cta_tx_emissao,
              ccustos_agencia: ticket.ccustos_agencia,
              moeda: ticket.moeda,
              emissor: ticket.emissor,
              promotor: ticket.promotor,
              gerente: ticket.gerente,
              cliente: ticket.cliente ?? linkedCustomer?.nome_completo,
              ccustos_cliente: ticket.ccustos_cliente,
              numero_requisicao: ticket.numero_requisicao,
              data_requisicao: this.parseDate(ticket.data_requisicao),
              tipo_passageiro: ticket.tipo_passageiro,
              solicitante: ticket.solicitante,
              aprovador: ticket.aprovador,
              departamento: ticket.departamento,
              matricula: ticket.matricula,
              num_cc: ticket.num_cc,
              cod_autorizacao_cc: ticket.cod_autorizacao_cc,
              tipo_domest_inter: ticket.tipo_domest_inter,
              scdp: ticket.scdp,
              info_adicionais: ticket.info_adicionais,
              info_internas: ticket.info_internas,
              canal_captacao: ticket.canal_captacao,
              cta_du_rav: ticket.cta_du_rav,
              situacao_contabil: ticket.situacao_contabil,
              projeto: ticket.projeto,
              motivo_viagem: ticket.motivo_viagem,
              motivo_recusa: ticket.motivo_recusa,
              tipo_roteiro_aereo: ticket.tipo_roteiro_aereo,
              destino_rot_aereo: ticket.destino_rot_aereo,
              canal_venda: ticket.canal_venda,
              multi_ccustos_cli: ticket.multi_ccustos_cli,
              tipo_roteiro: ticket.tipo_roteiro,
              tarifa_net: ticket.tarifa_net,
              tipo_emissao: ticket.tipo_emissao,
              co2_kg: ticket.co2_kg,
              cid_dest_principal: ticket.cid_dest_principal,
              apportionments: {
                create: ticket.apportionments?.map((a) => ({
                  ccustos_cliente: a.ccustos_cliente,
                  percentual: a.percentual,
                })),
              },
              values: {
                create: ticket.values?.map((v) => ({
                  codigo: v.codigo,
                  valor: v.valor,
                  valor_df: v.valor_df,
                  valor_mp: v.valor_mp,
                })),
              },
              expiry_dates: {
                create: ticket.expiry?.map((e) => ({
                  codigo: e.codigo,
                  valor: this.parseDate(e.valor) || new Date(),
                })),
              },
              air_data: ticket.sections
                ? {
                    create: {
                      sections: {
                        create: ticket.sections.map((s) => ({
                          cia_iata: s.cia_iata,
                          numero_voo: s.numero_voo,
                          aeroporto_origem: s.aeroporto_origem,
                          aeroporto_destino: s.aeroporto_destino,
                          data_partida: this.parseDate(s.data_partida),
                          hora_partida: s.hora_partida,
                          data_chegada: this.parseDate(s.data_chegada),
                          hora_chegada: s.hora_chegada,
                          classe: s.classe,
                          base_tarifaria: s.base_tarifaria,
                          ticket_designator: s.ticket_designator,
                          conexao_arp_partida: s.conexao_arp_partida,
                          conexao_arp_chegada: s.conexao_arp_chegada,
                          co2_kg: s.co2_kg,
                        })),
                      },
                    },
                  }
                : undefined,
              hotel_data: ticket.hotel
                ? {
                    create: {
                      nr_apts: ticket.hotel.nr_apts,
                      categ_apt: ticket.hotel.categ_apt,
                      tipo_apt: ticket.hotel.tipo_apt,
                      dt_check_in: this.parseDate(ticket.hotel.dt_check_in),
                      dt_check_out: this.parseDate(ticket.hotel.dt_check_out),
                      nr_hospedes: ticket.hotel.nr_hospedes,
                      reg_alimentacao: ticket.hotel.reg_alimentacao,
                      cod_tipo_pagto: ticket.hotel.cod_tipo_pagto,
                      dt_confirmacao: this.parseDate(
                        ticket.hotel.dt_confirmacao,
                      ),
                      confirmado_por: ticket.hotel.confirmado_por,
                    },
                  }
                : undefined,
              customer_data: customerSnapshot
                ? {
                    create: {
                      acao_cli: customerSnapshot.acao_cli,
                      razao_social: customerSnapshot.razao_social,
                      tipo_endereco: customerSnapshot.tipo_endereco,
                      endereco: customerSnapshot.endereco,
                      numero: customerSnapshot.numero,
                      complemento: customerSnapshot.complemento,
                      bairro: customerSnapshot.bairro,
                      cep: customerSnapshot.cep,
                      cidade: customerSnapshot.cidade,
                      estado: customerSnapshot.estado,
                      tipo_fj: customerSnapshot.tipo_fj,
                      dt_nasc: this.parseDate(customerSnapshot.dt_nasc),
                      tel: customerSnapshot.tel,
                      celular: customerSnapshot.celular,
                      cpf_cnpj: customerSnapshot.cpf_cnpj,
                      insc_identidade: customerSnapshot.insc_identidade,
                      sexo: customerSnapshot.sexo,
                      dt_cadastro: this.parseDate(customerSnapshot.dt_cadastro),
                      email: customerSnapshot.email,
                    },
                  }
                : undefined,
              sales_origins: {
                create: ticket.sales_origin?.map((so) => ({
                  item: so.item,
                })),
              },
              conjugates: {
                create: ticket.ticket_conjugate?.map((c) => ({
                  item: c.item,
                })),
              },
              location_data: ticket.location
                ? {
                    create: {
                      cidade_retirada: ticket.location.cidade_retirada,
                      local_retirada: ticket.location.local_retirada,
                      dt_retirada: this.parseDate(ticket.location.dt_retirada),
                      hr_retirada: ticket.location.hr_retirada,
                      local_devolucao: ticket.location.local_devolucao,
                      dt_devolucao: this.parseDate(
                        ticket.location.dt_devolucao,
                      ),
                      hr_devolucao: ticket.location.hr_devolucao,
                      categ_veiculo: ticket.location.categ_veiculo,
                      cod_tipo_pagto: ticket.location.cod_tipo_pagto,
                      dt_confirmacao: this.parseDate(
                        ticket.location.dt_confirmacao,
                      ),
                      confirmado_por: ticket.location.confirmado_por,
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
              transfer_data: ticket.transfer
                ? {
                    create: {
                      hotel_transfer_in: ticket.transfer.hotel_transfer_in,
                      cia_iata_chegada: ticket.transfer.cia_iata_chegada,
                      numero_voo_chegada: ticket.transfer.numero_voo_chegada,
                      data_chegada_voo: this.parseDate(
                        ticket.transfer.data_chegada_voo,
                      ),
                      hora_chegada_voo: ticket.transfer.hora_chegada_voo,
                      aeroporto_chegada: ticket.transfer.aeroporto_chegada,
                      hotel_transfer_out: ticket.transfer.hotel_transfer_out,
                      data_apanhar_pax: this.parseDate(
                        ticket.transfer.data_apanhar_pax,
                      ),
                      hora_apanhar_pax: ticket.transfer.hora_apanhar_pax,
                      cia_iata_partida: ticket.transfer.cia_iata_partida,
                      numero_voo_partida: ticket.transfer.numero_voo_partida,
                      data_partida_voo: this.parseDate(
                        ticket.transfer.data_partida_voo,
                      ),
                      hora_partida_voo: ticket.transfer.hora_partida_voo,
                      aeroporto_partida: ticket.transfer.aeroporto_partida,
                    },
                  }
                : undefined,
              wintour_other: ticket.other
                ? {
                    create: {
                      descricao: ticket.other.descricao,
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
      if (localImport?.id) {
        const errorResponse =
          error instanceof BadGatewayException
            ? error.getResponse()
            : undefined;
        const serializedResponse =
          typeof errorResponse === 'string'
            ? errorResponse
            : errorResponse
            ? JSON.stringify(errorResponse)
            : error instanceof Error
            ? error.message
            : 'erro desconhecido';

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

      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      throw new BadGatewayException({
        message: `Falha na integracao Wintour: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      });
    }
  }
}
