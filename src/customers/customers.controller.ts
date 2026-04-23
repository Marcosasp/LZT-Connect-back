import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilterCustomerDto } from './dto/filter-customer.dto';
import { PaginationDto } from './dto/pagination.dto';
import { CreateCustomerInput } from './dto/create-customer.input';
import { UpdateCustomerInput } from './dto/update-customer.input';
import { Customer } from './entities/customer.entity';
import { CustomerPageEntity } from './entities/customer-page.entity';
import { PaginatedCustomerEntity } from './entities/paginated-customer.entity';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@SerializeOptions({ type: Customer })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar cliente' })
  @ApiResponse({ status: 201, type: Customer })
  create(@Body() data: CreateCustomerInput) {
    return this.customersService.create(data);
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes' })
  @ApiResponse({ status: 200, type: CustomerPageEntity })
  findAll(@Query() pagination: PaginationDto) {
    return this.customersService.findAll(pagination.page, pagination.limit);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar clientes com filtros e paginação' })
  @ApiResponse({ status: 200, type: PaginatedCustomerEntity })
  search(@Query() filters: FilterCustomerDto) {
    return this.customersService.search(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cliente por ID com historico de tickets' })
  @ApiParam({ name: 'id', description: 'ID do cliente' })
  @ApiResponse({ status: 200, type: Customer })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar cliente' })
  @ApiParam({ name: 'id', description: 'ID do cliente' })
  @ApiResponse({ status: 200, type: Customer })
  update(@Param('id') id: string, @Body() data: UpdateCustomerInput) {
    return this.customersService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover cliente' })
  @ApiParam({ name: 'id', description: 'ID do cliente' })
  @ApiResponse({ status: 200, description: 'Cliente removido com sucesso.' })
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }
}
