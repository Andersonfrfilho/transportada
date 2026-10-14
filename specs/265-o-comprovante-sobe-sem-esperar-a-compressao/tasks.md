# Tasks — 265

Desbloqueada em 2026-10-14: as quatro decisões estão na spec ("Decisões"). Ordem de publicação
(ADR-0081 §9): painel tolerante (T009) → API (T002-T005) → worker (T006-T008) → app (T010).

- [ ] T001 [P] Medir o tamanho real das fotos da frota (p95/p99) para conferir os 12 MiB — evidência: números em `evidence.md`
- [ ] T002 Contrato da API: teto de corpo por rota (só o comprovante passa de 1 MiB) — `apps/api-transportada/test/`
- [ ] T003 Contrato da API: `variant = original` grava objeto + outbox na mesma transação — idem
- [ ] T004 Migration aditiva do estado (`processing_state`, `original_object_id`) + teste de migration e rollback
- [ ] T005 Implementar teto por rota, variante `original` e estado nas respostas
- [ ] T006 [P] Contrato do worker: original grande → versão ≤ 960 KiB + miniatura + leitura do código de barras
- [ ] T007 Trilho `delivery-proof-processing` no worker (processor, `worker_thread`, retry, limite de pixels)
- [ ] T008 `canhoto-read` lê o original quando existir — teste de leitura com imagem degradada contra original
- [ ] T009 [P] Painel tolerante ao estado `processing`/`processing_failed` (publicar primeiro, ADR-0081 §9)
- [ ] T010 App do motorista: orçamento de 8 s, envio de `variant`, barra com porcentagem de subida (RF12), estado "processando" e logs de upload com modelo (RF13) — contrato do app
- [ ] T011 Apagar o original quando `ready` (RF8) — worker, com teste de que falha mantém o original
- [ ] T012 Smoke Playwright do fluxo completo e medição em aparelho real (SM-A125M) — `evidence.md`
- [ ] T013 Remover da tela as pontes do hotfix de 14/10 que o desenho novo torna redundantes (decisão humana)
