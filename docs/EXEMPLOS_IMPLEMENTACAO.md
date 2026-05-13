# Exemplos de Implementação - Integração Wintour

## Overview

Este arquivo contém exemplos práticos de como integrar os novos métodos nos controllers do NestJS.

## 1. Sales Controller - Criar Venda com Triagem de Cliente

### Antes (Código Antigo)

```typescript
// sales.controller.ts
@Post('create')
async createSale(
  @Body() createSaleDto: CreateSaleDto,
  @Request() req: any,
) {
  // Lógica antiga: assumia que customerId já existia
  const sale = await this.salesService.create(createSaleDto);
  return sale;
}
```

### Depois (Código Novo com Integração Wintour)

```typescript
import {
  Controller,
  Post,
  Body,
  Request,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CustomersService } from '../customers/customers.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly customersService: CustomersService,
  ) {}

  /**
   * Criar venda com triagem automática de cliente.
   *
   * Suporta 3 cenários:
   * 1. customerId informado (cliente já conhecido)
   * 2. cpfCnpj informado (busca em base local, depois global)
   * 3. cpfCnpj + customerData (novo cliente, registra em ambas as bases)
   */
  @Post('create')
  async createSale(@Body() createSaleDto: CreateSaleDto, @Request() req: any) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    // Usar novo método que faz triagem de cliente
    const result = await this.salesService.createSaleWithCustomerTriage(
      {
        customerId: createSaleDto.customerId,
        cpfCnpj: createSaleDto.cpfCnpj,
        customerData: createSaleDto.customerData,
        origin: createSaleDto.origin,
        destination: createSaleDto.destination,
        departureDate: new Date(createSaleDto.departureDate),
        returnDate: createSaleDto.returnDate
          ? new Date(createSaleDto.returnDate)
          : undefined,
        travelType: createSaleDto.travelType || 'ONE_WAY',
        servicesData: createSaleDto.servicesData,
        paymentMethod: createSaleDto.paymentMethod,
        totalValue: createSaleDto.totalValue,
      },
      userId,
      this.customersService,
    );

    return {
      success: true,
      saleId: result.sale.id,
      customerSource: result.customerSource, // 'local' | 'global' | 'new'
      status: result.sale.servicesData?.status || 'PENDING',
      message: `Venda criada com sucesso. Cliente origem: ${result.customerSource}`,
    };
  }

  /**
   * Buscar cliente por CPF/CNPJ com escopo de usuário.
   * Útil para validação em tempo real no frontend.
   */
  @Get('customers/search/:cpfCnpj')
  async searchCustomerByCpf(
    @Param('cpfCnpj') cpfCnpj: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;

    try {
      const result = await this.customersService.findByCpfWithUserScope(
        cpfCnpj,
        userId,
      );

      return {
        found: true,
        customer: result.customer,
        source: result.source, // 'local' ou 'global'
      };
    } catch (error) {
      return {
        found: false,
        source: null,
        message: 'Cliente não encontrado. Será necessário cadastro novo.',
      };
    }
  }

  /**
   * Atualizar status de venda para APPROVED.
   * Chamado pela Lambda de faturamento do Wintour.
   */
  @Patch(':id/approve')
  async approveSale(@Param('id') saleId: string) {
    const updated = await this.salesService.updateSaleStatusToApproved(saleId);

    return {
      success: true,
      saleId: updated.id,
      status: updated.servicesData?.status || 'APPROVED',
      message: 'Venda aprovada com sucesso',
    };
  }
}
```

## 2. Customers Controller - Busca Global

### Novo Endpoint para Busca Inteligente

```typescript
import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerInput } from './dto/create-customer.input';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Busca cliente por CPF/CNPJ com escopo de usuário.
   *
   * Fluxo:
   * 1. Se encontrado na base local do usuário → retorna com source: 'local'
   * 2. Se não encontrado localmente, busca na base global → retorna com source: 'global'
   * 3. Se não encontrado em nenhuma base → 404
   */
  @Get('find/:cpfCnpj')
  async findCustomerScoped(
    @Param('cpfCnpj') cpfCnpj: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;

    const result = await this.customersService.findByCpfWithUserScope(
      cpfCnpj,
      userId,
    );

    return {
      ...result.customer,
      _source: result.source,
      _metadata: {
        source: result.source,
        foundIn:
          result.source === 'local'
            ? 'Base local do usuário'
            : 'Base global (Wintour)',
      },
    };
  }

  /**
   * Registrar novo cliente em ambas as bases.
   *
   * Fluxo:
   * 1. Cria na base local
   * 2. Registra na base global (Wintour)
   * 3. Retorna metadata sobre criação
   */
  @Post('register-both')
  async registerCustomerInBothSources(
    @Body() createCustomerInput: CreateCustomerInput,
    @Request() req: any,
  ) {
    const userId = req.user?.id;

    const result = await this.customersService.createCustomerInBothSources(
      createCustomerInput,
      userId,
    );

    return {
      success: true,
      customer: result.customer,
      createdIn: {
        local: result.createdInLocal,
        global: result.createdInGlobal,
        message: result.createdInLocal
          ? 'Cliente registrado com sucesso em ambas as bases'
          : 'Cliente já existia',
      },
    };
  }

  /**
   * Vincular cliente da base global ao usuário logado.
   *
   * Caso de uso:
   * - Cliente foi encontrado na base global
   * - Usuário iniciou uma venda com esse cliente
   * - Sistema vincula o cliente ao usuário para futuras buscas
   */
  @Post(':customerId/link-to-user')
  async linkCustomerToUser(
    @Param('customerId') customerId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    const linked = await this.customersService.linkGlobalCustomerToUser(
      customerId,
      userId,
    );

    return {
      success: true,
      customer: linked,
      message: 'Cliente vinculado ao seu perfil',
    };
  }
}
```

## 3. DTOs - Atualização

### CreateSaleDto com Suporte a Triagem

```typescript
// sales/dto/create-sale.dto.ts
import { IsOptional, IsString, IsDate, IsNumber } from 'class-validator';

export class CreateSaleDto {
  // Identificação do cliente (uma das 3 opções)
  @IsOptional()
  @IsString()
  customerId?: string; // Cliente já conhecido (ID direto)

  @IsOptional()
  @IsString()
  cpfCnpj?: string; // CPF/CNPJ para busca em bases

  @IsOptional()
  customerData?: {
    // Dados para registrar novo cliente
    nome?: string;
    nome_completo?: string;
    nomeCompleto?: string;
    cpf_cnpj?: string;
    cpfCnpj?: string;
    cpf?: string;
    email?: string;
    emailAddress?: string;
    e_mail?: string;
    telefone_celular?: string;
    telefoneCelular?: string;
    celular?: string;
    tel?: string;
    endereco?: string;
    enderecoCompleto?: string;
    cep?: string;
    codigoPostal?: string;
    logradouro?: string;
    logadouro?: string;
    bairro?: string;
    district?: string;
    cidade?: string;
    municipio?: string;
    city?: string;
    estado?: string;
    uf?: string;
    state?: string;
    razao_social?: string;
    razaoSocial?: string;
  };

  // Dados da venda
  @IsString()
  destination: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsDate()
  departureDate: Date;

  @IsOptional()
  @IsDate()
  returnDate?: Date;

  @IsOptional()
  @IsString()
  travelType?: string; // 'ONE_WAY', 'ROUND_TRIP', etc

  // Detalhes de pagamento
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @IsOptional()
  servicesData?: Record<string, any>;
}
```

## 4. Exemplo de Fluxo Completo no Frontend

### React Component - Buscar e Criar Venda

```typescript
// components/CreateSaleForm.tsx
import React, { useState } from 'react';
import { apiFetch } from '../lib/axios';

export function CreateSaleForm() {
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [customerData, setCustomerData] = useState<any>(null);
  const [customerSource, setCustomerSource] = useState<
    'local' | 'global' | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Buscar cliente ao digitar CPF/CNPJ
  const handleSearchCustomer = async (value: string) => {
    setCpfCnpj(value);

    if (value.length < 11) return;

    try {
      setIsLoading(true);
      const response = await apiFetch(`/customers/find/${value}`);
      setCustomerData(response);
      setCustomerSource(response._source);
    } catch (error) {
      // Cliente não encontrado - será necessário cadastro novo
      setCustomerData(null);
      setCustomerSource(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Criar venda com triagem automática
  const handleCreateSale = async (saleData: any) => {
    try {
      setIsLoading(true);

      const payload = {
        cpfCnpj, // Sistema fará triagem automática
        customerData:
          !customerSource && customerData ? customerData : undefined,
        destination: saleData.destination,
        departureDate: saleData.departureDate,
        totalValue: saleData.totalValue,
      };

      const response = await apiFetch('/sales/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Mostrar origem do cliente
      let sourceMessage = '';
      if (response.customerSource === 'local') {
        sourceMessage = '✅ Cliente já estava cadastrado para você';
      } else if (response.customerSource === 'global') {
        sourceMessage = '🌐 Cliente encontrado na base global e vinculado';
      } else if (response.customerSource === 'new') {
        sourceMessage = '✨ Novo cliente registrado com sucesso';
      }

      alert(`Venda criada!\n${sourceMessage}`);
      return response;
    } catch (error) {
      alert('Erro ao criar venda: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <input
        placeholder="CPF/CNPJ"
        value={cpfCnpj}
        onChange={(e) => handleSearchCustomer(e.target.value)}
        disabled={isLoading}
      />

      {customerData && (
        <div>
          <p>
            {customerData.nome}
            <span
              style={{
                marginLeft: '10px',
                fontSize: '12px',
                color: customerSource === 'local' ? 'green' : 'orange',
              }}
            >
              ({customerSource === 'local' ? 'Seu cadastro' : 'Base global'})
            </span>
          </p>
        </div>
      )}

      {!customerData && cpfCnpj.length >= 11 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Mostrar form de cadastro novo
          }}
        >
          <input type="text" placeholder="Nome completo" />
          <input type="email" placeholder="Email" />
          {/* Mais campos... */}
        </form>
      )}
    </div>
  );
}
```

## 5. Workflow de Integração com Wintour (Futuro)

### Lambda Wintour → Backend

```typescript
// Exemplo de como a Lambda Wintour chamará o backend

// 1. Após validação de faturamento
const updateStatusPayload = {
  saleId: 'sale_456',
  status: 'APPROVED',
  wintourConfirmation: {
    faturaId: 'fat_789',
    dataEmissao: '2026-05-12',
    valorTotal: 2500.0,
  },
};

// Chama backend
const response = await fetch('https://backend.api.com/sales/sale_456/approve', {
  method: 'PATCH',
  body: JSON.stringify(updateStatusPayload),
  headers: { 'X-API-Key': process.env.BACKEND_API_KEY },
});

// Response esperado
const result = await response.json();
console.log(result);
// {
//   success: true,
//   saleId: 'sale_456',
//   status: 'APPROVED',
//   message: 'Venda aprovada com sucesso'
// }
```

## 6. Roadmap - TODOs de Implementação

### Curto Prazo (Próximas sprints)

- [ ] Implementar validação de DTO com class-validator
- [ ] Adicionar testes unitários para triagem de cliente
- [ ] Documentar no Swagger/OpenAPI
- [ ] Implementar rate limiting para buscas de cliente

### Médio Prazo

- [ ] Integrar com API SOAP do Wintour para `registerCustomer()`
- [ ] Adicionar campo `user_id` ao modelo Customer
- [ ] Implementar lógica real de vínculo em `linkGlobalCustomerToUser()`
- [ ] Criar endpoint webhook para Lambda Wintour

### Longo Prazo

- [ ] Cache distribuído para buscas de cliente (Redis)
- [ ] Sincronização bidirecional com Wintour
- [ ] Dashboard de auditoria de clientes vinculados
- [ ] Relatórios de origem de clientes por vendedor

## Nota: Compatibilidade Retroativa

Todos os exemplos acima são **adições** ao código existente. Nenhuma funcionalidade anterior foi removida ou quebrada. Você pode:

✅ Usar `customerId` direto (modo antigo)
✅ Usar `cpfCnpj` com busca automática (novo)
✅ Usar `cpfCnpj + customerData` para novo cliente (novo)

Escolha a abordagem que fizer mais sentido para seu caso de uso!
