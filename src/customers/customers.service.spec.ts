import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'nestjs-prisma';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let service: CustomersService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const makeCreateInput = () => ({
    nome_completo: 'Maria Silva',
    cpf: '529.982.247-25',
    email: 'contato@lzt.com',
    telefone_celular: '(11) 98888-7777',
    endereco: 'Rua A, 123',
    cep: '01310-000',
    logradouro: 'Rua A',
    bairro: 'Centro',
    cidade: 'Sao Paulo',
    estado: 'sp',
  });

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

    const result = await service.create(makeCreateInput());

    expect(mockPrismaService.customer.create).toHaveBeenCalledWith({
      data: {
        nome_completo: 'Maria Silva',
        cpf: '52998224725',
        email: 'contato@lzt.com',
        telefone_celular: '11988887777',
        endereco: 'Rua A, 123',
        cep: '01310000',
        logradouro: 'Rua A',
        bairro: 'Centro',
        cidade: 'Sao Paulo',
        estado: 'SP',
      },
    });
    expect(result.id).toBe('customer-1');
  });

  it('should update customer and sanitize numeric fields', async () => {
    mockPrismaService.customer.update.mockResolvedValue({
      id: 'customer-1',
      nome_completo: 'Maria Silva',
    });

    await service.update('customer-1', {
      cpf: '529.982.247-25',
      cep: '01310-000',
      telefone_celular: '(11) 98888-7777',
      estado: 'sp',
    });

    expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: {
        cpf: '52998224725',
        cep: '01310000',
        telefone_celular: '11988887777',
        estado: 'SP',
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

    await expect(service.create(makeCreateInput())).rejects.toThrow(
      ConflictException,
    );
  });

  it('should return customer by id with tickets', async () => {
    const customer = {
      id: 'customer-1',
      nome_completo: 'Maria Silva',
      tickets: [{ id: 'ticket-1' }],
    };

    mockPrismaService.customer.findUnique.mockResolvedValue(customer);

    const result = await service.findOne('customer-1');

    expect(mockPrismaService.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      include: { tickets: true },
    });
    expect(result).toEqual(customer);
  });

  it('should throw NotFoundException when customer by id does not exist', async () => {
    mockPrismaService.customer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should list customers with pagination and return meta object', async () => {
    const data = [
      { id: 'customer-1', nome_completo: 'Maria Silva' },
      { id: 'customer-2', nome_completo: 'Joao Souza' },
    ];
    const total = 22;

    mockPrismaService.customer.findMany.mockResolvedValue(data);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.findAll(2, 10);

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      orderBy: { data_criacao_usuario: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(mockPrismaService.customer.count).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data,
      meta: { total: 22, page: 2, lastPage: 3 },
    });
  });

  it('should use default page=1 and limit=10 when called without arguments', async () => {
    const data = [{ id: 'customer-1', nome_completo: 'Maria Silva' }];
    const total = 1;

    mockPrismaService.customer.findMany.mockResolvedValue(data);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.findAll();

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      orderBy: { data_criacao_usuario: 'desc' },
      skip: 0,
      take: 10,
    });
    expect(result).toEqual({
      data,
      meta: { total: 1, page: 1, lastPage: 1 },
    });
  });

  it('should update customer by id with normalized fields', async () => {
    const updated = { id: 'customer-1', nome_completo: 'Maria Silva' };
    mockPrismaService.customer.update.mockResolvedValue(updated);

    const result = await service.update('customer-1', {
      nome_completo: '  Maria Silva  ',
      cpf: '529.982.247-25',
      email: '  MARIA@LZT.COM ',
      telefone_celular: '(11) 98888-7777',
      cep: '01310-000',
      estado: 'sp',
    });

    expect(mockPrismaService.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: {
        nome_completo: 'Maria Silva',
        cpf: '52998224725',
        email: 'maria@lzt.com',
        telefone_celular: '11988887777',
        cep: '01310000',
        estado: 'SP',
      },
    });
    expect(result).toEqual(updated);
  });

  it('should throw NotFoundException when updating non-existing customer', async () => {
    mockPrismaService.customer.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.update('missing-id', { nome_completo: 'Maria' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete customer by id and return success message', async () => {
    mockPrismaService.customer.delete.mockResolvedValue({ id: 'customer-1' });

    const result = await service.remove('customer-1');

    expect(mockPrismaService.customer.delete).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
    });
    expect(result).toEqual({ message: 'Cliente removido com sucesso.' });
  });

  it('should throw NotFoundException when deleting non-existing customer', async () => {
    mockPrismaService.customer.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(service.remove('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should search customers with filters and paginated response', async () => {
    const data = [{ id: 'customer-1', nome_completo: 'Maria Silva' }];
    const total = 1;

    mockPrismaService.customer.findMany.mockResolvedValue(data);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.search({
      nome: 'maria',
      email: 'lzt.com',
      cpf: '52998224725',
      page: 2,
      limit: 5,
    });

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: {
        nome_completo: { contains: 'maria', mode: 'insensitive' },
        email: { contains: 'lzt.com', mode: 'insensitive' },
        cpf: '52998224725',
      },
      orderBy: { data_criacao_usuario: 'desc' },
      skip: 5,
      take: 5,
    });
    expect(mockPrismaService.customer.count).toHaveBeenCalledWith({
      where: {
        nome_completo: { contains: 'maria', mode: 'insensitive' },
        email: { contains: 'lzt.com', mode: 'insensitive' },
        cpf: '52998224725',
      },
    });
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data, total, page: 2, limit: 5 });
  });

  it('should use default pagination when page and limit are not provided', async () => {
    const data = [{ id: 'customer-2', nome_completo: 'Joao Souza' }];
    const total = 3;

    mockPrismaService.customer.findMany.mockResolvedValue(data);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.search({
      nome: 'joao',
    });

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: {
        nome_completo: { contains: 'joao', mode: 'insensitive' },
      },
      orderBy: { data_criacao_usuario: 'desc' },
      skip: 0,
      take: 10,
    });
    expect(mockPrismaService.customer.count).toHaveBeenCalledWith({
      where: {
        nome_completo: { contains: 'joao', mode: 'insensitive' },
      },
    });
    expect(result).toEqual({ data, total, page: 1, limit: 10 });
  });
});
