# Evidencia — Feature 009 Faturamento

## T001 — Consolidar spec/plano executavel

Data: 2026-07-23

Modelo executor recomendado: Codex 5.4, com revisao Sol para dinheiro,
concorrencia, idempotencia e release.

Estado inicial: abertura da fase 7 do plano de entrega para fechar o MVP
operacional com selecao de CT-e autorizados, geracao de faturas, documentos
seguros e cancelamento operacional.

Arquivos previstos:

- `specs/009-billing/spec.md`
- `specs/009-billing/plan.md`
- `specs/009-billing/tasks.md`
- `specs/009-billing/evidence.md`

Decisoes registradas:

- faturamento inicial e operacional, sem NFS-e, boleto, baixa financeira ou
  conciliacao bancaria;
- somente CT-e autorizados, tenant-scoped e sem fatura ativa sao elegiveis;
- valores monetarios usam decimal canonico e snapshots imutaveis;
- fatura ativa bloqueia refaturamento do mesmo CT-e;
- cancelamento preserva historico e registra evento append-only;
- PDF/exportacao nao podem expor XML fiscal, storage key, certificado, token ou
  payload SEFAZ.

Comando planejado:

```text
bunx prettier --check specs/009-billing && git diff --check
```

Resultado:

```text
bunx prettier --check specs/009-billing
Checking formatting...
All matched files use Prettier code style!

git diff --check
0 issues
```

Observacao:

- `T001` cria a base executavel e libera `T002` para contracts de schema de
  faturamento.

## T002 — Contracts de schema de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para schema financeiro, dinheiro,
concorrencia, idempotencia, constraints tenant-scoped e rollback.

Contracts criados:

- agregador de schema exigindo exports em `database.schema`;
- tenant safety para `company_id`, FK restritiva com `companies`, timestamps UTC
  e ausencia de XML, storage key, certificado, chave privada e token;
- invoices com numero tenant-scoped, status, idempotencia, ator, correlation id
  e totais `numeric(14, 2)`;
- invoice items vinculados a CT-e autorizado/documento fiscal por FK
  tenant-scoped e bloqueio de refaturamento ativo;
- invoice events append-only;
- invoice documents com object storage opaco, hash, MIME, tamanho e versao.

Arquivos alterados:

- `apps/api-transportada/test/billing-schema.contract.test.ts`
- `apps/api-transportada/test/billing-schema/aggregator.contract.ts`
- `apps/api-transportada/test/billing-schema/billing.contract.ts`
- `apps/api-transportada/test/billing-schema/tables.ts`
- `apps/api-transportada/test/billing-schema/tenant-safety.contract.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test test/billing-schema.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
6 fail
T002 schema implementation is missing database export: billingInvoices
T002 schema implementation is missing database export: billingInvoiceItems
T002 schema implementation is missing database export: billingInvoiceEvents
```

Observacao:

- A falha e intencional para `T002`: os contracts documentam o schema esperado e
  a implementacao de `billing.schema.ts`, migration e rollback fica para `T003`.

## T003 — Schema, migration aditiva e rollback

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para schema financeiro, dinheiro,
constraints tenant-scoped, rollback e concorrencia.

Implementacao confirmada:

- `billing.schema.ts` com invoices, items, events e documents;
- exports agregados em `database.schema`;
- `stored_objects.purpose` ampliado para `billing_document`;
- migration `20260723125103_oval_dexter_bennett` aditiva para faturamento;
- rollback manual com hash de journal e restauracao do check anterior de
  `stored_objects.purpose`;
- migration-test atualizado para reconhecer tabelas de billing.

Comandos executados:

```text
bun test test/billing-schema.contract.test.ts
```

Resultado:

```text
6 pass
0 fail
93 expect() calls
```

```text
bun run db:check
```

Resultado:

```text
Everything's fine
```

```text
make migration-test
```

Resultado:

```text
9 pass
0 fail
129 expect() calls
```

Observacoes:

- A migration gerada originalmente tentou recriar `cte_issuance_outbox` porque a
  migration manual anterior nao possuia snapshot proprio. O SQL foi limpo para
  conter apenas billing e a alteracao controlada em `stored_objects`.
- O snapshot novo permanece como baseline futuro para evitar drift nas proximas
  geracoes.
- `T003` esta concluida e libera `T004` para contracts da aplicacao de
  faturamento.

## T004 — Contracts da aplicacao de faturamento

Data: 2026-07-23

Modelo executor recomendado: Codex Sol high para dinheiro, idempotencia,
concorrencia, transacoes e isolamento multiempresa.

Contracts criados:

- elegibilidade restrita a CT-e autorizado, sem fatura ativa e tenant-scoped;
- criacao transacional com snapshot decimal imutavel de invoice e itens;
- replay de idempotencia e conflito para fingerprint divergente;
- rollback quando o CT-e perde elegibilidade ou e reservado concorrentemente;
- consulta com anti-enumeracao e escopo derivado do contexto autenticado;
- cancelamento append-only, motivo sanitizado e replay de fatura ja cancelada.

Arquivos alterados:

- `apps/api-transportada/test/billing-application.contract.test.ts`
- `apps/api-transportada/test/billing-application/*.contract.ts`
- `apps/api-transportada/test/billing-application/support.ts`
- `apps/api-transportada/package.json`

Comando executado:

```text
bun test test/billing-application.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
11 fail
T005 application implementation is missing
```

Observacao:

- A falha e intencional para `T004`: os contracts fecham o comportamento da
  aplicacao e a implementacao dos casos de uso e repositorios fica para `T005`.
