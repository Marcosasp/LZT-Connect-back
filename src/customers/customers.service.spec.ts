import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'nestjs-prisma';
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
      count: jest.fn(),
    },
    userCustomer: {
      create: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
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
    expect(result).toEqual({
      ...customer,
      nome: customer.nome_completo,
      nomeCompleto: customer.nome_completo,
      razao_social: customer.nome_completo,
      tel: (customer as any).telefone_celular,
      celular: (customer as any).telefone_celular,
      cpf_cnpj: (customer as any).cpf,
    });
  });

  it('should throw NotFoundException when customer by id does not exist', async () => {
    mockPrismaService.customer.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should list customers with pagination and return meta object', async () => {
    const rawData = [
      {
        id: 'customer-1',
        nome_completo: 'Maria Silva',
        telefone_celular: undefined,
        cpf: undefined,
        razao_social: undefined,
        _count: { sales: 4 },
        userCustomers: [{ created_at: new Date('2026-04-10T00:00:00.000Z') }],
      },
      {
        id: 'customer-2',
        nome_completo: 'Joao Souza',
        telefone_celular: undefined,
        cpf: undefined,
        razao_social: undefined,
        _count: { sales: 1 },
        userCustomers: [{ created_at: new Date('2026-04-12T00:00:00.000Z') }],
      },
    ];
    const total = 22;

    mockPrismaService.customer.findMany.mockResolvedValue(rawData);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.findAll(2, 10, undefined, 'user-1');

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: { userCustomers: { some: { userId: 'user-1' } } },
      orderBy: { data_criacao_usuario: 'desc' },
      include: {
        _count: {
          select: { sales: true },
        },
        userCustomers: {
          where: { userId: 'user-1' },
          select: { created_at: true },
          take: 1,
        },
      },
      skip: 10,
      take: 10,
    });
    expect(mockPrismaService.customer.count).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: rawData.map(({ userCustomers, _count, ...c }) => ({
        ...c,
        nome: c.nome_completo,
        nomeCompleto: c.nome_completo,
        razao_social: c.nome_completo,
        tel: c.telefone_celular,
        celular: c.telefone_celular,
        cpf_cnpj: c.cpf,
        user_customer_created_at: userCustomers[0]?.created_at,
        sales_count: _count.sales,
      })),
      meta: { total: 22, page: 2, lastPage: 3 },
    });
  });

  it('should use default page=1 and limit=10 when called without arguments', async () => {
    const rawData = [
      {
        id: 'customer-1',
        nome_completo: 'Maria Silva',
        telefone_celular: undefined,
        cpf: undefined,
        razao_social: undefined,
        _count: { sales: 2 },
        userCustomers: [{ created_at: new Date('2026-04-10T00:00:00.000Z') }],
      },
    ];
    const total = 1;

    mockPrismaService.customer.findMany.mockResolvedValue(rawData);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.findAll(1, 10, undefined, 'user-1');

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: { userCustomers: { some: { userId: 'user-1' } } },
      orderBy: { data_criacao_usuario: 'desc' },
      include: {
        _count: {
          select: { sales: true },
        },
        userCustomers: {
          where: { userId: 'user-1' },
          select: { created_at: true },
          take: 1,
        },
      },
      skip: 0,
      take: 10,
    });
    expect(result).toEqual({
      data: rawData.map(({ userCustomers, _count, ...c }) => ({
        ...c,
        nome: c.nome_completo,
        nomeCompleto: c.nome_completo,
        razao_social: c.nome_completo,
        tel: c.telefone_celular,
        celular: c.telefone_celular,
        cpf_cnpj: c.cpf,
        user_customer_created_at: userCustomers[0]?.created_at,
        sales_count: _count.sales,
      })),
      meta: { total: 1, page: 1, lastPage: 1 },
    });
  });

  it('should update customer by id with normalized fields', async () => {
    const updated = {
      id: 'customer-1',
      nome_completo: 'Maria Silva',
      razao_social: null,
      telefone_celular: null,
      cpf: null,
    };
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
    expect(result).toEqual({
      ...updated,
      razao_social: 'Maria Silva',
      nome: 'Maria Silva',
      nomeCompleto: 'Maria Silva',
      tel: null,
      celular: null,
      cpf_cnpj: null,
    });
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

  it('should unlink customer from user and return success message', async () => {
    mockPrismaService.userCustomer.delete.mockResolvedValue({
      userId: 'user-1',
      customerId: 'customer-1',
    });

    const result = await service.unlinkFromUser('customer-1', 'user-1');

    expect(mockPrismaService.userCustomer.delete).toHaveBeenCalledWith({
      where: {
        userId_customerId: { userId: 'user-1', customerId: 'customer-1' },
      },
    });
    expect(result).toEqual({
      message: 'Cliente removido da sua lista com sucesso.',
    });
  });

  it('should throw NotFoundException when unlinking non-existing link', async () => {
    mockPrismaService.userCustomer.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.unlinkFromUser('missing-id', 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should search customers with filters and paginated response', async () => {
    const rawData = [
      {
        id: 'customer-1',
        nome_completo: 'Maria Silva',
        telefone_celular: undefined,
        cpf: undefined,
        razao_social: undefined,
      },
    ];
    const total = 1;

    mockPrismaService.customer.findMany.mockResolvedValue(rawData);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.search(
      {
        nome: 'maria',
        email: 'lzt.com',
        cpf: '52998224725',
        page: 2,
        limit: 5,
      },
      undefined,
      'user-1',
    );

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: {
        userCustomers: { some: { userId: 'user-1' } },
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
        userCustomers: { some: { userId: 'user-1' } },
        nome_completo: { contains: 'maria', mode: 'insensitive' },
        email: { contains: 'lzt.com', mode: 'insensitive' },
        cpf: '52998224725',
      },
    });
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: rawData.map((c) => ({
        ...c,
        nome: c.nome_completo,
        nomeCompleto: c.nome_completo,
        razao_social: c.nome_completo,
        tel: c.telefone_celular,
        celular: c.telefone_celular,
        cpf_cnpj: c.cpf,
      })),
      meta: { total: 1, page: 2, lastPage: 1 },
    });
  });

  it('should use default pagination when page and limit are not provided', async () => {
    const rawData = [
      {
        id: 'customer-2',
        nome_completo: 'Joao Souza',
        telefone_celular: undefined,
        cpf: undefined,
        razao_social: undefined,
      },
    ];
    const total = 3;

    mockPrismaService.customer.findMany.mockResolvedValue(rawData);
    mockPrismaService.customer.count.mockResolvedValue(total);
    mockPrismaService.$transaction.mockImplementation(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );

    const result = await service.search({ nome: 'joao' }, undefined, 'user-1');

    expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
      where: {
        userCustomers: { some: { userId: 'user-1' } },
        nome_completo: { contains: 'joao', mode: 'insensitive' },
      },
      orderBy: { data_criacao_usuario: 'desc' },
      skip: 0,
      take: 10,
    });
    expect(mockPrismaService.customer.count).toHaveBeenCalledWith({
      where: {
        userCustomers: { some: { userId: 'user-1' } },
        nome_completo: { contains: 'joao', mode: 'insensitive' },
      },
    });
    expect(result).toEqual({
      data: rawData.map((c) => ({
        ...c,
        nome: c.nome_completo,
        nomeCompleto: c.nome_completo,
        razao_social: c.nome_completo,
        tel: c.telefone_celular,
        celular: c.telefone_celular,
        cpf_cnpj: c.cpf,
      })),
      meta: { total: 3, page: 1, lastPage: 1 },
    });
  });

  it('should return empty search result when userId is not provided', async () => {
    const result = await service.search({ nome: 'maria', page: 2, limit: 5 });

    expect(mockPrismaService.customer.findMany).not.toHaveBeenCalled();
    expect(mockPrismaService.customer.count).not.toHaveBeenCalled();
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [],
      meta: { total: 0, page: 2, lastPage: 1 },
    });
  });
});
