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

## T2 — Política da diária

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`

### Entregas

- `apps/api-transportada/src/trips/domain/daily-allowance.constant.ts` (novo):
  `DEFAULT_DAILY_ALLOWANCE_AMOUNT = '200.0000'`, `DAILY_ALLOWANCE_DAY_SECONDS = 86400`,
  `MINIMUM_ALLOWANCE_DAYS = 1`.
- `apps/api-transportada/src/trips/domain/daily-allowance.policy.ts` (novo): `resolveDailyAllowance`
  (D3) e `suggestAllowanceDays` (D4), com o const-object `DAILY_ALLOWANCE_RATE_ORIGIN` (`driver` /
  `company` / `default`) no molde de `VALUATION_SOURCES`/`TRIP_OCCUPANCY_SOURCE` já usados no domínio
  de viagem.
- `apps/api-transportada/test/trip-valuation/daily-allowance.contract.ts` (novo, escrito **antes** da
  implementação): três casos de origem (D3) e os quatro casos de dias do plan (D4).
- `apps/api-transportada/test/trip-valuation.contract.test.ts`: import da suíte nova. Nenhuma entrada
  no `package.json` — o entrypoint `./test/trip-valuation.contract.test.ts` já estava declarado.

### Decisões

- `resolveDailyAllowance({ driverAmount, companyAmount })` **substitui**, não soma — confirmado pela
  premissa já validada da spec (D3): motorista com valor vence sempre, mesmo com empresa configurada;
  sem motorista, vale a empresa; sem nenhum dos dois, o padrão `'200.0000'`. Os dois parâmetros e o
  valor de retorno são strings `numeric` (Decimal-as-string) — a função só escolhe qual string usar,
  não faz aritmética nenhuma, então não há risco de float binário.
- `suggestAllowanceDays(durationSeconds)` fica com parâmetro primitivo único (não objeto): a regra do
  repo de objeto tipado vale para mais de um parâmetro, e o próprio `plan.md` já assinava a função
  assim. `Math.ceil(durationSeconds / 86400)` com piso em `Math.max(1, …)`.
- Tipos com sufixo `Params`/`Result` seguindo o precedente de `ResolveTripOccupancyParams` /
  `ResolvedTripOccupancy` (`trip-occupancy.policy.ts`): `ResolveDailyAllowanceParams` e
  `ResolvedDailyAllowance`.
- Escopo mantido estrito: **não** tocou em `buildTripDriverCost`, `trip-driver-cost.policy.ts`, query,
  rota ou frontend — isso é T3 em diante, como o prompt determinou.

### Gates

| Gate          | Comando                                    | Resultado                                                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Typecheck     | `bun run typecheck` (raiz, 6 apps)         | ✅ limpo — `tsc --noEmit` sem erro nas 6 apps                                 |
| Testes da API | `bun run --cwd apps/api-transportada test` | ✅ **6098 pass · 23 skip · 0 fail** · 21469 expect() · 177 arquivos · 12,13 s |
| Lint          | `bun run lint`                             | ✅ limpo — eslint sem warning nas 6 apps                                      |
| Formatação    | `bun run format:check`                     | ✅ limpo (após `prettier --write` no contrato novo)                           |

Os sete testes novos (`daily-allowance.contract.ts`) entram nos 6098 pass acima; nenhuma suíte
existente mudou de comportamento — T2 é só domínio puro, sem tocar em `trip-driver-cost.policy.ts`
nem em nada que outra suíte já exercite.

## T3 — pré-requisito: o que cada suíte de zona/empate passa a dizer

> O `tasks.md` exige este inventário **antes** de codar a T3. Levantado por `Explore` e conferido
> pela validação arquitetural em `opus`. Decisão do usuário: **as suítes são reescritas no lugar** —
> o arquivo continua existindo e muda de assunto, nenhuma é apagada.

### Por que tanta suíte cai de uma vez

O `buildTripDriverCost` de hoje não é uma soma: é uma **máquina de decisão sobre uma fonte incerta**.
Metade do arquivo (`hasDetail`, `buildTieBasis`, `tieDriverNameDetail`, `buildRateDetail`, a escolha
da lacuna preferida) existe para explicar ao operador _por que a tabela de região não respondeu_.
Com `driverAmount ?? companyAmount ?? DEFAULT`, a incerteza acaba — e o subsistema de diagnóstico
fica sem objeto. As suítes que morrem são as que testavam esse diagnóstico.

### API — `apps/api-transportada/test/`

| Suíte                                                | Hoje                                                                                                                          | Passa a dizer                                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trip-valuation/driver-rate-gap.contract.ts`         | 10 de 13 casos são lacuna de rota sem valor                                                                                   | A única lacuna do custo do motorista é **tripulação vazia**; sem valor cadastrado não é mais lacuna, é a diária padrão                                                 |
| `trip-valuation/driver-zone-table-price.contract.ts` | 8 de 9 casos são preço vindo da tabela de zona                                                                                | A zona não participa do custo do motorista; o preço é `diária × dias`                                                                                                  |
| `trip-valuation/driver-route-tie.contract.ts`        | 7 de 21 casos são empate entre zonas                                                                                          | Empate deixa de existir no custo; os 14 casos restantes seguem válidos                                                                                                 |
| `trip-valuation/driver-route-vote.contract.ts`       | 2 de 13 casos                                                                                                                 | Idem — a maioria não depende de empate                                                                                                                                 |
| `trip-valuation/crew-zone-wiring.contract.ts`        | Afirma **por texto de fonte** que a query chama `resolveTripDriverZone` e que ambos os leitores delegam a `this.resolveCrew(` | Afirma a ausência do loop por motorista e o valor da empresa lido **uma vez**. ⚠️ Quebra na T4, não na T3                                                              |
| `trip-valuation/read-valuation.contract.ts`          | 2 de 13 casos tocam custo por rota                                                                                            | Os dois passam a afirmar a parcela por diária                                                                                                                          |
| `trip-valuation/driver-zone.contract.ts`             | Testa `trip-driver-zone.policy.ts` direto                                                                                     | **Intacta** — a política fica no repo (decisão do usuário), a suíte segue sendo o que prova que ela funciona                                                           |
| `trip-financial/driver-and-tax.contract.ts`          | ≈8 de 13 casos; fixtures `AGGREGATE`/`SALARIED`                                                                               | O agregado e o da casa passam a ter a **mesma** conta (`diária × dias`); some o ramo `period`. Mantém `:152-154`, "viagem sem condutor é desconhecida, nunca gratuita" |
| `trip-financial/freeze.contract.ts`                  | Congelamento                                                                                                                  | **Intacta** na T3 — muda na T6                                                                                                                                         |

### Frontend — `apps/frontend-transportada/test/`

⚠️ Duas destas leem o **fonte da API** e quebram na T3 mesmo sem ninguém tocar no frontend.

| Suíte                                                          | Hoje                                                                                                                        | Passa a dizer                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `trip-financials/driver-route-tie-detail.contract.ts`          | 8 de 8 casos são o detalhe do empate                                                                                        | Reescrita para a linha da diária: valor, dias e origem                                       |
| `trip-financials/valuation-gap-labels.contract.ts`             | `:45-47` afirma que `apiGaps()` contém `NO_DRIVER_RATE`; `:50-65` exige rótulo em todos os dicionários para todo gap da API | Muda de assunto se entrar código novo de lacuna; a exigência de rótulo completo **continua** |
| `trip-financials/valuation-ledger-advisory.contract.ts`        | 4 de 5 casos; recorta `ADVISORY_GAPS` do fonte da API e compara a lista exata (`:75`, `:79`)                                | ⚠️ **`ADVISORY_GAPS` não deve ser mexida** — esvaziar quebra esta suíte sem ganho nenhum     |
| `trip-financials/valuation-ledger.contract.ts`                 | 1 de 6 casos                                                                                                                | O caso do motorista passa a ser a diária                                                     |
| `trip-financials/valuation-ledger-strikethrough.contract.ts`   | Válida, 1 fixture datada                                                                                                    | Só a fixture muda                                                                            |
| `trip-financials/gap-detail.contract.ts`                       | Válida, 2 de 3 fixtures datadas                                                                                             | Só as fixtures mudam                                                                         |
| `trip-financials/panel.contract.ts`                            | —                                                                                                                           | **Intacta**                                                                                  |
| `trip/proposal-toll-pending.contract.ts`                       | Válida, 1 fixture datada                                                                                                    | Só a fixture muda                                                                            |
| `multi-vehicle-smoke.helper.ts`                                | Helper de fixture                                                                                                           | Acompanha as fixtures                                                                        |
| `panel-error-state.contract.ts`, `valuation-panel.contract.ts` | —                                                                                                                           | **Alheias à feature**                                                                        |

### O que a validação arquitetural mudou no desenho, antes de codar

1. **O ramo `source: 'period'` morre, não é adaptado.** `freeze-trip-financial-result.use-case.ts:91`
   zera toda parcela `period`, e o CHECK do banco exige `amount = 0` nesse caso
   (`20260827124518_trip_financial_result/migration.sql:40`). Uma diária real congelaria como
   R$ 0,00 e o INSERT nem passaria. `'period'` continua no enum e em `VALUATION_SOURCES` porque
   resultados **já congelados** o carregam.
2. **`SALARIED_CREW_MEMBER` deixa de ser produzido**, mas continua no vocabulário e nos locales.
   Se continuasse sendo emitido, `trip-valuation.policy.ts:288-290` marcaria `hasGaps: true` numa
   conta agora completa. A informação "há motorista da casa" passa a viver em
   `basis.crew[].paymentModel`. Apagar do dicionário faria viagem antiga imprimir a string crua.
3. **A duração crua vai até a política, não os dias prontos.** Existem **três** consumidores, não
   dois: a sugestão de roteiro (`read-suggestion-valuation.use-case.ts` +
   `suggestion-valuation.adapter.ts:31`) sobrescreve a distância do solver. Se a query entregar
   `days` calculado, a proposta herda dias que não conhecem a rota proposta e a margem diverge da
   viagem criada a partir dela. O contexto leva `estimatedDurationSeconds` **e**
   `dailyAllowanceDays`; quem converte é `suggestAllowanceDays` (T2).
4. **A política recebe `driverAmount` cru + um `companyDailyAmount` por contexto.** O `plan.md:23`
   sugeria a query já resolver `dailyAmount` + `rateOrigin`, o que jogaria regra de negócio para o
   SQL — o arranjo que a spec 086 rejeitou e que `crew-zone-wiring.contract.ts` existe para impedir.
   O valor da empresa é **um por contexto**, não por linha: replicá-lo por motorista tornaria
   representável um estado impossível.
5. **`detail` da parcela passa a ser sempre `null`.** `trip-valuation.policy.ts:198-205` diz que a
   API nunca compõe frase de exibição — regra que `buildRateDetail` viola hoje. A frase é do FE (T11).
6. **Contrato para a T6:** `note` **é** o campo do código de lacuna
   (`freeze:94` grava `parcel.gap ?? ''`; `TripFinancialPanel.component.tsx:181-183` renderiza
   `t('gap.' + note)`). A T6 só escreve a frase de origem quando `gap === null`.
7. **Aritmética:** `diária × dias` com dias inteiro é multiplicação **exata** em `bigint` escalado —
   sem `divideHalfUp`, sem divisão. Somar os **bigints**, não os textos reformatados. Normalizar
   `dailyAmount` com `formatScaledDecimal` antes de pôr na base, senão `'250.00'` do cadastro e
   `'200.0000'` da constante sairiam com escalas diferentes na mesma lista. Invariante testável:
   `Σ basis.crew[].subtotal === amount`, exata.
8. **`exactOptionalPropertyTypes`:** `days`, `daysOrigin` e `crew` são obrigatórios na base nova,
   com `null` explícito em `driverName`. Nunca montar a base por spread condicional.

### Achados de brinde, registrados para não parecerem efeito da 143

- `DRIVER_ZONE_NOT_COVERED` e `DRIVER_ROUTE_AMBIGUOUS` **já são órfãos hoje**: declaração e locales,
  nenhum produtor em `src/`.
- `TRIP_COST_KINDS` (`trip-valuation.policy.ts:167-176`) **não tem `'manual'`**, embora o CHECK do
  banco tenha. Não é da T3 — é pré-requisito da **T7**, e o erro só apareceria em runtime.
- `company_energy_settings` não está em nenhuma lista de `readBusinessTables` (achado da T1).

### Efeitos visíveis que valem aviso antes do deploy

- **Toda viagem aberta existente passa a exibir "estimado"** na linha do motorista: nenhuma tem
  `trips.daily_allowance_days` preenchido. É o que a D4 pede, mas muda todas de uma vez.
- **`hasGaps` encolhe**, e com ele `isComplete` para congelamentos novos — mexe em telas e
  relatórios que filtram por isso. É o aceite 5.
- **Entre a T3 e a T11 a linha de derivação do motorista some do painel**: o FE não compila contra a
  API, revalida por zod (`tripValuationResponse.validation.ts`) e devolverá base vazia. Aceitável num
  worktree que fecha inteiro; **não** se a T3 for para staging sozinha.

### Decisões do usuário registradas nesta task

- **Suítes sem objeto são reescritas no lugar**, não apagadas — o arquivo muda de assunto.
- **`trip-driver-zone.policy.ts` e a política de empate ficam no repo**, sem consumidor de produção,
  com a **ADR-0066** registrando o porquê.
- A ADR é a **0066**, não a 0063 que o `tasks.md` nomeava: `docs/adr/` já tem dois `0062`, três
  `0063`, e o maior é `0065`.
