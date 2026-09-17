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

## T3 — A parcela do motorista é a diária

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`
· **Commit:** `bbe80757` — _feat(trip): a diária paga o motorista, e a tabela de região sai da conta_

### Entregas

- `src/trips/domain/trip-driver-cost.policy.ts` **reescrito**: `buildTripDriverCost({ companyDailyAmount,
crew, days, daysOrigin })` devolve `Σ (diária × dias)` com uma linha por condutor em `basis.crew`.
  `TripCrewMember` fica com quatro campos — `driverAmount` (cru), `driverId`, `driverName`,
  `paymentModel`. Sumiram `DriverTieBasis`, `hasDetail`, `buildTieBasis`, `tieDriverNameDetail`,
  `buildRateDetail`, `DETAIL_SEPARATOR`, o ramo `period`, o ramo `withoutAmount` e o `reduce` sobre
  `routeAmount`. Sobrevivem `ZERO`, `ERROR_CODE_PREFIX` e `parseScaledDecimal`.
- `src/trips/domain/trip-valuation.policy.ts`: nova lacuna `noTripDriver: 'NO_TRIP_DRIVER'`, novo tipo
  exportado `TripDriverCostCrewLine` e a variante `of: 'driver'` da base trocada por
  `{ crew, days, daysOrigin, of }`.
- `src/trips/domain/daily-allowance.policy.ts`: const-object `DAILY_ALLOWANCE_DAYS_ORIGIN`
  (`informed`/`estimated`) + o tipo, no molde do `DAILY_ALLOWANCE_RATE_ORIGIN` da T2.
- `test/trip-valuation/daily-allowance.contract.ts` estendido **antes** da implementação com os aceites
  1, 3, 4 e 5, a tripulação vazia, o dia zero e a invariante exata.
- Locales `NO_TRIP_DRIVER` nos quatro dicionários do frontend + a asserção correspondente em
  `test/trip-financials/valuation-gap-labels.contract.ts` — sem eles o gate do frontend reprova.

### Ordem: teste primeiro

Os oito casos novos de `daily-allowance.contract.ts` foram escritos e commitados de cabeça contra a
spec antes de `trip-driver-cost.policy.ts` mudar uma linha. Os aceites entraram como o teste os lê:

- **aceite 1** — agregado sem valor próprio, 50 h, empresa não configurada → `'600.0000'`, `days: 3`,
  `daysOrigin: 'estimated'`, `rateOrigin: 'default'`, `source: 'estimated'`;
- **aceite 3** — motorista R$ 250 vence a empresa R$ 180 (`rateOrigin: 'driver'`); sem valor próprio,
  a mesma empresa paga R$ 180 (`rateOrigin: 'company'`);
- **aceite 4** — um agregado (R$ 250) e um assalariado sem valor, 2 dias → `'900.0000'`, duas linhas em
  `basis.crew`, `gap: null`;
- **aceite 5** — rota sem célula na tabela de região não abre lacuna: `gap: null`, valor = padrão;
- **invariante** — empresa `'133.3300'`, motoristas `'77.7700'` / sem valor / `'0.0100'`, 7 dias →
  `Σ crew[].subtotal === amount` comparado em `bigint` via `parseScaledDecimal`, e o total é
  `'1477.7700'`. Sem tolerância: a soma é de `bigint`, não de texto reformatado.

### Decisões

- **`source` inverteu de sentido, e o arquivo diz por quê.** `measured` quando `daysOrigin` é
  `informed`, `estimated` quando é `estimated`. O valor da diária **sempre** existe (motorista, empresa
  ou padrão), então o que resta incerto não é mais o preço: são os dias.
- **`days < 1` lança `Error('TRIP_DRIVER_COST_INVALID_DAYS')`**, não `ApiError` — estado impossível
  merece 500, não 4xx. Segue o precedente de `trip-document-review.policy.ts:72`. `MINIMUM_ALLOWANCE_DAYS`
  é **importado** de `daily-allowance.constant.ts`; a primeira versão redeclarava a constante e violava
  o §16 do code-standart.
- **`detail` é sempre `null`.** A frase de exibição é do frontend (T11);
  `trip-valuation.policy.ts:198-205` já proibia a API de compô-la.
- **`ADVISORY_GAPS` não foi tocada**, e os seis códigos que deixaram de ser produzidos
  (`SALARIED_CREW_MEMBER`, `NO_DRIVER_RATE`, `CITY_WITHOUT_REGION`, `DRIVER_ZONE_PRICED_FROM_TABLE`,
  `DRIVER_RATE_MISSING_FOR_CLASS`, `DRIVER_ROUTE_TIE_HIGHEST_RATE`) continuam no vocabulário e nos
  locales: resultado congelado antes desta mudança ainda os carrega.
- **O aviso da nova lacuna ficou num parágrafo ⚠️ acima do `export const VALUATION_GAPS`, com crases e
  sem maiúscula entre aspas simples.** `valuation-gap-labels.contract.ts` recorta o fonte a partir de
  `indexOf('VALUATION_GAPS')` e colhe `/'([A-Z_]+)'/g` — um comentário descuidado inventaria códigos
  fantasma e exigiria rótulo para eles.
- **`NO_TRIP_DRIVER` nasceu** em vez de reaproveitar `NO_DRIVER_RATE`: a causa mudou, e reaproveitar o
  código faria a tela dizer "rota do agregado sem valor cadastrado" para uma viagem sem condutor.

### Dívida de uma task, deliberada

`trip-valuation.query.ts` **continua resolvendo a zona** (`readZoneCatalog`, `readDriverCoverage`,
`resolveTripDriverZone`) e o resultado **não entra mais na tripulação** — `resolveCrew` devolve
`driverAmount: null` para todo condutor, com comentário ⚠️ no lugar. Foi o mínimo para compilar, como
o prompt exigiu: manter a resolução é o que deixa `crew-zone-wiring.contract.ts` verde nesta task (a
reescrita dela é da T4, como este documento já previa). O custo é **duas leituras mortas de banco por
valoração** entre a T3 e a T4, e nenhuma viagem paga diária de motorista com valor próprio até a T4
ligar a fonte. `readRatesByRegion` segue como método privado morto de propósito — o mesmo contrato o
afirma por texto.

### Contrato que a T3 impõe à T4

1. `crew` chega **sem nenhum campo de zona** (`regionCode`, `regionCity`, `vehicleClass`, `routeAmount`,
   `routeGap`, `tiedZones`, `cityToRegister` acabaram) e com `driverAmount` **cru**, lido de
   `fleet_drivers.daily_allowance_amount`. Nada de resolver valor no SQL.
2. `companyDailyAmount` é **um por contexto**, nunca por linha da tripulação — replicá-lo por motorista
   tornaria representável um estado impossível.
3. O contexto leva `estimatedDurationSeconds` **cru** e `dailyAllowanceDays`; quem converte e decide
   entre `informed` e `estimated` é a política (`suggestAllowanceDays`), não a consulta. São **três**
   consumidores: a viagem, a sugestão de roteiro e o congelamento.
4. O terceiro consumidor mora em **`src/routing/`**, não em `src/trips/` como o briefing dizia:
   `src/routing/application/read-suggestion-valuation.use-case.ts` e
   `src/routing/infrastructure/suggestion-valuation.adapter.ts`. Ambos reusam `TripValuationContext` e
   hoje compilam porque `crew` é opcional — a T4 é que os liga.
5. `test/trip-valuation/crew-zone-wiring.contract.ts` afirma **por texto de fonte** (`:39-53`, `:94-96`)
   que a consulta chama `resolveTripDriverZone` e que os dois leitores delegam a `this.resolveCrew(`.
   Ele está verde hoje e **quebra na T4** — a reescrita é dela.

### Achado registrado, não corrigido

`src/trips/domain/trip-driver-zone.policy.ts:59` ainda diz em comentário que "a consulta precifica
`tiedZones` e `chooseTiedZone` fica com o maior valor" — **a consulta não faz mais nada disso**. Não
foi corrigido aqui porque o arquivo está fora do escopo da T3 e é objeto da ADR-0066 na T14; fica
anotado para não parecer descuido.

### Suítes reescritas no lugar, nenhuma apagada

| Suíte                                                   | Passou a dizer                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `trip-valuation/driver-rate-gap.contract.ts`            | A lacuna do agregado acabou junto com a tabela de região; todo condutor é pago                      |
| `trip-valuation/driver-zone-table-price.contract.ts`    | A zona não precifica mais nada; a cobertura não muda valor nem lacuna (`ADVISORY_GAPS` intacta)     |
| `trip-valuation/driver-route-tie.contract.ts`           | O empate não chega mais à parcela; o aviso continua sendo aviso para congelados                     |
| `trip-valuation/driver-route-vote.contract.ts`          | A votação decide o roteiro, não o preço; as faixas empatadas param na política de zona              |
| `trip-valuation/read-valuation.contract.ts`             | A leitura paga a diária; sem dias informados a parcela nasce `estimated`                            |
| `trip-financial/driver-and-tax.contract.ts`             | Agregado e assalariado na mesma conta; mantido "viagem sem condutor é desconhecida, nunca gratuita" |
| `trip-financials/valuation-gap-labels.contract.ts` (FE) | Passa a exigir `NO_TRIP_DRIVER` no vocabulário e rótulo nos quatro dicionários                      |

Os testes da API caem de 6098 (T2) para 6092: as suítes reescritas afirmam menos casos porque o
subsistema de diagnóstico da tabela de região deixou de existir. `driver-route-tie-detail.contract.ts`
do frontend **continua verde** — ele exercita o serviço de detalhe do FE, que só muda na T11.

### Gates

| Gate               | Comando                                         | Resultado                                                                     |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)              | ✅ limpo                                                                      |
| Testes da API      | `bun run --cwd apps/api-transportada test`      | ✅ **6092 pass · 23 skip · 0 fail** · 21463 expect() · 177 arquivos · 10,99 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test` | ✅ **4073 pass · 0 fail** · 35825 expect() · 29 arquivos · 4,24 s             |
| Lint               | `bun run lint`                                  | ✅ limpo                                                                      |
| Formatação         | `bun run format:check`                          | ✅ limpo (após `prettier --write` em três arquivos)                           |

## T4

Escopo: `trip-valuation.query.ts`, `read-trip-valuation.use-case.ts` e, como o contrato da T3 exigia,
`src/routing/application/read-suggestion-valuation.use-case.ts` (o terceiro consumidor).

### O que saiu da consulta

`readZoneCatalog`, `readDriverCoverage`, `readRatesByRegion`, `readZoneStops`, `readTripStopSequences`,
`resolveCrew` e `readVehicleFreightClass` — a resolução de zona, cobertura, classe do veículo e
sequência de parada saíram inteiras. Junto saíram os imports que só existiam para isso:
`fleetDriverRegions`, `freightRegionCities`, `freightRegionDriverRates`, `freightRegions`,
`resolveVehicleFreightClass`, `type FreightVehicleClass`, `type DriverPaymentModel`,
`resolveTripDriverZone`, `type DriverZoneCoverage`, `type RegionCityEntry`, `type TripZoneStop`.

### O que entrou

- **`readCompanyDailyAllowanceAmount(companyId)`** — uma leitura de `company_driver_allowance_settings`,
  chamada **exatamente uma vez por contexto** (uma em `readContext`, uma em `readPreviewContext`,
  nunca dentro de `readCrew`/`readPreviewCrew`). Ausência de linha vira `null`; a política decide o
  padrão do sistema.
- **`readAllowanceDays(input)`** — nome exigido literalmente pelo `tasks.md`, mas devolve os **segundos
  crus** somados das paradas (mesmo padrão de `readPlannedDistance`), nunca dias prontos. A conversão e
  a escolha `informed`/`estimated` continuam só em `suggestAllowanceDays` — comentário no método deixa
  o descompasso de nome explícito para quem ler depois.
- **`readCrew`/`readPreviewCrew` viraram um único JOIN** (`trip_drivers ⋈ fleet_drivers` e
  `fleet_drivers` filtrado por `id in (...)`, respectivamente), devolvendo `driverAmount` **cru** de
  `fleet_drivers.daily_allowance_amount` — sem campo de zona, sem `Promise.all` de catálogo/cobertura.

### Idas ao banco por valoração — antes/depois

| Caminho                       | Antes                                                                                                                  | Depois                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Prévia (`readPreviewContext`) | ~5: drivers + `readZoneStops`→`listStopAddresses` + `readZoneCatalog` + `readDriverCoverage` (paralelas)               | 2: `readPreviewCrew` + `readCompanyDailyAllowanceAmount`                |
| Viagem criada (`readContext`) | ~6: drivers + `readTripStopSequences` + `readZoneStops`→`listStopAddresses` + `readZoneCatalog` + `readDriverCoverage` | 3: `readCrew` + `readCompanyDailyAllowanceAmount` + `readAllowanceDays` |

Confere com o briefing: "a prévia hoje faz quatro idas ao banco; sobram duas" — a T4 fecha em duas
leituras próprias da tripulação/empresa na prévia (mais o resto do contexto, que já existia e não
mudou: combustível, documentos, ICMS, taxas federais).

### Terceiro consumidor ligado

`src/routing/application/read-suggestion-valuation.use-case.ts` já tinha `road.durationSeconds` em
mãos (o mesmo campo que alimenta `vehicles.push({ durationSeconds: road.durationSeconds, ... })`
algumas linhas abaixo). Passou a entrar em `estimatedDurationSeconds` no override de contexto que vai
para `repository.resolveValuation`, ao lado de `distanceMeters` — a proposta do solver nunca herda a
duração de uma viagem já criada.

### Testes reescritos, nenhum apagado

- **`crew-zone-wiring.contract.ts` foi reescrito por inteiro** (não apagado) — era o contrato que o
  briefing apontava como certo de quebrar: afirmava por texto de fonte que a consulta chamava
  `resolveTripDriverZone` e que os dois leitores delegavam a `this.resolveCrew(`. A versão nova afirma
  o oposto: ausência de `resolveTripDriverZone`/`resolveCrew`, os dois métodos novos selecionando
  `fleetDrivers.dailyAllowanceAmount` sem loop por motorista, `readCompanyDailyAllowanceAmount`
  aparecendo **exatamente duas vezes** no arquivo (uma por contexto) e nunca dentro do corpo da
  tripulação, e tenant-safety (`companyId`) nos quatro métodos novos/reescritos.
- **`driver-zone-table-price.contract.ts`** — o teste `'the crew query no longer raises the reminder'`
  recortava o fonte a partir de `source.indexOf('private async resolveCrew')`; com o método apagado,
  `indexOf` devolvia `-1` e a asserção passava por acidente (verde pelo motivo errado). Reescrito para
  afirmar sobre o arquivo inteiro: `resolveCrew` não existe mais, e nem `VALUATION_GAPS.driverZonePricedFromTable`
  nem `zone.isCoveredByDriver` aparecem em lugar nenhum.
- Nenhuma outra suíte precisou de caso novo: `trip-valuation/read-valuation.contract.ts` e os
  integration tests (`trip-financial-end-to-end.integration.ts`, `trip-fiscal-readiness.integration.ts`)
  já exercitam `readTripValuation`/prévia contra o Postgres real e continuaram verdes.

### Contrato que a T4 impõe à T5

1. `dailyAllowanceDays` já chega cru em `TripValuationContext` (de `trips.daily_allowance_days`), mas
   **nada hoje escreve essa coluna** — `createTripSchema`/`previewTripValuationSchema` ainda não têm o
   campo. É o que a T5 abre.
2. `estimatedDurationSeconds` está disponível cru nos três consumidores (viagem, prévia, sugestão);
   qualquer novo consumidor de `TripValuationContext` **não pode** receber dias prontos — só duração e
   dias informados, com a conversão sempre em `suggestAllowanceDays`.
3. `crew` agora sempre carrega `driverAmount` real do cadastro (nunca mais `null` por resolução de
   zona morta) — a T5, ao validar `dailyAllowanceDays: 0 → 400`, pode assumir que a diária do motorista
   já é a fonte de verdade, sem dívida herdada de leitura.

### Gates

| Gate               | Comando                                                | Resultado                                                                   |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo                                                                    |
| Testes da API      | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6090 pass · 23 skip · 0 fail** · 21456 expect() · 177 arquivos · ~11 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`        | ✅ **4073 pass · 0 fail** · 35825 expect() · 29 arquivos                    |
| Lint               | `bun run lint`                                         | ✅ limpo                                                                    |
| Formatação         | `bun run format:check`                                 | ✅ limpo (após `prettier --write` no use-case, que quebrou uma linha)       |

## T5

Escopo: `trip-request.schema.ts` (`createTripSchema`, `previewTripValuationSchema`) e
`trip.use-case.ts` (`create()`), que a T5 herda como contrato aberto da T4: "nada hoje escreve
`trips.daily_allowance_days`". Fechado ponta a ponta: schema → use case → porta → repositório
Drizzle, e o mesmo campo espelhado na prévia (`read-trip-valuation.use-case.ts`, `trip.routes.ts`)
porque "a prévia vale o mesmo tanto que a viagem criada" é regra do próprio `spec.md`.

### Regra de negócio

`dailyAllowanceDays` é **opcional**. Ausente ≠ zero: ausente é "sugere pela duração estimada"
(`daysOrigin: 'estimated'`), que é decisão exclusiva de `suggestAllowanceDays` (T2) — nunca do
schema, nunca do SQL. Informado é `>= 1` (`daysOrigin: 'informed'`). Por isso nenhum `.default()`
foi usado aqui: o campo tem de chegar como `undefined` de verdade e atravessar assim até a política,
sob `exactOptionalPropertyTypes`.

### Vermelho antes da implementação

Duas capturas, de propósito — a primeira para provar que o vermelho é genuíno e a segunda para
isolar a regra `.min(1)` especificamente da rejeição trivial de `.strict()` (o mesmo cuidado que a
T4 registrou como dívida: "um teste que nunca falhou não provou nada").

**1) Vermelho inicial — schema sem o campo, produção final revertida para `HEAD`, testes já escritos:**

```
$ bun test test/trip-http.contract.test.ts test/trip-application.contract.test.ts

test/trip-application.contract.test.ts:
error: expect(received).toMatchObject(expected)
  {
-   "dailyAllowanceDays": 2,
+   "companyId": "11111111-1111-4111-8111-111111111111",
+   "crew": [ ... ],
+   "vehicleId": "44444444-4444-4444-8444-444444444441",
  }
(fail) trip use case contract > forwards the informed daily allowance days to the repository,
and omits it when absent

test/trip-http.contract.test.ts:
error: expect(received).toBe(expected)
Expected: 201
Received: 400
(fail) trip create http contract > forwards the informed daily allowance days

 133 pass
 2 fail
 330 expect() calls
```

Nesta mesma rodada, `'refuses a zero or negative daily allowance days'` **já passava** — mas pelo
motivo errado: `.strict()` rejeita a chave desconhecida `dailyAllowanceDays` para qualquer valor,
inclusive `2`. Um vermelho que nunca existiu para essa asserção específica não prova nada; daí a
segunda captura.

**2) Vermelho isolado — schema com `z.number().int().optional()`, sem `.min(1)`, produção completa aplicada:**

```
$ bun test test/trip-http.contract.test.ts

test/trip-http.contract.test.ts:
124 |     expect(zeroResponse.status).toBe(400)
                                      ^
error: expect(received).toBe(expected)

Expected: 400
Received: 201

(fail) trip create http contract > refuses a zero or negative daily allowance days

 61 pass
 1 fail
 176 expect() calls
```

Com `.min(1)` de volta, as três suítes (`trip-http`, `trip-application`, `trip-valuation`) fecham em
272 pass / 0 fail — a mesma asserção que falhava por 201 agora fecha em 400 pela regra de negócio,
não pela forma do corpo.

### O que entrou

- **`createTripSchema`/`previewTripValuationSchema`**: `dailyAllowanceDays: z.number().int().min(1).optional()`
  nos dois — ambos continuam `.strict()`. Comentário em cada um deixa explícito por que não há
  `.default()`.
- **`CreateTripInput.dailyAllowanceDays?: number | undefined`** (`trip.use-case.ts`) e
  **`PreviewTripValuationInput.dailyAllowanceDays?: number | undefined`** (`read-trip-valuation.use-case.ts`)
  — `| undefined` explícito porque é exatamente o tipo que o zod infere sob
  `exactOptionalPropertyTypes` quando o campo atravessa direto por parâmetro genérico (fronteira de
  leitura). O mesmo padrão em `trip.routes.ts`: o genérico do `defineRoute` da prévia e o tipo de
  `Dependencies.previewValuation.execute`.
- **`CreateTripRecord.dailyAllowanceDays?: number`** (`trip.port.ts`, sem `| undefined`) — fronteira de
  escrita: o objeto é reconstruído por composição (`repository.create({...})`), e ali o padrão
  existente de spread condicional (`...(dailyAllowanceDays === undefined ? {} : { dailyAllowanceDays })`)
  garante que a chave nunca é escrita como `undefined` literal — nem em `trip.use-case.ts`, nem no
  `.values()` do `drizzle-trip.repository.ts`, nem no override de contexto de
  `previewTripValuation()`. "Nada de spread condicional" (T5 brief) vale para a definição do schema
  zod, não para essas camadas de escrita mais profundas — o idioma já usado no resto da base
  continua correto ali.
- **`preview-daily-allowance.contract.ts`** (novo): dois testes de `previewTripValuation()` — com
  `dailyAllowanceDays: 2` a parcela do motorista fecha em `400.0000`/`source: 'measured'`; sem o
  campo, `source: 'estimated'`. Confirma que `buildDriverParcel()` (T2/T4), que converte `daysOrigin`
  em `source`, não precisou de nenhuma mudança — só precisava do valor chegando até ela.

### Confirmado sem necessidade de mudança

- `trip.schema.ts` é wrapper fino sobre `trip-request.schema.ts` — reexporta schema e tipo inferido
  sem reconstrução; nenhuma edição ali.
- A rota de criação usa `defineRoute<Omit<CreateTripInput, 'context'>>` — herdou o campo automaticamente
  ao editar só `CreateTripInput`.
- `TripValuationContext.dailyAllowanceDays` e `buildDriverParcel()` já vinham corretos da T4; T5 só
  precisava fazer o valor informado alcançá-los.

### Gates

| Gate                     | Comando                                                | Resultado                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo                                                                                                                                                                                                                                        |
| Testes da API            | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6095 pass · 23 skip · 0 fail** · 21466 expect() · 177 arquivos · ~11 s                                                                                                                                                                     |
| Testes da API (sem flag) | `bun test --timeout 120000`                            | ✅ idêntico: 6095 pass · 23 skip · 0 fail — sem Docker/Postgres local nesta sessão (`docker compose ps` vazio), os 23 skips são os mesmos com e sem `.env.test`; nenhuma integração nova foi de fato exercitada contra banco real por esta task |
| Testes do frontend       | `bun run --cwd apps/frontend-transportada test`        | ✅ **4073 pass · 0 fail** · 35825 expect() · 29 arquivos                                                                                                                                                                                        |
| Lint                     | `bun run lint`                                         | ✅ limpo                                                                                                                                                                                                                                        |
| Formatação               | `bun run format:check`                                 | ✅ limpo                                                                                                                                                                                                                                        |

### Contrato que a T5 impõe à T6

1. `dailyAllowanceDays` já atravessa ponta a ponta: HTTP → `CreateTripInput`/`PreviewTripValuationInput`
   → `CreateTripRecord`/override de contexto → `trips.daily_allowance_days`/`TripValuationContext`.
   Qualquer novo consumidor deste campo deve seguir o mesmo par de fronteiras — `| undefined` explícito
   onde o valor chega direto do zod, `key?: T` + spread condicional onde é reconstruído por composição.
2. O CHECK `trips_daily_allowance_days_check` (T1) continua sendo a **segunda** barreira — o zod
   (`.min(1)`) é a primeira, e nenhuma linha inválida chega perto do banco com os testes atuais.
3. **Não existe fixture HTTP para a rota de prévia** (`POST .../valuation-preview`) — a cobertura de
   `dailyAllowanceDays` na prévia ficou no nível de função (`previewTripValuation()`, unitário), não
   HTTP. Se uma task futura precisar de um teste HTTP `dailyAllowanceDays: 0 → 400` para a prévia
   especificamente, a fixture de HTTP da prévia ainda precisa ser montada — hoje só a criação
   (`create.contract.ts`) tem esse nível de teste.

## T6 — Congelamento grava a origem

### Alvo

`freeze-trip-financial-result.use-case.ts:96` (`toParcel`) gravava `note: parcel.gap ?? ''` — sem
lacuna, `note` saía sempre vazio, mesmo para a parcela do motorista, cujo `basis` (T3) já carrega
tudo que o painel precisa para mostrar de onde veio o valor (`crew[].rateOrigin`, `dailyAmount`,
`days`). D5 exige que a viagem **fechada** grave a frase, não o vazio — ela não pode depender do
cadastro do motorista, que muda depois (D3).

### Vermelho real (não vazio)

Passo 1: as três novas asserções foram escritas primeiro em
`test/trip-financial/freeze.contract.ts`. Passo 2: para garantir que o vermelho fosse pelo motivo
certo (e não por erro de fixture), a implementação em `freeze-trip-financial-result.use-case.ts` foi
isolada via `git stash push -- <arquivo>` antes de rodar — a mesma técnica que a T5 registrou
("um teste que nunca falhou não prova nada"):

```
$ bun test ./test/trip-financial.contract.test.ts

error: expect(received).toContainEqual(expected)

Expected to contain: ObjectContaining {
  kind: "driver",
  note: "R$ 200,00 × 3 dias · valor geral",
}
Received: [
  { amount: "600.0000", kind: "driver", nature: "cost", note: "", source: "estimated" }
]
(fail) o congelamento do resultado (spec 061 T005) > parcela do motorista sem lacuna grava a frase de origem, não o código

error: expect(received).toContainEqual(expected)

Expected to contain: ObjectContaining {
  kind: "driver",
  note: "R$ 250,00 × 2 dias · valor do motorista; R$ 200,00 × 2 dias · valor padrão",
}
Received: [
  { amount: "900.0000", kind: "driver", nature: "cost", note: "", source: "measured" }
]
(fail) o congelamento do resultado (spec 061 T005) > mais de um condutor: a frase soma uma linha por condutor

 39 pass
 2 fail
 86 expect() calls
Ran 41 tests across 1 file. [178.00ms]
```

Não é vazio nem ambíguo: as duas falhas apontam exatamente para `note: ""` onde a asserção esperava
a frase composta — o formato exato que a implementação ainda não produzia, nada de erro de
compilação ou de fixture mal montada. O terceiro teste novo (lacuna → mantém o código) **já passava**
com o código antigo (`parcel.gap ?? ''` também devolve o código quando há lacuna) — isso não é uma
falha do processo, é a confirmação, por teste, de que o comportamento de hoje já protege a lacuna (ver
"Resposta à pergunta do orientador" abaixo). Depois do vermelho, `git stash pop` devolveu a
implementação, e a suíte fechou verde (ver Gates).

### O que entrou

- **`composeParcelNote`** (`freeze-trip-financial-result.use-case.ts`): a lacuna vence sempre —
  `parcel.gap !== null` retorna o código antes de tocar em `basis`. Sem lacuna, só a parcela do
  motorista (`basis.of === 'driver'`) ganha frase; qualquer outro `kind`/`basis` continua com `note`
  vazio, exatamente como hoje.
- **`composeDriverAllowanceNote`** + **`composeAllowanceLine`** (`ComposeAllowanceLineParams`,
  code-standart §10): uma linha por integrante da tripulação (D2), unidas por
  `ALLOWANCE_NOTE_SEPARATOR = '; '`; cada linha é `R$ <valor> × <dias> dia(s) · <origem>`.
- **`DAILY_ALLOWANCE_RATE_ORIGIN_LABEL`**: mapa `driver → "valor do motorista"` /
  `company → "valor geral"` / `default → "valor padrão"` — três rótulos, não dois. `spec.md` (aceite 4) só exemplifica com "valor geral", mas `daily-allowance.policy.ts` e `plan.md:39` distinguem os
  três casos; resolvido a favor da distinção de três, e o teste de frase única foi montado com
  `rateOrigin: 'company'` (não `'default'`) para reproduzir literalmente a frase do briefing
  ("R$ 200,00 × 3 dias · valor geral").
- **`formatCurrencyText`**: `formatFiscalMoney` (já usado em `invoice-layout.policy.ts`, via
  `decimal.service.ts`) faz o arredondamento half-up de 4 para 2 casas; o resto (separador de milhar
  `.`, decimal `,`) foi escrito aqui porque o único helper existente (`formatDecimalText` em
  `invoice-layout.policy.ts`) é privado daquele arquivo e assume entrada já em 2 casas.
- Três testes novos em `freeze.contract.ts`: sem lacuna/uma origem (frase única), com lacuna
  (`NO_TRIP_DRIVER`, código preservado), múltiplos condutores (frase composta, uma linha por
  condutor, D2).

### Por que isso não fere a regra da T3 (`detail` é sempre `null`)

A T3 fixou que a API **nunca** compõe texto de exibição em `detail` — quem calcula ao vivo (viagem
aberta) devolve dado cru, e é o frontend quem escreve a frase, porque o cadastro (tabela de praça,
motorista, empresa) ainda existe e pode ser consultado de novo a qualquer momento. `note`, no
congelamento, é o oposto: a viagem **já fechou**, e o cadastro que produziu aquele valor pode mudar
depois (motorista troca de tabela, empresa reconfigura o valor padrão) sem que o `trip_financial_parcels`
já gravado deva mudar junto (ADR-0049 §5, "viagem fechada congela"). Se a API não gravar a frase agora,
ela nunca mais poderá reconstruí-la — não há como "recalcular" o `rateOrigin` de uma diária que já foi
paga com uma tabela que não existe mais. Persistência histórica exige compor **agora**; exibição ao
vivo exige **não** compor, porque compor cedo demais é decidir por uma leitura que ainda pode mudar.
As duas regras protegem o mesmo risco (texto que mente) em direções opostas.

O banco não ajuda a pegar um erro aqui: `trip_financial_parcels.note` é `text` puro, sem CHECK, sem
enum, sem tamanho mínimo. Uma composição errada (frase trocada, número mal arredondado, origem
invertida) grava normalmente, sem nenhum teste de schema ou de banco reagir — o único lugar onde o
erro aparece é a tela do operador, meses depois, quando ninguém mais tem como conferir contra o
cadastro original. É exatamente por isso que o contrato (frase idêntica à que T11 vai montar no
frontend) precisa ser testado explicitamente aqui, e não pode depender de review visual.

### Resposta à pergunta do orientador: hoje, lacuna sobrescreve a frase?

**Não.** Nem antes nem depois desta task. Antes, `note: parcel.gap ?? ''` nunca compunha frase
nenhuma — não havia o que sobrescrever. Depois, `composeParcelNote` checa `parcel.gap !== null`
**primeiro** e retorna o código imediatamente nesse caso, sem nunca inspecionar `basis` — a frase só
é composta quando `gap === null`. O teste "parcela do motorista com lacuna mantém o código, nunca a
frase" (novo, nesta task) prova isso: com `basis: null, gap: 'NO_TRIP_DRIVER'`, `note` grava
`'NO_TRIP_DRIVER'`, não uma frase vazia nem inventada.

### Aceite 10 (viagem congelada antes desta feature)

Nenhuma migração de dado congelado foi feita ou é necessária. `toParcel` só roda no momento do
congelamento — uma viagem já congelada antes desta task tem sua linha em `trip_financial_parcels` já
gravada com `source: 'period'` e `note` com o código antigo; nada neste código a lê de novo ou a
reescreve. A mudança só afeta congelamentos (ou recongelamentos, via `reason`) que rodarem depois do
deploy desta task.

### Gates

| Gate                        | Comando                                                                                       | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck                   | `bun run typecheck` (raiz, 6 apps)                                                            | ✅ limpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Testes da API               | `bun run --cwd apps/api-transportada test`                                                    | ✅ 6098 pass · 23 skip · 0 fail · 21469 expect() · 177 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Testes da API (`.env.test`) | `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`) | ✅ idêntico — 6098 pass · 23 skip · 0 fail. Os novos testes desta task usam `buildRepository()` (porta falsa), não banco; tentativa extra de rodar `test/integration/trip-financial-end-to-end.integration.ts` contra Postgres real falhou por infraestrutura (`.env.test` aponta para a porta 65432 do stack de e2e dedicado, que não estava de pé nesta sessão — só o Postgres de dev, porta 55432) — não há mudança de schema/migração nesta task, então essa suíte fica fora do escopo de T6 |
| Testes do frontend          | `bun run --cwd apps/frontend-transportada test`                                               | ✅ 4073 pass · 0 fail · 35825 expect() · 29 arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Lint                        | `bun run lint`                                                                                | ✅ limpo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Formatação                  | `bun run format:check`                                                                        | ✅ limpo após `prettier --write` nos dois arquivos alterados                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Contrato que a T6 impõe à T7

1. `composeParcelNote` só reage a `parcel.basis?.of === 'driver'` — qualquer variante nova de
   `TripCostParcelBasis['of']` (ex.: pedágio, custo avulso) é **inerte** para `note` até ser tratada
   explicitamente. T7, ao separar pedágio de custo avulso/manual, deve decidir por si mesma se essas
   parcelas também precisam de frase de origem em `note`, ou se seguem com `note` vazio (ou o código
   da lacuna, se houver uma) como hoje.
2. A ordem de despacho é fixa e não pode inverter: lacuna (`parcel.gap !== null`) sempre vence antes
   de qualquer leitura de `basis`. T7 não deve introduzir um caminho onde uma parcela tenha `gap`
   populado e `note` ainda assim tente compor frase a partir de `basis` — o par
   `gap: null ⟺ basis populado` (T3) continua sendo a invariante que sustenta esse despacho.
3. A frase que a API compõe aqui (`R$ <valor> × <dias> dia(s) · <origem>`, `'; '` entre condutores)
   é o texto exato que T11 precisa reproduzir no frontend a partir do mesmo `basis` cru, para a
   viagem aberta. Não existe função compartilhada — o contrato é o texto idêntico, testado dos dois
   lados, nunca importado de um app para o outro.

## T7 — O pedágio deixa de engolir o avulso

**Isto é correção de defeito vivo, não feature.** `readTollTotal` soma todo `trip_cost_entries` da
viagem sem filtrar `kind` — hoje, em produção, qualquer lançamento `other` (avulso) já registrado
soma, sem querer, na parcela `toll`. A correção separa as duas leituras; não adiciona comportamento
novo, devolve o que já deveria estar isolado.

### Alvo

`trip-valuation.query.ts` (`readTollTotal`) e `trip-valuation.policy.ts` (`TRIP_COST_KINDS`, faltando
`'manual'` — o enum já previa a parcela, mas nenhuma leitura a alimentava).

### Vermelho real (não vazio)

Passo 1: o contrato foi escrito primeiro em `test/trip-financial/cost-entries.contract.ts`, com os
quatro cenários do aceite 6 (só pedágio, só avulso, os dois, nenhum) mais duas asserções de texto de
fonte (idioma de `driver-rate-gap.contract.ts`, já usado nesta base para pegar `WHERE` sem o filtro
certo sem precisar de banco). Passo 2: para garantir que o vermelho fosse pelo motivo certo, os três
arquivos de produção (`trip-valuation.query.ts`, `trip-valuation.policy.ts`,
`read-trip-valuation.use-case.ts`) foram isolados via `git stash push -- <arquivos>` antes de rodar —
mesma técnica que a T6 registrou:

```
$ bun test ./test/trip-financial.contract.test.ts

error: expect(received).toMatchObject(expected)

Matcher error: received value must be a non-null object

      at <anonymous> (.../test/trip-financial/cost-entries.contract.ts:50:34)
(fail) pedágio e avulso não se somam mais na mesma parcela (spec 143 D6) > só pedágio lançado: a parcela toll recebe o valor e a manual fica sem lançamento [2.16ms]

error: expect(received).toMatchObject(expected)

Matcher error: received value must be a non-null object

      at <anonymous> (.../test/trip-financial/cost-entries.contract.ts:61:34)
(fail) pedágio e avulso não se somam mais na mesma parcela (spec 143 D6) > só avulso lançado: a parcela manual recebe o valor e o pedágio não é inflado por ele [0.13ms]

error: expect(received).toMatchObject(expected)

Matcher error: received value must be a non-null object

      at <anonymous> (.../test/trip-financial/cost-entries.contract.ts:78:34)
(fail) pedágio e avulso não se somam mais na mesma parcela (spec 143 D6) > os dois lançados na mesma viagem: cada parcela guarda só o próprio valor [0.14ms]

error: expect(received).toMatchObject(expected)

Matcher error: received value must be a non-null object

      at <anonymous> (.../test/trip-financial/cost-entries.contract.ts:91:34)
(fail) pedágio e avulso não se somam mais na mesma parcela (spec 143 D6) > nenhum dos dois lançado: as duas parcelas ficam sem lançamento [0.10ms]

error: expect(received).toInclude(expected)

Expected to include: "eq(tripCostEntries.kind, 'toll')"
Received: "/**\n * Copyright (c) 2026 Ada Technology. MIT License.\n */\n..." (o arquivo original, sem filtro de kind)
(fail) a consulta separa pedágio de avulso na fonte (spec 143 D6) > readTollTotal filtra kind = toll

error: expect(received).toInclude(expected)

Expected to include: "readManualCostTotal"
Received: "..." (o método não existia)
(fail) a consulta separa pedágio de avulso na fonte (spec 143 D6) > readManualCostTotal existe e filtra kind = other

 41 pass
 6 fail
 97 expect() calls
Ran 47 tests across 1 file. [188.00ms]
```

Não é vazio nem ambíguo: as quatro falhas de parcela apontam para `byKind.get('manual')` retornando
`undefined` — porque `buildCostParcels`, sem a mudança, nunca produz uma parcela `manual` — e as duas
falhas de texto de fonte apontam exatamente para a ausência do filtro `kind = 'toll'` e do método
`readManualCostTotal` no arquivo real, não para erro de compilação ou de fixture. Depois do vermelho,
`git stash pop` devolveu a implementação, e a suíte fechou verde (ver Gates).

### O que entrou

- **`readTollTotal`** (`trip-valuation.query.ts`): ganhou `eq(tripCostEntries.kind, 'toll')` no
  `where` — antes somava todo `trip_cost_entries` da viagem, `toll` e `other` juntos.
- **`readManualCostTotal`** (novo, mesmo arquivo): mesma forma de `readTollTotal`, filtrando
  `kind = 'other'`. `null` quando ninguém lançou nada — ausência de lançamento, não gratuidade, a
  mesma semântica que já valia para `readTollTotal`. `readContext` passou a rodar as duas leituras em
  paralelo (`Promise.all`) e a devolver `manualCostTotal` no contexto.
- **`TRIP_COST_KINDS`** (`trip-valuation.policy.ts`): ganhou `'manual'` — faltava no enum de domínio
  mesmo com `TRIP_FINANCIAL_PARCEL_KINDS` (`trip-financial.schema.ts`) já incluindo o valor; sem essa
  entrada, a parcela nova só quebraria em runtime, não em tipo.
- **`buildCostParcels`** (`read-trip-valuation.use-case.ts`): nova chamada a `resolveRecordedParcel`
  para `kind: 'manual'`, reaproveitando `VALUATION_GAPS.notRecorded` (o mesmo código genérico de
  `toll`, cujo rótulo no frontend já é genérico — "ninguém lançou" — e não específico de pedágio).
  `TripValuationContext` ganhou o campo opcional `manualCostTotal`.
- A nomenclatura `kind='other'` (entrada) → `kind='manual'` (parcela) é intencional e não foi
  unificada: o CHECK `trip_cost_entries_kind_check` só aceita `('toll', 'other')`
  (`20260827124518_trip_financial_result/migration.sql:23`), e mexer nele está fora do escopo desta
  task (T8, não T7).
- Quatro testes novos em `cost-entries.contract.ts`: só pedágio, só avulso, os dois na mesma viagem,
  nenhum dos dois — cobrindo o aceite 6 (parte das parcelas) sem depender só da parcela `manual`
  isolada, que passaria mesmo com o defeito presente. Mais duas asserções de texto de fonte que pegam
  o `WHERE` sem filtro sem precisar de banco.

### Gates

| Gate                        | Comando                                                                                       | Resultado                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Typecheck                   | `bun run typecheck` (raiz, 6 apps)                                                            | ✅ limpo                                                                                       |
| Testes da API               | `bun run --cwd apps/api-transportada test`                                                    | ✅ 6104 pass · 23 skip · 0 fail · 21480 expect() · 177 arquivos                                |
| Testes da API (`.env.test`) | `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`) | ✅ idêntico — 6104 pass · 23 skip · 0 fail (os testes novos usam repositório falso, não banco) |
| Testes do frontend          | `bun run --cwd apps/frontend-transportada test`                                               | ✅ 4073 pass · 0 fail · 35825 expect() · 29 arquivos                                           |
| Lint                        | `bun run lint`                                                                                | ✅ limpo                                                                                       |
| Formatação                  | `bun run format:check`                                                                        | ✅ limpo                                                                                       |

### Quantas viagens já lançaram avulso indevidamente somado ao pedágio?

Não dá para saber a partir desta sessão: não há acesso a um banco de produção aqui — só o Postgres
local de desenvolvimento (porta 55432, sem dado de cliente) e o `.env.test` de integração, ambos
vazios de lançamentos reais. Uma contagem confiável exigiria rodar, contra o banco de produção,
`SELECT count(DISTINCT trip_id) FROM trip_cost_entries WHERE kind = 'other'` — toda viagem com pelo
menos um lançamento `other` já teve sua parcela `toll` inflada até este deploy, porque `readTollTotal`
não distinguia `kind`. Essa consulta fica fora do escopo e do acesso desta task.

### Contrato que a T7 impõe à T8

1. `GET /trips/:id/costs` (T8) lista `trip_cost_entries` por `tripId` sem filtrar `kind` — a
   separação `toll`/`other` desta task vive só na leitura agregada de `trip-valuation.query.ts`
   (`readTollTotal`/`readManualCostTotal`), não na tabela em si. T8 pode e deve continuar devolvendo
   os dois tipos de lançamento na mesma listagem; a distinção que importa (pedágio vs. avulso) é de
   **parcela**, não de linha listada.
2. O CHECK `trip_cost_entries_kind_check` continua `('toll', 'other')` — T8 não precisa (e não deve)
   adicionar `'manual'` ao banco. A tradução `other` (lançamento) → `manual` (parcela) é só da camada
   de valorização, e T8 trabalha direto com o `kind` da tabela (`toll`/`other`), nunca com o nome da
   parcela.
3. `TRIP_COST_KINDS` agora inclui `'manual'` — qualquer `switch`/mapa exaustivo sobre
   `TripCostParcel['kind']` que T8 vier a escrever (ex.: rótulo de autor por tipo de lançamento) já
   precisa cobrir esse valor; o typecheck (`exactOptionalPropertyTypes`, `strict`) pega a omissão em
   compilação, não em runtime.

## T8 — `GET /trips/:id/costs` com autor

Aceite 6 (parte de leitura): a rota devolve os lançamentos de custo com `id, kind, amount,
description, createdAt, actor: { userId, name }`. Aceite 7: quem não tem `trip.financials` recebe
403; viagem de outra empresa recebe 404, nunca 403 — 403 confirmaria a existência da viagem para
quem nem deveria saber que ela existe.

### Alvo

- `drizzle-trip-cost.repository.ts` — novo `listByTrip` (join com `identity_user_profiles` pelo
  `actorUserId`) e correção do defeito pré-existente em `record()`.
- `list-trip-costs.use-case.ts` (novo) — função simples `listTripCosts`, no molde de
  `readTripFiscalReadiness`: `null` do repositório vira `TripNotFoundError`.
- `trip.routes.ts` — nova rota `GET` na mesma `TRIP_COSTS_PATH` que já serve o `POST`.
- `main.ts` — injeção do novo use case.

### Vermelho real (não vazio) — dois vermelhos, de motivos diferentes

**Vermelho 1 — a rota ainda não existe** (`bun test ./test/trip-financial.contract.test.ts
./test/trip-http.contract.test.ts`, com os contratos já escritos e nenhuma produção tocada):

```
test/trip-financial.contract.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/trips/application/list-trip-costs.use-case.js' from
'.../test/trip-financial/list-costs.contract.ts'
-------------------------------

test/trip-http.contract.test.ts:
error: expect(received).toBe(expected)
Expected: 200
Received: 404
(fail) os lançamentos de custo da viagem, pela rota (spec 143 aceites 6 e 7) > responde os
lançamentos com o autor para quem tem trip.financials [0.31ms]

error: expect(received).toBe(expected)
Expected: 403
Received: 404
(fail) os lançamentos de custo da viagem, pela rota (spec 143 aceites 6 e 7) > recusa quem só tem
trip.manage — a leitura é permissão diferente da escrita [0.14ms]

 62 pass
 3 fail
 1 error
 181 expect() calls
Ran 65 tests across 2 files. [233.00ms]
```

Este 404 do nível HTTP **não prova isolamento por tenant** — ele só prova que a rota `GET` não está
registrada ainda (o `router` responde 404 para qualquer método sem `defineRoute` casando o
`pathname`). O fixture (`createTripHttpFixture`) nunca chega a exercitar SQL de verdade — ele troca o
repositório por um stub — então o 404 de tenant tem que nascer em outro nível: o use case unitário,
com repositório falso. Foi isso que o Passo 2 fechou.

**Vermelho 2 — o isolamento por tenant, isolado do resto** (depois de escrever o
`drizzle-trip-cost.repository.ts` real com `listByTrip`/`resolveActorName`, mas com
`list-trip-costs.use-case.ts` ainda na versão ingênua `return entries ?? []`, sem o guard de 404):

```
$ bun test ./test/trip-financial/list-costs.contract.ts

51 |   it('viagem de outra empresa não é encontrada — 404, nunca 403', async () => {
52 |     const attempt = list(buildRepository(null))
53 |
54 |     await expect(attempt).rejects.toBeInstanceOf(TripNotFoundError)
                                        ^
error:

Expected promise that rejects
Received promise that resolved: Promise { <resolved> }

      at <anonymous> (.../test/trip-financial/list-costs.contract.ts:54:35)
(fail) os lançamentos de custo da viagem, com o autor (spec 143 aceites 6 e 7) > viagem de outra
empresa não é encontrada — 404, nunca 403 [1.10ms]

 4 pass
 1 fail
 5 expect() calls
Ran 5 tests across 1 file. [39.00ms]
```

Este é o vermelho que conta: o `buildRepository(null)` simula exatamente o retorno do repositório
quando a viagem existe mas pertence a outra empresa (`listByTrip` devolve `null` porque o `SELECT
trips.id WHERE companyId = ? AND id = ?` não achou linha). Com o guard ausente, o use case engolia o
`null` como lista vazia e **resolvia com sucesso** — o mesmo formato de resposta que "viagem existe,
sem lançamento nenhum". Programaticamente isso seria 200 com `[]`, não 404: um vazamento de
existência mais sutil que um 403 (a rota nem chega a diferenciar as duas situações). A asserção falha
por conteúdo (`resolveu` vs. `rejeitou`), não por módulo ausente — prova que o teste está de fato
testando o filtro, e que o filtro (antes do guard) deixava passar. Depois de adicionar
`if (entries === null) throw new TripNotFoundError()`
(`list-trip-costs.use-case.ts:37-39`), a mesma suíte fica verde (5 pass, 0 fail).

### Onde o 404 cross-tenant nasce, exatamente

Dois pontos, cada um com um papel diferente — nenhum sozinho basta:

1. **`drizzle-trip-cost.repository.ts` (`listByTrip`, linhas ~59-65)** — o `where` que decide:
   `and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId))` contra a tabela `trips`
   (não `trip_cost_entries` diretamente). Se a viagem não pertence à empresa do contexto autenticado,
   a busca não acha linha (`trip === undefined`) e o método devolve `null` — nunca lança, nunca
   monta uma exceção HTTP. É aqui que o `companyId` do contexto (nunca do payload) decide existência.
2. **`list-trip-costs.use-case.ts` (`listTripCosts`, linhas ~35-39)** — quem traduz `null` em erro de
   domínio: `if (entries === null) throw new TripNotFoundError()`. O use case não faz try/catch
   (`code-standart §7`); o `TripNotFoundError` (`trip.error.ts:57-65`, status 404) propaga sem ser
   capturado até o exception filter global do router, que é quem de fato produz a resposta HTTP 404.

Ou seja: o repositório decide _que_ a viagem não existe para esta empresa (é a fronteira de
segurança — a query nunca vaza dado de outro tenant); o use case decide _o que fazer_ com essa
ausência (converter em erro de domínio, não engolir). A rota (`trip.routes.ts`) não participa dessa
decisão — ela só chama `dependencies.listTripCosts.execute(...)` e deixa o erro subir.

### A assimetria de permissão é intencional, não um defeito a unificar

`TRIP_COSTS_PATH` agora serve dois métodos com políticas diferentes:

- `POST` continua com `TRIP_MANAGE_POLICY` (`trip.manage`) — comentário original preservado
  (`trip.routes.ts`): "Pedágio e avulso são lançamento de operação: quem monta a viagem lança."
- `GET` (novo) usa `TRIP_FINANCIALS_POLICY` (`trip.financials`), a mesma política que já protege
  `readFinancialResult`/`recalculate` (spec 061 D4: "margem, custo de motorista e receita não são
  `trip.manage`").

Isto é o primeiro ponto que qualquer revisor vai questionar: por que quem pode _lançar_ um custo não
pode necessariamente _ver_ a lista de custos da mesma viagem? Resposta: são papéis diferentes por
desenho. `trip.manage` é operação (montar a viagem, lançar o que a operação gerou). `trip.financials`
é dinheiro — quem só monta viagem não tem, por padrão, visão financeira, mesmo sobre o que a própria
operação lançou. O teste `costs.contract.ts` ("recusa quem só tem trip.manage — a leitura é permissão
diferente da escrita") existe justamente para impedir que uma futura reescrita "simplifique" as duas
políticas para uma só. **A rota `POST` não foi tocada nesta task** — nem o `policy`, nem o handler,
nem o `parse`; só uma nova `defineRoute` foi inserida logo depois dela, no mesmo array.

### O defeito pré-existente corrigido (mesma classe, no escopo)

`record()` tinha `return { id: created?.id ?? '' }` — um fallback de string vazia sobre um
`INSERT ... RETURNING` que, por contrato do Postgres/Drizzle, sempre devolve a linha inserida.
`created` só seria `undefined` em uma falha de driver/transação que já deveria ter lançado antes; o
`?? ''` mascarava esse cenário devolvendo um `id` inválido em vez de estourar. Trocado por:

```ts
if (created === undefined) throw new Error('trip_cost_entries insert returned no row')
return { id: created.id }
```

Mesma classe do vício que T7 corrigiu (leitura silenciosa de um estado que não deveria acontecer),
desta vez do lado da escrita — e no mesmo arquivo que T8 já precisava tocar para o `listByTrip`.

### O nome do autor (aceite 6) e por que a cadeia de fallback é função pura, não SQL

`resolveActorName` (`drizzle-trip-cost.repository.ts`) resolve `name` → `email` → `'usuário
removido'` fora do SQL, como função exportada e testável sem Postgres — desvio deliberado do
precedente mais próximo (`trip-fiscal-readiness.query.ts`, que mantém seus helpers `resolveState`/
`toReadiness` privados, mas só porque são validados por integração com banco real). `identity_users`
não carrega nome/e-mail algum; `identity_user_profiles.name` é `NOT NULL` com CHECK de não-branco,
mas o `LEFT JOIN` pode não achar perfil nenhum (usuário removido) — é esse o gatilho real do
fallback final; o fallback para `email` é defesa em profundidade. As três branches (`nome`, `e-mail`,
`'usuário removido'`) são testadas diretamente em `list-costs.contract.ts`, sem Postgres.

### Por que não há teste de integração novo aqui

O container `transportada-test-postgres-1` (porta 65432, `.env.test`) estava parado no início desta
sessão; mesmo depois de subir, o precedente mais próximo (`trip-fiscal-readiness`) não tem teste de
integração cross-tenant algum, e a T7 já havia optado por prova de unidade/texto-fonte em vez de
integração para um problema estruturalmente parecido (separar comportamento por `kind`/tenant sem
depender de fixture de banco). O isolamento por tenant aqui é provado no nível de use case com
repositório falso (`buildRepository(null)`), exatamente como o `readiness.contract.ts` já fazia para
`TripNotFoundError`.

### Gates

| Gate                        | Comando                                                                                       | Resultado                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Typecheck                   | `bun run typecheck` (raiz, 6 apps)                                                            | ✅ limpo                                                        |
| Testes da API               | `bun run --cwd apps/api-transportada test`                                                    | ✅ 6111 pass · 23 skip · 0 fail · 21492 expect() · 177 arquivos |
| Testes da API (`.env.test`) | `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`) | ✅ idêntico — 6111 pass · 23 skip · 0 fail                      |
| Testes do frontend          | `bun run --cwd apps/frontend-transportada test`                                               | ✅ 4073 pass · 0 fail · 35825 expect() · 29 arquivos            |
| Lint                        | `bun run lint`                                                                                | ✅ limpo                                                        |
| Formatação                  | `bun run format:check`                                                                        | ✅ limpo (após `prettier --write` no repositório novo)          |

Os 23 `skip` são pré-existentes e não relacionados a T8 (`test/database-migration/support.ts` usa
`.skip` condicional próprio); a contagem é idêntica com e sem `.env.test`.

### Contrato que a T8 impõe à T9

1. `TripCostEntryView` (`list-trip-costs.use-case.ts`) é o formato definitivo de linha de custo com
   autor — `{ id, kind, amount, description, createdAt, actor: { userId, name } }`. Qualquer tela ou
   agregação que T9 vier a construir sobre lançamentos de custo com autor deve importar este tipo, não
   redeclará-lo.
2. `resolveActorName` já resolve a cadeia `name → email → 'usuário removido'` — T9 não precisa (e não
   deve) reimplementar essa lógica para qualquer outra listagem que precise do nome de quem lançou
   algo; importa a função ou replica o mesmo padrão de fallback.
3. A política de leitura de `trip.financials` (`TRIP_FINANCIALS_POLICY`) já cobre `GET
/trips/:id/costs` — se T9 expõe mais dado financeiro na mesma viagem, o padrão é a mesma política,
   não uma nova, a menos que o dado seja de fato menos sensível que custo lançado.

## T9 — Diária no cadastro do motorista (API + FE)

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`

Escopo: `driverFieldsSchema` (backend), a resposta HTTP da frota, `DriverForm` +
`DriverQuickCreateDialog` (paridade de rótulo/dica exigida por `driver-form-parity.contract.ts`).
`fleet_drivers.daily_allowance_amount` já existia (T1) — T9 abre o caminho de escrita/leitura, sem
migration.

### Regra de negócio

`dailyAllowanceAmount` é decimal-string, nunca número. Três estados, não dois:

- **valor** — a diária combinada só com este motorista, vence sempre no cálculo (D3/T2).
- **`null` explícito** — apaga o valor do motorista e devolve o cálculo ao valor geral da empresa.
- **chave ausente** (`exactOptionalPropertyTypes`) — "não mexeram nela": a ficha grava por inteiro a
  cada edição e o ausente não pode colapsar no mesmo caminho do `null`, ou apagaria o valor gravado
  toda vez que alguém só corrigisse o telefone.

Zod rejeita `<= 0` com 400; o CHECK `fleet_drivers_daily_allowance_check` (T1) é a segunda barreira.

### Vermelho backend — capturado depois, com a produção isolada por `git stash`

Mesma técnica que T5/T6/T8 já registraram aqui: os quatro arquivos de produção
(`fleet.port.ts`, `fleet.mapper.ts`, `fleet-request.schema.ts`, `fleet.routes.ts`) foram isolados via
`git stash push --keep-index -- <4 arquivos>`, mantendo os testes já escritos, para provar que o
vermelho é pelo motivo certo — não módulo ausente, não erro de fixture:

```
$ bun test test/fleet-domain.contract.test.ts

ZodError: [
  {
    "code": "unrecognized_keys",
    "keys": [
      "dailyAllowanceAmount"
    ],
    "path": [],
    "message": "Unrecognized key: \"dailyAllowanceAmount\""
  }
]
(fail) a diária que só este motorista recebe (spec 143 D5/D6) > aceita a diária como string decimal, nunca como número
(fail) a diária que só este motorista recebe (spec 143 D5/D6) > null apaga a diária combinada com o motorista
(fail) a diária que só este motorista recebe (spec 143 D5/D6) > a criação aceita o mesmo campo, ao lado dos demais da ficha

 96 pass
 3 fail
 280 expect() calls
```

`unrecognized_keys` é o `.strict()` do schema recusando uma chave que a produção ainda não conhece —
prova de conteúdo, não de import quebrado. Rodar as duas suítes HTTP+domínio juntas nesse mesmo
estado mostra o efeito em cascata correto: como `CREATE_DRIVER_BODY`/`UPDATE_DRIVER_BODY`
(`test/fixtures/fleet-http-payload.fixture.ts`) já carregam `dailyAllowanceAmount` para todo teste
que os usa, **14 testes falham**, não só os 2 novos de HTTP — inclusive testes que não falam de
diária (`accepts a partially filled address`, `propagates a duplicate document as 409`), todos pelo
mesmo `Unrecognized key`. Depois do `git stash pop`, as duas suítes voltam a 195 pass / 0 fail.

### Vermelho frontend — genuíno, seis falhas de conteúdo

```
$ bun test test/fleet.contract.test.ts

expect(createDriverDraft().dailyAllowanceAmount).toBe('')
  Received: undefined
expect(body.dailyAllowanceAmount).toBeNull()
  Received: undefined
expect(body.dailyAllowanceAmount).toBe('180.0000')
  Received: undefined
expect(withAllowance.dailyAllowanceAmount).toBe('180,00')
  Received: undefined
expect(source).toContain("label={t('driverDailyAllowanceAmount')}")
  — not found in DriverQuickCreateDialog.component.tsx
expect(ptBrLocale.driverDailyAllowanceAmount).toBeString()
  Received: undefined

 519 pass
 6 fail
 6545 expect() calls
```

Todas as seis são `Received: undefined` ou `toContain` não encontrado — nenhuma é "module not
found"; a suíte nova (`test/fleet/driver-daily-allowance.contract.ts`) já estava importada em
`test/fleet.contract.test.ts` quando o vermelho foi tirado.

### `null` × ausente — onde a distinção mora

`apps/api-transportada/src/fleet/infrastructure/fleet.mapper.ts`, `toDriverColumns()`:

```ts
...(driver.dailyAllowanceAmount === undefined
  ? {}
  : { dailyAllowanceAmount: driver.dailyAllowanceAmount }),
```

Chave ausente (`undefined`) não entra no objeto de colunas — o Drizzle não toca na coluna, e o valor
gravado sobrevive. `null` explícito entra e escreve `NULL` de verdade, que é o que apaga e devolve ao
valor geral da empresa. `mapDriver()` faz o caminho de leitura: `dailyAllowanceAmount:
record.dailyAllowanceAmount` — a coluna já é `string | null`, sem tradução.

### O que entrou

- **`driverFieldsSchema`** (`fleet-request.schema.ts`): `dailyAllowanceAmount` como
  `z.string().regex(MONEY_DECIMAL).refine(value => Number.parseFloat(value) > 0).nullable().optional()`
  — o único campo do schema com essa combinação `.nullable().optional()` (os demais campos de data
  usam `optionalDate()`/`optionalPastDate()`, que não têm o terceiro estado).
- **`FleetDriverInput.dailyAllowanceAmount?: string | null | undefined`** (`fleet.port.ts`) — o
  `| undefined` explícito **é o que o zod de fato infere** para uma propriedade `.optional()` sob
  `exactOptionalPropertyTypes`; sem ele, `bun run typecheck` reprovava em `fleet.routes.ts:192,205`
  (`Type 'string | null | undefined' is not assignable to type 'string | null'`) porque
  `CreateDriverBody`/`UpdateDriverBody` (`fleet.schema.ts`, derivados de
  `z.infer<typeof driverFieldsSchema>`) chegam com esse terceiro estado até a rota. O alargamento não
  muda `toDriverColumns()`: `=== undefined` lê igual tanto para chave ausente quanto para chave
  presente com valor `undefined`.
- **`serializeDriver()`** (`fleet.routes.ts`) e **`mapDriver()`** (`fleet.mapper.ts`) devolvem o campo
  cru, sem tradução.
- **Frontend** — `fleet.types.ts` (`FleetDriverBody.dailyAllowanceAmount: null | string`,
  `FleetDriverFormState.dailyAllowanceAmount: string`); três arrays de `fleet.constant.ts`
  (`DRIVER_BODY_KEYS`, `DRIVER_CREATE_BODY_KEYS`, `DRIVER_FORM_KEYS` — as duas primeiras gateiam
  `pickKeys()` em `fleetClient.service.ts`, e ficar de fora delas teria tipado certo e nunca chegado
  à API); `fleetForm.service.ts` importa `parseTypedAmount`/`toTypedAmount`/`AMOUNT_MAX_SCALE`/
  `AMOUNT_DISPLAY_SCALE` de `decimalAmount.service.ts` (nunca redeclara, code-standart §16) com um
  guard de branco explícito para o `null` (`parseTypedAmount` normaliza branco para zero, não para
  `null` — o guard é quem decide apagar); `DriverForm.component.tsx` e
  `DriverQuickCreateDialog.component.tsx` ganham o mesmo `FleetMoneyField` (`optional`, escala de
  exibição 2) e o mesmo parágrafo de dica — `FleetMoneyField` não tem prop `hint`, diferente de
  `FleetMeasureField`; locales pt-BR/en com rótulo e dica.

### Achado de lint, corrigido sem tocar em config compartilhada

Duas suítes usavam destructuring-para-omitir uma chave (`const { chave: _nome, ...resto } = objeto`),
e o `no-unused-vars` do eslint deste app não tem `ignoreRestSiblings` nem `varsIgnorePattern`
configurados — o prefixo `_` não isenta nada aqui. Trocado por clonar e `delete` explícito
(`test/fleet-domain/driver-daily-allowance.contract.ts`, `test/fleet-http/drivers.contract.ts`), sem
mexer em `eslint.config.js`: a regra do app não muda, só a forma de descartar a chave.

### Gates

| Gate               | Comando                                                | Resultado                                                                   |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo — inclui frontend-transportada, frontend-client, frontend-landing  |
| Testes da API      | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6120 pass · 23 skip · 0 fail** · 21507 expect() · 177 arquivos · ~11 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`        | ✅ **4079 pass · 0 fail** · 35842 expect() · 29 arquivos                    |
| Lint               | `bun run lint`                                         | ✅ limpo — 6 apps                                                           |
| Formatação         | `bun run format:check`                                 | ✅ limpo (após `prettier --write` em três arquivos)                         |

### Contrato que a T9 impõe à T10

1. `DAILY_ALLOWANCE_RATE_ORIGIN` (T2) e `resolveDailyAllowance` já sabem ler `driverAmount` de
   `fleet_drivers.daily_allowance_amount` — T10, ao abrir `company_driver_allowance_settings`, só
   precisa alimentar `companyAmount` no mesmo par; a função não muda.
2. O padrão `.nullable().optional()` para "apaga vs. não mexe" agora tem um precedente concreto no
   schema de motorista — T10 (`PUT/DELETE /company-settings/driver-allowance`) pode seguir o mesmo
   par (`FleetDriverInput.dailyAllowanceAmount` + `toDriverColumns()`) em vez de inventar um novo.
3. `AMOUNT_MAX_SCALE`/`AMOUNT_DISPLAY_SCALE`/`parseTypedAmount`/`toTypedAmount`
   (`decimalAmount.service.ts`) são o par certo para qualquer novo campo de dinheiro do frontend —
   T10 os importa, não redeclara.

## T10 — Valor geral da empresa (API + FE)

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`

Escopo: `GET/PUT/DELETE /company-settings/driver-allowance` + aba `DriverAllowancePanel` em
Configurações da empresa, no mesmo molde de `federal-tax-settings` (get/set/clear numa linha por
empresa). Sem linha gravada é resposta `200` com o padrão do sistema (`R$ 200,00`, `rateOrigin:
'default'`), nunca `404`; `PUT` faz upsert por `companyId` (`onConflictDoUpdate` no PK, nunca
insert-then-update) e audita em `auditLogs`; `DELETE` é idempotente. Reaproveita
`DAILY_ALLOWANCE_RATE_ORIGIN` e `DEFAULT_DAILY_ALLOWANCE_AMOUNT` (T2, `daily-allowance.policy.ts` /
`daily-allowance.constant.ts`) sem redeclarar — só os valores `.default`/`.company` se aplicam aqui,
nunca `.driver`. Mesma permissão `settings.manage` (escopo `company`), nenhuma nova.

### Vermelho — módulo de produção ainda não existia

```
$ bun test test/companies.contract.test.ts

test/companies.contract.test.ts:
# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/companies/application/driver-allowance-settings.use-case.js' from '/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/api-transportada/test/companies/driver-allowance-settings.contract.ts'
-------------------------------

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [47.00ms]
```

Vermelho pelo motivo certo: o teste de contrato (schema, use cases, wiring de rota, source-grep de
`companyId: context.scope.companyId`) foi escrito primeiro e falha porque nenhum arquivo de produção
existia ainda — não fixture ausente, não erro de asserção.

### O que entrou

- **Backend** (`src/companies/`): `application/driver-allowance-settings.port.ts` (tipos),
  `application/driver-allowance-settings.use-case.ts` (`createGetDriverAllowanceSettingsUseCase`,
  `createSetDriverAllowanceSettingsUseCase`, `createClearDriverAllowanceSettingsUseCase`),
  `infrastructure/drizzle-driver-allowance-settings.repository.ts` (`find`/`upsert`/`remove`/
  `appendAudit`, mesma tabela `auditLogs` do molde), `presentation/driver-allowance-settings.schema.ts`
  (`MONEY_DECIMAL` + `.refine(> 0)`, mesmo padrão de `driverFieldsSchema`),
  `presentation/driver-allowance-settings.routes.ts` (GET/PUT/DELETE, `SETTINGS_MANAGE_POLICY`,
  resposta default `{ amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT, rateOrigin:
DAILY_ALLOWANCE_RATE_ORIGIN.default, updatedAt: null }` quando não há linha). `main.ts` ganha o
  import, a instância do repositório e o spread das rotas — sem migration nova (a tabela
  `company_driver_allowance_settings` já existe da T1). `shared/api.constant.ts` ganha
  `API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH`. `test/companies/driver-allowance-settings.contract.ts`
  é importado por `test/companies.contract.test.ts` (suíte aninhada, não entra no `package.json`).
  `CLAUDE.md` do app ganha uma linha documentando a rota (§14).

- **Frontend** (`src/modules/company-settings/`): `shared/driverAllowance.validation.ts`
  (`DRIVER_ALLOWANCE_RATE_ORIGINS`, guards `isDriverAllowanceSettings`/`isDriverAllowanceResponse` —
  diferente do federal tax, a resposta nunca aceita `data: null`, porque o GET sempre devolve um
  valor populado, padrão ou da empresa), `shared/driverAllowanceClient.service.ts` (mesmo padrão de
  `federalTaxClient.service.ts`: `DriverAllowanceRequestError`, `send`/`readSettings`/`readErrorCode`,
  `createDriverAllowanceClient`), `hooks/useDriverAllowancePanel.hook.ts` (query + duas mutations,
  invalidação por `DRIVER_ALLOWANCE_QUERY_KEY`), `components/DriverAllowancePanel.component.tsx`
  (campo único, `toTypedAmount`/`parseTypedAmount` de `decimalAmount.service.ts`, reaproveita as
  classes CSS genéricas `federalTaxFields`/`federalTaxOrigin`/`federalTaxActions`/`federalTaxNote`).
  `companySettingsTabs.service.ts` ganha a aba `driverAllowance` em `SETTINGS_PANELS`,
  `SettingsDataSource`, `SETTINGS_PANEL_PLACEMENT` e `COMPANY_SETTINGS_TAB_IDS`.
  `CompanySettings.page.tsx` monta o hook, passa as props e renderiza `<DriverAllowancePanel>` na aba
  nova. Locales pt-BR/en com `tabs.driverAllowance` e o bloco `driverAllowance.*`.
  `test/company-settings/driver-allowance-panel.contract.ts` é importado por
  `test/company-settings.contract.test.ts` (mesmo padrão de suíte aninhada). `CLAUDE.md` do app
  atualiza a lista de abas de Configurações (§14).

### Revisão do coordenador: o aceite literal não tinha teste que falhasse

O `tasks.md` da T10 exige, ao pé da letra: "sem linha → GET devolve `200.0000` com `origin:
'default'`; PUT → `company`; DELETE volta ao padrão". O teste original
(`'reading without a row returns the system default, not an error'`) só exercitava o **use case**
(`createGetDriverAllowanceSettingsUseCase(...).execute(...)` devolvendo `null`) — quem de fato monta
o corpo com `DEFAULT_DAILY_ALLOWANCE_AMOUNT`/`DAILY_ALLOWANCE_RATE_ORIGIN.default` é a `jsonResponse`
de `driver-allowance-settings.routes.ts:97-113`, e nada chamava essa função. Confirmado por injeção
de defeito: trocar os dois `DAILY_ALLOWANCE_RATE_ORIGIN.default`/`.company` de lugar em
`driver-allowance-settings.routes.ts` deixava a suíte inteira verde antes desta correção.

Correção, só em `test/companies/driver-allowance-settings.contract.ts`:

1. O teste do use case foi renomeado para `'the get use case returns null when there is no stored
row'` — o nome agora diz exatamente o que a asserção prova, nada a mais.
2. Três testes novos passam a **chamar o handler de verdade** (`route.execute({ context: { identity:
undefined, scope: MANAGER_CONTEXT }, correlationId, pathParameters: {}, request })`, o mesmo padrão
   de `test/companies/distribution-cursor.contract.ts`, já que `federal-tax-settings.contract.ts` tem
   a mesma lacuna e não serviu de referência aqui):
   - `'GET without a stored row answers 200 with the system default, over HTTP'` — status `200`,
     corpo `{ amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT, rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
updatedAt: null }`.
   - `'PUT then GET over HTTP answer with origin company and the saved amount'` — grava `180.0000`
     pelo PUT de verdade, confere a resposta do próprio PUT e depois um GET separado, ambos com
     `rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company` e o valor gravado.
   - `'DELETE then GET over HTTP reverts to the system default'` — DELETE devolve `204`, e o GET
     seguinte volta ao mesmo corpo padrão do primeiro teste.
3. Nenhuma asserção compara contra o literal `'200.0000'` escrito à mão: importam
   `DEFAULT_DAILY_ALLOWANCE_AMOUNT` (`daily-allowance.constant.ts`) e `DAILY_ALLOWANCE_RATE_ORIGIN`
   (`daily-allowance.policy.ts`), os mesmos símbolos que a rota usa — o teste segue o dia em que o
   padrão mudar, em vez de virar dois números divergentes.

Reconfirmado depois da correção: a mesma injeção de defeito (trocar `.default`/`.company` na rota)
agora falha exatamente no teste `'PUT then GET over HTTP answer with origin company and the saved
amount'`, com o `toMatchObject` apontando `"rateOrigin": "company"` esperado contra `"default"`
recebido — desfeita em seguida, sem outra mudança na rota.

### Gates

| Gate               | Comando                                                | Resultado                                                                   |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo — inclui frontend-transportada, frontend-client, frontend-landing  |
| Testes da API      | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6134 pass · 23 skip · 0 fail** · 21543 expect() · 177 arquivos · ~11 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`        | ✅ **4086 pass · 0 fail** · 35877 expect() · 29 arquivos                    |
| Lint               | `bun run lint`                                         | ✅ limpo — 6 apps                                                           |
| Formatação         | `bun run format:check`                                 | ✅ limpo                                                                    |

## T11 — A linha do motorista mostra diária, dias e origem (FE)

**Data:** 2026-09-16 · **Branch:** `work/spec-143-diaria` · **Worktree:** `../transportada-wt/spec-143-diaria`

Escopo: a T3 trocou a forma da parcela do motorista na API (`basis.of === 'driver'` virou
`{ crew, days, daysOrigin }`, uma linha por condutor, sem `paymentModel`/`regionCity`/`regionCode`/
`tie`) e o frontend ficou para trás — o razão da viagem (`ValuationLedger`) ainda esperava a forma
antiga e não compilava contra o tipo novo. Esta task migra o tipo, o validador e
`composeCostParcelDetail` para compor, na tela, a mesma frase que `freeze-trip-financial-result.use-case.ts`
já congela na viagem fechada: `R$ {valor} × {dias} {dia|dias} · {origem}`, uma linha por condutor,
juntas por `'; '`.

### Vermelho — a frase ainda não existe no frontend

```
$ bun test ./test/trip-financials/driver-route-tie-detail.contract.ts

test/trip-financials/driver-route-tie-detail.contract.ts:
80 |       basis: driverBasis([crewMember()]),
81 |       detail: null,
82 |       t: translate(financialsPt),
83 |     })
84 |
85 |     expect(detail).toBe('R$ 250,00 × 3 dias · valor do motorista')
                        ^
error: expect(received).toBe(expected)

Expected: "R$ 250,00 × 3 dias · valor do motorista"
Received: null

      at <anonymous> (/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/frontend-transportada/test/trip-financials/driver-route-tie-detail.contract.ts:85:20)
(fail) the driver allowance sentence is composed on the screen (spec 143) > one driver, rate taken from the driver record [0.38ms]
90 |       basis: driverBasis([crewMember()], { days: 1 }),
91 |       detail: null,
92 |       t: translate(financialsPt),
93 |     })
94 |
95 |     expect(detail).toBe('R$ 250,00 × 1 dia · valor do motorista')
                        ^
error: expect(received).toBe(expected)

Expected: "R$ 250,00 × 1 dia · valor do motorista"
Received: null

      at <anonymous> (/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/frontend-transportada/test/trip-financials/driver-route-tie-detail.contract.ts:95:20)
(fail) the driver allowance sentence is composed on the screen (spec 143) > a single day uses the singular form [0.10ms]
110 |       basis: driverBasis([crewMember({ rateOrigin: 'driver' })]),
111 |       detail: null,
112 |       t: translate(financialsPt),
113 |     })
114 |
115 |     expect(company).toBe('R$ 250,00 × 3 dias · valor geral')
                          ^
error: expect(received).toBe(expected)

Expected: "R$ 250,00 × 3 dias · valor geral"
Received: null

      at <anonymous> (/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/frontend-transportada/test/trip-financials/driver-route-tie-detail.contract.ts:115:21)
(fail) the driver allowance sentence is composed on the screen (spec 143) > each rate origin names itself [0.06ms]
122 |       basis: driverBasis([crewMember({ dailyAmount: '1234.5600' })]),
123 |       detail: null,
124 |       t: translate(financialsPt),
125 |     })
126 |
127 |     expect(detail).toBe(`${formatAmount('1234.5600')} × 3 dias · valor do motorista`)
                         ^
error: expect(received).toBe(expected)

Expected: "R$ 1.234,56 × 3 dias · valor do motorista"
Received: null

      at <anonymous> (/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/frontend-transportada/test/trip-financials/driver-route-tie-detail.contract.ts:127:20)
(fail) the driver allowance sentence is composed on the screen (spec 143) > the thousands separator groups before the decimal comma [0.49ms]
136 |       ]),
137 |       detail: null,
138 |       t: translate(financialsPt),
139 |     })
140 |
141 |     expect(detail).toBe('R$ 250,00 × 3 dias · valor do motorista; R$ 180,00 × 3 dias · valor geral')
                         ^
error: expect(received).toBe(expected)

Expected: "R$ 250,00 × 3 dias · valor do motorista; R$ 180,00 × 3 dias · valor geral"
Received: null

      at <anonymous> (/Users/anderson.filho/Documents/personal/transportada-wt/spec-143-diaria/apps/frontend-transportada/test/trip-financials/driver-route-tie-detail.contract.ts:141:20)
(fail) the driver allowance sentence is composed on the screen (spec 143) > two drivers become two sentences, separated by "; ", in crew order [0.14ms]

 3 pass
 5 fail
 13 expect() calls
Ran 8 tests across 1 file. [19.00ms]
```

Vermelho pelo motivo certo: `composeCostParcelDetail` ainda lê `basis.tie` (que não existe mais na
forma nova de `basis`), então cai direto no `detail` cru (`null` em todos os casos de teste) — as
cinco asserções de conteúdo falham comparando `null` contra a frase esperada, não um módulo ausente
ou erro de tipo. As 3 que passam são o fallback sem `basis` (compatibilidade) e as duas checagens de
texto de fonte (que já eram verdadeiras antes desta task).

### O que entrou

- **Frontend** (`src/modules/trip-financials/shared/`): `tripValuation.service.ts` ganha os tipos
  locais `DailyAllowanceRateOrigin` (`'company' | 'default' | 'driver'`), `DailyAllowanceDaysOrigin`
  (`'estimated' | 'informed'`) e `TripDriverCostCrewLine` — cópias por valor dos equivalentes da API
  (nenhuma app importa fonte de outra); a variante `'driver'` de `TripValuationCostParcelBasis` vira
  `{ crew, days, daysOrigin, of: 'driver' }`, sem `paymentModel`/`regionCity`/`regionCode`/`tie`/
  `vehicleClass`. `tripValuationResponse.validation.ts` troca `readTie` por `readCrew` (condutor
  malformado é descartado do array, nunca invalida a parcela inteira — mesmo padrão de `isSource`) e
  ganha os guards `isRateOrigin`/`isDaysOrigin` (fallback para `'estimated'` quando o valor não bate).
  `tripCostParcelDetail.service.ts` é reescrito: `composeCostParcelDetail` monta, por condutor,
  `t('ledger.driverBasis', { amount, count: days, days, origin })` e junta as linhas por `'; '`
  (`DRIVER_ALLOWANCE_SEPARATOR`); sem `basis` ou `basis.of !== 'driver'` o `detail` cru sobe sem
  tradução (compatibilidade com resultado congelado antes da spec 143). Removidos `formatTiedZone`,
  `TIE_SEPARATOR`, `TIE_ZONES_SEPARATOR`.

- **Locales** (`tripFinancials.locale.json` / `.en.locale.json`): `ledger.driverBasis.fixed`/
  `.route_table` e `tieCityCount_one`/`_other`/`tieNoPrice` saem; entram `driverBasis_one`/`_other`
  (`"{{amount}} × {{days}} dia(s) · {{origin}}"`) e `driverRateOrigin.company`/`.default`/`.driver`
  (`"valor geral"`/`"valor padrão"`/`"valor do motorista"`, e os equivalentes em inglês). Todo o
  namespace `gap.*` foi preservado sem alteração.

- **`ValuationLedger.component.tsx`**: o comentário acima da chamada de `composeCostParcelDetail`
  passa a referenciar a spec 143; o ramo final da derivação (que antes lia
  `ledger.driverBasis.${basis.paymentModel}` com `city`/`vehicleClass`/`zone`) passa a usar
  diretamente o `detail` já composto por `composeCostParcelDetail` — o contrato público
  `<ValuationLedger valuation={valuation} />` não mudou.

- **`SuggestionVehicleValuation.component.tsx`**: só o comentário acima da mesma chamada foi
  corrigido (referenciava `basis.tie`, que não existe mais); a limitação conhecida e aceita — esta
  tela só compõe a frase quando `parcel.gap !== null`, e a parcela do motorista não tem mais `gap`
  depois da T3, então a frase da diária não aparece aqui hoje — ficou documentada no próprio
  comentário. Não corrigida por estar fora do escopo desta task (é limitação pré-existente da T3).

- **Testes**: `test/trip-financials/driver-route-tie-detail.contract.ts` reescrito no lugar (mesmo
  arquivo, sem renomear) — 8 testes cobrindo um condutor, singular/plural de dia, as três origens,
  separador de milhar, dois condutores unidos por `'; '`, o fallback sem `basis` (compatibilidade) e
  a paridade literal com `freeze-trip-financial-result.use-case.ts` (lida por texto de fonte).
  `test/trip-financials/valuation-ledger.contract.ts` e
  `test/trip-financials/valuation-ledger-advisory.contract.ts` tiveram suas fixtures de parcela do
  motorista migradas para a forma nova (a segunda usa `basis: null` — é o caso de resultado
  congelado antes da spec, com a frase já pronta em `detail` cru).

- **Correção (revisão do coordenador): o smoke também precisava migrar.** O relato original desta
  task registrava, errado, que `test/multi-vehicle-smoke.helper.ts` e
  `test/responsive.smoke.spec.ts` ficavam fora do alcance da migração — "não são type-checados" e
  "não quebram nenhum gate". Os dois pontos estavam errados: `apps/frontend-transportada/tsconfig.json`
  inclui `test/` no `include`, então o typecheck passava porque a fixture antiga é um objeto literal
  solto entregue a `fulfillJson(route, body: unknown)`, sem anotação de tipo — não porque o arquivo
  escapasse do compilador. E `responsive.smoke.spec.ts:1564` tinha uma **asserção viva** sobre a
  frase antiga (`/Zona 1\.002 \(JABOTICABAL\) · toco/u`), num diálogo que passa pelo
  `ValuationLedger`/`composeCostParcelDetail` de verdade — com a fixture nova essa asserção ficaria
  vermelha (a base antiga é descartada pelo validador, `detail` vira `null`, nada é impresso). O
  `t3-inventario.md` já listava `multi-vehicle-smoke.helper.ts` como "acompanha as fixtures": era
  escopo desde o inventário, não achado novo.

  Corrigido: `multi-vehicle-smoke.helper.ts:254-270` — `VEHICLE_VALUATION.costParcels[0].basis`
  migrado para `{ crew: [{ dailyAmount: '370.0000', driverId: AGGREGATE_DRIVER_ID, driverName:
'Agregado Sintetico', paymentModel: 'route_table', rateOrigin: 'company', subtotal: '1480.0000'
}], days: 4, daysOrigin: 'estimated', of: 'driver' }` — `paymentModel: 'route_table'` é o mesmo
  valor já usado antes da migração e um dos dois únicos literais aceitos por `DriverPaymentModel`
  (`apps/api-transportada/src/database/fleet.schema.ts:111`, `['route_table', 'fixed']`); `370,00 ×
4` fecha exato com `amount: '1480.00'` (Σ `crew[].subtotal` === `amount`, invariante da T3). O
  comentário de `:249-253` (que prometia "R$ 1.480,00 em zona 1.002 (JABOTICABAL) · toco") foi
  atualizado para a frase nova. `responsive.smoke.spec.ts:1564` passa a esperar
  `/R\$ 370,00 × 4 dias · valor geral/u`, derivado do próprio `formatAmount('370.0000')` (conferido
  por script: `"R$ 370,00"`, NBSP depois do "R$" — mas os testes deste smoke já casam esse
  espaço com Playwright's `getByText`, que normaliza espaço em branco incluindo NBSP; o precedente
  em `responsive.smoke.spec.ts:521` (`getByText('R$ 350,50')`) confirma) mais
`driverBasis_other`/`driverRateOrigin.company`do locale pt-BR; o comentário de`:1563` também foi
  atualizado.

  ⚠️ **`make smoke` não foi executado** — a stack precisa de Docker, e o Docker não respondeu nesta
  máquina. A correção acima é estática: conferida por leitura de código (tipo, invariante de soma,
  locale, saída real de `formatAmount`), não por execução do Playwright. A confirmação em runtime
  do smoke fica pendente da próxima vez que a stack subir.

### Gates

| Gate               | Comando                                                | Resultado                                                                   |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo — inclui frontend-transportada, frontend-client, frontend-landing  |
| Testes da API      | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6134 pass · 23 skip · 0 fail** · 21543 expect() · 177 arquivos · ~14 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`        | ✅ **4086 pass · 0 fail** · 35882 expect() · 29 arquivos                    |
| Lint               | `bun run lint`                                         | ✅ limpo — 6 apps                                                           |
| Formatação         | `bun run format:check`                                 | ✅ limpo                                                                    |

Baseline da T10 batido igual: API 6134/0 e FE 4086/0 — nenhuma regressão, nenhum teste a mais fora
do previsto (o total de arquivos e `expect()` do FE sobe de 35877 para 35882 só pelas asserções
novas desta task). Os cinco gates foram re-executados inteiros depois da correção do smoke
(revisão do coordenador) e batem os mesmos números — nenhuma regressão introduzida pela correção.

⚠️ **`make smoke` não roda nesta evidência** — precisa da stack em Docker, indisponível nesta
máquina; a correção do Playwright ficou provada por leitura (tipo, soma, locale, saída real de
`formatAmount`), não por execução.

## T12 — Painel com todos os gastos, lançamentos e input (API + FE)

### Contrato antes da implementação — o vermelho literal

Duas suítes novas, escritas e rodadas **antes** de qualquer linha de produção. Nenhuma delas entrou
no `package.json`: suíte dentro de diretório que já existe se registra por `import` no entrypoint
(`test/trip-financial.contract.test.ts` na API, `test/trip-financials.contract.test.ts` no FE) —
mexer no `package.json` quebraria `test-registry.contract.ts`.

**API — `test/trip-financial/cost-amount.contract.ts`** (`bun --env-file=../../.env.test test
test/trip-financial.contract.test.ts --timeout 120000`):

```
36 |     test(`${amount} devolve 400 em vez de morrer no CHECK do banco`, async () => {
37 |       expect(await statusOf(amount)).toBe(400)
                                          ^
error: expect(received).toBe(expected)

Expected: 400
Received: 201

      at <anonymous> (.../test/trip-financial/cost-amount.contract.ts:37:38)
(fail) o lançamento de valor zero é recusado na fronteira, não no banco > 0 devolve 400 em vez de morrer no CHECK do banco [6.63ms]
(fail) o lançamento de valor zero é recusado na fronteira, não no banco > 0.0000 devolve 400 em vez de morrer no CHECK do banco [0.26ms]
(fail) o lançamento de valor zero é recusado na fronteira, não no banco > 0.00 devolve 400 em vez de morrer no CHECK do banco [0.09ms]
(fail) o lançamento de valor zero é recusado na fronteira, não no banco > 000 devolve 400 em vez de morrer no CHECK do banco [0.08ms]

 57 pass
 4 fail
 111 expect() calls
Ran 61 tests across 1 file. [287.00ms]
```

Vermelho de **asserção**, não de import quebrado: os 57 restantes da mesma entrada passam, e os
quatro que falham falham pelo valor (`201` onde o contrato promete `400`). O caso negativo
(`-80.0000`) já nasce verde — ele nunca passou do `AMOUNT_PATTERN`.

**FE — `test/trip-financials/cost-entries.contract.ts`** (`bun test
test/trip-financials.contract.test.ts`):

```
 54 pass
 25 fail
 207 expect() calls
Ran 79 tests across 1 file. [51.00ms]
```

Os 25:

```
(fail) o valor digitado vira o decimal que a API aceita (spec 143 D6) > o milhar sai e a vírgula vira ponto, na escala fiscal
(fail) o valor digitado vira o decimal que a API aceita (spec 143 D6) > o corpo leva a espécie e a descrição escolhidas
(fail) as regras do formulário, contra o serviço puro > campo de valor em branco não sai do formulário
(fail) as regras do formulário, contra o serviço puro > zero não é custo, e nem sai do formulário
(fail) as regras do formulário, contra o serviço puro > a descrição respeita o teto que o servidor cobra
(fail) as regras do formulário, contra o serviço puro > lançamento completo não tem nada a corrigir
(fail) as regras do formulário, contra o serviço puro > valor acima do que a API aceita é barrado antes do envio
(fail) a resposta da API é entrada não confiável > o lançamento chega com autor, valor em texto e momento
(fail) a resposta da API é entrada não confiável > valor numérico na resposta é resposta inválida
(fail) a resposta da API é entrada não confiável > autor sem nome chega vazio, para o locale decidir a palavra
(fail) as chaves de consulta do módulo moram num lugar só > a constante publica as três chaves, e o hook antigo passa a lê-las de lá
(fail) o hook dos lançamentos > não pergunta a quem não tem trip.financials
(fail) o hook dos lançamentos > o sucesso derruba a lista e a conta prevista, e não o congelado
(fail) o hook dos lançamentos > a revalidação não segura o botão
(fail) o hook dos lançamentos > o nome de quem lançou não vai para o console
(fail) a lista de lançamentos na tela > a falha da lista tem erro e nova tentativa só dela
(fail) a lista de lançamentos na tela > a lista vazia se explica com palavra própria
(fail) a lista de lançamentos na tela > o carregamento tem a forma da lista
(fail) a lista de lançamentos na tela > a lista não reordena o que a API ordenou
(fail) o formulário, que é a metade trip.manage > o formulário só é montado por quem pode lançar
(fail) o formulário, que é a metade trip.manage > a falha da mutação preserva o que foi digitado
(fail) o formulário, que é a metade trip.manage > o campo de valor usa o par de máscara e parser do repositório
(fail) o painel monta a lista nas duas situações da viagem > os dois ramos do painel montam a lista
(fail) o painel monta a lista nas duas situações da viagem > o painel cabe no teto do repositório
(fail) as duas direções da permissão, pela página > lista e formulário vivem dentro do painel, nunca ao lado dele
```

Dois vermelhos com formas diferentes, de propósito, e vale registrar o porquê:

- Asserções contra arquivo **que já existe** falham pelo conteúdo, que é o vermelho que o processo
  pede. Ex.: `os dois ramos do painel montam a lista` → `Expected: 2 / Received: undefined`;
  `o painel cabe no teto do repositório` → `Expected: <= 200 / Received: 213`; `lista e formulário
vivem dentro do painel` imprime o `TripDetail.page.tsx` inteiro sem `useTripCostEntries`.
- Asserções contra arquivo **que ainda não existe** falham por `ENOENT` do `Bun.file(...).text()`.
  Isso é conteúdo também — o arquivo ausente é a divergência —, e a suíte **inteira roda** porque
  os módulos novos entram por `await import(...)` dentro de cada teste, nunca por `import` estático
  no topo: um `import` estático derrubaria a resolução do arquivo e nada correria. Foi decisão
  explícita, para não trocar 25 falhas de asserção por uma pilha de "module not found".

### O que entrou

**API — a fronteira passa a recusar o zero, e é só isso.**

- `apps/api-transportada/src/trips/presentation/trip-financial.schema.ts`: `AMOUNT_PATTERN` segue
  idêntico e ganha um `.refine` — string sem dígito de 1 a 9 vale zero, e zero não é custo. O
  `CHECK ("amount" > 0)` do banco **não foi tocado**: a constraint já estava certa, frouxa estava a
  fronteira, que aceitava `'0'` e deixava o erro do banco vazar como 500. A checagem é sobre a
  **string** (`/[1-9]/u`), nunca sobre `Number(value)` — dinheiro não vira float binário nem para
  validar.
- `apps/api-transportada/test/trip-financial/cost-amount.contract.ts` (novo, 55 linhas): dirige
  `parseTripCostRequest` com `Request` real e mapeia `ApiError.status`. Recusa `'0'`, `'0.0000'`,
  `'0.00'` e `'000'` com 400; mantém válidos `'0.5000'` (zero à esquerda é legítimo), `'0.0001'`,
  `'1'` e `'9999999999999.9999'`; e fixa que `'-80.0000'` **continua** recusado.
- `apps/api-transportada/test/trip-financial.contract.test.ts`: uma linha de `import`. ⚠️ Suíte nova
  dentro de diretório que já existe entra pelo **entrypoint**, nunca no `package.json` — a lista de
  lá é de entrypoints, e `test-registry.contract.ts` reprova arquivo de suíte metido ali.

⚠️ **Valor negativo continua fora, por decisão do usuário.** O estorno é spec própria: precisa
resolver permissão, efeito sobre resultado já congelado e trilha de auditoria. Nesta task não se
abriu sinal negativo nem se inventou espécie de lançamento — a premissa da spec (`spec.md:119`,
"Errou, lança um ajuste") fica registrada e sem implementação.

**Frontend — o painel ganha a lista de lançamentos e o formulário.**

| Arquivo                                               | Linhas | Papel                                                                               |
| ----------------------------------------------------- | -----: | ----------------------------------------------------------------------------------- |
| `test/trip-financials/cost-entries.contract.ts`       |    374 | a suíte de contrato (novo)                                                          |
| `src/.../shared/tripFinancialsQueryKey.constant.ts`   |     13 | as três chaves de consulta e as duas permissões, num lugar só (novo)                |
| `src/.../shared/tripCostEntryForm.service.ts`         |     74 | regra pura do formulário: `toTripCostEntryBody`, `validateTripCostEntryForm` (novo) |
| `src/.../shared/tripCostEntryResponse.validation.ts`  |     54 | fronteira de leitura: `toTripCostEntries` + `TripCostEntryResponseError` (novo)     |
| `src/.../hooks/useTripCostEntries.hook.ts`            |     86 | consulta, mutação e permissões do bloco (novo)                                      |
| `src/.../components/TripCostEntries.component.tsx`    |     91 | a lista, com carregamento, erro, nova tentativa e vazio próprios (novo)             |
| `src/.../components/TripCostEntryForm.component.tsx`  |     93 | a metade `trip.manage`: valor mascarado, espécie e descrição (novo)                 |
| `src/.../components/FrozenResultTable.component.tsx`  |     89 | o bloco do congelado, extraído do painel (novo)                                     |
| `src/.../components/TripFinancialPanel.component.tsx` |    168 | monta a lista nos dois ramos da viagem                                              |
| `src/modules/trip/pages/TripDetail.page.tsx`          |      — | chama o hook e passa o controlador ao painel                                        |
| `src/.../hooks/useTripFinancials.hook.ts`             |      — | passa a **importar** as chaves da constante nova                                    |
| `src/.../shared/tripFinancials.types.ts`              |      — | `TripCostEntry`, `TripCostEntryKind`, `TripCostEntryActor`                          |
| `src/.../shared/tripFinancialsClient.service.ts`      |      — | `readCosts` e o `kind` tipado                                                       |
| `src/.../locales/tripFinancials{,.en}.locale.json`    |      — | um bloco `costEntries` em cada, 20 linhas                                           |
| `src/.../styles/tripFinancials.module.css`            |      — | `.costEntries`, `.costEntryList`, `.costEntryDescription`, `.costEntryForm`         |

As decisões que valem registro:

- **O painel estava em 213 linhas e o teto do repositório é 200.** O bloco do congelado (totais,
  os dois avisos e a tabela de parcelas) saiu inteiro para `FrozenResultTable`, que recebe só
  `result` e recalcula o que precisa. Saiu pelo teto, não por reuso — tem um consumidor só, e o
  comentário do arquivo diz isso. `ValuationLedger` e `summarizeTripValuation` não foram tocados.
- **A lista vive dentro do painel, nos dois ramos** (viagem aberta e resultado congelado): gasto
  lançado depois do congelamento continua sendo gasto daquela viagem, e escondê-lo no congelado
  faria a tela mentir por omissão. A página não monta `TripCostEntries` nem `TripCostEntryForm` —
  ela só passa o controlador; o teste cobra as duas coisas.
- **Lançar derruba a lista e a conta prevista (`trip-valuation`), não o congelado
  (`trip-financials`).** O congelado é foto tirada, e revalidá-lo a cada lançamento daria a
  impressão de que o número muda sozinho — recalcular continua sendo ato explícito, com motivo.
- **`record` devolve `boolean`, não relança.** A recusa já é estado da mutação; o formulário só
  precisa saber se pode limpar os campos, e **preserva o que foi digitado quando a API recusa**.
- **§16:** as chaves de consulta e as permissões viraram constante única, e `useTripFinancials`
  passou a importá-las em vez de redeclarar as três que já tinha localmente.
- **PII:** o nome de quem lançou aparece na resposta da API e na tela, e **em lugar nenhum** vai
  para log — a suíte afirma que nenhum dos arquivos novos contém `console.`.

### Divergências registradas, não corrigidas

- **`useTripFinancials.hook.ts` invalida só `trip-financials` no `recalculate`, nunca
  `trip-valuation`.** É anterior à T12 e fora do escopo dela; corrigir aqui aumentaria o diff sem
  teste que cobrasse. Fica anotado para quem pegar a próxima task do módulo.
- **Os dois buracos herdados da 061:** o zero fechou aqui (regra + teste); o negativo continua
  aberto de propósito, virando spec própria por decisão do usuário.

### Gates

| Gate               | Comando                                                | Resultado                                                                     |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                     | ✅ limpo — inclui frontend-transportada, frontend-client, frontend-landing    |
| Testes da API      | `bun --env-file=../../.env.test test --timeout 120000` | ✅ **6143 pass · 23 skip · 0 fail** · 21552 expect() · 177 arquivos · 14,22 s |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`        | ✅ **4112 pass · 0 fail** · 35936 expect() · 29 arquivos · 5,86 s             |
| Lint               | `bun run lint`                                         | ✅ limpo — 6 apps                                                             |
| Formatação         | `bun run format:check`                                 | ✅ limpo                                                                      |

Baseline da T11 batido: API 6134 → **6143** (as 9 da suíte nova do valor) e FE 4086 → **4112** (as
26 da suíte nova dos lançamentos), com **0 fail** dos dois lados e nenhum teste a menos. Isoladas:
`bun --env-file=../../.env.test test test/trip-financial.contract.test.ts` dá **61 pass · 0 fail ·
111 expect()**, e `bun test test/trip-financials.contract.test.ts` dá **79 pass · 0 fail · 256
expect()**.

⚠️ **`make smoke` não foi executado** — precisa da stack em Docker, fora do ar nesta máquina. A
verificação de que nada do smoke quebra foi **estática, por leitura**, e é esta: dos seis cenários
do `responsive.smoke.spec.ts` que abrem "Detalhe da viagem", **nenhum** concede `trip.financials`
(a permissão só aparece nas linhas 1491 e 1499, no cenário do diálogo de montar roteiro, que não
navega para o detalhe). Sem `trip.financials` o `useTripCostEntries` nasce desabilitado e não emite
`GET /trips/:id/costs`, então nenhum mock precisou ganhar rota e nenhum arquivo de smoke foi
alterado. Isso é leitura, não execução — não se afirma verde que não se viu.

⚠️ **O comando de teste da API cobre os 177 entrypoints `*.test.ts`; os 83 arquivos
`test/integration/*.integration.ts` não entram na descoberta padrão do `bun test`** (o padrão casa
`*.test.*`, `*.spec.*`, `*_test.*`) e continuam sendo o script `test:integration`, que precisa de
Docker. A flag `--env-file` foi usada como manda o processo, e o número acima é comparável ao
baseline porque foi medido do mesmo jeito — mas vale dizer sem rodeio que esta execução **não
exercitou banco**.

⚠️ **Uma asserção da suíte do FE foi refinada depois do vermelho colado acima.** O teste cobrava o
literal `'trip.financials'` dentro de `useTripCostEntries.hook.ts`, o que obrigaria a redeclarar uma
string que já existe — exatamente o que o §16 proíbe. A asserção passou a cobrar a constante
(`export const FINANCIALS_PERMISSION = 'trip.financials'`) mais o uso do identificador no hook. O
alvo do teste não mudou; o caminho para satisfazê-lo, sim.

## T13 — Campo "Diárias" na criação da viagem (FE)

`TripQuickCreateDialog` + `useTripQuickCreate` + `tripClient`/`tripFinancialsClient`.

### Contrato antes da implementação — o vermelho literal

Suíte nova, `test/trip/daily-allowance-days.contract.ts`, registrada por `import` no entrypoint
`test/trip.contract.test.ts` (última linha) — nunca no `package.json`, pelo mesmo motivo do T12.

⚠️ **Duas das seis asserções chegaram já verdes no primeiro vermelho**, porque `trip.types.ts` e
`tripClient.service.ts` tinham sido editados numa sessão anterior a esta, antes de qualquer teste
existir para o campo — na ordem contrária à que o briefing pede ("não negociável": teste primeiro).
Não desfiz essas duas edições: reverter seria decisão de escopo tanto quanto seguir, e o código nelas
está correto e é exercitado pelo restante da suíte. Fica registrado como desvio.

`bun test test/trip.contract.test.ts` (vermelho, antes de tocar nos quatro arquivos restantes):

```
(fail) trip daily allowance days contract > the valuation preview carries the same value, and omits it when the field is empty [1.22ms]
(fail) trip daily allowance days contract > the days value is part of the preview query key, forcing a new calculation when it changes [0.12ms]
(fail) trip daily allowance days contract > the dialog and the controller hook wire the typed days into both network calls [0.19ms]

 891 pass
 3 fail
 17659 expect() calls
Ran 894 tests across 1 file. [442.00ms]
```

As três falhas mapeiam 1:1 para os três arquivos ainda não tocados — `tripFinancialsClient.service.ts`
(sem `dailyAllowanceDays` em `previewValuation`), `useTripValuationPreview.hook.ts` (sem o campo na
`queryKey`) e o par `useTripQuickCreate.hook.ts`/`TripQuickCreateDialog.component.tsx` (sem o
`dailyAllowanceDaysInput`) — e a mensagem é sempre um `expect` que não bate, nunca um import quebrado.

### O que mudou

| Arquivo                                                          | Papel                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `test/trip/daily-allowance-days.contract.ts`                     | a suíte de contrato (novo, 6 casos)                                             |
| `test/trip.contract.test.ts`                                     | uma linha de `import`                                                           |
| `src/.../trip/shared/tripQuickCreate.service.ts`                 | `resolveDailyAllowanceDaysInput` — string digitada → inteiro ≥ 1 ou `undefined` |
| `src/.../trip/hooks/useTripQuickCreate.hook.ts`                  | estado `dailyAllowanceDaysInput`, resolvido e passado ao `createTrip`           |
| `src/.../trip/components/TripQuickCreateDialog.component.tsx`    | o campo `<input type="number">` no `fieldGrid`, e o valor passado à prévia      |
| `src/.../trip/shared/trip.types.ts`                              | `CreateTripBody.dailyAllowanceDays?: number`                                    |
| `src/.../trip/shared/tripClient.service.ts`                      | `createTrip` manda o campo por espalhamento condicional                         |
| `src/.../trip-financials/shared/tripFinancialsClient.service.ts` | `previewValuation` ganha o mesmo campo, mesmo espalhamento                      |
| `src/.../trip-financials/hooks/useTripValuationPreview.hook.ts`  | o campo entra na chamada e na `queryKey` — mudar o valor força novo cálculo     |
| `src/.../trip/locales/trip{,.en}.locale.json`                    | `creation.dailyAllowanceDays` e `creation.dailyAllowanceDaysPlaceholder`        |

As decisões que valem registro:

- **A sugestão é só exibida, nunca recalculada no FE.** Nenhum dos arquivos tocados contém `86400` —
  a suíte afirma isso por leitura de arquivo, não só pela ausência de um teste que quebraria. Quem
  sugere é `suggestAllowanceDays` na API; o FE lê `days`/`daysOrigin` da resposta, como desde a T11.
- **Ausente nunca é `0` nem `null`.** `resolveDailyAllowanceDaysInput` recusa vazio, espaço, `'0'`,
  negativo e não-dígito, todos devolvendo `undefined`; e todo ponto de rede usa espalhamento
  condicional (`...(x === undefined ? {} : { x })`) — nunca `dailyAllowanceDays: undefined` explícito,
  que sob `exactOptionalPropertyTypes` é um valor diferente de "chave ausente" no JSON.
- **A prévia recebe o campo, não só a criação.** Esse era o defeito que a task existe para evitar:
  `useTripValuationPreview` manda `dailyAllowanceDays` no corpo do `POST /trips/valuation-preview` e
  o inclui na `queryKey`, então digitar um novo valor invalida o cache e dispara novo cálculo.
- **`0` e negativo nunca chegam à rede.** Coberto na função pura (`resolveDailyAllowanceDaysInput`)
  antes de qualquer requisição existir — o zod da API (`min(1)`) nunca vê esses valores partindo do
  diálogo de criação rápida.

### Divergências registradas, não corrigidas

- **A ordem do TDD foi quebrada em duas edições feitas antes desta sessão.** `trip.types.ts` e
  `tripClient.service.ts` já tinham `dailyAllowanceDays` quando a suíte nasceu, então 2 das 6
  asserções desse arquivo passaram de primeira — não porque o teste fosse fraco, mas porque a
  implementação chegou antes dele. Registrado, não desfeito.
- **A asserção da `queryKey` foi reescrita depois do vermelho colado acima**, pelo mesmo motivo do
  §16/`format:check`: o array `queryKey` com o novo campo passa de 100 colunas, e o `prettier` o
  quebra em uma linha por item — o que invalidava a checagem original por linha única. A asserção
  passou a recortar o bloco entre `queryKey: [` e o `]` que fecha, e cobrar as duas substrings
  (`TRIP_VALUATION_PREVIEW_QUERY_KEY` e `dailyAllowanceDays`) nesse bloco, em vez de numa linha só.
  O alvo do teste não mudou — o campo continua obrigatório na chave — só o modo de verificar.
- **Nenhum arquivo tocado nesta task refatora `TripQuickCreateDialog.component.tsx`.** Ele estava em
  454 linhas antes desta task e termina em 470, sobre o teto de 200 do repositório — dívida anterior
  à spec 143 (a T9 já adicionou campos a ele sem extrair nada). O mesmo vale para
  `DriverQuickCreateDialog.component.tsx` (359 linhas) e `DriverForm.component.tsx` (341 linhas), que
  esta task não tocou. Uma versão anterior deste briefing pedia extrair o diálogo; foi revogada
  explicitamente, e refatorar um arquivo pré-existente por causa de uma task de um campo só é decisão
  do usuário, não do executor — fica só registrado aqui.

### Gates

| Gate               | Comando                                              | Resultado                                                         |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Typecheck          | `bun run typecheck` (raiz, 6 apps)                   | ✅ limpo                                                          |
| Testes do frontend | `bun run --cwd apps/frontend-transportada test`      | ✅ **4119 pass · 0 fail** · 35958 expect() · 29 arquivos · 3,60 s |
| Testes da API      | — (nenhum arquivo de `apps/api-transportada` tocado) | não aplicável — nenhum contrato da API foi alterado               |
| Lint               | `bun run lint`                                       | ✅ limpo — 6 apps                                                 |
| Formatação         | `bun run format:check`                               | ✅ limpo                                                          |

Baseline batido: FE 4112 → **4119** (as 6 da suíte nova, mais uma linha de `import`), com **0 fail**
e nenhum teste a menos. Isolada: `bun test test/trip.contract.test.ts` dá **894 pass · 0 fail ·
17663 expect()**.

⚠️ **`make smoke` não foi executado** — Docker fora do ar nesta máquina, como no T12. A verificação
foi **estática, por leitura**: `test/trip-smoke.helper.ts` e `test/responsive.smoke.spec.ts`
interceptam `/trips`, `/trips/valuation-preview` e as demais rotas por **padrão de URL e método**,
nunca por corpo estrito — a única asserção de `postDataJSON()` no arquivo é sobre
`/trips/:id/mdfe-requirement`, alheia a este campo. Um campo novo e opcional no corpo da requisição
não quebra um mock que não lê aquele corpo. Nenhum arquivo de smoke foi alterado. Isso é leitura, não
execução.
