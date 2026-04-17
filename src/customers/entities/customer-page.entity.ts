import { ApiProperty } from '@nestjs/swagger';
import { Customer } from './customer.entity';

class CustomerPageMetaEntity {
  @ApiProperty({ description: 'Total de registros encontrados' })
  total: number;

  @ApiProperty({ description: 'Página atual' })
  page: number;

  @ApiProperty({ description: 'Última página disponível' })
  lastPage: number;
}

export class CustomerPageEntity {
  @ApiProperty({ type: [Customer] })
  data: Customer[];

  @ApiProperty({ type: CustomerPageMetaEntity })
  meta: CustomerPageMetaEntity;
}
