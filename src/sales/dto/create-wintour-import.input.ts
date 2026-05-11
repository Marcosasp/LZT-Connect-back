import { ApiProperty } from '@nestjs/swagger';
import {
  Allow,
  IsArray,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WintourApportionmentInput {
  @ApiProperty()
  ccustos_cliente: string;
  @ApiProperty()
  percentual: number;
}

export class WintourValueInput {
  @ApiProperty()
  codigo: string;
  @ApiProperty()
  valor: number;
  @ApiProperty({ required: false })
  valor_df?: number;
  @ApiProperty({ required: false })
  valor_mp?: number;
}

export class WintourExpiryInput {
  @ApiProperty()
  codigo: string;
  @ApiProperty()
  valor: Date;
}

export class WintourSectionInput {
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

export class WintourHotelInput {
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

export class WintourCustomerInput {
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

export class WintourSalesOriginInput {
  @ApiProperty()
  item: number;
}

export class WintourTicketConjugateInput {
  @ApiProperty()
  item: string;
}

export class WintourLocationInput {
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

export class WintourPackageInput {
  @ApiProperty({ required: false })
  cid_dest_principal?: string;
  @ApiProperty({ required: false })
  data_inicio_pacote?: Date;
  @ApiProperty({ required: false })
  data_fim_pacote?: Date;
  @ApiProperty({ required: false })
  descricao_pacote?: string;
}

export class WintourOtherServiceInput {
  @ApiProperty({ required: false })
  cid_dest_principal?: string;
  @ApiProperty({ required: false })
  data_inicio_outros_svcs?: Date;
  @ApiProperty({ required: false })
  data_fim_outros_svcs?: Date;
  @ApiProperty({ required: false })
  descricao_outros_svcs?: string;
}

export class WintourTransferInput {
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

export class WintourOtherInput {
  @ApiProperty()
  descricao: string;
}

export class WintourTicketInput {
  @ApiProperty({ required: false })
  @Allow()
  num_bilhete?: string;

  @ApiProperty({ required: false })
  @Allow()
  user_id?: string;

  @ApiProperty({ required: false })
  @Allow()
  customer_id?: string;

  @ApiProperty({ required: false })
  @Allow()
  localizador?: string;

  @ApiProperty({ required: false })
  @Allow()
  fornecedor?: string;

  @ApiProperty({ required: false })
  @Allow()
  passageiro?: string;

  @ApiProperty({ required: false })
  @Allow()
  idv_externo?: string;

  @ApiProperty({ required: false })
  id_posto_atendimento?: number;

  @ApiProperty({ required: false })
  posto_atendimento?: string;

  @ApiProperty({ required: false })
  dt_interna_cadastro?: Date;

  @ApiProperty({ required: false })
  @Allow()
  data_lancamento?: Date;

  @ApiProperty({ required: false })
  @Allow()
  codigo_produto?: string;

  @ApiProperty({ required: false })
  @Allow()
  prestador_svc?: string;

  @ApiProperty({ required: false })
  tour_code?: string;

  @ApiProperty({ required: false })
  @Allow()
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
  @Allow()
  moeda?: string;

  @ApiProperty({ required: false })
  emissor?: string;

  @ApiProperty({ required: false })
  promotor?: string;

  @ApiProperty({ required: false })
  gerente?: string;

  @ApiProperty({ required: false })
  @Allow()
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
  @Allow()
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
  @Allow()
  cid_dest_principal?: string;

  @ApiProperty({ type: () => [WintourApportionmentInput], required: false })
  apportionments?: WintourApportionmentInput[];

  @ApiProperty({ type: () => [WintourValueInput], required: false })
  @Allow()
  values?: WintourValueInput[];

  @ApiProperty({ type: () => [WintourExpiryInput], required: false })
  expiry?: WintourExpiryInput[];

  @ApiProperty({ type: () => [WintourSectionInput], required: false })
  sections?: WintourSectionInput[];

  @ApiProperty({ type: () => WintourHotelInput, required: false })
  @Allow()
  hotel?: WintourHotelInput;

  @ApiProperty({ type: () => WintourCustomerInput, required: false })
  @Allow()
  customer?: WintourCustomerInput;

  @ApiProperty({ type: () => [WintourSalesOriginInput], required: false })
  sales_origin?: WintourSalesOriginInput[];

  @ApiProperty({ type: () => [WintourTicketConjugateInput], required: false })
  ticket_conjugate?: WintourTicketConjugateInput[];

  @ApiProperty({ type: () => WintourLocationInput, required: false })
  @Allow()
  location?: WintourLocationInput;

  @ApiProperty({ type: () => WintourPackageInput, required: false })
  @Allow()
  package?: WintourPackageInput;

  @ApiProperty({ type: () => WintourOtherServiceInput, required: false })
  @Allow()
  other_services?: WintourOtherServiceInput;

  @ApiProperty({ type: () => WintourTransferInput, required: false })
  transfer?: WintourTransferInput;

  @ApiProperty({ type: () => WintourOtherInput, required: false })
  @Allow()
  other?: WintourOtherInput;
}

export class WintourPaymentDetailsInput {
  @ApiProperty({ required: false })
  @Allow()
  paymentMethod?: string;

  @ApiProperty({ required: false })
  @Allow()
  totalValue?: number;

  @ApiProperty({ required: false })
  @Allow()
  entryValue?: number;

  @ApiProperty({ required: false })
  @Allow()
  installments?: string;

  @ApiProperty({ required: false })
  @Allow()
  installmentValue?: number;

  @ApiProperty({ required: false })
  @Allow()
  notes?: string;

  @ApiProperty({ required: false })
  @Allow()
  cardBrand?: string;
}

export class CreateWintourImportInput {
  @ApiProperty()
  @IsString()
  nr_arquivo: string;

  @ApiProperty()
  @IsString()
  data_geracao: string;

  @ApiProperty()
  @IsString()
  hora_geracao: string;

  @ApiProperty()
  @IsString()
  nome_agencia: string;

  @ApiProperty({ default: 4 })
  @IsNumber()
  versao_xml: number;

  @ApiProperty({ type: () => WintourPaymentDetailsInput, required: false })
  @Allow()
  paymentDetails?: WintourPaymentDetailsInput;

  @ApiProperty({ type: [String], required: false })
  @Allow()
  selectedServices?: string[];

  @ApiProperty({ required: false })
  @Allow()
  servicesDetails?: Record<string, unknown>;

  @ApiProperty({ type: () => [WintourTicketInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WintourTicketInput)
  tickets: WintourTicketInput[];
}
