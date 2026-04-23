import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'nestjs-prisma';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  let service: SalesService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
    },
    wintourHeader: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockFetch = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.WINTOUR_SOAP_PIN = 'pin-de-teste';
    process.env.WINTOUR_SOAP_URL = 'https://wintour.test/soap';
    global.fetch = mockFetch as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: mockPrismaService },
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

  describe('createWintourImport', () => {
    it('should create the import locally and integrate with Wintour', async () => {
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
      });
      mockPrismaService.wintourHeader.update.mockResolvedValue({
        id: 'header-1',
        ...importData,
        integration_status: 'success',
        integration_protocol: 'PROTOCOLO-123',
        integration_raw_response: '<soap:Envelope />',
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

    it('should return integration error details when Wintour fails', async () => {
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

    it('should treat Wintour application error in return body as integration failure', async () => {
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
});
