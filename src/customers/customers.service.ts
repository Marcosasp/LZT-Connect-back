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

  private normalizeInput(data: CreateCustomerInput): CreateCustomerInput {
    return {
      ...data,
      nome_completo: data.nome_completo.trim(),
      cpf: data.cpf.replace(/\D/g, ''),
      email: data.email.trim().toLowerCase(),
      telefone_celular: data.telefone_celular.replace(/\D/g, ''),
      endereco: data.endereco.trim(),
      cep: data.cep.replace(/\D/g, ''),
      logradouro: data.logradouro.trim(),
      bairro: data.bairro.trim(),
      cidade: data.cidade.trim(),
      estado: data.estado.trim().toUpperCase(),
    };
  }

  async create(data: CreateCustomerInput) {
    try {
      return await this.prisma.customer.create({
        data: this.normalizeInput(data),
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

  async update(id: string, data: UpdateCustomerInput) {
    await this.findOneOrFail(id);

    const normalized: UpdateCustomerInput = {
      ...data,
      ...(data.nome_completo !== undefined && {
        nome_completo: data.nome_completo.trim(),
      }),
      ...(data.cpf !== undefined && { cpf: data.cpf.replace(/\D/g, '') }),
      ...(data.email !== undefined && {
        email: data.email.trim().toLowerCase(),
      }),
      ...(data.telefone_celular !== undefined && {
        telefone_celular: data.telefone_celular.replace(/\D/g, ''),
      }),
      ...(data.endereco !== undefined && { endereco: data.endereco.trim() }),
      ...(data.cep !== undefined && { cep: data.cep.replace(/\D/g, '') }),
      ...(data.logradouro !== undefined && {
        logradouro: data.logradouro.trim(),
      }),
      ...(data.bairro !== undefined && { bairro: data.bairro.trim() }),
      ...(data.cidade !== undefined && { cidade: data.cidade.trim() }),
      ...(data.estado !== undefined && {
        estado: data.estado.trim().toUpperCase(),
      }),
    };

    try {
      return await this.prisma.customer.update({
        where: { id },
        data: normalized,
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

  async remove(id: string) {
    await this.findOneOrFail(id);
    await this.prisma.customer.delete({ where: { id } });
    return { message: 'Cliente removido com sucesso.' };
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

  private async findOneOrFail(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Cliente com id "${id}" não encontrado.`);
    }
    return customer;
  }
}
