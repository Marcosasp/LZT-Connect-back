# Integração Wintour - Fluxo de Triagem de Clientes

## Visão Geral

Este documento descreve as mudanças implementadas no backend para preparar a integração futura com a plataforma Wintour. O sistema agora suporta um fluxo de triagem inteligente de clientes com suporte a duas bases de dados: local (usuário logado) e global (Wintour simulado).

## Alterações de Schema (Prisma)

### Nova Migration: `20260512131535_add_wintour_integration_fields`

Adicionados campos à tabela `sales`:

```sql
-- user_id: ID do usuário que criou a venda (rastreamento)
ALTER TABLE "sales" ADD COLUMN "user_id" TEXT;

-- customer_source: Origem do cliente ('local' | 'global')
ALTER TABLE "sales" ADD COLUMN "customer_source" TEXT DEFAULT 'local';

-- Índices para melhor performance
CREATE INDEX ON "sales"("user_id");
CREATE INDEX ON "sales"("customer_source");
```

### Estrutura Atualizada

```typescript
model Sale {
  id              String      @id @default(cuid())
  created_at      DateTime    @default(now())
  sale_date       DateTime?   @map("sale_date")
  updated_at      DateTime    @updatedAt
  customerId      String      @map("customer_id")
  customer        Customer    @relation(fields: [customerId], references: [id])

  // NOVO - Rastreamento Wintour
  userId          String?     @map("user_id")
  customerSource  String      @default("local") @map("customer_source")
  // Valores: 'local' = cliente do usuário logado
  //          'global' = cliente da base Wintour

  origin          String
  destination     String
  departureDate   DateTime    @map("departure_date")
  returnDate      DateTime?   @map("return_date")
  travelType      TravelType  @map("travel_type")
  servicesData    Json?       @map("services_data")
  passengers      Passenger[]

  @@index([customerId])
  @@index([sale_date])
  @@index([userId])           // NOVO
  @@index([customerSource])   // NOVO
  @@map("sales")
}
```

## Status de Venda (Regra de Negócio)

### Status PENDING Obrigatório

Toda nova venda é **sempre criada com status `PENDING`**, independentemente do valor total.

**Localização**: `sales.service.ts` - método `createSalesFromHeader()`

```typescript
// TODO: O status será atualizado via Lambda de faturamento do Wintour.
// Por enquanto, toda nova venda é criada com status PENDING.
const status = 'PENDING';
```

**Fluxo**:

1. ✅ Venda criada com `status: PENDING`
2. ⏳ Lambda Wintour valida faturamento
3. 🔄 Lambda chama `updateSaleStatusToApproved()` para mudar para `APPROVED`

## Busca Global (Simulação Wintour)

### Novo Método: `findByCpfWithUserScope()`

Localização: `customers.service.ts`

Busca cliente com escopo de usuário, com fallback para base global:

```typescript
async findByCpfWithUserScope(
  cpfCnpj: string,
  userId?: string,
): Promise<{ customer: any; source: 'local' | 'global' }>
```

**Fluxo de Busca**:

1. Se `userId` fornecido:
   - 🔍 Busca cliente na base local do usuário
   - ✅ Se encontrado, retorna `source: 'local'`
2. Se não encontrar localmente:
   - 🌐 Busca na base "global" (Wintour simulado)
   - ✅ Se encontrado, retorna `source: 'global'`
3. Se não encontrar em nenhuma base:
   - ❌ Lança `NotFoundException`

**Uso**:

```typescript
const result = await customersService.findByCpfWithUserScope(
  '123.456.789-00',
  userId,
);
console.log(result.source); // 'local' ou 'global'
```

## Vínculo Pós-Venda

### Novo Método: `linkGlobalCustomerToUser()`

Localização: `customers.service.ts`

Vincula cliente encontrado na base global ao usuário logado:

```typescript
async linkGlobalCustomerToUser(
  customerId: string,
  userId: string,
): Promise<any>
```

**Fluxo**:

1. Cliente encontrado na base global (Wintour)
2. Venda iniciada com esse cliente
3. Sistema automáticamente vincula cliente ao usuário:
   - TODO: `UPDATE clientes SET user_id = ? WHERE id = ?`
   - (Campo `user_id` ainda não está no schema Customer, mas está pronto para ser adicionado)

**Integração Automática**:

```typescript
// No método resolveScopedCustomer():
if (result.source === 'global') {
  await customersService.linkGlobalCustomerToUser(result.customer.id, userId);
}
```

## Cadastro Novo (Duas Bases)

### Novo Método: `createCustomerInBothSources()`

Localização: `customers.service.ts`

Cria novo cliente simultaneamente na base local E na base global (Wintour simulado):

```typescript
async createCustomerInBothSources(
  data: CreateCustomerInput,
  userId?: string,
): Promise<{
  customer: any;
  createdInLocal: boolean;
  createdInGlobal: boolean;
}>
```

**Fluxo**:

1. Cliente totalmente novo (não existe em nenhuma base)
2. Sistema cria na base local:
   - ✅ `clientes` table - banco local
3. Sistema registra na base global:
   - ⏳ TODO: Integração com API Wintour
   - 🔄 Por enquanto, simulado como `createdInGlobal: true`

**Código de Integração Futura**:

```typescript
// TODO: Integração com API Wintour para registrar na base global
// Quando Wintour API estiver disponível:
// const wintourResult = await this.wintourSoapService.registerCustomer(normalized);
// createdInGlobal = !!wintourResult.success;

// Por enquanto, simulamos
createdInGlobal = true;
```

**Retorno**:

```typescript
const result = await customersService.createCustomerInBothSources(
  { nome: 'João Silva', cpf: '123...', ... },
  userId
);

console.log(result);
// {
//   customer: { id, nome, cpf, ... },
//   createdInLocal: true,
//   createdInGlobal: true
// }
```

## Criação de Venda Integrada

### Novo Método: `createSaleWithCustomerTriage()`

Localização: `sales.service.ts`

Orquestra todo o fluxo de triagem de cliente durante criação de venda:

```typescript
async createSaleWithCustomerTriage(
  saleData: {
    customerId?: string;
    cpfCnpj?: string;
    customerData?: any;
    origin: string;
    destination: string;
    departureDate: Date;
    // ...
  },
  userId: string,
  customersService: any,
): Promise<{ sale: any; customerSource: 'local' | 'global' | 'new' }>
```

**Suporta 3 Cenários**:

#### 1️⃣ Cliente Encontrado (Base Local)

```
Input: customerId = "abc123" (já conhecemos)
          ↓
Criação de venda com customerSource: 'local'
          ↓
Venda com status: PENDING
```

#### 2️⃣ Cliente Encontrado (Base Global/Wintour)

```
Input: cpfCnpj = "123.456.789-00"
       userId = "seller123"
          ↓
Busca: não encontrado localmente
          ↓
Busca: encontrado na base global (Wintour)
          ↓
Vínculo automático ao usuário
          ↓
Criação de venda com customerSource: 'global'
          ↓
Venda com status: PENDING
```

#### 3️⃣ Cliente Novo (Registra em Ambas)

```
Input: cpfCnpj = "987.654.321-00" (novo)
       customerData = { nome, email, ... }
       userId = "seller123"
          ↓
Busca: não encontrado localmente
          ↓
Busca: não encontrado na base global
          ↓
Cria cliente em base local
          ↓
Cria cliente em base global (simulado)
          ↓
Criação de venda com customerSource: 'new'
          ↓
Venda com status: PENDING
```

**Exemplo de Uso em Controller**:

```typescript
@Post('create')
async createSale(
  @Body() createSaleDto: CreateSaleDto,
  @Request() req: any,
) {
  const result = await this.salesService.createSaleWithCustomerTriage(
    {
      cpfCnpj: createSaleDto.cpfCnpj,
      customerData: createSaleDto.customerData,
      origin: createSaleDto.origin,
      destination: createSaleDto.destination,
      departureDate: new Date(createSaleDto.departureDate),
      travelType: 'ONE_WAY',
    },
    req.user.id, // userId
    this.customersService,
  );

  return {
    saleId: result.sale.id,
    customerSource: result.customerSource,
    status: result.sale.servicesData.status, // 'PENDING'
  };
}
```

## Atualização de Status (Lambda Wintour)

### Novo Método: `updateSaleStatusToApproved()`

Localização: `sales.service.ts`

Atualiza status de venda para `APPROVED` após validação de faturamento:

```typescript
async updateSaleStatusToApproved(saleId: string): Promise<any>
```

**Fluxo**:

1. Lambda Wintour valida faturamento da venda
2. Chama endpoint: `PATCH /sales/{saleId}/approve`
3. Status muda: `PENDING` → `APPROVED`
4. Log registrado para auditoria

**Dados Auditados**:

- `sale.servicesData.status`: 'PENDING' → 'APPROVED'
- `sale.updated_at`: timestamp da atualização
- Disponível em `sale.userId` para rastreamento

## Resumo das Mudanças

| Arquivo                 | Mudança                                       | Impacto                                    |
| ----------------------- | --------------------------------------------- | ------------------------------------------ |
| `prisma/schema.prisma`  | Adicionados `userId`, `customerSource` à Sale | ✅ Rastreamento de origem do cliente       |
| `prisma/migrations/...` | Migração `add_wintour_integration_fields`     | ✅ Novos campos no banco                   |
| `customers.service.ts`  | +5 novos métodos                              | ✅ Busca com escopo, vínculo, novo cliente |
| `sales.service.ts`      | Status sempre PENDING + 3 métodos             | ✅ Fluxo de triagem, atualização status    |

## TODO Pendentes

1. **Integração com API Wintour**:

   - [ ] Implementar `WintourSoapService.registerCustomer()`
   - [ ] Chamar ao criar cliente novo em `createCustomerInBothSources()`
   - [ ] Tratamento de erro se Wintour não responder

2. **Campo `user_id` em Customer**:

   - [ ] Adicionar `userId` ao schema de `Customer`
   - [ ] Implementar lógica real em `linkGlobalCustomerToUser()`
   - [ ] Ajustar `findByCpfWithUserScope()` para filtrar por `userId`

3. **Lambda de Faturamento**:

   - [ ] Implementar Lambda que chama `updateSaleStatusToApproved()`
   - [ ] Webhook ou polling para sincronizar status

4. **Testes Unitários**:
   - [ ] Teste de triagem com cliente local
   - [ ] Teste de triagem com cliente global
   - [ ] Teste de triagem com cliente novo
   - [ ] Teste de atualização de status

## Exemplos de Fluxo End-to-End

### Cenário 1: Venda com Cliente Existente (Local)

```
Frontend → POST /sales/create
{
  "customerId": "cust_123",
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Backend → SalesService.createSaleWithCustomerTriage()
  → Encontrado customerId
  → Cria venda com customerSource: 'local'
  → Status: 'PENDING'

Response ← 201 Created
{
  "saleId": "sale_456",
  "customerSource": "local",
  "status": "PENDING"
}
```

### Cenário 2: Venda com Cliente da Base Global

```
Frontend → POST /sales/create
{
  "cpfCnpj": "123.456.789-00",
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Backend → SalesService.createSaleWithCustomerTriage()
  → CustomersService.findByCpfWithUserScope()
    → Não encontrado localmente
    → Encontrado na base global
    → linkGlobalCustomerToUser() → Vincula ao usuário
  → Cria venda com customerSource: 'global'
  → Status: 'PENDING'

Response ← 201 Created
{
  "saleId": "sale_456",
  "customerSource": "global",
  "status": "PENDING"
}
```

### Cenário 3: Venda com Cliente Novo

```
Frontend → POST /sales/create
{
  "cpfCnpj": "987.654.321-00",
  "customerData": {
    "nome": "Maria Silva",
    "email": "maria@example.com",
    "telefone_celular": "11999999999",
    ...
  },
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Backend → SalesService.createSaleWithCustomerTriage()
  → CustomersService.findByCpfWithUserScope()
    → Não encontrado localmente
    → Não encontrado na base global
    → CustomersService.createCustomerInBothSources()
      → Cria em base local ✅
      → Cria em base global (simulado) ✅
  → Cria venda com customerSource: 'new'
  → Status: 'PENDING'

Response ← 201 Created
{
  "saleId": "sale_456",
  "customerSource": "new",
  "status": "PENDING"
}
```

### Cenário 4: Lambda Wintour Atualiza Status

```
Lambda Wintour → PATCH /sales/sale_456/approve

Backend → SalesService.updateSaleStatusToApproved()
  → Busca venda
  → Atualiza servicesData.status: 'PENDING' → 'APPROVED'
  → Log: "[updateSaleStatusToApproved] Venda sale_456 status atualizado para APPROVED"

Response ← 200 OK
{
  "saleId": "sale_456",
  "status": "APPROVED",
  "updatedAt": "2026-05-12T14:30:00Z"
}
```

## Notas Importantes

1. **Compatibilidade Retroativa**: Todas as mudanças são não-destrutivas. Código existente continua funcionando.

2. **Simulação de Wintour**: Por enquanto, a base "global" é simulada na mesma tabela `clientes`. Quando integração real com Wintour acontecer, será substituída por chamadas SOAP.

3. **Status PENDING**: Força o padrão seguro de "vendas pendentes até aprovação". Remove lógica anterior baseada em valor total.

4. **Auditoria**: Campo `userId` rastreia qual vendedor criou a venda para auditoria e relatórios.
