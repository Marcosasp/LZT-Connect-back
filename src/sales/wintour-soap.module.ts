import { Module } from '@nestjs/common';
import { WintourSoapService } from './wintour-soap.service';

@Module({
  providers: [WintourSoapService],
  exports: [WintourSoapService],
})
export class WintourSoapModule {}
