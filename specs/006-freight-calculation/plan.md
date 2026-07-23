# Plano técnico — Regras e cálculo de frete

## Contexto e evidência

O projeto já possui:

- autenticação, tenant e RBAC deny-by-default;
- configurações fiscais e sequência fiscal tenant-scoped;
- importação e distribuição NF-e com documentos normalizados;
- PostgreSQL/Drizzle com migrations aditivas;
- API `Bun.serve`, worker Bun/RabbitMQ e frontend React/Vite;
- Makefile com gates locais e smoke Playwright.

A feature 006 usa `nfe_documents` como entrada, mas não altera XML original,
importação, distribuição ou fiscal provider. O motor de frete é domínio interno
do TransportAdA e não depende de SEFAZ, CT-e ou pacote fiscal.

## Decisões arquiteturais

### 1. Motor desacoplado e determinístico

O cálculo fica em módulo próprio, sem dependência de HTTP, frontend ou CT-e:

```ts
interface CalculateFreightInput {
  readonly companyId: string
  readonly invoiceId: string
  readonly issuedAt: string
  readonly invoiceTotalAmount: string
  readonly rule: FreightRuleSnapshot
}

interface CalculateFreightResult {
  readonly baseAmount: string
  readonly percentage: string
  readonly minimumAmount: string | null
  readonly maximumAmount: string | null
  readonly calculatedAmount: string
  readonly totalAmount: string
  readonly adjustments: readonly FreightAdjustment[]
  readonly ruleSnapshot: FreightRuleSnapshot
  readonly calculationDetails: Record<string, unknown>
}
```

O implementation usa uma biblioteca decimal já instalada se houver padrão no
projeto; se não houver, a task deve introduzir dependência mínima e justificada
ou usar aritmética decimal por escala fixa. `number` binário não participa de
dinheiro ou percentual.

### 2. Versionamento de regra

`freight_rules` representa a identidade configurável. `freight_rule_versions`
representa o conteúdo imutável de cálculo. Alterar campos que impactam cálculo
cria uma nova versão e atualiza a versão corrente da regra.

Campos iniciais:

- nome e descrição;
- tipo `PERCENTAGE_OF_INVOICE_TOTAL`;
- prioridade;
- status `ACTIVE`/`INACTIVE`;
- vigência inicial/final;
- percentual;
- valor mínimo opcional;
- valor máximo opcional;
- filtros futuros em JSON estrito inicialmente vazio;
- versão;
- snapshot canônico.

A seleção vigente usa:

1. mesma empresa;
2. status ativo;
3. tipo suportado;
4. `valid_from <= nfe.issued_at`;
5. `valid_until IS NULL OR valid_until >= nfe.issued_at`;
6. maior prioridade;
7. versão mais recente;
8. ID como desempate determinístico.

Sobreposição de regras ativas equivalentes na mesma prioridade é bloqueada para
evitar cálculo ambíguo. Prioridades diferentes podem coexistir e a maior vence.

### 3. Snapshot de cálculo

Cada cálculo persistido salva:

- dados mínimos da NF-e usados como entrada;
- regra e versão selecionadas;
- snapshot completo da versão;
- base, percentual, valor calculado antes de limites, mínimo, máximo e total;
- ajustes aplicados;
- política de arredondamento;
- ator, empresa, correlation ID e idempotency key.

O snapshot é imutável. Reprocessar ou recalcular cria outro registro ou uma
futura revisão explícita; nunca sobrescreve o histórico.

### 4. Arredondamento e escala

- Banco guarda dinheiro como `numeric(19,4)` para preservar cálculo.
- DTO monetário sai como string decimal com duas casas quando representa valor
  financeiro exibível e quatro casas quando representa base interna, conforme
  contrato do endpoint.
- Percentual usa string decimal de até seis casas, por exemplo `0.035000` para
  3,5%.
- O valor percentual bruto é calculado como `invoiceTotalAmount * percentage`.
- Mínimo e máximo são aplicados depois do cálculo bruto.
- A task de contrato deve fixar a política exata de arredondamento e provar
  casos de meio centavo.

### 5. APIs

Rotas iniciais:

```http
GET  /freight-rules
POST /freight-rules
GET  /freight-rules/:id
PATCH /freight-rules/:id
POST /freight-rules/:id/activate
POST /freight-rules/:id/deactivate

POST /nfe-documents/:id/freight-simulations
GET  /nfe-documents/:id/freight-calculations
GET  /freight-calculations/:id
```

Regras:

- rotas de regra exigem `settings.manage`;
- simulação persistente exige `freight.simulate`, `invoices.read` e
  `Idempotency-Key`;
- consulta de cálculos exige `freight.simulate` ou permissão futura equivalente;
- nenhuma rota aceita `companyId` no body/query;
- respostas usam `Cache-Control: no-store`;
- IDs cross-tenant retornam `404` indistinguível;
- erros de configuração retornam `409` ou `422` com código interno seguro.

### 6. Frontend

Adicionar módulo `freight` ou equivalente em `apps/frontend-transportada`:

- tela/lista de regras de frete;
- formulário percentual com vigência, prioridade, mínimo e máximo;
- visualização de versões/histórico mínimo;
- ação de simulação na lista/detalhe de NF-e importada;
- card de resultado com base, percentual, mínimo, máximo, ajustes e total;
- estados empty/loading/error/forbidden;
- i18n e tokens existentes;
- sem persistir XML ou dados fiscais sensíveis em storage/cache.

Se a UI de NF-e atual já possui detalhe/lista suficiente, a task deve integrar a
ação de simulação ali sem antecipar lote CT-e.

## Arquitetura e arquivos afetados

Previsão de módulos:

```text
apps/api-transportada/src/freight-rules/
├── domain/
├── application/
├── infrastructure/
└── presentation/

apps/api-transportada/src/freight-calculations/
├── domain/
├── application/
├── infrastructure/
└── presentation/

apps/api-transportada/src/database/freight.schema.ts
apps/frontend-transportada/src/modules/freight/
```

O worker não é obrigatório nesta feature. Se aparecer necessidade de cálculo em
massa, ela deve ser registrada como decisão deferida para lote/CT-e, não
implementada aqui.

## Contratos/API/eventos

Não há evento RabbitMQ obrigatório nesta feature. A API pode calcular de forma
síncrona porque a simulação é bounded e não chama rede externa. Auditoria
continua transacional no banco.

Contratos mínimos:

- schema/migration de regras, versões e cálculos;
- motor decimal puro;
- aplicação de CRUD/versionamento de regra;
- aplicação de seleção vigente e simulação;
- HTTP de regras e simulações;
- frontend DTO/query/permissions;
- smoke responsivo.

## Dados, migration e rollback

A migration é aditiva:

- criar `freight_rules`;
- criar `freight_rule_versions`;
- criar `freight_calculations`;
- adicionar índices tenant-scoped e FKs compostas;
- adicionar checks de decimal, status, vigência e mínimo/máximo;
- adicionar unique de idempotência por empresa.

Rollback manual remove primeiro rotas/consumidores em deploy, depois cálculos,
versões e regras. Após existir cálculo real, rollback destrutivo de dados não é
permitido em produção; correção deve ser roll-forward.

## Segurança e tenant

- auth/RBAC antes de body e parser pesado;
- tenant sempre derivado do contexto;
- NF-e, regra e cálculo sempre filtrados por empresa;
- anti-enumeração para IDs inexistentes/cross-tenant;
- nenhuma resposta retorna XML, storage key, hash fiscal interno ou payload de
  importação;
- auditoria não inclui XML nem snapshots com dados fiscais além do necessário ao
  cálculo;
- frontend não grava payload em localStorage/sessionStorage/cache.

## Idempotência e concorrência

- `POST /nfe-documents/:id/freight-simulations` persistente exige
  `Idempotency-Key`;
- replay igual retorna o cálculo já criado;
- replay divergente retorna `409`;
- versão da regra é travada ou relida dentro da transação do cálculo;
- criação/alteração de regra usa transação e constraint contra sobreposição;
- duas simulações concorrentes com mesma idempotency key criam no máximo um
  cálculo.

## Observabilidade

Logs estruturados incluem:

- `companyId`, `userId`, `correlationId`;
- `freightRuleId`, `freightRuleVersion`, `freightCalculationId`;
- `invoiceId`;
- código de erro seguro;
- duração da simulação.

Métricas desejadas:

- regras ativas por empresa;
- simulações por status;
- erro por ausência de regra;
- aplicação de mínimo/máximo;
- duração de cálculo.

Auditoria registra:

- criação/alteração/ativação/desativação de regra;
- simulação persistida;
- falhas de regra não encontrada quando relevante.

## Estratégia de testes

1. **Schema/migration:** constraints tenant-scoped, checks, versão, idempotência,
   sobreposição e rollback.
2. **Motor decimal:** percentual 3,5%, mínimo, máximo, arredondamento,
   entradas inválidas e ausência de `number` em DTOs.
3. **Aplicação:** seleção vigente por data da NF-e, prioridade, versão,
   snapshot, alteração histórica e anti-enumeração.
4. **HTTP:** RBAC antes do body, body strict, `Idempotency-Key`, erros seguros,
   no-store e paginação.
5. **Integração:** PostgreSQL real com duas empresas, NF-e importada sintética e
   simulações concorrentes.
6. **Frontend:** contracts de client/query/permissions e estados.
7. **Smoke:** Playwright em 375/768/1280 para admin, operador e usuário sem
   permissão.
8. **Final:** `bun install --frozen-lockfile`, checks dos apps alterados,
   `make check`, `make migration-test`, smoke gerenciado e `git diff --check`.

## ADRs

- `ADR 0008 — Motor decimal e snapshots de cálculo de frete`.

## Riscos

| Risco                                  | Mitigação                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Cálculo monetário impreciso            | contract decimal antes da implementação e proibição de `number` para dinheiro |
| Regra histórica mudar resultado antigo | snapshot imutável e teste de alteração posterior                              |
| Ambiguidade por múltiplas regras       | constraint de sobreposição e ordenação determinística                         |
| Escopo invadir lote/CT-e               | endpoints limitados a simulação e documentação de fronteira                   |
| Cross-tenant em NF-e ou regra          | FKs compostas, filtros tenant e testes negativos                              |
| Arredondamento controverso             | política explícita no contract e ADR                                          |
| UI induzir produção fiscal             | textos de simulação e ausência de emissão nesta feature                       |
