# Plano tecnico — Faturamento

## Contexto e premissas

- A feature `008-cte-homologation` fornece CT-e autorizados com documentos
  fiscais, metadados seguros e timeline de emissao.
- A feature `006-freight-calculation` fornece snapshots decimais de frete.
- O faturamento fecha o MVP operacional: NF-e -> frete -> CT-e -> fatura.
- A primeira entrega gera faturas operacionais internas; emissao fiscal de NFS-e,
  boleto e conciliacao financeira ficam fora.

## Arquitetura e arquivos afetados

Bounded contexts previstos:

- `apps/api-transportada/src/billing/`
  - `application/`
  - `infrastructure/`
  - `presentation/`
- `apps/api-transportada/src/database/billing.schema.ts`
  - tabelas de fatura, itens, eventos, sequencias e documentos exportados.
- `apps/frontend-transportada/src/modules/billing/`
  - listagem de CT-e elegiveis;
  - selecao e revisao de fatura;
  - consulta de faturas;
  - download de PDF/exportacao;
  - cancelamento com permissao.
- `apps/worker-transportada/src/billing/` somente se PDF/exportacao assincrono
  for necessario; caso contrario, gateway de documento fica na API.

## APIs previstas

- `GET /billing/eligible-cte`
- `POST /billing/invoices`
- `GET /billing/invoices`
- `GET /billing/invoices/:id`
- `POST /billing/invoices/:id/cancel`
- `GET /billing/invoices/:id/documents`

Permissoes iniciais:

- `billing.read` para listar elegiveis, faturas e documentos;
- `billing.create` para criar faturas;
- `billing.manage` para cancelar faturas.

Todas as rotas autenticadas usam `no-store`, DTO strict, cursor validado e
anti-enumeracao para tenant cruzado.

## Dados, migration e rollback

Tabelas propostas:

- `billing_invoices`
  - `id`, `company_id`, `invoice_number`, `status`, `customer_name`,
    `customer_document`, `issue_date`, `due_date`, `currency`, `subtotal_amount`,
    `discount_amount`, `surcharge_amount`, `total_amount`, `idempotency_key`,
    `request_fingerprint`, timestamps e correlation id.
- `billing_invoice_items`
  - `id`, `company_id`, `invoice_id`, `cte_document_id`, `cte_key`, `cte_number`,
    `batch_id`, `batch_item_id`, `description`, `freight_amount`,
    `total_amount`, snapshot financeiro e ordem.
- `billing_invoice_events`
  - evento append-only com tipo, versao, ator, motivo sanitizado, payload seguro
    e timestamp.
- `billing_invoice_documents`
  - PDF/exportacao gerados, storage key opaca, hash, mime type, tamanho, versao
    e URL temporaria indireta.

Constraints essenciais:

- `company_id + invoice_number` unico.
- `company_id + idempotency_key` unico quando informado.
- `company_id + cte_document_id` unico para faturas ativas via indice parcial ou
  estrategia equivalente.
- FKs compostas tenant-scoped para CT-e/documentos, batch e membership do ator.
- Checks de status, valores nao negativos, total coerente e vencimento valido.

Rollback:

- remover rotas/consumers primeiro;
- remover documentos gerados somente do banco, preservando objetos finais em
  storage;
- dropar indices, triggers, tabelas e entradas de journal em ordem inversa.

## Regras de dominio

- Estados iniciais:
  - `draft` nao persistido no servidor na primeira versao;
  - `issued` para fatura ativa criada;
  - `cancelled` para cancelamento operacional.
- Uma fatura `issued` bloqueia refaturamento do CT-e.
- Cancelamento registra evento e preserva itens/totais.
- Valores sao copiados de snapshots autorizados; total da fatura e soma decimal
  dos itens mais ajustes permitidos.
- Primeira versao deve aceitar apenas uma moeda (`BRL`) e deixar extensao
  explicita no schema.

## PDF e exportacao

- PDF inicial pode ser gerado por adapter interno simples, sem dependencia
  fiscal, com dados de fatura e lista de CT-e.
- Exportacao operacional inicial pode ser CSV ou JSON versionado, desde que
  testado e sem XML/storage key.
- Documentos usam storage create-only ja existente e resposta HTTP retorna URL
  temporaria/metadados seguros.

## Observabilidade

- Eventos:
  - `billing.invoice.created`
  - `billing.invoice.cancelled`
  - `billing.invoice.document.generated`
  - `billing.invoice.document.failed`
- Logs correlacionam `companyId`, `invoiceId`, `invoiceNumber`, `actorUserId`,
  `correlationId` e quantidade de itens.
- Erros externos de storage/PDF sao sanitizados e preservam `cause` interno.

## Estrategia de testes

- Contracts de schema para constraints, FKs tenant-scoped, unicidade ativa,
  decimal e rollback.
- Contracts de aplicacao para elegibilidade, criacao idempotente, concorrencia,
  cancelamento e anti-enumeracao.
- Contracts HTTP para RBAC antes do body, DTO strict, no-store, cursores e erros
  seguros.
- Contracts frontend para client/query, selecao, view-model, permissões e
  limpeza de estado sensivel.
- Smoke Playwright responsivo cobrindo listar elegiveis, criar fatura, consultar
  detalhe e cancelar com/sem permissao.
- Gate final: `bun install --frozen-lockfile`, `make check`,
  `make migration-test`, `make dev` + `make smoke` + `make down`,
  `git diff --check`.

## Riscos

- Politica real de faturamento por tomador/cliente pode exigir cadastro de
  clientes dedicado.
- PDF pode virar requisito fiscal/contabil mais forte; a primeira versao deve
  manter adapter substituivel.
- Refaturamento apos cancelamento precisa ser conservador para nao permitir
  cobranca duplicada sem trilha clara.
- Faturas com muitos CT-e podem exigir geracao assincrona de documentos.
