import { ApiProperty } from '@nestjs/swagger';

export class Customer {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty()
  nome_completo: string;

  @ApiProperty()
  cpf: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  telefone_celular: string;

  @ApiProperty()
  endereco: string;

  @ApiProperty()
  cep: string;

  @ApiProperty()
  logradouro: string;

  @ApiProperty()
  bairro: string;

  @ApiProperty()
  cidade: string;

  @ApiProperty()
  estado: string;

  @ApiProperty()
  data_criacao_usuario: Date;
}
