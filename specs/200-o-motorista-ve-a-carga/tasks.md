# Tasks — Spec 200

**👤 = ação humana. 🧠 = sobe para `opus`.**

Toda task:

- começa pelo teste, **visto vermelho**;
- fecha com typecheck, lint e testes da app;
- na API, roda os **dois** comandos (contrato e `test:integration` com `--env-file=../../.env.test`);
- registra o teste novo no entrypoint, no `package.json` e no test-registry;
- anota a evidência no `evidence.md`;
- vira um commit isolado, com `--no-verify` e caminhos explícitos.

Sem migration no servidor.

## Fase 0 — Pré-requisitos

> 🤖 Modelo: `sonnet`

- [ ] **T0** Confirmar que a 192 está em staging: cópia, matriz, `cargoBlockedBy` e
      `hasLoadedCargoPlan`. Se não estiver, **pare**.
  - Conferir os tipos da planta no painel e o estado do `DriverStopCard` contra `origin/staging`.
  - Confirmar que o número 200 continua livre.

## Fase 1 — API

> 🤖 Modelo: `opus`

- [ ] **T1.1** 🧠 `GET /me/trips/current/stops/:stopId/cargo-plan`, reusando a leitura da cópia da 192.
  - Contrato de formato.
  - Negativos multiempresa e multimotorista.
  - Integração com a cópia filtrada e remapeada (CA01).

## Fase 2 — App do motorista

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Cópias por valor (RF3), com o cabeçalho e o mapa do `copy-by-value-header.contract.ts`.
      Validador tolerante (RF2, CA02).
- [ ] **T2.2** Página `/carga/:stopId`: camadas, lista em texto e o botão "Ver na carga" (RF4, RF5).
      Contrato do serviço das camadas (CA03).
- [ ] **T2.3** Cache sem rede (RF6).
  - Se precisar de store novo, a migração v3→v4 é aditiva.
  - Contratos: CA04 e CA05.
  - Medir o tempo do desenho com a fixture Atego e anotar no `evidence.md`.
- [ ] **T2.4** `bun run build` com o `dist.contract.test.ts` e o smoke em 375 px (CA06).

## Fase 3 — Revisão e publicação

> 🤖 Modelo: `sonnet` (T3.3 é `opus`)

- [ ] **T3.1** 👤 Preview local.
  - Subir `motorista-api-demo` (53901) e `motorista-local` (53200).
  - Estender a API de demonstração com a rota. Se o arquivo do scratchpad sumiu, recriar conforme a
    T5.1 da 192.
  - Tirar prints em 375 e 768 e fazer a revisão de design.
  - O usuário vê e aprova (CA07).
- [ ] **T3.2** Documentação: `apps/frontend-driver/CLAUDE.md` (mapa da carga, lista de cópias,
      versão do IndexedDB, se mudar) e `docs/ai-context/frontend-driver.md`. Rodar prettier.
- [ ] **T3.3** Revisão final com `code-reviewer` (`opus`).
  - Publicar na ordem **API → app, esta só depois da T3.1**.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/200-o-motorista-ve-a-carga/ (leia spec.md, plan.md,
tasks.md, a ADR-0077 §7–§8 e apps/frontend-driver/CLAUDE.md antes). PRÉ-REQUISITO: spec 192 publicada em
staging — se não estiver, pare e avise. Uma task por vez.
Árvore própria (make worktree NAME=spec-200; em worktree do Claude, branch própria) — sem git stash.
Modelos: T0 → sonnet · Fase 1 → opus · Fase 2 → executor model=sonnet · Fase 3 → sonnet
(T3.3 → code-reviewer model=opus).
Cada task: teste antes (visto vermelho), typecheck + lint + testes; na API os DOIS comandos (contrato e
test:integration com --env-file=../../.env.test); evidência em evidence.md; commit isolado com --no-verify
e caminhos explícitos.
REGRA DO USUÁRIO: tela vai primeiro ao PREVIEW local (motorista-local 53200 + motorista-api-demo 53901),
prints 375/768, e só sobe para staging depois de o usuário ver e aprovar.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push.
Pare e pergunte antes de: deploy em produção, estouro do orçamento de precache sem saída óbvia.
```
