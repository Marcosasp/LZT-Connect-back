import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CUSTOMER_ID_PATTERN =
  /^(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export enum SaleTravelType {
  ONE_WAY = 'ONE_WAY',
  ROUND_TRIP = 'ROUND_TRIP',
  MULTI_CITY = 'MULTI_CITY',
}

export class CreateSaleTravelDataDto {
  @ApiProperty({ description: 'Cidade de origem da viagem' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'A origem deve ser um texto.' })
  @IsNotEmpty({ message: 'A origem da viagem é obrigatória.' })
  origin: string;

  @ApiProperty({ description: 'Cidade de destino da viagem' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'O destino deve ser um texto.' })
  @IsNotEmpty({ message: 'O destino da viagem é obrigatório.' })
  destination: string;

  @ApiProperty({
    description: 'Data de ida em formato ISO 8601',
    example: '2026-05-10T09:00:00.000Z',
  })
  @IsDateString(
    {},
    { message: 'A data de ida deve estar em formato ISO 8601.' },
  )
  departureDate: string;

  @ApiProperty({
    required: false,
    description: 'Data de retorno em formato ISO 8601',
    example: '2026-05-15T18:00:00.000Z',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString(
    {},
    { message: 'A data de retorno deve estar em formato ISO 8601.' },
  )
  returnDate?: string;

  @ApiProperty({ enum: SaleTravelType, description: 'Tipo da viagem' })
  @IsEnum(SaleTravelType, { message: 'O tipo de viagem informado é inválido.' })
  travelType: SaleTravelType;

  @ApiProperty({
    required: false,
    description: 'Data da venda em formato ISO 8601',
    example: '2026-04-30T00:00:00.000Z',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString(
    {},
    { message: 'A data da venda deve estar em formato ISO 8601.' },
  )
  saleDate?: string;
}

export class CreateSalePassengerDto {
  @ApiProperty({ description: 'Nome completo do passageiro' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'O nome do passageiro deve ser um texto.' })
  @IsNotEmpty({ message: 'O nome do passageiro é obrigatório.' })
  name: string;
}

export class CreateSaleDto {
  @ApiProperty({
    description: 'Identificador do cliente vinculado à venda',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'O customerId deve ser um texto.' })
  @Matches(CUSTOMER_ID_PATTERN, {
    message: 'O customerId deve ser um UUID válido ou um CUID válido.',
  })
  customerId: string;

  @ApiProperty({ type: () => CreateSaleTravelDataDto })
  @ValidateNested()
  @Type(() => CreateSaleTravelDataDto)
  travelData: CreateSaleTravelDataDto;

  @ApiProperty({
    type: [String],
    description: 'Lista de serviços ativados para a venda',
    example: ['hotel', 'car_rental'],
  })
  @IsArray({ message: 'selectedServices deve ser um array.' })
  @ArrayNotEmpty({ message: 'Selecione pelo menos um serviço.' })
  @ArrayUnique({
    message: 'selectedServices não pode conter valores duplicados.',
  })
  @IsString({
    each: true,
    message: 'Cada serviço selecionado deve ser um texto.',
  })
  selectedServices: string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Detalhes dinâmicos dos serviços, como hotel e locação.',
  })
  @IsObject({ message: 'servicesDetails deve ser um objeto.' })
  servicesDetails: Record<string, unknown>;

  @ApiProperty({
    type: () => [CreateSalePassengerDto],
    description: 'Passageiros vinculados à venda',
  })
  @IsArray({ message: 'passengers deve ser um array.' })
  @ArrayNotEmpty({ message: 'Informe ao menos um passageiro.' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalePassengerDto)
  passengers: CreateSalePassengerDto[];
}
