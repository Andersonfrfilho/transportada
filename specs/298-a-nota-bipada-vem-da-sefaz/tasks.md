# Tasks — 298 A nota bipada vem da SEFAZ

Cada task fecha com typecheck + testes da app (script `test` e, quando tocar `test/integration/**`, `test:integration`
com `--env-file=../../.env.test`) + commit isolado + evidência em `evidence.md`.

## Fase 0 — Medir antes

> 🤖 Modelo: `sonnet`

- [ ] T0.1 Script `tmp/ops/producao-consulta-por-chave.sh <chave>` (leitura, 1 consulta `consChNFe` de dentro do
      container do worker, imprime só `cStat`, `xMotivo` e `schema`). **Rodar em produção pede aprovação humana** e a
      chave de uma das notas de 06/11. Evidência: `cStat` registrado. Não bloqueia as fases seguintes.

## Fase 1 — Banco e API

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

- [ ] T1.1 Migration aditiva (D1, D3, índice único parcial) + schema da API e cópia do worker — `make migration-test`.
- [ ] T1.2 Contrato das rotas (RF1, RF2, 404 entre empresas, idempotência, `found`) — antes do código.
- [ ] T1.3 Use cases + rotas + outbox + OpenAPI — contratos da T1.2 verdes; `test:integration` da rota.

## Fase 2 — Worker

> 🤖 Modelo: `sonnet`

- [ ] T2.1 `[P]` Política pura de desfecho (tabela `cStat`/`DfeItem` → estado e motivo, RF4) — contrato de tabela.
- [ ] T2.2 `[P]` Gateway: `consultarPorChave` no gateway e na factory — contrato com dublê.
- [ ] T2.3 Orçamento atômico (D3) — integração com duas reservas concorrentes e 656 abrindo 65 min.
- [ ] T2.4 Consumidor + repositório (importa `procNFe` pelo escritor comum, RF5, RF6, RF8) + topologia + `main.ts` —
      integração: importa, não duplica com a distribuição.
- [ ] T2.5 Reenfileirar `waiting` na rotina existente (D5) — contrato da rotina.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.4 → `haiku`)

- [ ] T3.1 Cliente + hook de polling + componente de linha (RF9, RF10) — contratos dos estados.
- [ ] T3.2 Criação da viagem (`useTripQuickCreate`): `notFound` vira busca; `imported` vira `staged` — contrato.
- [ ] T3.3 Detalhe da viagem e página de NF-e (RF11, RF12) — contratos.
- [ ] T3.4 Locales pt-BR/en dos estados e motivos — `typecheck` + teste de chaves de locale.

## Fase 4 — Publicar

> 🤖 Modelo: `sonnet`

- [ ] T4.1 Staging: bipar chave de homologação (recusa `not_found` com XML) e chave cadastrada; evidência por texto
      (`read_page`), sem screenshot intermediário.
- [ ] T4.2 Produção (**aprovação humana**): migration + API → worker → painel (ADR-0081 §9, tolerante primeiro);
      uma chave real importada e vinculada; atualizar `docs/runbooks/producao.md` e o `CLAUDE.md` (§14 do code-standart).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/298-a-nota-bipada-vem-da-sefaz/ (leia spec.md, plan.md e tasks.md
antes de começar). Trabalhe no worktree ../transportada-wt/spec-298 (branch work/spec-298). Uma task por vez, na ordem
do tasks.md; T0.1 só prepara o script — rodar em produção pede aprovação.
Modelos: Fase 1 → executor model=sonnet (T1.1 model=haiku) · Fase 2 → executor model=sonnet ·
Fase 3 → executor model=sonnet (T3.4 model=haiku) · Fase 4 → executor model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes (script test; test:integration com --env-file=../../.env.test quando tocar
integração) + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, qualquer chamada à SEFAZ de produção, migration destrutiva, [NEEDS CLARIFICATION].
```
