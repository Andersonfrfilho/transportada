# Tasks — Spec 201

Toda task começa pelo contrato ou teste, **visto vermelho**, e fecha com `bun run typecheck`,
`bun run lint`, os testes da app tocada (na API os **dois** comandos, de dentro de
`apps/api-transportada`: `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`), teste novo registrado no entrypoint, no
`package.json` e em `test/test-registry/declaration.contract.ts`, evidência no `evidence.md` e commit
isolado com `--no-verify` e caminhos explícitos. Sem migration.

## Fase 1 — API do aceite

> 🤖 Modelo: `opus` (regra de domínio no aceite)

- [ ] **T0** Conferir as premissas do `plan.md` (aceite sem ETA; `main.ts:2629` sem `routeFreezer`;
      estado de `trip-stop-order.adapter.ts` em `origin/staging`, que a 192 muda para levar o ator) e
      anotar arquivo:linha no `evidence.md`. Divergiu: pare e pergunte. Conferir que 201 segue livre.
- [ ] **T1** 🧠 `stopIds?` no aceite (RF1, RF2): schema, validação do conjunto antes de qualquer
      escrita, ordem enviada, rota congelada dessa ordem. Integração: CA01–CA04. **Publicar em staging
      antes da T2.**

## Fase 2 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T2** `RouteSuggestionPanel` → `onAccept(order)` → hook → cliente com `stopIds` só com ordem
      manual (RF3). Contrato do hook e do cliente (CA05).
- [ ] **T3** `TripStopList`: `KeyboardSensor` + `sortableKeyboardCoordinates`, anúncios traduzidos
      (RF4, CA06), e a nota datada na 079 `spec.md:18`. Condicional: se `stopOrderVersion` já vier no detalhe (spec 192 em staging), mandar
      `expectedStopOrderVersion` e tratar o `409` (RF5); se não, deixar anotado no `evidence.md`.
- [ ] **T4** 👤 Preview local do painel (`painel-worktree` em `.claude/launch.json`): print 1280 e 768 da
      sugestão com a ordem trocada antes e depois do aceite, e do foco de teclado na alça; revisão de
      design e acessibilidade (foco visível, anúncio). O usuário vê e aprova antes de staging.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/201-a-ordem-do-painel-nao-se-perde/ (leia spec.md,
plan.md e tasks.md antes; leia a seção de trip/routing de apps/frontend-transportada/CLAUDE.md e
specs/111-ordem-manual-da-proposta/spec.md D3/D4). Uma task por vez, na ordem.
Árvore própria (make worktree NAME=spec-201; em worktree do Claude, branch própria) — sem git stash.
Modelos: T0–T1 → opus · T2–T4 → executor model=sonnet.
Cada task: teste antes (visto vermelho), typecheck + lint + testes; na API os DOIS comandos
(contrato e test:integration com --env-file=../../.env.test); evidência em evidence.md; commit isolado
com --no-verify e caminhos explícitos.
A T1 sobe para staging antes da T2 (corpo .strict()). REGRA DO USUÁRIO: mudança de tela vai primeiro ao
preview local (T4) e só sobe depois de o usuário ver.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push.
Pare e pergunte antes de: deploy em produção, divergência das premissas da T0.
```
