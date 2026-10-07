# Tarefas — 252

> **Q3 e Q4 estão `[NEEDS CLARIFICATION]`** (`spec.md`): não bloqueiam nenhuma task de código; bloqueiam **ligar a
> rotina** (configurar `FERIADOS_API_TOKEN`), que é passo do usuário. Migration **só staging** (Q2).

Uma task por vez, na ordem. Cada task fecha com: **contrato vermelho antes** (pelo motivo certo), `bun run typecheck`,
lint com a app como cwd, teste pelo **script `test` do `package.json`** (nunca `bun test` cru; na API contrato e
integração são dois comandos — `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`), integração contra um Postgres **que responda** (pular não é
passar), **prova por mutação**, `bun run format:check` na raiz, **commit isolado** com caminhos explícitos
(`--no-verify`, nunca `git add -A`) e evidência em `evidence.md`. Teste novo entra na lista explícita do `package.json`
da app. Migration pede também `make migration-test` e `db:generate` = `no_changes`.

## Quadro

| Task | Modelo                          | Migration | Prints  | Depende de     |
| ---- | ------------------------------- | --------- | ------- | -------------- |
| T0.1 | 🧠 `opus`                       | —         | —       | —              |
| T0.2 | `haiku`                         | —         | —       | T0.1           |
| T1.1 | `haiku`                         | —         | —       | T0.2           |
| T1.2 | `sonnet`                        | —         | —       | T1.1           |
| T2.1 | `sonnet`                        | —         | —       | T1.2 (staging) |
| T2.2 | 🧠 `sonnet` (revisão `opus`)    | **sim**   | —       | T2.1           |
| T2.3 | `haiku`                         | —         | —       | T2.1           |
| T3.1 | `sonnet`                        | —         | —       | T2.2           |
| T3.2 | `sonnet`                        | —         | —       | T2.2           |
| T3.3 | `sonnet`                        | —         | —       | T3.1, T3.2     |
| T3.4 | `sonnet`                        | —         | —       | T3.3           |
| T3.5 | `haiku`                         | —         | —       | T3.4           |
| T4.1 | `sonnet`                        | —         | —       | T2.2           |
| T4.2 | `sonnet`                        | —         | —       | T2.2           |
| T5.1 | `haiku`                         | —         | —       | T4.1, T4.2     |
| T5.2 | `sonnet`                        | —         | **sim** | T5.1           |
| T5.3 | `sonnet`                        | —         | **sim** | T5.1           |
| T6.1 | `sonnet` (revisão final `opus`) | —         | **sim** | todas          |

## Fase 0 — Decisão e conferência

> 🤖 Modelo: `haiku` (T0.1 é 🧠 — `opus`)

- [ ] **T0.1** 🧠 Validar o **ADR-0100** (redigido em 2026-10-07 a partir do desenho do `architect`) com `architect`
      `opus`: D1–D11, modelo de dados, emendas ao ADR-0048 §3 e à 238. Status de "proposta" para "aceita"; divergência
      vira emenda no ADR e nota em `evidence.md`.
- [ ] **T0.2** Conferir os fatos do `plan.md` § Contexto contra `origin/staging` (arquivo e linha) e o próximo
      timestamp de migration livre. Divergência vira nota em `evidence.md`.

## Fase 1 — O roteirizador fecha só a cidade em feriado (sem migration)

> 🤖 Modelo: `sonnet` (T1.1 em `haiku`)

- [ ] **T1.1** Inverter o teste de `route-optimization-municipal-holiday.integration.test.ts` ~199–206 para esperar
      **`[CITY_B]`** e acrescentar o caso do **mesmo CNPJ com paradas em duas cidades** (feriado em B não fecha a
      parada em A). Vermelho contra o código atual, pelo motivo certo. (CA1)
- [ ] **T1.2** `readPoolWindows`: select com `cityIbgeCode`, janela por `${cityCode}\u0000${taxId}`, `resolvePoolWindow`
      com a cidade da parada; política e contrato do solver intactos. Mutação: tirar o filtro por cidade deixa a T1.1
      vermelha. Publicar o worker em staging **sozinho** e confirmar o deploy. (CA1)

## Fase 2 — Dado e catálogo

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — revisão `opus`; T2.3 em `haiku`)

- [ ] **T2.1** Contratos e integração do modelo **antes**: tabelas, únicos, CHECK de exclusão mútua
      `source_rule_id`/`provider_entry_id`, índice parcial, CHECK de `job` com o nome novo, `rollback.sql` (estático).
- [ ] **T2.2** 🧠 Migration aditiva (`<timestamp>_holiday_provider_import`) + `rollback.sql` + `snapshot.json` + schema
      Drizzle; comandos em tabela publicada no fim do arquivo; `make migration-test`; `db:generate` = `no_changes`;
      integração do roteirizador verde depois dela. Revisão `opus` em passada separada. **Só staging.** (CA2)
- [ ] **T2.3** `holiday.provider.pull` nas quatro cópias do catálogo de jobs — **painel primeiro** — com rótulo e
      locale pt-BR/en; `catalog.contract.ts` das quatro apps verde.

## Fase 3 — A rotina no worker

> 🤖 Modelo: `sonnet` (T3.5 em `haiku`)

- [ ] **T3.1** Cliente HTTP da FeriadosAPI: `Authorization: Bearer`, guarda Zod com as chaves esperadas, erros tipados
      (`provider_unreachable`, `provider_unauthorized`, `malformed_response`), `data` `DD/MM/AAAA` → `YYYY-MM-DD`
      validada; fixture no formato da documentação (cidade, estado, nacional, facultativo, página > 100).
- [ ] **T3.2** Descoberta por cursor (`nfe_documents_company_updated_issued_id_idx`, 2.000 por lote, 20 lotes por ciclo),
      destino físico pela mesma junção do roteirizador, upsert em `holiday_import_cities`; empresa com
      `is_enabled = false` pulada. Integração contra Postgres.
- [ ] **T3.3** Busca: ordem por `sum(document_count)`, horizonte (D8), limitador 1,2 s com relógio e `sleep` injetados,
      teto de 100 por ciclo, orçamento mensal incrementado antes da chamada, backoff 1 h/6 h/24 h até 7 dias, 401/403,
      429 com `Retry-After`, `quota_exhausted`, `not_covered` (90 dias). (CA3, CA7)
- [ ] **T3.4** Aplicação: municipal `ON CONFLICT DO NOTHING` pulando supressões, estadual `once` marcado (D6), só datas
      `>=` hoje em São Paulo (D7), nacional só paridade (`national_mismatch`), facultativo só no cache, `removed_at`
      sem apagar a linha da empresa. Confere no início que a Fase 1 está em staging. (CA4, CA6, CA10, CA11)
- [ ] **T3.5** `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` no schema do worker (vazio = ausente),
      registro condicional da rotina (`job_run_routine_missing` sem token), `.env.example` sem valor,
      `.railway/railway.ts` com `preserve()`, contrato de que o token não aparece no log (inclusive em erro). (CA8, CA9)

## Fase 4 — API

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Rotas de gestão (`settings.manage`, `.strict()`, `companyId` do contexto, `audit_logs` na mesma
      transação): desligar/restaurar importado, adoção pelo `PATCH` de nome/tipo (zera `provider_entry_id`), status da
      importação. Integração contra Postgres. (CA5)
- [ ] **T4.2** `holidayWarnings` nas paradas do `GET /trips/:id` e `POST /business-calendar/day-checks` (`fleet.read`,
      até 200 itens, 400 a campo desconhecido e a > 200); contrato de contagem de consultas (+0 ou +4 fixas), leituras
      em série dentro de transação (`transaction-serial-queries.contract.test.ts`). (CA12, CA13)

## Fase 5 — Painel

> 🤖 Modelo: `sonnet` (T5.1 em `haiku`)

- [ ] **T5.1** Painel tolerante aos campos novos: validação aceita `holidayWarnings` ausente ou presente; `day-checks`
      indisponível cai no aviso nacional de hoje. Sai antes da API.
- [ ] **T5.2** Aba Calendário: origem (nacional, estadual, cadastrado, importado), desligar/restaurar, removidos pelo
      fornecedor, status da importação; locale pt-BR/en. **Prints** 375/768/1280, claro e escuro, aprovados pelo
      usuário antes de publicar.
- [ ] **T5.3** Avisos por parada na montagem (uma chamada a `day-checks` quando o solver termina, no lugar do aviso
      só nacional) e selo nas paradas do detalhe; texto neutro, nunca desabilita "Criar viagem". **Prints**
      375/768/1280, claro e escuro, aprovados pelo usuário. (CA14)

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final `opus`)

- [ ] **T6.1** Revisão de design e usabilidade (web.md §15) comparando a tela real com os prints aprovados;
      documentação viva (`plan.md` § Documentação viva), entrada de `feriadosapi.com` como destino de saída em
      `docs/SECURITY.md`; revisão final com `code-reviewer` `opus` em passada separada; auditoria do §15 do
      `code-standart.md` (N+1, `Promise.all`, logs sem PII, sanitização).

## Publicação

T1.2 sai sozinha → T2.2 com T2.3 (painel antes) → API (Fase 4) → worker (Fase 3), **inerte sem token** → o usuário
confirma termos e plano (Q3, Q4) e configura o token em staging → acompanhar o 1º ciclo e registrar em `evidence.md` →
telas depois dos prints aprovados → produção por PR `staging → main` com aprovação humana (a migration com aprovação
própria).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/252-os-feriados-vem-da-feriadosapi-e-avisam-na-montagem/
(leia spec.md, plan.md, tasks.md e docs/adr/0100-os-feriados-vem-da-feriadosapi-e-avisam-na-montagem.md antes de
começar). Uma task por vez, na ordem do tasks.md, em worktree/branch próprios a partir de origin/staging (git fetch
antes; confira que 252 e o ADR 0100 seguem sendo desta spec).
Modelos: T0.1 🧠 → opus (architect valida o ADR-0100) · Fase 0 (T0.2) → executor model=haiku ·
Fase 1 → T1.1 executor model=haiku, T1.2 executor model=sonnet · Fase 2 → T2.1 executor model=sonnet,
T2.2 🧠 executor model=sonnet com revisão code-reviewer model=opus em passada separada, T2.3 executor model=haiku ·
Fase 3 → T3.1–T3.4 executor model=sonnet, T3.5 executor model=haiku · Fase 4 → executor model=sonnet ·
Fase 5 → T5.1 executor model=haiku, T5.2 e T5.3 executor model=sonnet · T6.1 → executor model=sonnet e revisão final
code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com: contrato vermelho antes, typecheck, lint com cwd na app, teste pelo script do package.json (API:
contrato e integração são dois comandos, com --env-file=../../.env.test), integração contra Postgres que responda,
mutação, format:check na raiz, commit isolado com caminhos explícitos (--no-verify, nunca git add -A), evidência em
evidence.md. Migration: make migration-test e db:generate = no_changes.
A rotina só grava em municipal_holidays depois de a T1.2 estar publicada em staging.
Pare e pergunte antes de: produção (deploy, PR staging→main, migration em produção), migration destrutiva, configurar
ou pedir FERIADOS_API_TOKEN (Q3 e Q4 são [NEEDS CLARIFICATION] e o token é passo do usuário), mudar o contrato do
solver, e qualquer tela publicada sem print aprovado.
```
