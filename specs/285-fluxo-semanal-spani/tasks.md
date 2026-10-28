# Tasks — Fluxo semanal da Spani

Referências: [spec.md](./spec.md) · [plan.md](./plan.md). Test-first. Uma etapa por spec/PR.

## Etapa 1 — Verificar a importação do zip

> 🤖 Modelo: `sonnet`

- [ ] T001 Subir o zip real em staging e registrar o resumo em `evidence.md` (135 importadas, 264 duplicadas; reenvio 399 duplicadas).
- [ ] T002 Se o expander recusar o zip, ajustar o limite com teste.
- [ ] T003 Registrar o passo a passo no `docs/runbooks/producao.md`.

## Etapa 2 — Planilha, seleção e emissão de CT-e/NFS-e

> 🤖 Modelo: `opus` (fiscal, emissão em lote)

- [ ] T004 Contrato do parser da planilha e do cruzamento com as notas.
- [ ] T005 Modelo de execução/passos/confirmações (migration aditiva + rollback).
- [ ] T006 Passo de emissão com confirmação, idempotente, reaproveitando CT-e em lote e NFS-e externa.
- [ ] T007 Tela de confirmação dos passos 1 e 2 (`prints/1-importacao.png`, `prints/2-emitir.png`).

## Etapa 3 — Fatura dos CT-e

> 🤖 Modelo: `sonnet`

- [ ] T008 Passo de fatura com prazo vindo da automação (15 dias na Spani) e tela (`prints/3-fatura.png`).

## Etapa 4 — Envio em partes de 100, respondendo a todos

> 🤖 Modelo: `opus` (email, anexos, destinatários)

- [ ] T009 Montagem das partes, modelo de email com tabela de Ribeirão (modelo do módulo de notificação).
- [ ] T010 Envio por parte com reenvio da parte que falhar e tela (`prints/4-enviar.png`).

## Etapa 5 — Caixa da empresa

> 🤖 Modelo: `opus` (infra de email recebido)

- [ ] T011 Spec própria: domínio, recebimento e disparo do fluxo.

## Etapa 6 — Página de automações

> 🤖 Modelo: `sonnet`

- [ ] T012 CRUD de automações e tela (`prints/5-automacoes.png`); sem nome ou CNPJ da Spani no código.
