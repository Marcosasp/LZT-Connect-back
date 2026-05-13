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
  Req,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCustomerInput } from './dto/create-customer.input';
import { FilterCustomerDto } from './dto/filter-customer.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateCustomerInput } from './dto/update-customer.input';
import { Customer } from './entities/customer.entity';
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

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar cliente' })
  @ApiResponse({ status: 200, type: Customer })
  update(@Param('id') id: string, @Body() data: UpdateCustomerInput) {
    return this.customersService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir cliente' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async remove(@Param('id') id: string) {
    await this.customersService.remove(id);
    return { success: true };
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes' })
  @ApiResponse({ status: 200, type: [Customer] })
  findAll(@Query() pagination: PaginationDto) {
    const {
      page,
      limit,
      per_page,
      order,
      sort,
      direction,
      sorting,
      dir,
      orderBy,
    } = pagination;
    const rawOrder = order ?? sort ?? direction ?? sorting ?? dir ?? orderBy;

    return this.customersService.findAll(page, per_page ?? limit, rawOrder);
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar clientes com filtros' })
  @ApiResponse({ status: 200, type: [Customer] })
  search(@Query() filters: FilterCustomerDto) {
    return this.customersService.search(
      filters,
      filters.order ??
        filters.sort ??
        filters.direction ??
        filters.sorting ??
        filters.orderBy,
    );
  }

  @Get('cpf/:cpf')
  @ApiOperation({ summary: 'Buscar cliente por CPF' })
  @ApiResponse({ status: 200, type: Customer })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findByCpf(@Param('cpf') cpf: string) {
    return this.customersService.findByCpf(cpf);
  }

  @Get('cnpj/:cnpj')
  @ApiOperation({ summary: 'Buscar cliente por CNPJ' })
  @ApiResponse({ status: 200, type: Customer })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findByCnpj(@Param('cnpj') cnpj: string) {
    return this.customersService.findByCnpj(cnpj);
  }

  @Get('triage/:cpfCnpj')
  @ApiOperation({
    summary:
      'Triagem de cliente por CPF/CNPJ (base local primeiro, depois global/Wintour)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Retorna o cliente completo e a origem (local/global) quando encontrado; caso contrário retorna null.',
  })
  async triageByCpfCnpj(
    @Param('cpfCnpj') cpfCnpj: string,
    @Req() request?: any,
  ) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    return this.customersService.findByCpfWithUserScope(cpfCnpj, userId);
  }
}
