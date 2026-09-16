# Evidence — 143 A diária paga o motorista

Registro por task: comando, saída relevante, commit.

## T1 — Esquema: diária do motorista, dias da viagem e valor geral da empresa

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`

### Entregas

- `fleet_drivers.daily_allowance_amount numeric(19,4) NULL` + `fleet_drivers_daily_allowance_check`
  (`is null or > 0`).
- `trips.daily_allowance_days integer NULL` + `trips_daily_allowance_days_check`
  (`is null or >= 1`).
- Tabela `company_driver_allowance_settings` + `company_driver_allowance_settings_amount_check` (`> 0`).
- Migration `apps/api-transportada/drizzle/20260916120000_driver_daily_allowance/`
  (`migration.sql` e `snapshot.json` gerados por `db:generate`, diretório renomeado; `rollback.sql` à mão).

### Decisões de desenho registradas

- **Arquivo próprio** `src/database/company-driver-allowance-settings.schema.ts`, modelado em
  `company_energy_settings` — `company_id uuid PRIMARY KEY` com FK `restrict`/`cascade`. Uma linha por
  empresa sai da **chave**, não de um UNIQUE acessório sobre `id` surrogate.
- O `plan.md` citava `company_tax_settings` como modelo; **corrigido** para `company_energy_settings`,
  com o motivo na própria linha (`company_tax_settings` usa `id` surrogate + UNIQUE).
- `updated_by_user_id uuid NOT NULL` **sem chave estrangeira**, como em `company_tax_settings`: é rastro
  de quem mexeu no dinheiro, e apagar o usuário não pode apagar o rastro nem travar a linha.
- CHECK dos dias fica em `>= 1`, sem teto: o limite de 60 é regra de zod, de outra task.
- Migration **puramente aditiva**: nenhum `DROP`, nenhum `CASCADE`, nenhum `NOT VALID` (coluna nova não
  tem linha antiga para validar). O `rollback.sql` recusa-se a rodar — `RAISE EXCEPTION` — se qualquer
  das três colunas/tabela já tiver dado, e confere `ROW_COUNT = 1` ao apagar a entrada do journal.
- Teste real de banco da nova tabela e dos dias da viagem foi para `trip-constraints.assertion.ts`
  (além da `fleet-constraints.assertion.ts` pedida), porque é lá que existem `companyId`, `vehicleId`
  e `userId` para os inserts.

### Gates

| Gate          | Comando                                                            | Resultado                                                                     |
| ------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Typecheck     | `bun run typecheck` (raiz, 6 apps)                                 | ✅ limpo                                                                      |
| Testes da API | `bun run --cwd apps/api-transportada test`                         | ✅ **6091 pass · 23 skip · 0 fail** · 21462 expect() · 177 arquivos · 11,53 s |
| Lint          | `bun run lint`                                                     | ✅ limpo                                                                      |
| Formatação    | `bun run format:check`                                             | ✅ limpo (após `prettier --write` no arquivo novo)                            |
| Rollback      | `bun test ./test/database-migration.contract.test.ts` (PG18 local) | ✅ **60 pass · 0 fail** com o replay do rollback (ver "Replay do rollback")   |
| Migration     | `make migration-test`                                              | ✅ **96 pass · 0 fail** · 1268 expect() · 8 arquivos · 36,24 s                |

### Replay do rollback — defeito encontrado e corrigido

**O `rollback.sql` da T1 quebrava o replay do teste de migration, e o defeito estava provado:**

```
PostgresError: fleet_drivers has rows with daily_allowance_amount set, refusing rollback
```

`database-migration.integration.ts` roda as asserções de constraint — que inserem, de propósito,
linhas com `daily_allowance_amount`, `daily_allowance_days` e uma linha em
`company_driver_allowance_settings` para exercitar os CHECKs — e **só depois** aplica todos os
`rollback.sql` em ordem reversa. As três guardas de dado, que são justamente o que a T1 quis, viam
esse dado de teste e recusavam. `make migration-test` teria reprovado.

A correção segue o precedente do repo, `rntrc-rollback.assertion.ts`: uma asserção dedicada que
**prova a recusa** e depois **esvazia o dado ofensor** para a fase de replay conseguir rodar.

- Arquivo novo: `apps/api-transportada/test/database-migration/driver-allowance-rollback.assertion.ts`
  (`assertDriverAllowanceRollbackRefusesRecordedMoney`).
- Cobre as **três** guardas em sequência — as guardas param na primeira, então cada mensagem só
  aparece depois que a anterior é esvaziada: diária do motorista → dias da viagem → linha de
  configuração da empresa. Cada recusa tem a mensagem verificada.
- Ao fim, limpa para o replay: `daily_allowance_amount = null`, `daily_allowance_days = null`,
  `delete from company_driver_allowance_settings`.
- Chamada ligada em `database-migration.integration.ts`, junto das outras asserções, antes do bloco
  de rollbacks reversos.
- O `rollback.sql` **não mudou** — a guarda é o comportamento desejado, o que faltava era o teste
  respeitá-la.

**Prova contra Postgres real** (PG 18.4 Homebrew, `postgres://postgres@127.0.0.1:55433/transportada`),
com a chamada de `assertCteProfileOutputConstraints` neutralizada **apenas localmente** (falha
pré-existente e alheia, descrita abaixo) para alcançar a fase de replay:

```bash
DRIZZLE_TEST_DATABASE_URL="postgres://postgres@127.0.0.1:55433/transportada" \
  bun test ./test/database-migration.contract.test.ts --timeout 180000
# 60 pass · 0 fail · 1170 expect()
```

O replay completo — aplicar → rollback de todas as migrations → reaplicar → rollback de novo —
passou. A neutralização do cte foi desfeita antes do commit (conferido com `git diff`) e **não
entrou na branch**.

Sanidade da asserção: trocando de propósito a mensagem esperada da terceira guarda, o teste falha
com `Received: "company_driver_allowance_settings has rows, refusing rollback"` — ou seja, as três
recusas são realmente alcançadas e comparadas, nenhuma passa por omissão.

### Gate formal — `make migration-test` verde

O Docker voltou (`docker desktop stop` + `pkill -9` dos processos `com.docker`/`Docker Desktop` +
`docker desktop start`) e o gate rodou inteiro, na imagem do compose, **sem nenhum ajuste local**:

```bash
make migration-test
# Container transportada-local-postgres-1  Healthy
# 96 pass · 0 fail · 1268 expect() · 8 arquivos · 36,24 s · exit code 0
```

Isso fecha três coisas de uma vez:

1. A migration e o `rollback.sql` da T1 estão corretos ponta a ponta, **incluindo o replay**
   (aplicar → rollback de todas → reaplicar).
2. A correção `driver-allowance-rollback.assertion.ts` funciona na imagem real, não só no PG local.
3. A falha de `cte-profile-output-constraints.assertion.ts:134` (SQLSTATE `23503` esperado,
   `23001` recebido) era mesmo **diferença do Postgres 18.4 local contra a imagem do compose**:
   aqui ela passa. Pré-existente e alheia a esta task de qualquer forma — foi reproduzida em árvore
   limpa com `git stash` —, e a neutralização usada no diagnóstico local **nunca entrou na branch**
   (conferido: a chamada segue em `database-migration.integration.ts:107`, árvore limpa).
