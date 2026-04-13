import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { CreateCustomerInput } from './dto/create-customer.input';

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

  findAll() {
    return this.prisma.customer.findMany({
      orderBy: {
        data_criacao_usuario: 'desc',
      },
    });
  }
}
