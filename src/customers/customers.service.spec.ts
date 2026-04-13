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
      nome_completo: 'Maria Silva',
    });

    const result = await service.create({
      nome_completo: 'Maria Silva',
      cpf: '529.982.247-25',
      email: 'contato@lzt.com',
      telefone_celular: '(11) 99999-0000',
      endereco: 'Rua Augusta, 123',
      cep: '01305-000',
      logradouro: 'Rua Augusta',
      bairro: 'Consolacao',
      cidade: 'Sao Paulo',
      estado: 'sp',
    });

    expect(mockPrismaService.customer.create).toHaveBeenCalledWith({
      data: {
        nome_completo: 'Maria Silva',
        cpf: '52998224725',
        email: 'contato@lzt.com',
        telefone_celular: '11999990000',
        endereco: 'Rua Augusta, 123',
        cep: '01305000',
        logradouro: 'Rua Augusta',
        bairro: 'Consolacao',
        cidade: 'Sao Paulo',
        estado: 'SP',
      },
    });
    expect(result.id).toBe('customer-1');
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
        nome_completo: 'Maria Silva',
        cpf: '529.982.247-25',
        email: 'maria@lzt.com',
        telefone_celular: '(11) 99999-0000',
        endereco: 'Rua Augusta, 123',
        cep: '01305-000',
        logradouro: 'Rua Augusta',
        bairro: 'Consolacao',
        cidade: 'Sao Paulo',
        estado: 'SP',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should list customers ordered by created_at desc', async () => {
    mockPrismaService.customer.findMany.mockResolvedValue([
      { id: 'customer-1', nome_completo: 'Maria Silva' },
    ]);

    const result = await service.findAll();

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      orderBy: {
        data_criacao_usuario: 'desc',
      },
    });
    expect(result).toHaveLength(1);
  });
});
