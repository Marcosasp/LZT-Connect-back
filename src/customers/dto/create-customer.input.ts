import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { IsCpf } from '../validators/is-cpf.validator';

export class CreateCustomerInput {
  @ApiProperty({ description: 'Nome completo do cliente', required: false })
  @IsOptional()
  @IsString({ message: 'O nome completo deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.nomeCompleto ?? obj?.nome;
    return typeof source === 'string' ? source.trim() : source;
  })
  nome_completo?: string;

  @ApiProperty({
    description: 'Nome completo do cliente (alias para nome_completo)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O nome completo deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nomeCompleto?: string;

  @ApiProperty({
    description: 'Nome do cliente (alias para nome_completo)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O nome deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome?: string;

  @ApiProperty({ description: 'Razão social do cliente', required: false })
  @IsOptional()
  @IsString({ message: 'A razão social deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.razaoSocial;
    return typeof source === 'string' ? source.trim() : source;
  })
  razao_social?: string;

  @ApiProperty({ description: 'Razão social (alias)', required: false })
  @IsOptional()
  @IsString({ message: 'A razão social deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  razaoSocial?: string;

  @ApiProperty({ description: 'CPF do cliente', required: false })
  @IsOptional()
  @IsString({ message: 'O CPF deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{11}$/, { message: 'O CPF deve conter 11 dígitos' })
  @IsCpf({ message: 'CPF inválido' })
  cpf?: string;

  @ApiProperty({
    description: 'CPF/CNPJ do cliente (alias para cpf)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O CPF/CNPJ deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.cpfCnpj;
    return typeof source === 'string' ? source.replace(/\D/g, '') : source;
  })
  cpf_cnpj?: string;

  @ApiProperty({ description: 'CPF/CNPJ (camelCase alias)', required: false })
  @IsOptional()
  @IsString({ message: 'O CPF/CNPJ deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  cpfCnpj?: string;

  @ApiProperty({ description: 'E-mail do cliente', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.emailAddress ?? obj?.e_mail;
    return typeof source === 'string' ? source.trim().toLowerCase() : source;
  })
  email?: string;

  @ApiProperty({
    description: 'Email do cliente (alias para email)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O email deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  emailAddress?: string;
  @ApiProperty({
    description: 'E-mail (snake_case alias para email)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O e-mail deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  e_mail?: string;
  @ApiProperty({ description: 'Telefone celular com DDD', required: false })
  @IsOptional()
  @IsString({ message: 'O telefone celular deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.telefoneCelular ?? obj?.celular;
    return typeof source === 'string' ? source.replace(/\D/g, '') : source;
  })
  telefone_celular?: string;

  @ApiProperty({
    description: 'Telefone celular (camelCase alias para telefone_celular)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O telefone celular deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  telefoneCelular?: string;

  @ApiProperty({
    description: 'Celular com DDD (alias para telefone_celular)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O celular deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{10,11}$/, {
    message: 'O celular deve conter 10 ou 11 dígitos',
  })
  celular?: string;

  @ApiProperty({
    description: 'Tel (alias curto para telefone_celular)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O tel deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  tel?: string;

  @ApiProperty({ description: 'Endereço completo', required: false })
  @IsOptional()
  @IsString({ message: 'O endereço deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.enderecoCompleto;
    return typeof source === 'string' ? source.trim() : source;
  })
  endereco?: string;

  @ApiProperty({
    description: 'Endereço completo (alias para endereco)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O endereço deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  enderecoCompleto?: string;

  @ApiProperty({ description: 'CEP do endereço', required: false })
  @IsOptional()
  @IsString({ message: 'O CEP deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.codigoPostal ?? obj?.codigo_postal;
    return typeof source === 'string' ? source.replace(/\D/g, '') : source;
  })
  @Matches(/^\d{8}$/, { message: 'O CEP deve conter 8 dígitos' })
  cep?: string;

  @ApiProperty({
    description: 'Código postal (alias para cep)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O código postal deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  codigoPostal?: string;

  @ApiProperty({ description: 'Logradouro', required: false })
  @IsOptional()
  @IsString({ message: 'O logradouro deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.logadouro ?? obj?.street;
    return typeof source === 'string' ? source.trim() : source;
  })
  logradouro?: string;

  @ApiProperty({
    description: 'Logadouro (alias para logradouro)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O logadouro deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  logadouro?: string;

  @ApiProperty({ description: 'Bairro', required: false })
  @IsOptional()
  @IsString({ message: 'O bairro deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.district;
    return typeof source === 'string' ? source.trim() : source;
  })
  bairro?: string;

  @ApiProperty({
    description: 'District (alias para bairro)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O district deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  district?: string;

  @ApiProperty({ description: 'Cidade', required: false })
  @IsOptional()
  @IsString({ message: 'A cidade deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.municipio ?? obj?.city;
    return typeof source === 'string' ? source.trim() : source;
  })
  cidade?: string;

  @ApiProperty({
    description: 'Municipio (alias para cidade)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O municipio deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  municipio?: string;

  @ApiProperty({
    description: 'City (alias para cidade)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'A city deve ser texto' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  @ApiProperty({ description: 'UF do estado com 2 letras', required: false })
  @IsOptional()
  @IsString({ message: 'O estado deve ser texto' })
  @Transform(({ value, obj }) => {
    const source = value ?? obj?.uf ?? obj?.state;
    return typeof source === 'string' ? source.trim().toUpperCase() : source;
  })
  @Matches(/^[A-Z]{2}$/, { message: 'O estado deve conter 2 letras (UF)' })
  estado?: string;

  @ApiProperty({ description: 'UF (alias para estado)', required: false })
  @IsOptional()
  @IsString({ message: 'A UF deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  uf?: string;

  @ApiProperty({
    description: 'State (alias para estado)',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'O state deve ser texto' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  state?: string;
}
