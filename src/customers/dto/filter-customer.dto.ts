import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class FilterCustomerDto {
  @ApiPropertyOptional({
    description: 'Filtro parcial por nome (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({
    description: 'Filtro parcial por e-mail (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'CPF exato (somente dígitos)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\D/g, '') : value,
  )
  cpf?: string;

  @ApiPropertyOptional({ description: 'Página atual (padrão: 1)', default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Registros por página (padrão: 10)',
    default: 10,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description:
      'Ordenação dos resultados (asc, desc, mais antigos, mais recentes)',
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  order?: string;

  @ApiPropertyOptional({
    description: 'Alias para order (asc, desc, mais antigos, mais recentes)',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Alias para order' })
  @IsOptional()
  @IsString()
  direction?: string;

  @ApiPropertyOptional({ description: 'Alias para order' })
  @IsOptional()
  @IsString()
  sorting?: string;

  @ApiPropertyOptional({ description: 'Alias para order' })
  @IsOptional()
  @IsString()
  orderBy?: string;
}
