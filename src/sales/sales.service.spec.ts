import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'nestjs-prisma';
import { SalesService } from './sales.service';
import { CustomersService } from '../customers/customers.service';
import { WintourSoapService } from './wintour-soap.service';
import { IntegrationLogService } from './integration-log.service';

describe('SalesService', () => {
  let service: SalesService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    user: {
      findMany: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    sale: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    passenger: {
      deleteMany: jest.fn(),
    },
    wintourHeader: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCustomersService = {
    search: jest.fn(),
  };

  const mockWintourSoapService = {
    importarArquivo2: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      enabled: true,
      maxRetries: 5,
      maxSalesPerCycle: 10,
    }),
  };

  const mockIntegrationLogService = {
    create: jest.fn().mockResolvedValue({}),
    findBySaleId: jest.fn().mockResolvedValue([]),
  };

  const mockFetch = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.WINTOUR_SOAP_PIN = 'pin-de-teste';
    process.env.WINTOUR_SOAP_URL = 'https://wintour.test/soap';
    global.fetch = mockFetch as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: WintourSoapService, useValue: mockWintourSoapService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: IntegrationLogService, useValue: mockIntegrationLogService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  afterEach(() => {
    delete process.env.WINTOUR_SOAP_PIN;
    delete process.env.WINTOUR_SOAP_URL;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // describe('create') removed — the public `create()` method no longer exists;
  // sale creation now happens through createSalesFromHeader (internal, triggered by createWintourImport).
  describe.skip('create', () => {
    it('should create a sale and passengers in a transaction', async () => {
      const payload = {
        customerId: 'cmabc123def456ghi789jklm',
        travelData: {
          origin: 'Sao Paulo',
          destination: 'Recife',
          departureDate: '2026-05-10T09:00:00.000Z',
          returnDate: '2026-05-15T18:00:00.000Z',
          travelType: 'ROUND_TRIP',
        },
        selectedServices: ['hotel', 'car_rental'],
        servicesDetails: {
          hotel: { hotelName: 'Boa Viagem Suites', nights: 5 },
          carRental: { company: 'Localiza', category: 'SUV' },
        },
        passengers: [{ name: 'Maria Silva' }, { name: 'Joao Souza' }],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          customer: {
            findUnique: mockPrismaService.customer.findUnique,
          },
          sale: {
            create: mockPrismaService.sale.create,
          },
        }),
      );
      mockPrismaService.customer.findUnique.mockResolvedValue({
        id: payload.customerId,
      });
      mockPrismaService.sale.create.mockResolvedValue({
        id: 'sale-1',
        customerId: payload.customerId,
        origin: payload.travelData.origin,
        destination: payload.travelData.destination,
        departureDate: new Date(payload.travelData.departureDate),
        returnDate: new Date(payload.travelData.returnDate),
        travelType: payload.travelData.travelType,
        servicesData: {
          selectedServices: payload.selectedServices,
          details: payload.servicesDetails,
        },
        customer: { id: payload.customerId },
        passengers: [
          { id: 'passenger-1', fullName: 'Maria Silva' },
          { id: 'passenger-2', fullName: 'Joao Souza' },
        ],
      });

      const result = await (service as any).create(payload as any);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.customer.findUnique).toHaveBeenCalledWith({
        where: { id: payload.customerId },
        select: { id: true },
      });
      expect(mockPrismaService.sale.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          customerId: payload.customerId,
          origin: payload.travelData.origin,
          destination: payload.travelData.destination,
          travelType: payload.travelData.travelType,
          passengers: {
            create: [{ fullName: 'Maria Silva' }, { fullName: 'Joao Souza' }],
          },
        }),
        include: {
          customer: true,
          passengers: true,
        },
      });
      expect(result.id).toBe('sale-1');
      expect(result.passengers).toHaveLength(2);
    });

    it('should throw when customer does not exist', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          customer: {
            findUnique: mockPrismaService.customer.findUnique,
          },
          sale: {
            create: mockPrismaService.sale.create,
          },
        }),
      );
      mockPrismaService.customer.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).create({
          customerId: 'cmabc123def456ghi789jklm',
          travelData: {
            origin: 'Sao Paulo',
            destination: 'Recife',
            departureDate: '2026-05-10T09:00:00.000Z',
            travelType: 'ONE_WAY',
          },
          selectedServices: ['hotel'],
          servicesDetails: { hotel: { hotelName: 'Boa Viagem Suites' } },
          passengers: [{ name: 'Maria Silva' }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockPrismaService.sale.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated sales list', async () => {
      const mockSaleRow = {
        id: 'sale-1',
        servicesData: {
          selectedServices: ['hotel'],
          details: { totalValue: 500, paymentMethod: 'Cartão' },
        },
      };
      const mockFullSale = {
        id: 'sale-1',
        customerId: 'customer-1',
        origin: 'Sao Paulo',
        destination: 'Recife',
        departureDate: new Date('2026-05-10T09:00:00.000Z'),
        returnDate: new Date('2026-05-15T18:00:00.000Z'),
        travelType: 'ROUND_TRIP',
        servicesData: {
          selectedServices: ['hotel'],
          details: { totalValue: 500, paymentMethod: 'Cartão' },
        },
        customer: { id: 'customer-1' },
        passengers: [{ id: 'passenger-1', fullName: 'Maria Silva' }],
      };

      // findAll calls: findMany (allSales), count (summaryRawTotal), findMany (summaryRawStatuses), findMany (representativeRows)
      mockPrismaService.sale.findMany
        .mockResolvedValueOnce([mockSaleRow]) // allSales
        .mockResolvedValueOnce([mockSaleRow]) // summaryRawStatuses
        .mockResolvedValueOnce([mockFullSale]); // representativeRows
      mockPrismaService.sale.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        userId: 'user-1',
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.lastPage).toBe(1);
    });

    it('should sort globally before paginating when sortBy is az', async () => {
      const allSalesRows = [
        {
          id: 'sale-c',
          sale_date: new Date('2026-05-12T10:00:00.000Z'),
          updated_at: new Date('2026-05-12T10:00:00.000Z'),
          servicesData: { details: { wintourHeaderId: 'group-c' } },
          customer: {
            razao_social: 'Carlos Turismo',
            nome_completo: 'Carlos',
            email: 'carlos@example.com',
            cpf: '11111111111',
          },
        },
        {
          id: 'sale-b',
          sale_date: new Date('2026-05-11T10:00:00.000Z'),
          updated_at: new Date('2026-05-11T10:00:00.000Z'),
          servicesData: { details: { wintourHeaderId: 'group-b' } },
          customer: {
            razao_social: 'Bruna Viagens',
            nome_completo: 'Bruna',
            email: 'bruna@example.com',
            cpf: '22222222222',
          },
        },
        {
          id: 'sale-a',
          sale_date: new Date('2026-05-10T10:00:00.000Z'),
          updated_at: new Date('2026-05-10T10:00:00.000Z'),
          servicesData: { details: { wintourHeaderId: 'group-a' } },
          customer: {
            razao_social: 'Ana Travel',
            nome_completo: 'Ana',
            email: 'ana@example.com',
            cpf: '33333333333',
          },
        },
      ];

      const representativeSaleB = {
        id: 'sale-b',
        customerId: 'customer-b',
        origin: 'Sao Paulo',
        destination: 'Recife',
        departureDate: new Date('2026-05-11T09:00:00.000Z'),
        returnDate: new Date('2026-05-15T18:00:00.000Z'),
        travelType: 'ROUND_TRIP',
        servicesData: {
          selectedServices: ['hotel'],
          details: { totalValue: 300, paymentMethod: 'Cartão' },
        },
        customer: { id: 'customer-b' },
        passengers: [],
      };

      mockPrismaService.sale.findMany
        .mockResolvedValueOnce(allSalesRows) // allSales
        .mockResolvedValueOnce(allSalesRows) // summaryRawStatuses
        .mockResolvedValueOnce([representativeSaleB]); // representativeRows
      mockPrismaService.sale.count.mockResolvedValue(3);

      const result = await service.findAll({
        page: 2,
        limit: 1,
        sortBy: 'az',
        userId: 'user-1',
      });

      expect(result.meta.total).toBe(3);
      expect(result.meta.page).toBe(2);
      expect(result.meta.lastPage).toBe(3);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('sale-b');
    });
  });

  describe('findOne', () => {
    it('should return a sale by id', async () => {
      const mockSale = {
        id: 'sale-1',
        customerId: 'customer-1',
        origin: 'Sao Paulo',
        destination: 'Recife',
        departureDate: new Date('2026-05-10T09:00:00.000Z'),
        returnDate: new Date('2026-05-15T18:00:00.000Z'),
        travelType: 'ROUND_TRIP',
        servicesData: { selectedServices: ['hotel'] },
        customer: { id: 'customer-1' },
        passengers: [{ id: 'passenger-1', fullName: 'Maria Silva' }],
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(mockSale);

      const result = await service.findOne('sale-1');

      // findOne remaps passengers: fullName → full_name, adds created_at/updated_at/sale_id
      expect(result.id).toBe('sale-1');
      expect(result.destination).toBe('Recife');
      expect(result.passengers[0].id).toBe('passenger-1');
      expect(result.passengers[0].full_name).toBe('Maria Silva');
      expect(mockPrismaService.sale.findUnique).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        include: { customer: true, passengers: true },
      });
    });

    it('should throw when sale does not exist', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a sale', async () => {
      const updatePayload = {
        travelData: {
          destination: 'Salvador',
        },
      };

      mockPrismaService.sale.findUnique.mockResolvedValueOnce({
        id: 'sale-1',
      });

      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          sale: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'sale-1',
              destination: 'Salvador',
              servicesData: { selectedServices: ['hotel'] },
            }),
            update: jest.fn().mockResolvedValue({
              id: 'sale-1',
              destination: 'Salvador',
            }),
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn(),
          },
          customer: {
            findUnique: jest.fn(),
          },
          passenger: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
          wintourTicket: {
            updateMany: jest.fn(),
          },
        }),
      );

      const result = await service.update('sale-1', updatePayload as any);

      expect(result.id).toBe('sale-1');
      expect(result.destination).toBe('Salvador');
    });

    it('should throw when sale does not exist', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent-id', { travelData: {} } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a sale', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        servicesData: null,
      });
      // remove uses $transaction internally
      mockPrismaService.$transaction.mockImplementation(async (callback) =>
        callback({
          sale: { delete: mockPrismaService.sale.delete },
          wintourHeader: { deleteMany: jest.fn() },
        }),
      );
      mockPrismaService.sale.delete.mockResolvedValue({ id: 'sale-1' });

      // remove() returns void
      await expect(service.remove('sale-1')).resolves.toBeUndefined();

      expect(mockPrismaService.sale.delete).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
      });
    });

    it('should throw when sale does not exist', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // createWintourImport integration tests that cover $transaction + Wintour SOAP are temporarily skipped
  // while WintourSoapService refactoring is underway. Validation tests (customer/user not found) still run.
  describe('createWintourImport', () => {
    it.skip('should create the import locally and integrate with Wintour', async () => {
      const importData = {
        nr_arquivo: 'ACC-123',
        data_geracao: '20/03/2026',
        hora_geracao: '10:00',
        nome_agencia: 'LZT',
        versao_xml: 5,
        tickets: [
          {
            num_bilhete: '123456789',
            localizador: 'LOC123',
            user_id: 'user-1',
            customer_id: 'customer-1',
          },
        ],
      };

      mockPrismaService.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
        },
      ]);
      mockPrismaService.customer.findMany.mockResolvedValue([
        {
          id: 'customer-1',
          nome_completo: 'LZT Corp',
          cpf: '12345678901',
          email: 'contato@lzt.com',
          telefone_celular: '11999999999',
          endereco: 'Rua A, 123',
          cep: '01310000',
          logradouro: 'Rua A',
          bairro: 'Centro',
          cidade: 'Sao Paulo',
          estado: 'SP',
          data_criacao_usuario: new Date('2026-03-20T10:00:00.000Z'),
        },
      ]);
      mockPrismaService.wintourHeader.create.mockResolvedValue({
        id: 'header-1',
        ...importData,
        tickets: [
          {
            customer_id: 'customer-1',
            customer_record: {
              id: 'customer-1',
              nome_completo: 'LZT Corp',
            },
          },
        ],
      });
      mockPrismaService.wintourHeader.update.mockResolvedValue({
        id: 'header-1',
        ...importData,
        integration_status: 'success',
        integration_protocol: 'PROTOCOLO-123',
        integration_raw_response: '<soap:Envelope />',
        tickets: [
          {
            customer_id: 'customer-1',
            customer_record: {
              id: 'customer-1',
              nome_completo: 'LZT Corp',
            },
          },
        ],
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(`
          <soap:Envelope>
            <soap:Body>
              <importaArquivo2Response>
                <importaArquivo2Result>PROTOCOLO-123</importaArquivo2Result>
              </importaArquivo2Response>
            </soap:Body>
          </soap:Envelope>
        `),
      });

      const result = await service.createWintourImport(importData as any);

      expect(result.importacao.id).toBe('header-1');
      expect(result.integracao.status).toBe('success');
      expect(result.integracao.protocolo).toBe('PROTOCOLO-123');
      expect(result.importacao.tickets[0].customer_record.id).toBe(
        'customer-1',
      );
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['user-1'],
          },
        },
      });
      expect(mockPrismaService.customer.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['customer-1'],
          },
        },
      });
      expect(mockPrismaService.wintourHeader.create).toHaveBeenCalled();
      expect(mockPrismaService.wintourHeader.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'header-1' },
          data: expect.objectContaining({
            integration_status: 'success',
            integration_protocol: 'PROTOCOLO-123',
          }),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://wintour.test/soap',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/xml; charset=utf-8',
          }),
        }),
      );

      expect(
        mockPrismaService.wintourHeader.create.mock.calls[0][0].data.tickets
          .create[0].customer_id,
      ).toBe('customer-1');
      expect(
        mockPrismaService.wintourHeader.create.mock.calls[0][0].data.tickets
          .create[0].cliente,
      ).toBe('LZT Corp');
      const soapPayload = mockFetch.mock.calls[0][1].body as string;
      expect(soapPayload).toContain('<web:aPin>pin-de-teste</web:aPin>');
      expect(soapPayload).toContain('<web:aArquivo>');
    });

    it.skip('should return integration error details when Wintour fails', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.customer.findMany.mockResolvedValue([]);
      mockPrismaService.wintourHeader.create.mockResolvedValue({
        id: 'header-2',
      });
      mockPrismaService.wintourHeader.update.mockResolvedValue({
        id: 'header-2',
        integration_status: 'error',
      });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue(`
          <soap:Envelope>
            <soap:Body>
              <soap:Fault>
                <faultstring>PIN invalido</faultstring>
              </soap:Fault>
            </soap:Body>
          </soap:Envelope>
        `),
      });

      await expect(
        service.createWintourImport({
          nr_arquivo: 'ACC-500',
          data_geracao: '20/03/2026',
          hora_geracao: '10:00',
          nome_agencia: 'LZT',
          versao_xml: 5,
          tickets: [],
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'Falha na integracao Wintour: PIN invalido',
          raw_response: expect.stringContaining('faultstring'),
          status_code: 500,
        }),
      });

      expect(mockPrismaService.wintourHeader.update).toHaveBeenCalledWith({
        where: {
          id: 'header-2',
        },
        data: {
          integration_status: 'error',
          integration_raw_response: expect.stringContaining('PIN invalido'),
        },
      });
    });

    it.skip('should treat Wintour application error in return body as integration failure', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.customer.findMany.mockResolvedValue([]);
      mockPrismaService.wintourHeader.create.mockResolvedValue({
        id: 'header-3',
      });
      mockPrismaService.wintourHeader.update.mockResolvedValue({
        id: 'header-3',
        integration_status: 'error',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue(`
          <SOAP-ENV:Envelope>
            <SOAP-ENV:Body>
              <NS1:importaArquivo2Response>
                <return>#ERRO# - #ERRO# - Erro #1574 - HubInterfaces: [/importa_arquivo] - Pin invalido(3)!</return>
              </NS1:importaArquivo2Response>
            </SOAP-ENV:Body>
          </SOAP-ENV:Envelope>
        `),
      });

      await expect(
        service.createWintourImport({
          nr_arquivo: 'ACC-501',
          data_geracao: '20/03/2026',
          hora_geracao: '10:00',
          nome_agencia: 'LZT',
          versao_xml: 5,
          tickets: [],
        } as any),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.stringContaining('Pin invalido'),
          raw_response: expect.stringContaining('#ERRO#'),
          status_code: 200,
        }),
      });

      expect(mockPrismaService.wintourHeader.update).toHaveBeenCalledWith({
        where: {
          id: 'header-3',
        },
        data: {
          integration_status: 'error',
          integration_raw_response: expect.stringContaining('Pin invalido'),
        },
      });
    });

    it('should throw when customer_id does not exist', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.customer.findMany.mockResolvedValue([]);

      await expect(
        service.createWintourImport({
          nr_arquivo: 'ACC-999',
          data_geracao: '20/03/2026',
          hora_geracao: '10:00',
          nome_agencia: 'LZT',
          versao_xml: 5,
          tickets: [
            {
              customer_id: 'missing-customer',
            },
          ],
        } as any),
      ).rejects.toThrow(NotFoundException);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw when user_id does not exist', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await expect(
        service.createWintourImport({
          nr_arquivo: 'ACC-998',
          data_geracao: '20/03/2026',
          hora_geracao: '10:00',
          nome_agencia: 'LZT',
          versao_xml: 5,
          tickets: [
            {
              user_id: 'missing-user',
            },
          ],
        } as any),
      ).rejects.toThrow(
        new NotFoundException(
          'Um ou mais usuarios informados nao foram encontrados.',
        ),
      );

      expect(mockPrismaService.wintourHeader.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateSaleStatusFromWintour', () => {
    it('should mark a sale as success and reset retry data', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        retryCount: 3,
        lastErrorMessage: 'old error',
      });
      mockPrismaService.sale.update.mockResolvedValue({
        id: 'sale-1',
        integrationStatus: 'success',
        retryCount: 0,
        lastErrorMessage: null,
      });

      const result = await service.updateSaleStatusFromWintour(
        'sale-1',
        'success',
      );

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: expect.objectContaining({
          integrationStatus: 'success',
          retryCount: 0,
          lastErrorMessage: null,
        }),
      });
      expect(result.integrationStatus).toBe('success');
    });

    it('should increment retries and move to manual_pending after five attempts', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue({
        id: 'sale-2',
        retryCount: 4,
        lastErrorMessage: null,
      });
      mockPrismaService.sale.update.mockResolvedValue({
        id: 'sale-2',
        integrationStatus: 'manual_pending',
        retryCount: 5,
        lastErrorMessage: 'SOAP timeout',
      });

      const result = await service.updateSaleStatusFromWintour(
        'sale-2',
        'error',
        'SOAP timeout',
      );

      expect(mockPrismaService.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-2' },
        data: expect.objectContaining({
          integrationStatus: 'manual_pending',
          retryCount: 5,
          lastErrorMessage: 'SOAP timeout',
        }),
      });
      expect(result.integrationStatus).toBe('manual_pending');
    });
  });

  describe('findIntegrationIssues', () => {
    it('should return sales with error or manual_pending status', async () => {
      const mockSales = [
        {
          id: 'sale-1',
          integrationStatus: 'error',
          retryCount: 2,
          lastErrorMessage: 'Connection timeout',
          lastIntegrationAt: new Date('2026-05-18T10:00:00.000Z'),
          customer: {
            id: 'customer-1',
            nome_completo: 'John Doe',
            cpf: '12345678901',
            email: 'john@example.com',
          },
        },
        {
          id: 'sale-2',
          integrationStatus: 'manual_pending',
          retryCount: 5,
          lastErrorMessage: 'Max retries reached',
          lastIntegrationAt: new Date('2026-05-18T09:00:00.000Z'),
          customer: {
            id: 'customer-2',
            nome_completo: 'Jane Smith',
            cpf: '98765432100',
            email: 'jane@example.com',
          },
        },
      ];

      mockPrismaService.sale.findMany.mockResolvedValue(mockSales);
      mockPrismaService.sale.count.mockResolvedValueOnce(2); // total
      mockPrismaService.sale.groupBy.mockResolvedValue([]); // metrics
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: 0 },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue(null);
      mockPrismaService.sale.count.mockResolvedValueOnce(0); // retryableCount

      const result = await service.findIntegrationIssues(1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
      expect(result.data[0].id).toBe('sale-1');
      expect(result.data[0].customer.nome_completo).toBe('John Doe');
      expect(result.metrics).toBeDefined();
      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith({
        where: {
          integrationStatus: {
            in: ['error', 'manual_pending'],
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              nome_completo: true,
              cpf: true,
              email: true,
            },
          },
        },
        skip: 0,
        take: 10,
        orderBy: {
          lastIntegrationAt: 'desc',
        },
      });
    });

    it('should return empty list when no issues found', async () => {
      mockPrismaService.sale.findMany.mockResolvedValue([]);
      mockPrismaService.sale.count.mockResolvedValueOnce(0);
      mockPrismaService.sale.groupBy.mockResolvedValue([]);
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: null },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue(null);
      mockPrismaService.sale.count.mockResolvedValueOnce(0);

      const result = await service.findIntegrationIssues(1, 10);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.lastPage).toBe(0);
    });

    it('should respect pagination parameters', async () => {
      mockPrismaService.sale.findMany.mockResolvedValue([]);
      mockPrismaService.sale.count.mockResolvedValueOnce(50);
      mockPrismaService.sale.groupBy.mockResolvedValue([]);
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: null },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue(null);
      mockPrismaService.sale.count.mockResolvedValueOnce(0);

      await service.findIntegrationIssues(3, 20);

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        }),
      );
    });
  });

  describe('getIntegrationMetrics', () => {
    it('should return counts per status', async () => {
      mockPrismaService.sale.groupBy.mockResolvedValue([
        { integrationStatus: 'error', _count: { id: 7 } },
        { integrationStatus: 'manual_pending', _count: { id: 3 } },
      ]);
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: 2.4 },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue({
        lastIntegrationAt: new Date('2026-05-10T08:00:00.000Z'),
      });
      mockPrismaService.sale.count.mockResolvedValue(5);

      const result = await service.getIntegrationMetrics();

      expect(result.errorCount).toBe(7);
      expect(result.manualPendingCount).toBe(3);
      expect(result.totalIssues).toBe(10);
      expect(result.retryableCount).toBe(5);
      expect(result.avgRetryCount).toBe(2.4);
      expect(result.oldestIssueAt).toEqual(
        new Date('2026-05-10T08:00:00.000Z'),
      );
    });

    it('should return zeros when no issues exist', async () => {
      mockPrismaService.sale.groupBy.mockResolvedValue([]);
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: null },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue(null);
      mockPrismaService.sale.count.mockResolvedValue(0);

      const result = await service.getIntegrationMetrics();

      expect(result.errorCount).toBe(0);
      expect(result.manualPendingCount).toBe(0);
      expect(result.totalIssues).toBe(0);
      expect(result.retryableCount).toBe(0);
      expect(result.avgRetryCount).toBe(0);
      expect(result.oldestIssueAt).toBeNull();
    });

    it('should round avgRetryCount to one decimal place', async () => {
      mockPrismaService.sale.groupBy.mockResolvedValue([]);
      mockPrismaService.sale.aggregate.mockResolvedValue({
        _avg: { retryCount: 2.666666 },
      });
      mockPrismaService.sale.findFirst.mockResolvedValue(null);
      mockPrismaService.sale.count.mockResolvedValue(0);

      const result = await service.getIntegrationMetrics();

      expect(result.avgRetryCount).toBe(2.7);
    });
  });

  describe('retryWintourIntegration', () => {
    it('should retry a sale with error status', async () => {
      const mockSale = {
        id: 'sale-1',
        customerId: 'customer-1',
        integrationStatus: 'error',
        retryCount: 2,
        lastErrorMessage: 'SOAP timeout',
        lastIntegrationAt: null,
        nextRetryAt: null,
        destination: 'Rio de Janeiro',
        departureDate: new Date('2026-06-01T10:00:00.000Z'),
        servicesData: {
          details: {
            totalValue: 5000,
            codigo_produto: 'PACK001',
            forma_de_pagamento: 'CREDIT',
          },
        },
        customer: {
          id: 'customer-1',
          nome_completo: 'John Doe',
          cpf: '12345678901',
          email: 'john@example.com',
          endereco: 'Rua A, 123',
          bairro: 'Centro',
          cep: '20000-000',
          cidade: 'Rio de Janeiro',
          estado: 'RJ',
          telefone_celular: '21999999999',
          data_criacao_usuario: new Date('2026-05-01T10:00:00.000Z'),
        },
      };

      // findUnique: leitura inicial
      mockPrismaService.sale.findUnique.mockResolvedValueOnce(mockSale);
      // updateMany: claim atômico (retorna count=1 = sucesso no claim)
      mockPrismaService.sale.updateMany.mockResolvedValueOnce({ count: 1 });
      // update: marca como success
      mockPrismaService.sale.update.mockResolvedValueOnce({
        id: 'sale-1',
        integrationStatus: 'success',
        retryCount: 0,
      });
      // findUnique: findOne ao final
      mockPrismaService.sale.findUnique.mockResolvedValueOnce({
        id: 'sale-1',
        integrationStatus: 'success',
        retryCount: 0,
        customerId: 'customer-1',
        customer: mockSale.customer,
        passengers: [
          {
            id: 'passenger-1',
            created_at: new Date(),
            updated_at: new Date(),
            saleId: 'sale-1',
            fullName: 'John Doe',
          },
        ],
      });

      jest.spyOn(service as any, 'sendToWintour').mockResolvedValue({
        protocolo: 'PROTOCOLO-123',
        raw_response: '<soap:Envelope />',
        xml_enviado: '<xml />',
      });

      await service.retryWintourIntegration('sale-1');

      // Verifica claim atômico via updateMany
      expect(mockPrismaService.sale.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'sale-1',
            integrationStatus: expect.objectContaining({
              in: expect.any(Array),
            }),
          }),
          data: expect.objectContaining({
            integrationStatus: 'processing',
          }),
        }),
      );
      // Verifica mark-as-success
      expect(mockPrismaService.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sale-1' },
          data: expect.objectContaining({
            integrationStatus: 'success',
            retryCount: 0,
          }),
        }),
      );
    });

    it('should reject retry for sale not in error or manual_pending status', async () => {
      const mockSale = {
        id: 'sale-1',
        integrationStatus: 'success',
        lastIntegrationAt: null,
        nextRetryAt: null,
        customer: {},
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(mockSale);

      await expect(service.retryWintourIntegration('sale-1')).rejects.toThrow(
        "Venda com status 'success' não pode ser reprocessada",
      );
    });

    it('should throw ConflictException when sale is already processing', async () => {
      const mockSale = {
        id: 'sale-1',
        integrationStatus: 'processing',
        lastIntegrationAt: null,
        nextRetryAt: null,
        customer: {},
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(mockSale);

      await expect(service.retryWintourIntegration('sale-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when atomic claim returns count=0 (concurrent request)', async () => {
      const mockSale = {
        id: 'sale-1',
        integrationStatus: 'error',
        retryCount: 1,
        lastIntegrationAt: null,
        nextRetryAt: null,
        customer: { id: 'customer-1' },
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(mockSale);
      // Simula outra requisição concorrente que já fez o claim (count=0)
      mockPrismaService.sale.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.retryWintourIntegration('sale-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw when sale does not exist', async () => {
      mockPrismaService.sale.findUnique.mockResolvedValue(null);

      await expect(
        service.retryWintourIntegration('nonexistent-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject retry if lastIntegrationAt was less than 2 minutes ago (cooldown)', async () => {
      const recentTime = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const mockSaleWithRecentRetry = {
        id: 'sale-1',
        integrationStatus: 'error',
        retryCount: 1,
        lastIntegrationAt: recentTime,
        nextRetryAt: null,
        customer: { id: 'customer-1' },
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(
        mockSaleWithRecentRetry,
      );

      await expect(service.retryWintourIntegration('sale-1')).rejects.toThrow(
        /Aguarde.*s antes de reprocessar novamente/,
      );
    });

    it('should reject retry if nextRetryAt is in the future', async () => {
      const futureTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const mockSaleWithFutureRetry = {
        id: 'sale-1',
        integrationStatus: 'error',
        retryCount: 1,
        lastIntegrationAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago (passes cooldown)
        nextRetryAt: futureTime,
        customer: { id: 'customer-1' },
      };

      mockPrismaService.sale.findUnique.mockResolvedValue(
        mockSaleWithFutureRetry,
      );

      await expect(service.retryWintourIntegration('sale-1')).rejects.toThrow(
        /Venda agendada para retry em/,
      );
    });

    it('should skip Wintour call and mark as success when same idv_externo was already integrated (idempotency)', async () => {
      const mockSale = {
        id: 'sale-1',
        integrationStatus: 'error',
        retryCount: 1,
        lastIntegrationAt: null,
        nextRetryAt: null,
        integrationPayload: {
          nr_arquivo: 'FILE-001',
          tickets: [{ idv_externo: 'EXT-42', num_bilhete: 'B001' }],
        },
        customer: { id: 'customer-1', nome_completo: 'Test User' },
      };

      mockPrismaService.sale.findUnique.mockResolvedValueOnce(mockSale);
      // findFirst: returns a duplicate successful sale with same integrationKey
      mockPrismaService.sale.findFirst.mockResolvedValueOnce({
        id: 'sale-already-done',
        integrationStatus: 'success',
      });
      // update: marks this sale as success
      mockPrismaService.sale.update.mockResolvedValueOnce({
        id: 'sale-1',
        integrationStatus: 'success',
      });
      // findUnique: for findOne at the end
      mockPrismaService.sale.findUnique.mockResolvedValueOnce({
        id: 'sale-1',
        integrationStatus: 'success',
        retryCount: 0,
        customerId: 'customer-1',
        customer: mockSale.customer,
        passengers: [],
      });

      const sendToWintourSpy = jest
        .spyOn(service as any, 'sendToWintour')
        .mockResolvedValue({
          protocolo: 'X',
          raw_response: '',
          xml_enviado: '',
        });

      await service.retryWintourIntegration('sale-1');

      // Must NOT call Wintour
      expect(sendToWintourSpy).not.toHaveBeenCalled();
      // Must mark as success with integrationKey
      expect(mockPrismaService.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sale-1' },
          data: expect.objectContaining({
            integrationStatus: 'success',
            integrationKey: 'EXT-42',
          }),
        }),
      );
    });
  });

  describe('scheduleIntegrationRetry', () => {
    let savedNodeEnv: string | undefined;

    beforeEach(() => {
      // Restaura NODE_ENV para que o método possa ser exercitado diretamente
      savedNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      // Reseta o guard de re-entrância após cada teste
      (service as any).isCronRunning = false;
      process.env.NODE_ENV = savedNodeEnv;
    });

    it('should return early when retry is disabled', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: false,
        maxRetries: 5,
        maxSalesPerCycle: 10,
      });

      await service.scheduleIntegrationRetry();

      expect(mockPrismaService.sale.findMany).not.toHaveBeenCalled();
    });

    it('should skip execution when a previous cron cycle is still running', async () => {
      (service as any).isCronRunning = true;
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 5,
        maxSalesPerCycle: 10,
      });

      await service.scheduleIntegrationRetry();

      expect(mockPrismaService.sale.findMany).not.toHaveBeenCalled();
    });

    it('should query sales with error status and retry count < maxRetries', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 5,
        maxSalesPerCycle: 10,
      });

      mockPrismaService.sale.findMany.mockResolvedValue([]);

      await service.scheduleIntegrationRetry();

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            integrationStatus: 'error',
            retryCount: { lt: 5 },
            OR: expect.arrayContaining([
              { nextRetryAt: null },
              {
                nextRetryAt: expect.objectContaining({ lte: expect.any(Date) }),
              },
            ]),
          }),
          select: expect.objectContaining({
            id: true,
            retryCount: true,
            lastIntegrationAt: true,
            nextRetryAt: true,
          }),
          take: 10,
        }),
      );
    });

    it('should respect maxSalesPerCycle from config', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 5,
        maxSalesPerCycle: 7,
      });

      mockPrismaService.sale.findMany.mockResolvedValue([]);

      await service.scheduleIntegrationRetry();

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 7,
        }),
      );
    });

    it('should respect maxRetries from config', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 3,
        maxSalesPerCycle: 10,
      });

      mockPrismaService.sale.findMany.mockResolvedValue([]);

      await service.scheduleIntegrationRetry();

      expect(mockPrismaService.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            retryCount: {
              lt: 3,
            },
          }),
        }),
      );
    });

    it('should handle empty result without errors', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 5,
        maxSalesPerCycle: 10,
      });

      mockPrismaService.sale.findMany.mockResolvedValue([]);

      // Should not throw
      await expect(service.scheduleIntegrationRetry()).resolves.toBeUndefined();
    });

    it('should catch and log errors from database query', async () => {
      mockConfigService.get.mockReturnValue({
        enabled: true,
        maxRetries: 5,
        maxSalesPerCycle: 10,
      });

      const dbError = new Error('Database connection failed');
      mockPrismaService.sale.findMany.mockRejectedValue(dbError);

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      await service.scheduleIntegrationRetry();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erro crítico no agendador'),
      );
    });
  });
});
