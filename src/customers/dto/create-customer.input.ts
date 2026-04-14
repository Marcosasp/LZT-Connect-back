import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsNotEmpty,
  Length,
  IsString,
} from 'class-validator';

export class CreateCustomerInput {
  @ApiProperty()
  @IsString({ message: 'Razão social deve ser um texto.' })
  @IsNotEmpty({ message: 'Razão social é obrigatória.' }) // O ValidationPipe agora verá este campo
  razao_social: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  acao_cli?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tipo_endereco?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  complemento?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'CEP deve ser uma string.' })
  cep?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tipo_fj?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  dt_nasc?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'Celular deve ser uma string.' })
  celular?: string;

  @ApiProperty()
  @IsNotEmpty({ message: 'CPF/CNPJ não pode ser vazio.' })
  @IsString()
  @Length(11, 18, { message: 'CPF/CNPJ deve ter entre 11 e 18 caracteres.' })
  cpf_cnpj: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  insc_identidade?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sexo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  dt_cadastro?: Date;

  @ApiProperty()
  @IsEmail({}, { message: 'E-mail inválido' })
  @IsNotEmpty({ message: 'E-mail é obrigatório.' })
  email: string;
}
