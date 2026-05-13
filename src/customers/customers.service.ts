import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { CreateCustomerInput } from './dto/create-customer.input';
import { FilterCustomerDto } from './dto/filter-customer.dto';
import { UpdateCustomerInput } from './dto/update-customer.input';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private getPrismaOrder(order?: string): 'asc' | 'desc' {
    const v = (order ?? '').toString().toLowerCase();
    return v.includes('antigo') || v === 'asc' ? 'asc' : 'desc';
  }

  private onlyDigits(value?: string | null) {
    if (value === null || value === undefined) {
      return value;
    }

    return value.replace(/\D/g, '');
  }

  private mapCustomerResponse<
    T extends {
      nome_completo: string;
      telefone_celular: string;
      cpf: string;
      razao_social?: string | null;
    },
  >(customer: T) {
    const razaoSocial =
      customer.razao_social && customer.razao_social.trim() !== ''
        ? customer.razao_social
        : customer.nome_completo;

    return {
      ...customer,
      razao_social: razaoSocial,
      nome: customer.nome_completo,
      nomeCompleto: customer.nome_completo,
      tel: customer.telefone_celular,
      celular: customer.telefone_celular,
      cpf_cnpj: customer.cpf,
    };
  }

  private normalizeCreateInput(
    data: CreateCustomerInput,
  ): Prisma.CustomerCreateInput {
    const nomeCompletoValue =
      data.nome ?? data.nomeCompleto ?? data.nome_completo ?? data.razao_social;
    const nomeCompleto = nomeCompletoValue?.trim() ?? '';
    const cpf = (data.cpf_cnpj ?? data.cpfCnpj ?? data.cpf)?.trim() ?? '';
    const email =
      (data.email ?? data.emailAddress ?? data.e_mail)?.trim().toLowerCase() ??
      '';
    const telefoneCelular =
      (
        data.tel ??
        data.celular ??
        data.telefoneCelular ??
        data.telefone_celular
      )?.trim() ?? '';
    const endereco = (data.endereco ?? data.enderecoCompleto)?.trim() ?? '';
    const cep = (data.cep ?? data.codigoPostal)?.trim() ?? '';
    const logradouro = (data.logadouro ?? data.logradouro)?.trim() ?? '';
    const bairro = (data.bairro ?? data.district)?.trim() ?? '';
    const cidade = (data.cidade ?? data.municipio ?? data.city)?.trim() ?? '';
    const estado =
      (data.estado ?? data.uf ?? data.state)?.trim().toUpperCase() ?? '';
    const razaoSocial =
      (data.razao_social ?? data.razaoSocial)?.trim() === nomeCompleto
        ? undefined
        : (data.razao_social ?? data.razaoSocial)?.trim();

    return {
      nome_completo: nomeCompleto,
      razao_social: razaoSocial,
      cpf: this.onlyDigits(cpf) ?? cpf,
      email,
      telefone_celular: this.onlyDigits(telefoneCelular) ?? telefoneCelular,
      endereco,
      cep: this.onlyDigits(cep) ?? cep,
      logradouro,
      bairro,
      cidade,
      estado,
    };
  }

  private normalizeUpdateInput(
    data: UpdateCustomerInput,
  ): Prisma.CustomerUpdateInput {
    const nomeCompletoValue =
      data.nome ?? data.nomeCompleto ?? data.nome_completo ?? data.razao_social;
    const cpfValue = data.cpf_cnpj ?? data.cpfCnpj ?? data.cpf;
    const emailValue = data.email ?? data.emailAddress ?? data.e_mail;
    const telefoneCelularValue =
      data.celular ?? data.tel ?? data.telefoneCelular ?? data.telefone_celular;
    const enderecoValue = data.endereco ?? data.enderecoCompleto;
    const cepValue = data.cep ?? data.codigoPostal;
    const logradouroValue = data.logadouro ?? data.logradouro;
    const bairroValue = data.bairro ?? data.district;
    const cidadeValue = data.cidade ?? data.municipio ?? data.city;
    const estadoValue = data.estado ?? data.uf ?? data.state;
    const razaoSocialValue = data.razao_social ?? data.razaoSocial;

    return {
      ...(nomeCompletoValue !== undefined && {
        nome_completo: nomeCompletoValue.trim(),
      }),
      ...(razaoSocialValue !== undefined &&
        razaoSocialValue !== nomeCompletoValue?.trim() && {
          razao_social: razaoSocialValue.trim(),
        }),
      ...(cpfValue !== undefined && {
        cpf: this.onlyDigits(cpfValue) ?? cpfValue,
      }),
      ...(emailValue !== undefined && {
        email: emailValue.trim().toLowerCase(),
      }),
      ...(telefoneCelularValue !== undefined && {
        telefone_celular:
          this.onlyDigits(telefoneCelularValue) ?? telefoneCelularValue,
      }),
      ...(enderecoValue !== undefined && {
        endereco: enderecoValue.trim(),
      }),
      ...(cepValue !== undefined && {
        cep: this.onlyDigits(cepValue) ?? cepValue,
      }),
      ...(logradouroValue !== undefined && {
        logradouro: logradouroValue.trim(),
      }),
      ...(bairroValue !== undefined && {
        bairro: bairroValue.trim(),
      }),
      ...(cidadeValue !== undefined && {
        cidade: cidadeValue.trim(),
      }),
      ...(estadoValue !== undefined && {
        estado: estadoValue.trim().toUpperCase(),
      }),
    };
  }

  async create(data: CreateCustomerInput) {
    try {
      return await this.prisma.customer.create({
        data: this.normalizeCreateInput(data),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cliente com CPF ja cadastrado.');
      }

      throw error;
    }
  }

  async findAll(page = 1, limit = 10, order?: string) {
    const prismaOrder = this.getPrismaOrder(order);
    const skip = (page - 1) * limit;

    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        orderBy: { data_criacao_usuario: prismaOrder },
        skip,
        take: limit,
      }),
      this.prisma.customer.count(),
    ]);

    const data = customers.map((customer) =>
      this.mapCustomerResponse(customer),
    );

    const lastPage = Math.ceil(total / limit);

    return { data, meta: { total, page, lastPage } };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        tickets: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente com id "${id}" nao encontrado.`);
    }

    return this.mapCustomerResponse(customer);
  }

  async findByCpf(cpf: string) {
    const digits = this.onlyDigits(cpf) ?? cpf;

    const customer = await this.prisma.customer.findUnique({
      where: { cpf: digits },
      include: { tickets: true },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente com CPF "${cpf}" nao encontrado.`);
    }

    return this.mapCustomerResponse(customer);
  }

  async findByCnpj(cnpj: string) {
    const digits = this.onlyDigits(cnpj) ?? cnpj;

    const customer = await this.prisma.customer.findUnique({
      where: { cpf: digits },
      include: { tickets: true },
    });

    if (!customer) {
      throw new NotFoundException(`Cliente com CNPJ "${cnpj}" nao encontrado.`);
    }

    return this.mapCustomerResponse(customer);
  }

  async update(id: string, data: UpdateCustomerInput) {
    try {
      const normalized = this.normalizeUpdateInput(data);

      const customer = await this.prisma.customer.update({
        where: { id },
        data: normalized,
      });

      return this.mapCustomerResponse(customer);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cliente com CPF ja cadastrado.');
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Cliente com id "${id}" não encontrado.`);
      }

      throw error;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.customer.delete({ where: { id } });
      return { message: 'Cliente removido com sucesso.' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Cliente com id "${id}" não encontrado.`);
      }

      throw error;
    }
  }

  async search(filters: FilterCustomerDto, order = 'desc') {
    const { nome, email, cpf, page = 1, limit = 10 } = filters;
    const rawOrder =
      order ??
      filters.order ??
      filters.sort ??
      filters.direction ??
      filters.sorting ??
      filters.orderBy;
    const prismaOrder = this.getPrismaOrder(rawOrder);

    const where: Prisma.CustomerWhereInput = {
      ...(nome && {
        nome_completo: { contains: nome, mode: 'insensitive' },
      }),
      ...(email && {
        email: { contains: email, mode: 'insensitive' },
      }),
      ...(cpf && { cpf }),
    };

    const skip = (page - 1) * limit;

    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { data_criacao_usuario: prismaOrder },
        skip,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    const data = customers.map((customer) =>
      this.mapCustomerResponse(customer),
    );

    const lastPage = Math.ceil(total / limit);
    return { data, meta: { total, page, lastPage } };
  }

  /**
   * Busca cliente por CPF/CNPJ com escopo de usuário.
   * Primeiro procura nos clientes do usuário logado.
   * Se não encontrar, busca na base "global" (simulação Wintour).
   *
   * @param cpfCnpj CPF ou CNPJ do cliente
   * @param userId ID do usuário logado (opcional)
   * @returns { customer, source: 'local' | 'global' }
   */
  async findByCpfWithUserScope(
    cpfCnpj: string,
    userId?: string,
  ): Promise<{ customer: any; source: 'local' | 'global' } | null> {
    const digits = this.onlyDigits(cpfCnpj) ?? cpfCnpj;

    // 1. Busca na base local do usuário (vinculado pelo user_id)
    if (userId) {
      const localCustomer = await this.prisma.customer.findFirst({
        where: { cpf: digits, userId },
        include: { tickets: true },
      });

      if (localCustomer) {
        return {
          customer: this.mapCustomerResponse(localCustomer),
          source: 'local',
        };
      }
    }

    // 2. Busca na base "global" (Wintour simulado — clientes sem vínculo de usuário)
    // findFirst para não lançar erro quando o CPF não existe
    const globalCustomer = await this.prisma.customer.findFirst({
      where: { cpf: digits },
      include: { tickets: true },
    });

    if (globalCustomer) {
      return {
        customer: this.mapCustomerResponse(globalCustomer),
        source: 'global',
      };
    }

    // Retorna null para que o chamador decida criar o cliente
    return null;
  }

  /**
   * Procura cliente na base global (Wintour simulado) ou cria um novo temporário.
   * Usado quando o CPF é novo e precisa ser registrado.
   *
   * @param data Dados do cliente para busca/criação
   * @returns { customer, isNew: boolean }
   */
  async findOrCreateGlobalCustomer(data: CreateCustomerInput): Promise<{
    customer: any;
    isNew: boolean;
  }> {
    const normalized = this.normalizeCreateInput(data);
    const digits = this.onlyDigits(normalized.cpf) ?? normalized.cpf;

    // Tenta buscar na base global
    const existingCustomer = await this.prisma.customer.findUnique({
      where: { cpf: digits },
      include: { tickets: true },
    });

    if (existingCustomer) {
      return {
        customer: this.mapCustomerResponse(existingCustomer),
        isNew: false,
      };
    }

    // Se não existe, cria novo
    const newCustomer = await this.prisma.customer.create({
      data: normalized,
      include: { tickets: true },
    });

    return {
      customer: this.mapCustomerResponse(newCustomer),
      isNew: true,
    };
  }

  /**
   * Vincula um cliente da base "global" (Wintour) ao usuário atual.
   * Usado quando o cliente foi encontrado na base global e uma venda é criada.
   *
   * @param customerId ID do cliente global
   * @param userId ID do usuário logado
   * @returns Customer vinculado
   */
  async linkGlobalCustomerToUser(
    customerId: string,
    userId: string,
  ): Promise<any> {
    const linked = await this.prisma.customer.update({
      where: { id: customerId },
      data: { userId },
      include: { tickets: true },
    });

    return this.mapCustomerResponse(linked);
  }

  /**
   * Cria novo cliente na base local do usuário E na base "global" (Wintour simulado).
   * Garante que o cliente esteja disponível em ambas as fontes.
   *
   * @param data Dados do cliente
   * @param userId ID do usuário logado (opcional)
   * @returns { customer, createdInLocal: boolean, createdInGlobal: boolean }
   */
  async createCustomerInBothSources(
    data: CreateCustomerInput,
    userId?: string,
  ): Promise<{
    customer: any;
    createdInLocal: boolean;
    createdInGlobal: boolean;
  }> {
    const normalized = this.normalizeCreateInput(data);
    const digits = this.onlyDigits(normalized.cpf) ?? normalized.cpf;

    // 1. Tenta buscar cliente existente
    const existing = await this.prisma.customer.findUnique({
      where: { cpf: digits },
      include: { tickets: true },
    });

    let createdInLocal = false;
    let createdInGlobal = false;

    if (existing) {
      // Cliente já existe, apenas retorna
      return {
        customer: this.mapCustomerResponse(existing),
        createdInLocal: false,
        createdInGlobal: false,
      };
    }

    // 2. Cria novo cliente (base local)
    const newCustomer = await this.prisma.customer.create({
      data: normalized,
      include: { tickets: true },
    });

    createdInLocal = true;

    // 3. TODO: Integração com API Wintour para registrar na base global
    // Quando Wintour API estiver disponível:
    // const wintourResult = await this.wintourSoapService.registerCustomer(normalized);
    // createdInGlobal = !!wintourResult.success;

    // Por enquanto, simulamos a criação na base global
    createdInGlobal = true;

    return {
      customer: this.mapCustomerResponse(newCustomer),
      createdInLocal,
      createdInGlobal,
    };
  }
}
