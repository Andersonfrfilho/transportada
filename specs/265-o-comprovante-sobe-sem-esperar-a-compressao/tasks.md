# Tasks — 265

Bloqueada por: respostas às `[NEEDS CLARIFICATION]` da spec (teto do original, retenção, orçamento,
painel). Nada aqui começa antes disso.

- [ ] T001 Medir o tamanho real das fotos da frota (p95/p99) e fechar o teto do original — evidência: números em `evidence.md`
- [ ] T002 Contrato da API: teto de corpo por rota (só o comprovante passa de 1 MiB) — `apps/api-transportada/test/`
- [ ] T003 Contrato da API: `variant = original` grava objeto + outbox na mesma transação — idem
- [ ] T004 Migration aditiva do estado (`processing_state`, `original_object_id`) + teste de migration e rollback
- [ ] T005 Implementar teto por rota, variante `original` e estado nas respostas
- [ ] T006 [P] Contrato do worker: original grande → versão ≤ 960 KiB + miniatura + leitura do código de barras
- [ ] T007 Trilho `delivery-proof-processing` no worker (processor, `worker_thread`, retry, limite de pixels)
- [ ] T008 `canhoto-read` lê o original quando existir — teste de leitura com imagem degradada contra original
- [ ] T009 [P] Painel tolerante ao estado `processing`/`processing_failed` (publicar primeiro, ADR-0081 §9)
- [ ] T010 App do motorista: orçamento de tempo da redução, envio de `variant`, estado "processando" — contrato do app
- [ ] T011 Retenção e expurgo do original (conforme a decisão) — rotina no cron
- [ ] T012 Smoke Playwright do fluxo completo e medição em aparelho real (SM-A125M) — `evidence.md`
- [ ] T013 Remover da tela as pontes do hotfix de 14/10 que o desenho novo torna redundantes (decisão humana)
