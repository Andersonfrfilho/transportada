# Tasks — Importar o zip semanal de XMLs da Spani

Referências: [spec.md](./spec.md) · [plan.md](./plan.md). Test-first. Cada etapa indica o modelo.

## Fase 0 — Dados

> 🤖 Modelo: `opus` (migration + origem fiscal)

- [ ] T001 Contract de origem `zip` e resumo da importação (vermelho primeiro).
- [ ] T002 Migration aditiva (CHECK ampliado + resumo) com rollback; `bun run db:check`.

## Fase 1 — Núcleo da importação

> 🤖 Modelo: `opus` (fiscal, validação de zip, segurança)

- [ ] T003 Leitor de zip com limites (RF6) + testes de zip bomba e `..`.
- [ ] T004 Use-case `import-nfe-xml-archive`: chave, classificação novas/existentes/inválidas, reuso do parser da 005.
- [ ] T005 Contratos: outra empresa, sem permissão, duplicata interna, reenvio idempotente.

## Fase 2 — API e tela

> 🤖 Modelo: `sonnet`

- [ ] T006 Rota multipart + `GET` do resumo; schema Zod.
- [ ] T007 Tela: envio de zip/XMLs avulsos e resumo (novas, já existiam, inválidas).

## Fase 3 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] T008 Evidência com o lote 19–23/10 (135 novas + 264 existentes) e atualização de `docs/runbooks`.
- [ ] T009 `make check` verde.
