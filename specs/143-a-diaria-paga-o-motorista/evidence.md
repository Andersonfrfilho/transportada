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

| Gate          | Comando                                    | Resultado                                                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Typecheck     | `bun run typecheck` (raiz, 6 apps)         | ✅ limpo                                                                      |
| Testes da API | `bun run --cwd apps/api-transportada test` | ✅ **6091 pass · 23 skip · 0 fail** · 21462 expect() · 177 arquivos · 11,53 s |
| Lint          | `bun run lint`                             | ✅ limpo                                                                      |
| Formatação    | `bun run format:check`                     | ✅ limpo (após `prettier --write` no arquivo novo)                            |
| Migration     | `make migration-test`                      | ⛔ **PENDENTE — Docker indisponível (2026-09-16)**                            |

### ⛔ Gate pendente

`make migration-test` **não foi rodado**: o Docker Desktop desta máquina sobe e morre em segundos, sem
runtime de container alternativo. Falta rodar exatamente:

```bash
make migration-test
```

Enquanto isso não rodar, **o `rollback.sql` não está provado contra Postgres real** — nem o replay
aplicar → rollback → reaplicar que o alvo executa.

**Prova parcial, que não substitui o gate:** contra um Postgres 18.4 local (Homebrew, porta 55432),
`DRIZZLE_TEST_DATABASE_URL=... bun test ./test/database-migration.contract.test.ts` deu **59 pass /
1 fail**. A única falha é `cte-profile-output-constraints.assertion.ts:134`, que espera SQLSTATE
`23503` e recebe `23001` — **pré-existente e alheia a esta task**, reproduzida em árvore limpa com
`git stash`; é diferença entre o Postgres 18 local e a imagem do compose. As três CHECKs novas e a
tabela nova passaram contra banco de verdade; a fase de replay do rollback fica para o gate real,
porque roda depois da falha pré-existente.
