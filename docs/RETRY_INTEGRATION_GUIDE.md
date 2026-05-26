# Guia de Retry de Integração Wintour

## Visão Geral

O sistema agora oferece suporte completo para rastreamento e retry de integrações Wintour que falharam. Esse documento descreve como utilizar as novas funcionalidades para gerenciar vendas com problemas de integração.

## Fluxo de Status

```
pending → processing → success/error
                       ↓ (retry automático em caso de erro)
                       manual_pending (após 5 tentativas)
```

Quando uma venda falha após 5 tentativas, seu status muda automaticamente para `manual_pending`, indicando que intervenção manual é necessária.

## Auto-Retry Automático ⏰

O sistema implementa um agendador de tarefas (cron job) que executa a cada **5 minutos** para reprocessar automaticamente vendas com status `error`.

### Configuração

As variáveis de ambiente controlam o comportamento do auto-retry:

```bash
# Ativa/desativa o agendador de retry automático
WINTOUR_RETRY_ENABLED=true

# Número máximo de tentativas antes de marcar como manual_pending
# Padrão: 5
WINTOUR_RETRY_MAX_RETRIES=5

# Número máximo de vendas a reprocessar por ciclo
# Padrão: 10 (para não sobrecarregar o sistema)
WINTOUR_RETRY_MAX_SALES_PER_CYCLE=10
```

### Comportamento do Agendador

1. **Executa a cada 5 minutos** (configurável via `@Cron(CronExpression.EVERY_5_MINUTES)`)
2. **Busca vendas com:**
   - Status = `error`
   - `retryCount` < `WINTOUR_RETRY_MAX_RETRIES`
3. **Para cada venda:**
   - Tenta reprocessar via `retryWintourIntegration()`
   - Em caso de sucesso: marca como `success`, reseta `retryCount`
   - Em caso de falha: incrementa `retryCount`, mantém mensagem de erro
4. **Após atingir limite:**
   - Status muda para `manual_pending` automaticamente
   - Necessária intervenção manual via endpoint POST `/sales/:id/retry-integration`
5. **Registra logs:**
   - Sucesso: `[scheduleIntegrationRetry] ✓ Venda {id} reprocessada com sucesso.`
   - Falha: `[scheduleIntegrationRetry] ✗ Falha ao reprocessar venda {id}: {erro}`
   - Resumo: `[scheduleIntegrationRetry] Ciclo concluído: {X} sucesso, {Y} falha, {Z}ms total.`

### Exemplo de Log

```
[scheduleIntegrationRetry] Iniciando verificação de vendas com erro para retry automático.
[scheduleIntegrationRetry] ✓ Venda sale-123 reprocessada com sucesso.
[scheduleIntegrationRetry] ✗ Falha ao reprocessar venda sale-456: SOAP timeout
[scheduleIntegrationRetry] Ciclo concluído: 1 sucesso, 1 falha, 2341ms total.
```

### Limitações e Performance

- **Processa no máximo 10 vendas por ciclo** (configurável) para evitar picos de carga
- **Executa a cada 5 minutos** = 288 ciclos por dia
- **Máximo de reprocessamentos por ciclo**: 10 vendas × 288 ciclos = 2.880 tentativas/dia
- Se houver > 10 vendas em erro, as demais serão processadas no próximo ciclo

### Desabilitar Auto-Retry

Para desabilitar em ambiente de desenvolvimento ou testes:

```bash
WINTOUR_RETRY_ENABLED=false
```

O agendador não será executado, mas os endpoints manuais (`GET /sales/integration-issues` e `POST /sales/:id/retry-integration`) continuam funcionando.

## Endpoints Implementados

### 1. GET `/sales/integration-issues`

Retorna uma lista paginada de vendas com problemas de integração.

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Query:**

- `page` (opcional): Número da página (padrão: 1)
- `limit` (opcional): Itens por página, máximo 100 (padrão: 10)

**Resposta Sucesso (200):**

```json
{
  "data": [
    {
      "id": "sale-123",
      "integrationStatus": "error",
      "retryCount": 2,
      "lastErrorMessage": "SOAP timeout",
      "lastIntegrationAt": "2026-05-18T10:30:00.000Z",
      "customer": {
        "id": "customer-456",
        "nome_completo": "João Silva",
        "cpf": "12345678901",
        "email": "joao@example.com"
      }
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "lastPage": 2
  }
}
```

**Exemplo cURL:**

```bash
curl -X GET "http://localhost:3000/sales/integration-issues?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. POST `/sales/:id/retry-integration`

Reprocessa a integração Wintour para uma venda específica que está em erro.

**Autenticação:** Bearer Token obrigatório

**Parâmetros de Path:**

- `id` (obrigatório): ID da venda

**Condições Válidas:**

- Venda deve ter status `error` ou `manual_pending`
- Após reprocessamento bem-sucedido, status muda para `success` e `retryCount` reseta para 0
- Após falha, `retryCount` é incrementado e status pode mudar para `manual_pending` se atingir 5 tentativas

**Resposta Sucesso (200):**

```json
{
  "id": "sale-123",
  "customerId": "customer-456",
  "customer": {
    "id": "customer-456",
    "nome_completo": "João Silva",
    "cpf": "12345678901",
    "email": "joao@example.com"
  },
  "origin": "São Paulo",
  "destination": "Rio de Janeiro",
  "departureDate": "2026-06-10T10:00:00.000Z",
  "returnDate": "2026-06-15T18:00:00.000Z",
  "integrationStatus": "success",
  "retryCount": 0,
  "lastErrorMessage": null,
  "lastIntegrationAt": "2026-05-18T11:00:00.000Z",
  "passengers": [...]
}
```

**Resposta Erro (400) - Status inválido:**

```json
{
  "statusCode": 400,
  "message": "Venda com status 'success' não pode ser reprocessada. Apenas vendas com status error ou manual_pending podem ser reprocessadas."
}
```

**Resposta Erro (404) - Venda não encontrada:**

```json
{
  "statusCode": 404,
  "message": "Venda com id 'sale-999' não encontrada."
}
```

**Exemplo cURL:**

```bash
curl -X POST "http://localhost:3000/sales/sale-123/retry-integration" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Métodos de Service

### `findIntegrationIssues(page?: number, limit?: number)`

Retorna vendas com status `error` ou `manual_pending`.

**Parâmetros:**

- `page` (padrão: 1): Página da listagem
- `limit` (padrão: 10): Itens por página

**Retorno:**

```typescript
{
  data: Array<{
    id: string;
    customer: {
      id: string;
      nome_completo: string;
      cpf: string;
      email: string;
    };
    retryCount: number;
    lastErrorMessage: string | null;
    lastIntegrationAt: Date | null;
    integrationStatus: string;
  }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  }
}
```

### `retryWintourIntegration(saleId: string)`

Reprocessa a integração Wintour para uma venda específica.

**Parâmetros:**

- `saleId`: ID da venda

**Comportamento:**

1. Valida se a venda existe e está em status válido
2. Marca venda como `processing`
3. Reconstrói payload mínimo com dados da venda
4. Executa integração com Wintour
5. Atualiza status para `success` e reseta retry count, ou marca como `error`/`manual_pending` se falhar
6. Retorna venda atualizada

**Lançamentos de Erro:**

- `NotFoundException`: Venda não encontrada
- `BadRequestException`: Status inválido para retry
- `BadGatewayException`: Erro na integração Wintour

**Exemplo de Uso (programático):**

```typescript
import { SalesService } from './sales/sales.service';

export class ReprocessSalesJob {
  constructor(private salesService: SalesService) {}

  async reprocessFailedSales() {
    const issues = await this.salesService.findIntegrationIssues(1, 100);

    for (const issue of issues.data) {
      if (issue.retryCount < 3) {
        // Máximo 3 tentativas do job
        try {
          const updated = await this.salesService.retryWintourIntegration(
            issue.id,
          );
          console.log(`✓ Venda ${issue.id} reprocessada com sucesso`);
        } catch (error) {
          console.error(
            `✗ Falha ao reprocessar venda ${issue.id}:`,
            error.message,
          );
        }
      }
    }
  }
}
```

## Fluxo de Erro Detalhado

### Cenário 1: Primeira Falha

1. Venda é criada com status `pending`, `retryCount = 0`
2. Integração falha durante `sendToWintour()`
3. Sistema marca como `error`, `retryCount = 1`, armazena mensagem de erro
4. Admin vê na lista de issues

### Cenário 2: Retry Manual Bem-Sucedido

1. Admin chama `POST /sales/:id/retry-integration`
2. Sistema marca como `processing`
3. Reexecuta integração com payload mínimo
4. Sucesso: marca como `success`, `retryCount = 0`, `lastErrorMessage = null`
5. Venda desaparece da lista de issues

### Cenário 3: Múltiplas Falhas

1. Venda falha (retry=1)
2. Admin tenta retry → falha novamente (retry=2)
3. Webhook atualiza → falha novamente (retry=3)
4. Padrão continua...
5. Na 5ª falha: status muda para `manual_pending`
6. Venda fica em `manual_pending` até resolução manual

## Considerações de Design

### Separação de Responsabilidades

- `markSalesAsProcessing()`: Marca início da integração
- `markSalesAsSuccess()`: Marca conclusão bem-sucedida
- `markSalesAsFailure()`: Marca falha e incrementa retry
- `retryWintourIntegration()`: Orquestra o retry para uma venda individual

### Payload Mínimo para Retry

Para retry de vendas, o sistema reconstrói um payload mínimo contendo:

- Dados do cliente (nome, CPF, email, endereço)
- Destination
- Departure date
- Valores de serviços
- Detalhes de pagamento

Isso permite retry sem armazenar dados XML completos originalmente.

### Transações

- Mudanças de status são atômicas
- Retry usa transação para garantir consistência
- Falha na integração não deixa venda em estado inconsistente

## Monitoramento e Alertas (Recomendações)

Implemente alertas para:

1. **Vendas em `error`**: Mais de 30 minutos sem sucesso
2. **Vendas em `manual_pending`**: Requer intervenção humana
3. **Taxa de falha elevada**: > 5% de vendas falhando

### Logs do Auto-Retry

Os logs do agendador aparecem no stdout da aplicação NestJS:

```
[scheduleIntegrationRetry] Iniciando verificação de vendas com erro para retry automático.
[scheduleIntegrationRetry] ✓ Venda sale-123 reprocessada com sucesso.
[scheduleIntegrationRetry] ✗ Falha ao reprocessar venda sale-456: SOAP timeout
[scheduleIntegrationRetry] Ciclo concluído: 1 sucesso, 1 falha, 2341ms total.
```

### Queries de Diagnóstico

```sql
-- Vendas aguardando retry automático
SELECT id, retryCount, lastErrorMessage, lastIntegrationAt
FROM sales
WHERE integrationStatus = 'error'
ORDER BY lastIntegrationAt ASC;

-- Vendas que requerem intervenção manual
SELECT id, retryCount, lastErrorMessage, lastIntegrationAt
FROM sales
WHERE integrationStatus = 'manual_pending'
ORDER BY lastIntegrationAt ASC;

-- Taxa de sucesso nas últimas 24 horas
SELECT
  integrationStatus,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM sales
WHERE lastIntegrationAt > NOW() - INTERVAL '24 hours'
GROUP BY integrationStatus;
```

## Dashboard Sugerido

Para administradores, implemente um dashboard que mostre:

- Gráfico de vendas por status de integração
- Lista filtrada de issues com botão de retry
- Histórico de tentativas e mensagens de erro
- Tendência de sucesso/falha ao longo do tempo

## Backward Compatibility

✅ Todas as funcionalidades existentes são preservadas
✅ Novos campos estão com valores padrão sensatos
✅ APIs antigas continuam funcionando
✅ Webhook existente continua recebendo atualizações de status

## Próximas Melhorias

1. ✅ **IMPLEMENTADO**: Auto-retry automático (background job) via cron job a cada 5 minutos
2. Webhooks para notificar quando vendas movem para `manual_pending`
3. Interface de administração para gerenciar retries
4. Métricas detalhadas de integração por período
5. Pausar auto-retry via endpoint (maintenance mode)
6. Histórico completo de tentativas de integração com timestamps

## Payload Armazenado para Retries 💾

A partir desta versão, o sistema armazena o payload original enviado para Wintour no campo `integrationPayload` da venda. Isso oferece várias vantagens:

### Benefícios

1. **Consistência de Retry**: O payload retido é exatamente o que foi enviado inicialmente
2. **Reprodutibilidade**: Facilita troubleshooting ao ter o payload original armazenado
3. **Performance**: Evita reconstruir o payload a cada retry (uso menos recursos)
4. **Auditoria**: Mantém registro do que foi enviado para Wintour

### Estrutura do Campo

```typescript
// Modelo Sale (Prisma)
model Sale {
  // ... outros campos ...
  integrationPayload   Json?       @map("integration_payload")
  // ... outros campos ...
}
```

O `integrationPayload` armazena a estrutura completa `CreateWintourImportInput`:

```typescript
interface CreateWintourImportInput {
  nr_arquivo: string; // Número do arquivo/header
  data_geracao: string; // Data de geração
  hora_geracao: string; // Hora de geração
  nome_agencia: string; // Nome da agência
  versao_xml: number; // Versão do XML
  paymentDetails?: PaymentDetails; // Detalhes de pagamento
  selectedServices?: string[]; // Serviços selecionados
  servicesDetails?: unknown; // Detalhes dos serviços
  tickets: Array<{
    // Tickets da importação
    customer_id?: string;
    cliente: string;
    passageiro: string;
    cid_dest_principal: string;
    // ... outros campos ...
  }>;
}
```

### Fluxo de Armazenamento

```
1. createWintourImport() constrói payload original
   ↓
2. Payload é salvo em sale.integrationPayload
   ↓
3. Payload é enviado para Wintour
   ↓
4. Se falhar, retryWintourIntegration() reutiliza o payload armazenado
   ↓
5. Se suceder, retryCount = 0, lastErrorMessage = null
```

### Fallback para Reconstrução

Se por algum motivo o `integrationPayload` não estiver disponível (ex: vendas criadas antes dessa versão):

```typescript
// Código em retryWintourIntegration()
if (sale.integrationPayload && typeof sale.integrationPayload === 'object') {
  // Usa payload armazenado
  payload = sale.integrationPayload as CreateWintourImportInput;
} else {
  // Fallback: reconstrói o payload
  payload = this.buildMinimalWintourPayload(sale, sale.customer, nrArquivo);
}
```

### Exemplo de Query SQL

Para inspecionar o payload armazenado de uma venda:

```sql
SELECT
  id,
  integration_status,
  retry_count,
  integration_payload,
  last_error_message
FROM sales
WHERE id = 'sale-xxx'
AND integration_payload IS NOT NULL;
```

Para verificar quais vendas têm payload armazenado:

```sql
SELECT COUNT(*)
FROM sales
WHERE integration_payload IS NOT NULL
AND (integration_status = 'error' OR integration_status = 'manual_pending');
```

### Migração de Dados

A migration `20260518143000_add_integration_payload` adicionou a coluna:

```sql
ALTER TABLE "sales" ADD COLUMN "integration_payload" JSONB;
CREATE INDEX "idx_sales_integration_payload" ON "sales" USING GIN ("integration_payload");
```

- ✅ Coluna adicionada com valor padrão `null`
- ✅ Índice GIN criado para queries eficientes
- ✅ Vendas existentes continuam funcionando (fallback para reconstrução)
- ✅ Novas vendas automaticamente têm payload armazenado

## Endpoints Implementados
