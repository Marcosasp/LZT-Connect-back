import { ApiProperty } from '@nestjs/swagger';

export class SalePassenger {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty()
  sale_id: string;

  @ApiProperty()
  full_name: string;
}

export class SaleEntity {
  @ApiProperty()
  id: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty()
  customer_id: string;

  @ApiProperty()
  origin: string;

  @ApiProperty()
  destination: string;

  @ApiProperty()
  departure_date: Date;

  @ApiProperty({ required: false, nullable: true })
  return_date?: Date | null;

  @ApiProperty()
  travel_type: string;

  @ApiProperty({ required: false, nullable: true, type: 'object' })
  services_data?: Record<string, unknown> | null;

  @ApiProperty({ type: () => [SalePassenger], required: false })
  passengers?: SalePassenger[];
}

export class PaginatedSaleResponse {
  @ApiProperty({ type: () => [SaleEntity] })
  data: SaleEntity[];

  @ApiProperty()
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}
