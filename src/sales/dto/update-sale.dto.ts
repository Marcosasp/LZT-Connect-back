import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CreateSalePassengerDto,
  CreateSaleTravelDataDto,
  SaleTravelType,
  CUSTOMER_ID_PATTERN,
} from './create-sale.dto';

export class UpdateSaleTravelDataDto extends PartialType(
  CreateSaleTravelDataDto,
) {}

export class UpdateSaleDto {
  @ApiPropertyOptional({
    description: 'Identificador do cliente vinculado à venda',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'O customerId deve ser um texto.' })
  @Matches(CUSTOMER_ID_PATTERN, {
    message: 'O customerId deve ser um UUID válido ou um CUID válido.',
  })
  customerId?: string;

  @ApiPropertyOptional({ type: () => UpdateSaleTravelDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSaleTravelDataDto)
  travelData?: UpdateSaleTravelDataDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Lista de serviços ativados para a venda',
    example: ['hotel', 'car_rental'],
  })
  @IsOptional()
  @IsArray({ message: 'selectedServices deve ser um array.' })
  @ArrayUnique({
    message: 'selectedServices não pode conter valores duplicados.',
  })
  @IsString({
    each: true,
    message: 'Cada serviço selecionado deve ser um texto.',
  })
  selectedServices?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Detalhes dinâmicos dos serviços, como hotel e locação.',
  })
  @IsOptional()
  @IsObject({ message: 'servicesDetails deve ser um objeto.' })
  servicesDetails?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: () => [CreateSalePassengerDto],
    description: 'Passageiros vinculados à venda (substitui todos)',
  })
  @IsOptional()
  @IsArray({ message: 'passengers deve ser um array.' })
  @ValidateNested({ each: true })
  @Type(() => CreateSalePassengerDto)
  passengers?: CreateSalePassengerDto[];
}
