# Plano — Feature 314

1. API (`apps/api-transportada/src/nfe-imports`): constante `REPROCESSABLE_REJECTION_CODES`; `reprocess-nfe-import.use-case.ts` passa a selecionar item `failed` **ou** `rejected` elegível; estados bloqueados (RF5); nova rota de simulação `GET /v1/nfe-imports/:id/reprocess-preview` (só leitura, `invoices.import`).
2. Contratos primeiro: `test/nfe-import-reprocess.contract.test.ts` (elegível, não elegível, ocupado, simulação sem escrita) e entrada na lista do `package.json`.
3. Integração com banco: tentativa única sob dupla confirmação (`test/integration/`), rodada com `--env-file=../../.env.test`.
4. Worker: nenhuma mudança; o consumidor já relê os itens pendentes da importação. Conferir em `nfe-import-consumer.contract` que item novo de tentativa seguinte é processado.
5. Painel (`modules/nfe-workspace`): `isReprocessable` passa a considerar o que a API devolve; diálogo de confirmação com a contagem; textos em `.locale.json`; teste de contrato do painel.
6. Runbook: o script de operação passa a ser o plano B; atualizar `docs/runbooks/producao.md`.
7. Publicar em etapas: API (retrocompatível) → painel. Primeiro `staging`; `main` só com aprovação.
