# 030 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — banco

> 🤖 Modelo: `sonnet`

- [x] **T001** Migration aditiva em `nfe_distribution_cursors`: `consecutive_rate_limits`
      (`integer not null default 0`), `last_skipped_from_nsu` (`text`), `last_skipped_to_nsu`
      (`text`), `last_skipped_at` (`timestamptz`). Schema Drizzle na API e a **cópia** no worker
      (`apps/worker-transportada/src/database/`). Rollback ao lado.
      Verificação: `make migration-test`.

## Fase B — worker (o automático)

> 🤖 Modelo: `sonnet` (T003 é 🧠 — é a regra que quebra o laço)

- [x] **T002** Contrato: página que falha ao persistir avança o cursor e grava o intervalo pulado;
      dois 656 com `ult_nsu < max_nsu` ressincronizam para `max_nsu`; 656 com `ult_nsu == max_nsu`
      não move nada; 137/138 zeram o contador. Suíte nova em
      `test/nfe-distribution/cursor-recovery.contract.ts` + entrada no `package.json`.
- [x] **T003** 🧠 Implementar no `nfe-distribution-consumer.service.ts` e no
      `drizzle-nfe-distribution-cursor.repository.ts`: avanço incondicional do cursor, contador de
      recusas, ressincronização e gravação do intervalo pulado. Log próprio
      `nfe_distribution_page_skipped` e `nfe_distribution_cursor_resynced`.
- [x] **T004** `resyncCursor` no repositório Drizzle do worker: método próprio para salto, que calcula
      a janela de uma hora sozinho e grava o intervalo abandonado — regra 3 da spec. Integração em
      `test/nfe-distribution-cursor-repository.integration.test.ts`.

## Fase C — API (o manual)

> 🤖 Modelo: `sonnet`

- [x] **T005** Contrato de rota: `GET`/`PUT /company-settings/distribution-cursor` com
      `settings.manage` escopo `company`; 403 sem permissão; 422 para `ultNsu > maxNsu` e para
      formato fora de 15 dígitos; isolamento entre empresas.
- [x] **T006** Use cases, repositório, serializer e rotas. Trilha de auditoria na escrita.

## Fase D — frontend

> 🤖 Modelo: `sonnet`

- [x] **T007** Painel “Cursor da distribuição” em Configurações, abaixo do painel da busca
      automática: valores, recusas seguidas, último intervalo pulado e campo de ajuste com
      confirmação. Esqueleto de carregamento, campos e select pelos tokens, locales pt-BR
      acentuados + en.
- [x] **T008** Contrato do painel (render, permissão, submit, erro 422).

## Fase E — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T009** `make check` verde, evidência em `evidence.md`, runbook §7 atualizado para apontar
      esta feature no lugar do procedimento manual, PR e deploy.
