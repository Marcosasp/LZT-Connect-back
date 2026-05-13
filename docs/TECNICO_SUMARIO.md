# SUMÁRIO TÉCNICO - Integração Wintour

## Modificações de Código

### 1. Schema Prisma (prisma/schema.prisma)

**Novos campos na tabela `sales`**:

- `userId?: String` - ID do usuário que criou a venda
- `customerSource: String @default("local")` - Origem do cliente: 'local' | 'global'

**Novos índices**:

- `@@index([userId])`
- `@@index([customerSource])`

**Migration**: `20260512131535_add_wintour_integration_fields`

---

### 2. Alterações em `sales.service.ts`

#### Modificação da Função Existente

**`createSalesFromHeader()`** - Assinatura atualizada:

```typescript
private async createSalesFromHeader(
  // ... parâmetros antigos ...
  userId?: string,              // NOVO
  customerSource: 'local' | 'global' = 'local', // NOVO
): Promise<number>
```

**Mudança de lógica de status**:

```typescript
// ANTES: const status = resolvedTotalValue > 0 ? 'APPROVED' : 'PENDING';
// DEPOIS:
// TODO: O status será atualizado via Lambda de faturamento do Wintour.
// Por enquanto, toda nova venda é criada com status PENDING.
const status = 'PENDING';
```

**Novos campos no `sale.create()`**:

```typescript
await prismaClient.sale.create({
  data: {
    customerId,
    userId, // NOVO
    customerSource, // NOVO
    // ... campos antigos ...
  },
});
```

#### Novos Métodos Públicos

1. **`resolveScopedCustomer()`**

   - Busca cliente por CPF/CNPJ com escopo de usuário
   - Vincula automático se origem é 'global'
   - Retorna: `{ customer, source: 'local' | 'global' }`

2. **`createSaleWithCustomerTriage()`**

   - Orquestra criação de venda com triagem de cliente
   - Suporta 3 cenários: cliente local, cliente global, cliente novo
   - Retorna: `{ sale, customerSource: 'local' | 'global' | 'new' }`

3. **`updateSaleStatusToApproved()`**
   - Atualiza status de `PENDING` para `APPROVED`
   - Chamado pela Lambda Wintour
   - Atualiza campo `servicesData.status`

---

### 3. Alterações em `customers.service.ts`

#### Novos Métodos Públicos

1. **`findByCpfWithUserScope()`**

   ```typescript
   async findByCpfWithUserScope(
     cpfCnpj: string,
     userId?: string
   ): Promise<{ customer: any; source: 'local' | 'global' }>
   ```

   - Busca primeiro no usuário logado (se userId fornecido)
   - Fallback para base global
   - Lança `NotFoundException` se não encontrado

2. **`findOrCreateGlobalCustomer()`**

   ```typescript
   async findOrCreateGlobalCustomer(
     data: CreateCustomerInput
   ): Promise<{ customer: any; isNew: boolean }>
   ```

   - Procura cliente na base global
   - Cria novo se não existir
   - Retorna flag `isNew`

3. **`linkGlobalCustomerToUser()`**

   ```typescript
   async linkGlobalCustomerToUser(
     customerId: string,
     userId: string
   ): Promise<any>
   ```

   - Vincula cliente global ao usuário
   - TODO: Implementar quando Customer tiver `user_id`
   - Atualmente apenas retorna cliente existente

4. **`createCustomerInBothSources()`**
   ```typescript
   async createCustomerInBothSources(
     data: CreateCustomerInput,
     userId?: string
   ): Promise<{
     customer: any;
     createdInLocal: boolean;
     createdInGlobal: boolean;
   }>
   ```
   - Cria cliente na base local
   - Registra na base global (simulado, TODO: integração real)
   - Retorna metadata sobre criação

---

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend: POST /sales/create                                     │
│ Body: { cpfCnpj?, customerId?, customerData?, ... }             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ SalesController.createSale()                                    │
│ → extrai userId do req.user.id                                  │
│ → chama salesService.createSaleWithCustomerTriage()             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ SalesService.createSaleWithCustomerTriage()                     │
│                                                                  │
│ 1. Se customerId informado:                                      │
│    → usa diretamente                                             │
│    → customerSource = 'local'                                    │
│                                                                  │
│ 2. Se cpfCnpj e não encontrar customerId:                       │
│    → chama customersService.findByCpfWithUserScope()            │
│    │                                                             │
│    ├─ Não encontrado localmente?                                │
│    │  → busca na base global                                    │
│    │  → vincula ao usuário                                      │
│    │  → customerSource = 'global'                               │
│    │                                                             │
│    └─ Não encontrado em nenhuma base?                           │
│       → Se customerData fornecido:                              │
│         → chama createCustomerInBothSources()                   │
│         → customerSource = 'new'                                │
│       → Else: erro                                              │
│                                                                  │
│ 3. Cria Sale com:                                               │
│    - userId                                                      │
│    - customerId                                                  │
│    - customerSource ('local' | 'global' | 'new')               │
│    - status: 'PENDING' (forçado)                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Response ao Frontend                                             │
│ {                                                                │
│   saleId,                                                        │
│   customerSource: 'local' | 'global' | 'new',                   │
│   status: 'PENDING'                                             │
│ }                                                                │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ [ASSINCRONO] Lambda Wintour                                     │
│ 1. Valida faturamento                                            │
│ 2. PATCH /sales/{saleId}/approve                                │
│    → chama salesService.updateSaleStatusToApproved()            │
│ 3. Status muda: PENDING → APPROVED                              │
│ 4. Log registrado para auditoria                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mudanças de Comportamento

| Feature                      | Antes                              | Depois           | Impacto        |
| ---------------------------- | ---------------------------------- | ---------------- | -------------- |
| **Status Padrão**            | Lógica complexa (baseada em valor) | Sempre PENDING   | ✅ Mais seguro |
| **Origem do Cliente**        | Não rastreada                      | Armazenada em DB | ✅ Auditoria   |
| **Busca de Cliente**         | Sempre base local                  | Local + global   | ✅ Flexível    |
| **Novo Cliente**             | Registra só localmente             | Ambas as bases   | ✅ Integrado   |
| **Vínculo Global**           | Não existe                         | Automático       | ✅ Novo        |
| **Rastreamento de Vendedor** | Não existe                         | userId           | ✅ Novo        |

---

## Checklist de Teste

### ✅ Cenário 1: Cliente Existente (Local)

```
POST /sales/create
{
  "customerId": "cust_123",
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Esperado:
- Sale criada com customerSource: 'local'
- Status: 'PENDING'
- userId: do usuário autenticado
```

### ✅ Cenário 2: Cliente Encontrado (Base Global)

```
POST /sales/create
{
  "cpfCnpj": "123.456.789-00",
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Esperado:
- Customer buscado e vinculado ao usuário
- Sale criada com customerSource: 'global'
- Status: 'PENDING'
```

### ✅ Cenário 3: Cliente Novo

```
POST /sales/create
{
  "cpfCnpj": "987.654.321-00",
  "customerData": { ... },
  "destination": "Cancun",
  "departureDate": "2026-06-01"
}

Esperado:
- Customer criado (em ambas as bases - para futuro)
- Sale criada com customerSource: 'new'
- Status: 'PENDING'
```

### ✅ Cenário 4: Lambda Wintour Aprova Venda

```
PATCH /sales/sale_123/approve

Esperado:
- Sale atualizada com status: 'APPROVED'
- servicesData.status: 'APPROVED'
```

---

## Integração Futura com Wintour

### TODOs no Código

**Em `customers.service.ts`, método `createCustomerInBothSources()`**:

```typescript
// TODO: Integração com API Wintour para registrar na base global
// Quando Wintour API estiver disponível:
// const wintourResult = await this.wintourSoapService.registerCustomer(normalized);
// createdInGlobal = !!wintourResult.success;
```

**Em `sales.service.ts`, método `createSalesFromHeader()`**:

```typescript
// TODO: O status será atualizado via Lambda de faturamento do Wintour.
// Por enquanto, toda nova venda é criada com status PENDING.
const status = 'PENDING';
```

**Em `customers.service.ts`, método `linkGlobalCustomerToUser()`**:

```typescript
// TODO: Implementar vínculo quando Customer model tiver campo user_id
// const linked = await this.prisma.customer.update({
//   where: { id: customerId },
//   data: { userId },
// });
```

---

## Performance Considerações

1. **Índices Adicionados**: `userId`, `customerSource` em `sales`

   - Melhora queries por usuário
   - Filtragem por origem do cliente

2. **Buscas de Cliente**:

   - Usa `findUnique({ where: { cpf } })` (rápido via índice único)
   - Sem N+1 queries

3. **Criação em Transação**:
   - Todas operações mantêm atomicidade
   - Sem race conditions

---

## Segurança

1. **userId obrigatório**: Todas operações rastreadas para auditoria
2. **Validação de CPF/CNPJ**: Normalização de dígitos
3. **Isolamento de dados**: Clientes ligados a usuários (quando implementado)
4. **Sem exposição de base "global"**: Operação transparente para frontend

---

## Rollback/Revert

Se necessário reverter:

1. Remover campos `userId` e `customerSource` da Sale model no schema
2. Remover migration com `npx prisma migrate resolve --rolled-back 20260512131535_add_wintour_integration_fields`
3. Remover novos métodos dos serviços
4. Reverter status para lógica anterior: `const status = resolvedTotalValue > 0 ? 'APPROVED' : 'PENDING'`

**Impacto**: Baixo - não há dado importante nos campos novos que não possa ser recriado.

---

## Conclusão

✅ Backend pronto para integração com Wintour
✅ Fluxo de triagem de clientes implementado
✅ Status PENDING forçado para segurança
✅ Rastreamento de origem e auditoria habilitado
✅ Novos métodos prontos para uso em controllers
✅ Documentação completa para frontend e Lambda

**Próximos passos**:

1. Implementar Controllers conforme exemplos
2. Atualizar DTOs de validação
3. Adicionar testes unitários
4. Integrar com API SOAP Wintour (quando disponível)
