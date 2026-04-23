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

  private onlyDigits(value?: string | null) {
    if (value === null || value === undefined) {
      return value;
    }

    return value.replace(/\D/g, '');
  }

  private normalizeCreateInput(
    data: CreateCustomerInput,
  ): Prisma.CustomerCreateInput {
    return {
      nome_completo: data.nome_completo.trim(),
      cpf: this.onlyDigits(data.cpf) ?? data.cpf,
      email: data.email.trim().toLowerCase(),
      telefone_celular:
        this.onlyDigits(data.telefone_celular) ?? data.telefone_celular,
      endereco: data.endereco.trim(),
      cep: this.onlyDigits(data.cep) ?? data.cep,
      logradouro: data.logradouro.trim(),
      bairro: data.bairro.trim(),
      cidade: data.cidade.trim(),
      estado: data.estado.trim().toUpperCase(),
    };
  }

  private normalizeUpdateInput(
    data: UpdateCustomerInput,
  ): Prisma.CustomerUpdateInput {
    return {
      ...(data.nome_completo !== undefined && {
        nome_completo: data.nome_completo.trim(),
      }),
      ...(data.cpf !== undefined && { cpf: this.onlyDigits(data.cpf) }),
      ...(data.email !== undefined && {
        email: data.email.trim().toLowerCase(),
      }),
      ...(data.telefone_celular !== undefined && {
        telefone_celular: this.onlyDigits(data.telefone_celular),
      }),
      ...(data.endereco !== undefined && { endereco: data.endereco.trim() }),
      ...(data.cep !== undefined && { cep: this.onlyDigits(data.cep) }),
      ...(data.logradouro !== undefined && {
        logradouro: data.logradouro.trim(),
      }),
      ...(data.bairro !== undefined && { bairro: data.bairro.trim() }),
      ...(data.cidade !== undefined && { cidade: data.cidade.trim() }),
      ...(data.estado !== undefined && {
        estado: data.estado.trim().toUpperCase(),
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

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        orderBy: { data_criacao_usuario: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customer.count(),
    ]);

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

    return customer;
  }

  async update(id: string, data: UpdateCustomerInput) {
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: this.normalizeUpdateInput(data),
      });
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

  async search(filters: FilterCustomerDto) {
    const { nome, email, cpf, page = 1, limit = 10 } = filters;

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

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { data_criacao_usuario: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
