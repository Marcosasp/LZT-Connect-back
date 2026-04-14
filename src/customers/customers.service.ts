import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'nestjs-prisma';
import { CreateCustomerInput } from './dto/create-customer.input';
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

  async create(data: CreateCustomerInput) {
    const payload: Prisma.CustomerCreateInput = {
      razao_social: data.razao_social,
      cpf_cnpj: this.onlyDigits(data.cpf_cnpj),
      email: data.email,
      acao_cli: data.acao_cli,
      tipo_endereco: data.tipo_endereco,
      endereco: data.endereco,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      cep: this.onlyDigits(data.cep),
      cidade: data.cidade,
      estado: data.estado,
      tipo_fj: data.tipo_fj,
      dt_nasc: data.dt_nasc,
      tel: this.onlyDigits(data.tel),
      celular: this.onlyDigits(data.celular),
      insc_identidade: data.insc_identidade,
      sexo: data.sexo,
      dt_cadastro: data.dt_cadastro,
    };

    try {
      return await this.prisma.customer.create({
        data: payload,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Cliente com e-mail ou CPF/CNPJ ja cadastrado.',
        );
      }

      throw error;
    }
  }

  async update(id: string, data: UpdateCustomerInput) {
    const payload: Prisma.CustomerUpdateInput = {
      razao_social: data.razao_social,
      cpf_cnpj: this.onlyDigits(data.cpf_cnpj),
      email: data.email,
      acao_cli: data.acao_cli,
      tipo_endereco: data.tipo_endereco,
      endereco: data.endereco,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      cep: this.onlyDigits(data.cep),
      cidade: data.cidade,
      estado: data.estado,
      tipo_fj: data.tipo_fj,
      dt_nasc: data.dt_nasc,
      tel: this.onlyDigits(data.tel),
      celular: this.onlyDigits(data.celular),
      insc_identidade: data.insc_identidade,
      sexo: data.sexo,
      dt_cadastro: data.dt_cadastro,
    };

    try {
      return await this.prisma.customer.update({
        where: { id },
        data: payload,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Cliente com e-mail ou CPF/CNPJ ja cadastrado.',
        );
      }

      throw error;
    }
  }

  findAll() {
    return this.prisma.customer.findMany({
      orderBy: {
        created_at: 'desc',
      },
    });
  }
}
