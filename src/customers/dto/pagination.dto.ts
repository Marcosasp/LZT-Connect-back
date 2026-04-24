import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PaginationDto {
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
    description: 'Registros por página (alias para limit)',
    default: 10,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  per_page?: number;

  @ApiPropertyOptional({
    description: 'Ordenação (aceita asc, desc, Mais antigos, Mais recentes)',
  })
  @IsOptional()
  @IsString()
  order?: string;

  @ApiPropertyOptional({ description: 'Alias para order' })
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
  dir?: string;

  @ApiPropertyOptional({ description: 'Alias para order' })
  @IsOptional()
  @IsString()
  orderBy?: string;
}
