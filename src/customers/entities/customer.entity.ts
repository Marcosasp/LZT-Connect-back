import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

function onlyDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function formatCpf(value?: string | null): string | undefined {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
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
  nome_completo: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) => formatCpf(value), { toPlainOnly: true })
  cpf: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) => formatCelular(value), { toPlainOnly: true })
  telefone_celular: string;

  @ApiProperty()
  @Expose()
  endereco: string;

  @ApiProperty()
  @Expose()
  @Transform(({ value }) => formatCep(value), { toPlainOnly: true })
  cep: string;

  @ApiProperty()
  @Expose()
  logradouro: string;

  @ApiProperty()
  @Expose()
  bairro: string;

  @ApiProperty()
  @Expose()
  cidade: string;

  @ApiProperty()
  @Expose()
  estado: string;

  @ApiProperty()
  @Expose()
  data_criacao_usuario: Date;

  @ApiProperty({ required: false })
  @Expose()
  razao_social?: string;

  @ApiProperty({ required: false })
  @Expose()
  nome?: string;

  @ApiProperty({ required: false })
  @Expose()
  tel?: string;

  @ApiProperty({ required: false })
  @Expose()
  celular?: string;

  @ApiProperty({ required: false })
  @Expose()
  cpf_cnpj?: string;

  @ApiProperty({ required: false, type: [Object] })
  @Expose()
  tickets?: Record<string, unknown>[];
}
