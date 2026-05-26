import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { CustomersModule } from '../customers/customers.module';
import { WintourSoapModule } from './wintour-soap.module';
import { IntegrationLogService } from './integration-log.service';

@Module({
  imports: [CustomersModule, WintourSoapModule],
  controllers: [SalesController],
  providers: [SalesService, IntegrationLogService],
  exports: [IntegrationLogService],
})
export class SalesModule {}
