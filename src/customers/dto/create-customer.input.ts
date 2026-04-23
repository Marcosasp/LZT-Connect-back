import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { IsCpf } from '../validators/is-cpf.validator';

export class CreateCustomerInput {
  @ApiProperty({ description: 'Nome completo do cliente' })
  @IsString({ message: 'O nome completo deve ser texto' })
  @IsNotEmpty({ message: 'O nome completo é obrigatório' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome_completo: string;

  @ApiProperty({ description: 'CPF do cliente' })
  @IsString({ message: 'O CPF deve ser texto' })
  @IsNotEmpty({ message: 'O CPF é obrigatório' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{11}$/, { message: 'O CPF deve conter 11 dígitos' })
  @IsCpf({ message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({ description: 'E-mail do cliente' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @IsNotEmpty({ message: 'O e-mail é obrigatório' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ description: 'Telefone celular com DDD' })
  @IsString({ message: 'O telefone celular deve ser texto' })
  @IsNotEmpty({ message: 'O telefone celular é obrigatório' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{10,11}$/, {
    message: 'O telefone celular deve conter 10 ou 11 dígitos',
  })
  telefone_celular: string;

  @ApiProperty({ description: 'Endereço completo' })
  @IsString({ message: 'O endereço deve ser texto' })
  @IsNotEmpty({ message: 'O endereço é obrigatório' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  endereco: string;

  @ApiProperty({ description: 'CEP do endereço' })
  @IsString({ message: 'O CEP deve ser texto' })
  @IsNotEmpty({ message: 'O CEP é obrigatório' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  @Matches(/^\d{8}$/, { message: 'O CEP deve conter 8 dígitos' })
  cep: string;

  @ApiProperty({ description: 'Logradouro' })
  @IsString({ message: 'O logradouro deve ser texto' })
  @IsNotEmpty({ message: 'O logradouro é obrigatório' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  logradouro: string;

  @ApiProperty({ description: 'Bairro' })
  @IsString({ message: 'O bairro deve ser texto' })
  @IsNotEmpty({ message: 'O bairro é obrigatório' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bairro: string;

  @ApiProperty({ description: 'Cidade' })
  @IsString({ message: 'A cidade deve ser texto' })
  @IsNotEmpty({ message: 'A cidade é obrigatória' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cidade: string;

  @ApiProperty({ description: 'UF do estado com 2 letras' })
  @IsString({ message: 'O estado deve ser texto' })
  @IsNotEmpty({ message: 'O estado é obrigatório' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{2}$/, { message: 'O estado deve conter 2 letras (UF)' })
  estado: string;
}
