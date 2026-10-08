# Tarefas — Feature 255

Uma por vez; teste antes; commit isolado por task; evidência em `evidence.md`.
Gates por task: typecheck da app, testes da app (script `test`, nunca `bun test` cru), `format:check` na raiz.

## Fase 0 — Conferência

> 🤖 Modelo: `haiku`

- [ ] **T0.1** Conferir os caminhos/linhas do `plan.md` contra `origin/staging`; registrar divergência. Aceite: lista em `evidence.md`.
- [ ] **T0.2** Conferir se o `GET` da viagem já devolve o tipo da ocorrência (para RF6). Aceite: resposta registrada.

## Fase 1 — Painel e app tolerantes

> 🤖 Modelo: `haiku`

- [ ] **T1.1** Painel: `iconName?: null | string` opcional no tipo e no guard de chave exata + contrato "com e sem a chave".
- [ ] **T1.2** Motorista: `iconName` opcional no tipo e no guard + contrato.

## Fase 2 — O dado

> 🤖 Modelo: `sonnet` (T2.1 é 🧠 — `opus`, validar com `architect`: migration + CHECK)

- [ ] **T2.1** 🧠 Constante do catálogo, coluna, CHECK, migration/rollback/snapshot. Integração `test/integration/occurrence-type-icon.integration.ts` + `make migration-test`.
- [ ] **T2.2** Zod, mapper, use case, leitura, DTOs e goldens (RF2, RF3, CA2). Contrato antes; mutação vermelha registrada (esquecer o mapper).

## Fase 3 — Telas

> 🤖 Modelo: `sonnet`; T3.1 → `haiku`

- [ ] **T3.1** Glyphs faltantes nos dois `icon.tsx` + contrato catálogo × `ICON_PATHS`.
- [ ] **T3.2** Aba Tipos: seletor de ícone + locale.
- [ ] **T3.3** Chip do motorista com ícone (CA1: sem ícone = igual a hoje).
- [ ] **T3.4** Cartão da ocorrência no painel com ícone.

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet`; revisão → `code-reviewer` `sonnet`

- [ ] **T4.1** Smoke CA3 em staging (escolher na aba Tipos → ver no app do motorista).
- [ ] **T4.2** Atualizar `docs/ai-context/{api-transportada,frontend-transportada,frontend-driver}.md` e os `CLAUDE.md` de app tocados.
- [ ] **T4.3** `make check`, `make migration-test`, integração da API, `evidence.md` consolidado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/255-o-tipo-da-ocorrencia-escolhe-o-icone/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 0 e 1 → executor model=haiku · Fases 2 e 3 → executor model=sonnet · T3.1 → haiku ·
T2.1 🧠 → opus (validar com architect antes) · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
