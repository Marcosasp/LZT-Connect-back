import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerInput } from './create-customer.input';

export class UpdateCustomerInput extends PartialType(CreateCustomerInput) {}
