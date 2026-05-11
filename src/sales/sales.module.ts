import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { CustomersModule } from '../customers/customers.module';
import { WintourSoapModule } from './wintour-soap.module';

@Module({
  imports: [CustomersModule, WintourSoapModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
