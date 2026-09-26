# Tasks — Spec 202

**👤 = ação humana. 🧠 = sobe para `opus`.**

## Como toda task fecha

Toda task começa pelo teste, que tem de ser visto **vermelho** antes da implementação, e só fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada.
- Na API, os **dois** comandos, rodados de dentro de `apps/api-transportada`:
  - contrato: `bun --env-file=../../.env.test test --timeout 120000`;
  - integração: `bun --env-file=../../.env.test run test:integration`.
- No worker, `make worker-integration`, com a contagem de testes **executados** anotada no
  `evidence.md`.
- Registro do teste novo no entrypoint da área, no `package.json` e no test-registry.
- Evidência no `evidence.md`.
- Commit isolado, com `--no-verify` e caminhos explícitos.

A migration nasce com `rollback.sql` e fecha com `make migration-test` e `db:generate` = `no_changes`.

## Fase 0 — Pré-requisitos

> 🤖 Modelo: `opus`

- [ ] **T0** Confirmar que a 192 está em staging: `PUT` com `suggestionId`, matriz e editor. Se não
      estiver, **pare**.
  - Conferir as premissas do `plan.md` e passar a ADR-0084 para `aceita`.
  - Conferir que 202 e 0084 continuam livres: `git log --all -- 'specs/202*' 'docs/adr/0084*'`.

## Fase 1 — API e worker

> 🤖 Modelo: `opus`

- [ ] **T1.1** 🧠 Migration (`plan.md` § Dados). Testes:
  - CHECKs;
  - índice parcial: dois pedidos em voo na mesma viagem são recusados;
  - `rollback.sql`.
- [ ] **T1.2** 🧠 As duas rotas `/me/trips/current/stop-order-suggestions`.
  - Ledger `stop_order_suggestion`, `rateLimit` e posse.
  - `blockedStops` calculado pela matriz da 192.
  - Testes: CA05 e negativos multiempresa e multimotorista.
- [ ] **T1.3** 🧠 Worker (RF3).
  - Recorte das paradas não concluídas.
  - `origin` separado de `depot`.
  - `departureEpochSeconds` = agora.
  - Orçamento ≤ 5 s.
  - Zerar a coordenada na transação do resultado.
  - Testes: CA01, CA02 e CA03 (contrato do worker nos pontos `end = depot` e janelas contra agora).
- [ ] **T1.4** Rotina `stop-order-suggestion.expire` e os quatro catálogos (RF4). Testes: CA04 e
      CA07.
- [ ] **T1.5** 🧠 Redação: log do gateway e `beforeBreadcrumb` (RF5). Teste: CA06.

## Fase 2 — App do motorista

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Folha de finalidade, leitura pontual só depois do toque, consulta a cada 1 s até 30 s,
      preenchimento do rascunho e `suggestionId` no salvamento (RF6). Testes: CA08 e CA09 (evento
      conferido na integração).
- [ ] **T2.2** 👤 Preview local e aprovação.
  - Estender a API de demonstração com as duas rotas. Ela é o `motorista-api-demo` na 53901; se o
    arquivo do scratchpad sumiu, recriar como descrito na T5.1 da 192.
  - Tirar prints em 375 e 768.
  - Revisão de design.
  - O usuário vê e aprova (CA10).
- [ ] **T2.3** Documentação:
  - `docs/SECURITY.md` (posição da sugestão);
  - `apps/frontend-driver/CLAUDE.md`;
  - `docs/ai-context/worker-transportada.md`.
  - Rodar prettier.
- [ ] **T2.4** Revisão final:
  - `code-reviewer` e `security-reviewer`, `opus`;
  - publicação na ordem **API/worker → app, esta só depois da T2.2**.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/202-a-sugestao-parte-de-onde-o-caminhao-esta/ (leia
spec.md, plan.md, tasks.md, docs/adr/0084-a-sugestao-parte-de-onde-o-caminhao-esta.md e a ADR-0077 antes).
PRÉ-REQUISITO: spec 192 publicada em staging — se não estiver, pare e avise. Uma task por vez.
Árvore própria (make worktree NAME=spec-202; em worktree do Claude, branch própria) — sem git stash.
Modelos: Fase 0–1 → opus (T1.4 → executor model=sonnet) · Fase 2 → executor model=sonnet
(T2.4 → code-reviewer e security-reviewer model=opus).
Cada task: teste antes (visto vermelho), typecheck + lint + testes; na API os DOIS comandos (contrato e
test:integration com --env-file=../../.env.test); no worker make worker-integration com a contagem de
executados; evidência em evidence.md; commit isolado com --no-verify e caminhos explícitos. Migration com
rollback.sql, make migration-test e db:generate = no_changes.
REGRA DO USUÁRIO: tela vai primeiro ao PREVIEW local (motorista-local 53200 + motorista-api-demo 53901),
prints 375/768, e só sobe para staging depois de o usuário ver e aprovar. API/worker sobem após os gates.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push.
Pare e pergunte antes de: deploy em produção, migration destrutiva, divergência das premissas da T0.
```
