import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Customer } from '../../customers/entities/customer.entity';

export class WintourApportionment {
  @ApiProperty()
  ccustos_cliente: string;
  @ApiProperty()
  percentual: number;
}

export class WintourValue {
  @ApiProperty()
  codigo: string;
  @ApiProperty()
  valor: number;
  @ApiProperty({ required: false })
  valor_df?: number;
  @ApiProperty({ required: false })
  valor_mp?: number;
}

export class WintourExpiry {
  @ApiProperty()
  codigo: string;
  @ApiProperty()
  valor: Date;
}

export class WintourSection {
  @ApiProperty()
  cia_iata: string;
  @ApiProperty({ required: false })
  numero_voo?: string;
  @ApiProperty()
  aeroporto_origem: string;
  @ApiProperty()
  aeroporto_destino: string;
  @ApiProperty({ required: false })
  data_partida?: Date;
  @ApiProperty({ required: false })
  hora_partida?: string;
  @ApiProperty({ required: false })
  data_chegada?: Date;
  @ApiProperty({ required: false })
  hora_chegada?: string;
  @ApiProperty({ required: false })
  classe?: string;
  @ApiProperty({ required: false })
  base_tarifaria?: string;
  @ApiProperty({ required: false })
  ticket_designator?: string;
  @ApiProperty({ required: false })
  conexao_arp_partida?: number;
  @ApiProperty({ required: false })
  conexao_arp_chegada?: number;
  @ApiProperty({ required: false })
  co2_kg?: number;
}

export class WintourAir {
  @ApiProperty({ type: () => [WintourSection] })
  sections: WintourSection[];
}

export class WintourHotel {
  @ApiProperty({ required: false })
  nr_apts?: number;
  @ApiProperty({ required: false })
  categ_apt?: string;
  @ApiProperty({ required: false })
  tipo_apt?: string;
  @ApiProperty({ required: false })
  dt_check_in?: Date;
  @ApiProperty({ required: false })
  dt_check_out?: Date;
  @ApiProperty({ required: false })
  nr_hospedes?: number;
  @ApiProperty({ required: false })
  reg_alimentacao?: string;
  @ApiProperty({ required: false })
  cod_tipo_pagto?: string;
  @ApiProperty({ required: false })
  dt_confirmacao?: Date;
  @ApiProperty({ required: false })
  confirmado_por?: string;
}

export class WintourCustomerData {
  @ApiProperty({ required: false })
  acao_cli?: string;
  @ApiProperty({ required: false })
  razao_social?: string;
  @ApiProperty({ required: false })
  tipo_endereco?: string;
  @ApiProperty({ required: false })
  endereco?: string;
  @ApiProperty({ required: false })
  numero?: string;
  @ApiProperty({ required: false })
  complemento?: string;
  @ApiProperty({ required: false })
  bairro?: string;
  @ApiProperty({ required: false })
  cep?: string;
  @ApiProperty({ required: false })
  cidade?: string;
  @ApiProperty({ required: false })
  estado?: string;
  @ApiProperty({ required: false })
  tipo_fj?: string;
  @ApiProperty({ required: false })
  dt_nasc?: Date;
  @ApiProperty({ required: false })
  tel?: string;
  @ApiProperty({ required: false })
  celular?: string;
  @ApiProperty({ required: false })
  cpf_cnpj?: string;
  @ApiProperty({ required: false })
  insc_identidade?: string;
  @ApiProperty({ required: false })
  sexo?: string;
  @ApiProperty({ required: false })
  dt_cadastro?: Date;
  @ApiProperty({ required: false })
  email?: string;
}

export class WintourSalesOrigin {
  @ApiProperty()
  item: number;
}

export class WintourTicketConjugate {
  @ApiProperty()
  item: string;
}

export class WintourLocation {
  @ApiProperty({ required: false })
  cidade_retirada?: string;
  @ApiProperty({ required: false })
  local_retirada?: string;
  @ApiProperty({ required: false })
  dt_retirada?: Date;
  @ApiProperty({ required: false })
  hr_retirada?: string;
  @ApiProperty({ required: false })
  local_devolucao?: string;
  @ApiProperty({ required: false })
  dt_devolucao?: Date;
  @ApiProperty({ required: false })
  hr_devolucao?: string;
  @ApiProperty({ required: false })
  categ_veiculo?: string;
  @ApiProperty({ required: false })
  cod_tipo_pagto?: string;
  @ApiProperty({ required: false })
  dt_confirmacao?: Date;
  @ApiProperty({ required: false })
  confirmado_por?: string;
}

export class WintourPackage {
  @ApiProperty({ required: false })
  cid_dest_principal?: string;
  @ApiProperty({ required: false })
  data_inicio_pacote?: Date;
  @ApiProperty({ required: false })
  data_fim_pacote?: Date;
  @ApiProperty({ required: false })
  descricao_pacote?: string;
}

export class WintourOtherService {
  @ApiProperty({ required: false })
  cid_dest_principal?: string;
  @ApiProperty({ required: false })
  data_inicio_outros_svcs?: Date;
  @ApiProperty({ required: false })
  data_fim_outros_svcs?: Date;
  @ApiProperty({ required: false })
  descricao_outros_svcs?: string;
}

export class WintourTransfer {
  @ApiProperty({ required: false })
  hotel_transfer_in?: string;
  @ApiProperty({ required: false })
  cia_iata_chegada?: string;
  @ApiProperty({ required: false })
  numero_voo_chegada?: string;
  @ApiProperty({ required: false })
  data_chegada_voo?: Date;
  @ApiProperty({ required: false })
  hora_chegada_voo?: string;
  @ApiProperty({ required: false })
  aeroporto_chegada?: string;
  @ApiProperty({ required: false })
  hotel_transfer_out?: string;
  @ApiProperty({ required: false })
  data_apanhar_pax?: Date;
  @ApiProperty({ required: false })
  hora_apanhar_pax?: string;
  @ApiProperty({ required: false })
  cia_iata_partida?: string;
  @ApiProperty({ required: false })
  numero_voo_partida?: string;
  @ApiProperty({ required: false })
  data_partida_voo?: Date;
  @ApiProperty({ required: false })
  hora_partida_voo?: string;
  @ApiProperty({ required: false })
  aeroporto_partida?: string;
}

export class WintourOther {
  @ApiProperty()
  descricao: string;
}

export class WintourTicket extends BaseEntity {
  @ApiProperty({ required: false })
  num_bilhete?: string;

  @ApiProperty({ required: false })
  user_id?: string;

  @ApiProperty({ type: () => User, required: false })
  user?: User;

  @ApiProperty({ required: false })
  customer_id?: string;

  @ApiProperty({ type: () => Customer, required: false })
  customer_record?: Customer;

  @ApiProperty({ required: false })
  localizador?: string;

  @ApiProperty({ required: false })
  fornecedor?: string;

  @ApiProperty({ required: false })
  passageiro?: string;

  @ApiProperty({ required: false })
  idv_externo?: string;

  @ApiProperty({ required: false })
  id_posto_atendimento?: number;

  @ApiProperty({ required: false })
  posto_atendimento?: string;

  @ApiProperty({ required: false })
  dt_interna_cadastro?: Date;

  @ApiProperty({ required: false })
  data_lancamento?: Date;

  @ApiProperty({ required: false })
  codigo_produto?: string;

  @ApiProperty({ required: false })
  prestador_svc?: string;

  @ApiProperty({ required: false })
  tour_code?: string;

  @ApiProperty({ required: false })
  forma_de_pagamento?: string;

  @ApiProperty({ required: false })
  cartao_mp?: string;

  @ApiProperty({ required: false })
  cartao_cp?: string;

  @ApiProperty({ required: false })
  conta_taxas_adicionais?: string;

  @ApiProperty({ required: false })
  conta_taxas_adicionais2?: string;

  @ApiProperty({ required: false })
  cod_outras_txs?: string;

  @ApiProperty({ required: false })
  cod_outras_txs2?: string;

  @ApiProperty({ required: false })
  cod_outras_txs3?: string;

  @ApiProperty({ required: false })
  cta_tx_emissao?: string;

  @ApiProperty({ required: false })
  ccustos_agencia?: string;

  @ApiProperty({ required: false })
  moeda?: string;

  @ApiProperty({ required: false })
  emissor?: string;

  @ApiProperty({ required: false })
  promotor?: string;

  @ApiProperty({ required: false })
  gerente?: string;

  @ApiProperty({ required: false })
  cliente?: string;

  @ApiProperty({ required: false })
  ccustos_cliente?: string;

  @ApiProperty({ required: false })
  numero_requisicao?: string;

  @ApiProperty({ required: false })
  data_requisicao?: Date;

  @ApiProperty({ required: false })
  tipo_passageiro?: string;

  @ApiProperty({ required: false })
  solicitante?: string;

  @ApiProperty({ required: false })
  aprovador?: string;

  @ApiProperty({ required: false })
  departamento?: string;

  @ApiProperty({ required: false })
  matricula?: string;

  @ApiProperty({ required: false })
  num_cc?: string;

  @ApiProperty({ required: false })
  cod_autorizacao_cc?: string;

  @ApiProperty({ required: false })
  tipo_domest_inter?: string;

  @ApiProperty({ required: false })
  scdp?: string;

  @ApiProperty({ required: false })
  info_adicionais?: string;

  @ApiProperty({ required: false })
  info_internas?: string;

  @ApiProperty({ required: false })
  canal_captacao?: string;

  @ApiProperty({ required: false })
  cta_du_rav?: string;

  @ApiProperty({ required: false })
  situacao_contabil?: string;

  @ApiProperty({ required: false })
  projeto?: string;

  @ApiProperty({ required: false })
  motivo_viagem?: string;

  @ApiProperty({ required: false })
  motivo_recusa?: string;

  @ApiProperty({ required: false })
  tipo_roteiro_aereo?: string;

  @ApiProperty({ required: false })
  destino_rot_aereo?: string;

  @ApiProperty({ required: false })
  canal_venda?: string;

  @ApiProperty({ required: false })
  multi_ccustos_cli?: string;

  @ApiProperty({ required: false })
  tipo_roteiro?: number;

  @ApiProperty({ required: false })
  tarifa_net?: number;

  @ApiProperty({ required: false })
  tipo_emissao?: string;

  @ApiProperty({ required: false })
  co2_kg?: number;

  @ApiProperty({ required: false })
  cid_dest_principal?: string;

  @ApiProperty({ type: () => [WintourApportionment], required: false })
  apportionments?: WintourApportionment[];

  @ApiProperty({ type: () => [WintourValue], required: false })
  values?: WintourValue[];

  @ApiProperty({ type: () => [WintourExpiry], required: false })
  expiry?: WintourExpiry[];

  @ApiProperty({ type: () => WintourAir, required: false })
  air_data?: WintourAir;

  @ApiProperty({ type: () => WintourHotel, required: false })
  hotel?: WintourHotel;

  @ApiProperty({ type: () => WintourCustomerData, required: false })
  customer?: WintourCustomerData;

  @ApiProperty({ type: () => [WintourSalesOrigin], required: false })
  sales_origin?: WintourSalesOrigin[];

  @ApiProperty({ type: () => [WintourTicketConjugate], required: false })
  ticket_conjugate?: WintourTicketConjugate[];

  @ApiProperty({ type: () => WintourLocation, required: false })
  location?: WintourLocation;

  @ApiProperty({ type: () => WintourPackage, required: false })
  package?: WintourPackage;

  @ApiProperty({ type: () => WintourOtherService, required: false })
  other_services?: WintourOtherService;

  @ApiProperty({ type: () => WintourTransfer, required: false })
  transfer?: WintourTransfer;

  @ApiProperty({ type: () => WintourOther, required: false })
  other?: WintourOther;
}

export class WintourHeader extends BaseEntity {
  @ApiProperty()
  nr_arquivo: string;

  @ApiProperty()
  data_geracao: string;

  @ApiProperty()
  hora_geracao: string;

  @ApiProperty()
  nome_agencia: string;

  @ApiProperty()
  versao_xml: number;

  @ApiProperty({ required: false })
  integration_status?: string;

  @ApiProperty({ required: false })
  integration_protocol?: string;

  @ApiProperty({ required: false })
  integration_raw_response?: string;

  @ApiProperty({ type: () => [WintourTicket], required: false })
  tickets?: WintourTicket[];
}

export class WintourIntegrationResult {
  @ApiProperty()
  status: string;

  @ApiProperty()
  protocolo: string;

  @ApiProperty()
  raw_response: string;
}

export class WintourImportResponse {
  @ApiProperty({ type: () => WintourHeader })
  importacao: WintourHeader;

  @ApiProperty({ type: () => WintourIntegrationResult })
  integracao: WintourIntegrationResult;
}
