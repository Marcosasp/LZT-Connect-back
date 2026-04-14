import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

function onlyDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function formatCpfCnpj(value?: string | null): string | undefined {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }

  return value ?? undefined;
}

function formatCep(value?: string | null): string | undefined {
  const digits = onlyDigits(value);

  if (digits.length === 8) {
    return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
  }

  return value ?? undefined;
}

function formatCelular(value?: string | null): string | undefined {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return value ?? undefined;
}

export class Customer {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  created_at: Date;

  @ApiProperty()
  @Expose()
  updated_at: Date;

  @ApiProperty()
  @Expose()
  razao_social: string;

  @ApiProperty({ required: false })
  @Expose()
  acao_cli?: string;

  @ApiProperty({ required: false })
  @Expose()
  tipo_endereco?: string;

  @ApiProperty({ required: false })
  @Expose()
  endereco?: string;

  @ApiProperty({ required: false })
  @Expose()
  numero?: string;

  @ApiProperty({ required: false })
  @Expose()
  complemento?: string;

  @ApiProperty({ required: false })
  @Expose()
  bairro?: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ value }) => formatCep(value), { toPlainOnly: true })
  cep?: string;

  @ApiProperty({ required: false })
  @Expose()
  cidade?: string;

  @ApiProperty({ required: false })
  @Expose()
  estado?: string;

  @ApiProperty({ required: false })
  @Expose()
  tipo_fj?: string;

  @ApiProperty({ required: false })
  @Expose()
  dt_nasc?: Date;

  @ApiProperty({ required: false })
  @Expose()
  tel?: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ value }) => formatCelular(value), { toPlainOnly: true })
  celular?: string;

  @ApiProperty({ required: false })
  @Expose()
  @Transform(({ value }) => formatCpfCnpj(value), { toPlainOnly: true })
  cpf_cnpj?: string;

  @ApiProperty({ required: false })
  @Expose()
  insc_identidade?: string;

  @ApiProperty({ required: false })
  @Expose()
  sexo?: string;

  @ApiProperty({ required: false })
  @Expose()
  dt_cadastro?: Date;

  @ApiProperty({ required: false })
  @Expose()
  email?: string;
}
