import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'nestjs-prisma';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let service: CustomersService;

  const mockPrismaService = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a customer', async () => {
    mockPrismaService.customer.create.mockResolvedValue({
      id: 'customer-1',
      razao_social: 'LZT Corp',
    });

    const result = await service.create({
      razao_social: 'LZT Corp',
      email: 'contato@lzt.com',
      cpf_cnpj: '123.456.789-01',
      cep: '01310-000',
      celular: '(11) 98888-7777',
      tel: '(11) 3333-2222',
    });

    expect(mockPrismaService.customer.create).toHaveBeenCalledWith({
      data: {
        razao_social: 'LZT Corp',
        email: 'contato@lzt.com',
        cpf_cnpj: '12345678901',
        acao_cli: undefined,
        tipo_endereco: undefined,
        endereco: undefined,
        numero: undefined,
        complemento: undefined,
        bairro: undefined,
        cep: '01310000',
        cidade: undefined,
        estado: undefined,
        tipo_fj: undefined,
        dt_nasc: undefined,
        tel: '1133332222',
        celular: '11988887777',
        insc_identidade: undefined,
        sexo: undefined,
        dt_cadastro: undefined,
      },
    });
    expect(result.id).toBe('customer-1');
  });

  it('should update customer and sanitize numeric fields', async () => {
    mockPrismaService.customer.update.mockResolvedValue({
      id: 'customer-1',
      razao_social: 'LZT Corp',
    });

    await service.update('customer-1', {
      cpf_cnpj: '12.345.678/0001-99',
      cep: '01310-000',
      celular: '(11) 98888-7777',
      tel: null as unknown as string,
    });

    expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: {
        razao_social: undefined,
        cpf_cnpj: '12345678000199',
        email: undefined,
        acao_cli: undefined,
        tipo_endereco: undefined,
        endereco: undefined,
        numero: undefined,
        complemento: undefined,
        bairro: undefined,
        cep: '01310000',
        cidade: undefined,
        estado: undefined,
        tipo_fj: undefined,
        dt_nasc: undefined,
        tel: null,
        celular: '11988887777',
        insc_identidade: undefined,
        sexo: undefined,
        dt_cadastro: undefined,
      },
    });
  });

  it('should throw ConflictException when duplicate customer exists', async () => {
    mockPrismaService.customer.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({
        razao_social: 'LZT Corp',
        cpf_cnpj: '00000000000191',
        email: 'contato@lzt.com',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should list customers ordered by created_at desc', async () => {
    mockPrismaService.customer.findMany.mockResolvedValue([
      { id: 'customer-1', razao_social: 'LZT Corp' },
    ]);

    const result = await service.findAll();

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      orderBy: {
        created_at: 'desc',
      },
    });
    expect(result).toHaveLength(1);
  });
});
