# Plano técnico — 298

Siglas: A = `apps/api-transportada/src`, W = `apps/worker-transportada/src`, F = `apps/frontend-transportada/src`.

## Contexto e premissas

Fatos levantados em `spec.md` § "Fatos". Decisões:

- **D1 — Busca é uma importação.** Cada busca é um `nfe_imports` com `source = 'access_key'` e um
  `nfe_import_items` com a chave; o estado da busca (RF3) é derivado desse par mais a tabela de controle (D3).
  Reaproveita trilha, auditoria e a escrita do documento. `source = 'access_key'` exige migration aditiva.
- **D2 — Uma busca, um evento.** Outbox `transportada.nfe.access-key.requested` → rota `nfe-access-key.v1`, consumidor
  próprio no worker. Não passa pelo consumidor da distribuição: o lease do cursor por NSU não pode esperar a SEFAZ
  responder chaves.
- **D3 — Orçamento separado do cursor.** Tabela `nfe_access_key_lookup_budgets (company_id, environment)` com
  `window_started_at`, `used_in_window`, `blocked_until`. O consumidor reserva uma unidade com `update … where
used_in_window < 15 and (blocked_until is null or blocked_until < now()) returning` antes de chamar a SEFAZ.
  Sem unidade → busca em `waiting` com `not_before`. Se a 656 vier mesmo assim, `blocked_until = now() + 65 min`.
- **D4 — Acrescentar é da operação.** O worker importa; a nota bipada vai para a lista de notas encontradas e quem
  acrescenta é a operação, pelas rotas de vínculo que já
  aplicam as regras da viagem. Nenhuma regra de viagem duplicada no worker.
- **D5 — Reenfileirar o `waiting`.** A rotina de jobs do worker que já existe (`W/nfe-distribution-pull/`) ganha um
  passo: buscas `waiting` com `not_before <= now()` voltam a gerar evento (no máx. o que cabe no orçamento).

## Arquitetura e arquivos afetados

- **Migration** (A `database/nfe.schema.ts` + cópia do worker): CHECK de `nfe_documents.source` e `nfe_imports.source`
  aceita `access_key`; colunas em `nfe_import_items`: `lookup_reason varchar null`, `not_before timestamptz null`;
  tabela `nfe_access_key_lookup_budgets`; `processing_outbox.event_type` aceita o novo evento.
- **API:** `A/nfe-access-key-lookups/` — `request-access-key-lookup.use-case.ts`, `get-access-key-lookup.use-case.ts`,
  `*.routes.ts`, `*.schema.ts`; registro em `main.ts`; rotas no OpenAPI.
- **Worker:**
  - `W/nfe-distribution/infrastructure/nfe-distribution-gateway.ts` + `adatechnology-nfe-distribution-provider.factory.ts`:
    expor `consultarPorChave`.
  - `W/nfe-access-key-lookup/` — `domain/access-key-lookup-outcome.policy.ts` (DfeItem/erro → estado e motivo, pura),
    `application/process-access-key-lookup.use-case.ts`, `infrastructure/drizzle-access-key-lookup.repository.ts`
    (reusa `writeDocumentChildren` e `lockAccessKey`).
  - `W/messaging/nfe-access-key-rabbitmq-topology.ts`, `W/runtime/nfe-access-key-consumer.service.ts`, `W/main.ts`.
- **Painel:** `F/modules/nfe-access-key-lookup/` (cliente, hook `useAccessKeyLookup.hook.ts` com polling, componente
  de linha); integração em `useTripQuickCreate.hook.ts`, `useTripDocumentLinkForm.hook.ts`, página de NF-e; locales.

## Contratos/API/eventos

- `POST /v1/nfe-access-key-lookups` body `{ accessKey }` → `201 {data:{id,status}}` | `200 {data:{status:'found',documentId}}`
  | `200 {data:<busca existente>}` | `400 INVALID_ACCESS_KEY`.
- `GET /v1/nfe-access-key-lookups/:id` → `200 {data:{id,status,documentId?,reason?,notBefore?}}` | `404`.
- Evento `transportada.nfe.access-key.requested` `{ lookupId, companyId, importId }` (só referência, sem chave inteira
  no log).

- `POST /v1/nfe-documents/access-key-checks` body `{ accessKeys: string[1..200] }` (`invoices.read`) →
  `200 {data:[{accessKey, documentId|null}]}` — uma query `where company_id = $1 and access_key = any($2)`; chave
  inválida → `400` com a lista de todas as inválidas.
- Importar por bip (painel): `F/modules/nfe-workspace/` — `useAccessKeyImport.hook.ts` (fila, agrupamento de 500 ms,
  `sessionStorage` com try/catch), `accessKeyImportSummary.service.ts` (resumo puro, base do critério 4a),
  `AccessKeyImportPanel.component.tsx`.

## Dados, migration e rollback

Aditiva. Rollback: remover a tabela nova e as colunas novas; o CHECK volta só se não houver linha `access_key`
(antes, reclassificar para `upload` — escrito no rollback, executado só com aprovação).

## Segurança e tenant

`companyId` do contexto; 404 entre empresas; certificado só em memória; nada de chave inteira, XML ou CNPJ de
participante em log; rota com rate limit do usuário (bipar é rápido, mas o orçamento da SEFAZ é da empresa).

## Idempotência e concorrência

- Índice único parcial: uma busca ativa (`queued|querying|waiting`) por `(company_id, access_key)`.
- `processed_messages` no consumidor; reserva do orçamento atômica (D3); escrita do documento sob `lockAccessKey`.

## Observabilidade

Eventos `nfe_access_key_lookup_finished` com `status`, `reason`, `cStat`, `budgetLeft`; alerta se `blocked_until` for
aberto (656 é sinal de defeito, nunca rotina).

## Estratégia de testes

Política de desfecho pura (tabela de `cStat`); contratos de rota; contrato do consumidor com gateway dublê (656,
640, resNFe, procNFe, timeout); integração no banco (importa, não duplica com a distribuição, orçamento atômico com
duas reservas concorrentes); contratos do painel para cada estado de linha.

## Riscos

- **Contador compartilhado com a distribuição:** a NT fala em "consultas por chave de acesso ou NSU". O produto não
  usa `consNSU`, só `distNSU`; se o contador incluir `distNSU`, o teto de 15 dá margem, e o alerta de 656 mostra.
- **Transportadora como não interessada** (provável nas notas de 06/11): o valor da P1 vem da recusa clara + XML.
- **`resNFe` para transportador**: a NT diz que transportador recebe completo; se vier resumo, cai em `summary_only`.
