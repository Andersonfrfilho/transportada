# Tasks — Spec 215

## Fase A — o código esquece as colunas

> 🤖 Modelo: `sonnet` (T2 é 🧠 — validar o snapshot à mão com `opus` antes do commit)

- [ ] **T1** Contrato estático (CA2): reprova se `tripStops` declarar `latitude`, `longitude` ou
      `geocodingPrecision` — `test/trip-schema/*.contract.ts` + lista do `package.json` — evidência:
      vermelho antes de T2.
- [ ] **T2** 🧠 Remover as três colunas e os quatro `check`s de `trip.schema.ts`; migration à mão
      com `snapshot.json` do schema novo e SQL/rollback sem efeito — `drizzle/<ts>_trip_stops_forget_dead_coordinates/`
      — evidência: `db:generate` = `no_changes`, `schema-snapshot.contract.ts` verde,
      `make migration-test` verde.
- [ ] **T3** Comentários do RF3 — quatro arquivos citados na spec — evidência: `grep` sem
      "existem e nunca são escrit".
- [ ] **T4** Gates da fase A: typecheck, lint, contrato e integração da API; commit isolado; push para
      staging; deploy verde.
- [ ] **T5** Fase A em produção: PR para `main` com o commit da fase A (cherry-pick sobre
      `origin/main`), **merge com aprovação humana**.

## Fase B — o banco apaga as colunas

> 🤖 Modelo: `sonnet`. Nada desta fase começa antes de T5 estar em produção.

- [ ] **T6** RF2: contagem das três colunas não nulas = 0 em dev, staging e produção (`Postgres-Hqfu`),
      registrada em `evidence.md` com data. Diferente de zero → parar e reportar.
- [ ] **T7** Integração do CA3 (vermelha antes de T8) — `test/integration/*.integration.ts` + lista do
      `package.json`.
- [ ] **T8** Migration de remoção com `rollback.sql` — `drizzle/<ts>_trip_stops_drop_dead_coordinates/`
      — evidência: `make migration-test` (aplica, desfaz, reaplica), T7 verde, `db:generate` =
      `no_changes`.
- [ ] **T9** Gates da fase B; commit isolado. **Parar e pedir aprovação humana** antes do push para
      staging (migration destrutiva) e de novo antes do PR para produção.
- [ ] **T10** Revisão final: `code-reviewer` (`opus`) sobre as duas fases; atualizar o núcleo da API
      (`apps/api-transportada/CLAUDE.md`) se ele citar as colunas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/215-a-parada-perde-as-colunas-mortas/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase A → executor model=sonnet · T2 🧠 → opus (validar o snapshot com architect antes do
commit) · Fase B → executor model=sonnet · revisão final (T10) → code-reviewer model=opus.
Cada task fecha com typecheck + lint + os dois comandos de teste da API (contrato e
test:integration com --env-file=../../.env.test) + make migration-test quando houver migration +
commit isolado com caminhos explícitos e --no-verify, evidência em evidence.md.
Pare e pergunte antes de: merge em main (T5), iniciar a fase B sem a fase A em produção, qualquer
contagem do RF2 diferente de zero, push da migration destrutiva para staging e PR dela para produção (T9).
```
