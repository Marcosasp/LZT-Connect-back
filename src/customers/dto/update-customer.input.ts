import { PartialType } from '@nestjs/swagger';
import { CreateCustomerInput } from './create-customer.input';

export class UpdateCustomerInput extends PartialType(CreateCustomerInput) {}
