import { ApiProperty } from '@nestjs/swagger';
import { Customer } from './customer.entity';

export class PaginatedCustomerEntity {
  @ApiProperty({ type: [Customer] })
  data: Customer[];

  @ApiProperty({ description: 'Total de registros encontrados' })
  total: number;

  @ApiProperty({ description: 'Página atual' })
  page: number;

  @ApiProperty({ description: 'Registros por página' })
  limit: number;
}
