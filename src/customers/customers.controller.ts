import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  UnauthorizedException,
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
  ApiHeader,
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

  private static readonly CREATE_CUSTOMER_TRIAGE_ORIGIN = 'sales-triage';

  @Post()
  @ApiHeader({
    name: 'x-customer-origin',
    required: false,
    description:
      'Origem da criação. Obrigatório para criação via triagem de venda: sales-triage.',
  })
  @ApiOperation({ summary: 'Cadastrar cliente' })
  @ApiResponse({ status: 201, type: Customer })
  @ApiResponse({
    status: 403,
    description:
      'Criação direta bloqueada. Utilize o fluxo de triagem de venda.',
  })
  create(
    @Body() data: CreateCustomerInput,
    @Req() request?: any,
    @Headers('x-customer-origin') customerOrigin?: string,
  ) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    if (
      customerOrigin?.toLowerCase() !==
      CustomersController.CREATE_CUSTOMER_TRIAGE_ORIGIN
    ) {
      throw new ForbiddenException(
        'Criação direta de cliente não permitida. Utilize o fluxo de venda com triagem.',
      );
    }

    return this.customersService.create(data, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar cliente' })
  @ApiResponse({ status: 200, type: Customer })
  update(@Param('id') id: string, @Body() data: UpdateCustomerInput) {
    return this.customersService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remover cliente do usuário' })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  async deleteCustomer(@Param('id') id: string, @Req() request: any) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    await this.customersService.deleteCustomer(id, userId);
    return { success: true };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar clientes' })
  @ApiResponse({ status: 200, type: [Customer] })
  findAll(@Query() pagination: PaginationDto, @Req() request: any) {
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

    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    return this.customersService.findAll(
      page,
      per_page ?? limit,
      rawOrder,
      userId,
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar clientes com filtros' })
  @ApiResponse({ status: 200, type: [Customer] })
  search(@Query() filters: FilterCustomerDto, @Req() request: any) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;

    return this.customersService.search(
      filters,
      filters.order ??
        filters.sort ??
        filters.direction ??
        filters.sorting ??
        filters.orderBy,
      userId,
    );
  }

  @Get('cpf/:cpf')
  @ApiOperation({ summary: 'Buscar cliente por CPF' })
  @ApiResponse({ status: 200, type: Customer })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findByCpf(@Param('cpf') cpf: string, @Req() request?: any) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;
    return this.customersService.findByCpf(cpf, userId);
  }

  @Get('cnpj/:cnpj')
  @ApiOperation({ summary: 'Buscar cliente por CNPJ' })
  @ApiResponse({ status: 200, type: Customer })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findByCnpj(@Param('cnpj') cnpj: string, @Req() request?: any) {
    const user = request?.user as { id?: string; user_id?: string } | undefined;
    const userId = user?.id ?? user?.user_id;
    return this.customersService.findByCnpj(cnpj, userId);
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
