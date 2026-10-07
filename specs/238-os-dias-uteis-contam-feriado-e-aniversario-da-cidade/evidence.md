# Evidência — 238

## T1.1 — política pura `business-calendar.policy.ts` (2026-10-06)

Executada com `opus` sobre o desenho validado pelo `architect` (`opus`). Worktree `angry-hamilton-090c30`, branch
`work/spec-232-momento-do-evento` (1 commit de docs da 237 à frente de `origin/staging`, de outra sessão).

- **Contrato antes** (`290ff3a6e`): `test/business-calendar.contract.test.ts` (entrada fina, na lista explícita do
  `test` do `package.json`) + suítes em `test/business-calendar/` + `test/fixtures/business-calendar.fixture.ts`.
  Vermelho por `Cannot find module '../../src/business-calendar/…'` (o módulo não existia).
- **Implementação** (`6e2a3e731`): `src/business-calendar/domain/` (`business-calendar.policy.ts`,
  `business-calendar-build.policy.ts`, `national-holiday.policy.ts`, `holiday-rule.policy.ts`, `civil-date.policy.ts`,
  `business-calendar.types.ts`, `business-calendar.error.ts`, `business-calendar.constant.ts`) e
  `src/business-calendar/application/civil-date.service.ts` (`toCivilDate`). O mesmo commit dividiu o contrato de
  erros (>200 linhas) em `business-calendar-coverage.contract.ts` e passou o helper a receber objeto, **sem mudar
  expectativa**: 121 pass / 267 `expect()` antes e depois da divisão.
- **Verde:** `bun --env-file=../../.env.test test ./test/business-calendar.contract.test.ts` → **121 pass, 0 fail**.
- **Gates** (cwd `apps/api-transportada`): `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`);
  contratos `bun --env-file=../../.env.test test --timeout 120000` → **10174 pass / 25 skip / 0 fail** (antes:
  10053 / 25 / 0, medido no início da tarefa; +121 = os novos); `bun run format:check` na raiz → limpo.

### A tabela foi conferida à mão antes do código

As 58 linhas (somas, dia 0, contagens, explicação) foram refeitas por raciocínio próprio contra o calendário civil
(Páscoa 2025 = 20/04, 2026 = 05/04, 2027 = 28/03, 2028 = 16/04, 2000 = 23/04; dias da semana a partir de 01/01 de
cada ano). **Nenhuma divergência** com a tabela do `architect`. Observação: as linhas 14–16 (Corpus Christi) não são
sensíveis a um Corpus deslocado em −1 dia — a data inicial cai no feriado deslocado e o dia 0 avança para o mesmo
resultado; a mutação "Corpus +59" é pega pela lista de 2026 e pela paridade, não pela tabela.

### CA1 da spec estava errado — corrigido

A redação anterior do CA1 ("pula o fim de semana e um feriado municipal na terça") levava a **2026-10-15** e
esquecia que **12/10/2026 é segunda e é feriado nacional** (Nossa Senhora Aparecida). Com o municipal de Campinas
em 13/10, sexta 09/10 + 3 dias úteis = **2026-10-16** (14, 15, 16). Sem o municipal (São Paulo) dá 2026-10-15. O
`spec.md` § CA1 foi reescrito com os dois resultados (linhas 1 e 2 da tabela).

### Prova por mutação (cada uma derrubou teste; restaurada; `git diff --quiet` limpo ao fim)

| Mutação                                                     | Vermelho                                           |
| ----------------------------------------------------------- | -------------------------------------------------- |
| Sem expansão anual (`yearly` só no primeiro ano)            | 4 fail (CA2 2027, calendário saturado)             |
| Sábado contado como útil                                    | 37 fail (linhas 1, 2, 4, …)                        |
| UF ignorada (estadual vale em toda UF)                      | 3 fail (linhas 36, 38, explicação estadual)        |
| Feriado de fim de semana transferido para a segunda         | 12 fail (linhas 19, 23, 26, …)                     |
| Sem avanço do dia 0                                         | 10 fail (linhas 4, 5, 6, …)                        |
| Carnaval −46 (a terça vira quarta de cinzas)                | 5 fail (linhas 8, 10, 44, …)                       |
| Corpus Christi +59                                          | 2 fail (lista de 2026, paridade 1900–2199)         |
| 29/02 cai em 28/02 no ano comum                             | 1 fail (linha 43)                                  |
| 29/02 cai em 01/03 no ano comum (estouro do `Date.UTC`)     | 1 fail (explicação BH 2027-03-01)                  |
| Getter local no dia da semana (`getDay`)                    | 1 fail (subprocesso `TZ=America/Sao_Paulo`)        |
| Getters locais na data (`getDate`/`getMonth`/`getFullYear`) | 1 fail (subprocesso `TZ=America/Sao_Paulo`)        |
| Sem teto de largura da cobertura                            | 1 fail (cobertura acima de cinco anos)             |
| Caminhada sem limite da cobertura                           | 3 fail (fora da cobertura, calendário saturado ×2) |
| Data fora da cobertura aceita ("sem feriado")               | 1 fail (fora da cobertura)                         |
| `once` repetido todo ano                                    | 2 fail (linha 41, CA2 único)                       |
| Contagem inclui o dia inicial                               | 7 fail (linhas 51–58)                              |
| Regra estadual de UF inexistente ignorada                   | 1 fail (regra estadual corrompida)                 |

⚠️ **`bun test` roda o processo em UTC**: as duas mutações de getter local passam em todos os testes do processo e
só o subprocesso com `TZ=America/Sao_Paulo` as pega (`time-zone-probe.ts`). Por isso o teste de fuso é por
subprocesso, e o UTC também é sondado.

### Divergências do desenho validado (todas com motivo)

1. **Mais arquivos no domínio:** `civil-date.policy.ts` (texto ↔ inteiro), `holiday-rule.policy.ts` (conferência e
   expansão das regras) e `business-calendar-build.policy.ts` (montagem), para manter arquivo ≤200 linhas e um
   conceito por arquivo. `business-calendar.policy.ts` reexporta `buildBusinessCalendar`, então a superfície pedida
   continua num import só. `toCivilDate` foi junto, em `application/civil-date.service.ts`.
2. **Código novo `BUSINESS_CALENDAR_INVALID_COVERAGE`**: cobertura invertida, fracionária ou fora de 1583–9999 (e ano
   inválido em `listNationalHolidays`). Nenhum dos códigos da lista descrevia isso — `COVERAGE_TOO_WIDE` diria uma
   coisa falsa. 1583 é o primeiro ano inteiro do calendário gregoriano, onde a Páscoa de Meeus vale.
3. **Contrato em sete arquivos** (`…-add`, `…-count`, `…-coverage`, `…-errors`, `…-saturation`, `…-time-zone`,
   `national-holiday-parity`) em vez de um `business-calendar.contract.ts`, pelo teto de 200 linhas. O `package.json`
   lista **só a entrada** `business-calendar.contract.test.ts`, que importa as suítes — é a convenção da API
   (`test-registry` cobra as entradas; listar as suítes as rodaria duas vezes).
4. **Casos além da tabela:** "29/02 nunca cai em 01/03" (BH, 2027-03-01) — nenhuma linha pegava essa mutação;
   explicação de feriado em domingo, estadual por UF e sábado útil; CA2 por `isBusinessDay`; `toCivilDate` na virada
   do dia e do ano; a sonda de fuso roda também em UTC; teto de 366 aceito; 5000 regras aceitas.
5. **Formato da causa:** `{ source: 'national', key }` | `{ source: 'state', name }` |
   `{ source: 'municipal', kind, name }`. Chaves nacionais: `universal_fraternization`, `carnival`, `good_friday`,
   `tiradentes`, `labour_day`, `corpus_christi`, `independence_day`, `our_lady_of_aparecida`, `all_souls_day`,
   `republic_proclamation`, `black_consciousness`, `christmas`. A linha 44 sai
   `[{ source: 'national', key: 'carnival' }, { source: 'municipal', kind: 'city_anniversary', name }]`.
6. **Toda regra é conferida, inclusive a de outra cidade** (`INVALID_CITY`/`UNKNOWN_STATE` em regra municipal
   também), pela mesma razão da estadual: dado corrompido não é ignorado.
7. **`BusinessCalendarError` estende `ApiError` com status 422** para todos os códigos (padrão dos `*.error.ts` de
   domínio da API); o mapeamento numa rota fica para a T1.3.

### Pendências decididas pelo usuário (2026-10-06; ADR-0096 § "Decisões do usuário")

A T1.1 levantou Q1–Q3 como [NEEDS CLARIFICATION]; o usuário as decidiu no chat. A política não muda: recebe regras
`once` e `yearly` e um `cityIbgeCode`.

- **Q1 — decidida:** o roteirizador casa `holiday_on = input.date`
  (`apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts:1053-1059`). O feriado
  `yearly` (aniversário incluído) fica guardado como regra "todo ano" para a política **e** é materializado
  automaticamente como uma data fixa por ano em `municipal_holidays` (rotina que gera os próximos anos); o roteirizador
  continua lendo só datas fixas e **não é alterado**. Desenho dos dados e da rotina: T1.2/T1.3; a migration em tabela
  existente segue exigindo aprovação humana específica.
- **Q2 — decidida:** a cidade do feriado é sempre o **destino físico** da carga, resolvido pelo chamador com
  `resolvePhysicalDestination` (desvio manual → `<entrega>` → `<enderDest>`, spec 073), nunca o endereço cadastrado do
  destinatário. A política recebe só o `cityIbgeCode`. A spec 238 (§ Dúvidas e RF6) foi ajustada; 236/237 ficam com o
  coordenador (destrava a M6 da 237).
- **Q3 — decidida:** fuso fixo de São Paulo (`America/Sao_Paulo`), sem coluna por empresa.

### O que não rodou

- Integração (`test:integration`): a T1.1 não toca banco, rota, migration, worker nem cron.
- `make check` completo (frontend, worker, build de todas as apps): só os gates da API e o `format:check` da raiz.
- Push/deploy: não é desta tarefa (quem publica é o orquestrador).

## T1.2a — caracterização do roteirizador antes da migration (2026-10-07)

Executada com `sonnet` em worktree isolado, branch `work/238-t12a` a partir de `origin/staging` (c298f9b20). Nenhum
código de produção, migration, `municipal_holidays` ou contrato do solver foi tocado: só teste e docs.

- **Arquivo:** `apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts` (na lista
  explícita de `test:integration`). Repositório, efeito, solver e banco reais; só a matriz é dublê (ADR-0044 §1). Passa
  das 200 linhas (305) porque a semeadura de nota, destinatário, endereço e janela por cliente é tabela de INSERTs.
- **Efeito observável:** cliente fechado vira janela `(0,0)` em `resolvePoolWindow`, e o solver declara a violação
  `delivery_window` na parada (`route_suggestion_stops.violations`). A data do roteiro é o dia UTC de hoje
  (`startOfUtcDaySeconds(new Date())`, não injetável); o teste a calcula por cenário.
- **Só o pool lê feriado.** `municipalHolidays` aparece em um único ponto do worker (`readPoolWindows`, ~1053); a
  sugestão de viagem (`readStops`) não resolve janela de cliente.

### Comportamento atual medido

| Cenário                                                              | Resultado                                   |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Sem feriado                                                          | ninguém fechado                             |
| Feriado `once`, cidade da parada, data do roteiro                    | parada fechada (`delivery_window`)          |
| Mesmo feriado em ontem/amanhã                                        | ninguém fechado                             |
| Feriado de cidade sem parada no roteiro (outra cidade)               | ninguém fechado (`inArray` por cidade)      |
| Feriado de outra empresa                                             | ninguém fechado                             |
| `holiday_on = 2000-MM-DD` (formato `yearly` da opção A)              | ninguém fechado: o solver nunca lê `yearly` |
| **Defeito pré-existente:** feriado só da cidade B, roteiro com A e B | **A e B fechadas** (deveria ser só B)       |

### Defeito conhecido (fora de escopo da 238)

> **Corrigido em 2026-10-07, por decisão do usuário, antes de a importação de feriados valer** (F1 do roteirizador,
> branch `work/roteirizador-feriado-por-cidade`): o feriado vale só para a parada da cidade dele. Ver
> § "F1 do roteirizador — feriado por cidade" ao fim deste arquivo. O texto abaixo é a caracterização do defeito.

`readPoolWindows` busca só `holidayOn` das cidades das paradas do roteiro e passa **a mesma lista a todo cliente**:
o feriado da cidade B fecha também o cliente da cidade A, desde que as duas tenham parada no mesmo roteiro. O teste o
fixa com `// comportamento atual (defeito conhecido, spec 238 fora de escopo)`; quem corrigir inverte a asserção.
Relevante para a T1.3: materializar o feriado anual por ano **não** muda isso, mas aumenta quantas linhas o defeito
alcança.

### Prova por mutação (cada uma restaurada com `git checkout`; `git diff --quiet` limpo)

| Mutação no repositório/política                                                            | Vermelho                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Data do filtro SQL trocada por `'2000-01-01'`                                              | 2 fail: "once fecha" e o do defeito da cidade |
| Filtro SQL por `holidayOn` removido **só no SQL**                                          | 0 fail — mutante equivalente (ver abaixo)     |
| Filtro SQL por data removido **e** política (`delivery-window.policy.ts`) ignorando a data | 2 fail: "outra data" e "2000-MM-DD"           |
| Filtro por `companyId` removido                                                            | 1 fail: "feriado de outra empresa"            |
| Filtro por cidade (`inArray` de `cityIbgeCode`) removido                                   | 1 fail: "cidade sem parada no roteiro"        |

⚠️ **O filtro de data tem duas camadas**: a consulta SQL e `resolveDeliveryWindow` (`holiday.holidayOn === date`).
Remover só a do SQL não muda comportamento; por isso a prova do teste de data só fica vermelha derrubando as duas.

### Gates

- `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `bun run test` (contratos) → **1991 pass / 0 fail**.
- Integração nova isolada → **7 pass / 0 fail** (28 `expect()`).
- `test:integration` completo, uma vez, no banco descartável `t238t12a_worker_integration` (Postgres do Docker em
  65432, migrado com `db:migrate` desta árvore) → **212 pass / 4 skip / 0 fail** (216 testes, 47 arquivos). Os 4
  `skip` são testes que se autodesativam sem dependência opcional; não identifiquei quais (o `bun` não lista pulados),
  e nenhum falhou — `osrm-routing-matrix` e `contractor-mail-inbound-outbox` não falharam nesta execução.

### O que não rodou

- `make check` completo e `make migration-test`: não há migration nesta task.
- Integração da API e frontend: não tocados.
- Push: não é desta tarefa.

## T1.2 — migration aditiva do calendário útil, schemas e contratos (2026-10-07)

Executada com `sonnet` no worktree `angry-hamilton-090c30`, branch `work/spec-232-momento-do-evento`, a partir de
`origin/staging` (`9e4837a43`; `fetch` e `rebase` com saída 0). Desenho **B1** fechado pelo `architect` (`opus`) e
autorizado pelo usuário no chat (2026-10-07) **só para staging**; produção continua exigindo aprovação específica. Nada
foi publicado (push é de quem orquestra).

- **Contrato antes** (`858f7a745`, vermelho): schemas (`test/business-calendar-schema/`), migration estática
  (`test/database-migration/business-calendar.static.contract.ts`), CHECKs e FK no banco
  (`business-calendar*.assertion.ts`, ligado em `database-migration.integration.ts`) e o caso novo do roteirizador.
  Vermelho pelo motivo certo: `SyntaxError: Export named 'municipalHolidayRules' not found` (schema), `business_calendar
migration is required` (sete testes estáticos + a lista de pastas) e, no worker, `7 pass / 1 fail` num banco migrado
  **sem** a T1.2 (o caso novo, porque a tabela ainda não existia).
- **Migration + schemas** (`b134e60c5`): pasta única `drizzle/20261007140303_business_calendar/` (posterior a
  `20261007133324_cargo_preview_retention`), `snapshot.json` encadeado (`prevIds` = id do snapshot da retenção) pelo
  `db:generate --name business_calendar`, depois ajustada à mão (ordem, `NOT VALID` + `VALIDATE`, `lock_timeout`). O
  `db:generate` seguinte devolve `{"status":"no_changes"}`.
- **Constante neutra** `src/shared/business-calendar.constant.ts`: as 27 UFs, os vocabulários e o padrão de cidade
  moram em `shared/` porque o schema não importa de domínio (molde da retenção); o domínio importa de lá e reexporta,
  então a T1.1 não mudou (121 testes seguem verdes). `schema-check.constant.ts` ganhou `monthDayInRangeSql`, o CHECK de
  dia do mês compartilhado pela regra municipal e pelo feriado estadual.

### O que a migration toca em `municipal_holidays` (a tabela já publicada) — linha a linha

Seis comandos, exatamente estes e nesta ordem (fixados por `business-calendar.static.contract.ts`):

1. `ALTER TABLE "municipal_holidays" ADD COLUMN "kind" text DEFAULT 'holiday' NOT NULL;` — só catálogo (Postgres ≥ 11);
   as linhas atuais viram `holiday`.
2. `ALTER TABLE "municipal_holidays" ADD COLUMN "source_rule_id" uuid;` — nulo = digitada à mão.
3. `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_kind_check" CHECK ("kind" in ('holiday',
'city_anniversary')) NOT VALID;` e, no comando seguinte,
   `ALTER TABLE "municipal_holidays" VALIDATE CONSTRAINT "municipal_holidays_kind_check";` (SHARE UPDATE EXCLUSIVE).
4. `ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_company_source_rule_fk" FOREIGN KEY
("company_id","source_rule_id") REFERENCES "municipal_holiday_rules"("company_id","id") ON DELETE CASCADE ON UPDATE
CASCADE;` — MATCH SIMPLE: nulo não é conferido; vem depois do `CREATE TABLE` das regras.
5. `CREATE INDEX "municipal_holidays_company_source_rule_idx" ON "municipal_holidays" ("company_id","source_rule_id")
WHERE "source_rule_id" is not null;` — SHARE na tabela enquanto constrói (o migrador aplica a pasta numa transação
   só, sem `CONCURRENTLY`).

**Nada mais**: nenhum INSERT, UPDATE, DELETE, backfill, DROP, RENAME ou `ALTER COLUMN` na migration inteira. O unique
`(company_id, city_ibge_code, holiday_on)`, `holiday_on`, `municipal_holidays_city_check` (`^[0-9]{7}$`), o nome e a
tabela em si não mudam. A cópia do schema no worker (`delivery-client.schema.ts`, `holidayOn notNull`) **não** foi tocada.
`SET LOCAL lock_timeout = '3s'` abre a pasta e volta a `DEFAULT` no fim; o custo de lock está no cabeçalho do SQL.

Tabelas novas (nascem vazias): `municipal_holiday_rules`, `state_holidays`, `company_business_calendar_settings`
(campos, CHECKs, únicos e FKs: ADR-0096 §5). Todo identificador tem ≤ 63 bytes (checado no schema e no SQL).

### Medir antes de levar a produção (passo do usuário/ops — **não** rodei: nunca leio banco de produção)

O `ADD COLUMN`/`CREATE INDEX` pesam pelo tamanho da tabela, e as linhas existentes entram na leitura da T1.3. Em
**staging primeiro**, depois em produção, com o usuário de leitura:

```sql
select count(*) from municipal_holidays;                                      -- custo do ALTER e do índice
select count(*) from municipal_holidays where extract(year from holiday_on) = 2000;   -- resto do formato 2000-MM-DD
select count(*) from municipal_holidays where city_ibge_code !~ '^[1-5][0-9]{6}$';    -- a política recusa essas cidades
select count(*) from municipal_holidays
  where substr(city_ibge_code, 1, 2) not in ('11','12','13','14','15','16','17','21','22','23','24','25','26','27',
    '28','29','31','32','33','35','41','42','43','50','51','52','53');        -- UF fora das 27
select count(*) from municipal_holidays where char_length(name) > 120;        -- a rota nova limita o nome a 120
select company_id, count(*) from municipal_holidays group by 1 order by 2 desc limit 1;  -- maior empresa
```

Nenhum resultado bloqueia **esta** migration (os CHECKs novos são das tabelas novas; o de `kind` vê só o default
`holiday`). Importam para a T1.3: cidade fora do padrão faria a política recusar o calendário daquela empresa
(`BUSINESS_CALENDAR_INVALID_CITY`/`UNKNOWN_STATE`), e nome acima de 120 não editaria pela rota nova.

### Banco: o que o contrato prova (`business-calendar*.assertion.ts`, dentro de `db:test`)

Recusam: cidade de 6/8 dígitos, com 0 ou 6 na frente, com letra e vazia (`city_check`); UF inexistente com regex ok
(`34`, `10`, `54`: `state_check`); mês 13/0, dia 0/32, 31/04, 31/06, 31/09, 31/11, 30/02 (`month_day_check`); `kind`
inválido; nome vazio e de 121 caracteres; regra duplicada (empresa + cidade + dia). Aceitam: 29/02, 30/04, 31/12,
nome de 120. A mesma cidade e dia em **outra empresa** é aceita (o unique inclui a empresa). `municipal_holidays`: o
INSERT antigo, sem `kind`, vira `holiday` com origem nula; `kind` inválido é recusado; `source_rule_id` de regra de
**outra empresa** é recusado pela FK composta (`23503`); data gerada colidindo com a digitada é `23505`; apagar a regra
apaga só as datas dela e **a digitada (origem nula) fica**. `state_holidays`: `weekly`, UF `99`/`3`, nome vazio/121,
`once` sem data, `once` com mês, `yearly` com data, `yearly` **sem mês, sem dia ou sem os dois** (o buraco do NULL),
13/1, 31/04, 30/02, dia 0 — todos recusados; 29/02 `yearly` aceito; os dois únicos parciais recusam a repetição de cada
forma e deixam `once` e `yearly` coexistirem. `company_business_calendar_settings`: nasce `false`, uma linha por
empresa, FK recusa empresa que não existe.

**Rollback e reaplicação:** com regra, duas datas geradas e uma digitada gravadas, o `rollback.sql` remove as três
tabelas, as duas colunas, a FK, o índice e a linha do journal (verifica 1 linha), e as **três datas ficam** em
`municipal_holidays` (`2026-07-14`, `2026-09-20`, `2027-07-14`); `runDatabaseMigrations` reaplica e as linhas antigas
voltam `holiday` sem origem.

### Roteirizador (T1.2a + caso novo)

`apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts`, banco descartável **próprio**
`t238_t12_worker_it` (criado no Postgres do `.env.test`, migrado com `db:migrate` desta árvore; nenhum banco compartilhado):

| Banco                               | Resultado                                                               |
| ----------------------------------- | ----------------------------------------------------------------------- |
| migrado até a retenção (sem a T1.2) | 7 pass / **1 fail** — o caso novo, `municipal_holiday_rules` não existe |
| migrado com a T1.2                  | **8 pass / 0 fail** — os 7 antigos, sem alteração, e o caso novo        |

O caso novo: uma data com `source_rule_id` (e a regra que a gerou) fecha o cliente na data do roteiro, igual à digitada.
`git diff --quiet` em `apps/worker-transportada/src/routing/` → 0 (nada alterado), e `resolveDeliveryWindow` idem.

### Prova por mutação (cada uma derrubou teste; restaurada com `git checkout`; `git diff --quiet` limpo ao fim)

Duas camadas: o SQL que roda (`migration.sql`, pelo `db:test`) e o schema TS (contrato de schema).

| Mutação                                             | `migration.sql` (db:test)                                  | schema TS (contrato)                       |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| sem o CHECK de dia/mês da regra                     | 1 fail — a integração (constraint ausente)                 | 1 fail — `month_day_check`                 |
| CHECK de dia/mês afrouxado (`day between 1 and 31`) | 1 fail — a integração (31/04 aceito, esperava `23514`)     | —                                          |
| sem `ON DELETE CASCADE` na FK composta              | 2 fail — estático (seis comandos) + integração             | 1 fail — `FK composta … CASCADE`           |
| unique da regra sem a empresa                       | 1 fail — a integração (mesma cidade/dia em outra empresa)  | 1 fail — `única por empresa, cidade e dia` |
| `kind` sem default                                  | 2 fail — estático + integração (INSERT antigo sem `kind`)  | 1 fail — `o tipo nasce holiday`            |
| CHECK de UF removida                                | 1 fail — a integração (constraint ausente)                 | 1 fail — `UF que não existe`               |
| UF `10` aceita na lista do CHECK                    | 1 fail — a integração (`1009502` aceito, esperava `23514`) | —                                          |
| `yearly` sem `is not null` (buraco do NULL)         | 1 fail — a integração (`yearly` sem mês aceito)            | —                                          |
| sábado útil por padrão (`DEFAULT true`)             | 1 fail — a integração                                      | —                                          |

⚠️ A primeira tentativa da mutação "`kind` sem default" passou limpa (116 pass): o `replace` tinha atingido o
**comentário** do cabeçalho, que cita o mesmo texto. O harness passou a mirar o comando com o `;` final.

### Gates

- `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `bun run format:check` na raiz → limpo.
- Contratos da API (`bun --env-file=../../.env.test run test`, lista do `package.json`; e `test --timeout 120000`, descoberta
  padrão) → **10523 pass / 25 skip / 0 fail**, 201 arquivos. Antes **10498 / 25 / 0** (derivado: 10523 − 18 do contrato de
  schema − 7 do contrato estático; não medi a linha de base separadamente).
- `db:test` com `DRIZZLE_TEST_DATABASE_URL` do `.env.test` → **153 pass / 0 fail**; `make migration-test` → **153 pass /
  0 fail** (mesmo `db:test`, contra o Postgres local do compose). `migration-completeness.integration.ts` → 3 pass.
- `bun run db:generate` → `no_changes`.

### O que não rodou

- `test:integration` da API inteira (~17 min): nenhuma integração da API toca `municipal_holidays` nem as tabelas novas;
  rodei `migration-completeness` e o `db:test`. A integração completa do **worker** também não — só a do roteirizador.
- `make check` completo (frontend, build de todas as apps).
- As consultas de medição acima (passo do usuário/ops) e qualquer migration em staging/produção.
- Push e deploy: de quem orquestra.

### Para a T1.3 (herdado desta task)

- `POST /municipal-holidays` hoje faz `ON CONFLICT (company_id, city_ibge_code, holiday_on) DO UPDATE SET name`: se o
  operador redigitar uma data **gerada** por uma regra, o nome muda mas `source_rule_id` fica, e a data some junto com a
  regra. Decidir na T1.3 se redigitar zera a origem.
- O defeito do roteirizador da T1.2a (feriado de uma cidade fecha o cliente de outra no mesmo roteiro) segue de pé e agora
  alcança até 10 linhas por regra "todo ano".

## T1.3 — repositório, geração das datas e rotas do calendário de dias úteis (2026-10-07)

Executada com `sonnet` no worktree `angry-hamilton-090c30`, branch `work/spec-232-momento-do-evento`, sobre `origin/staging`
(`fetch` e `rebase` com saída 0; `bun install --frozen-lockfile` sem mudança). Desenho fechado pelo `architect` (`opus`),
ADR-0096 §6. Nenhuma migration, nenhuma mudança no roteirizador (`apps/worker-transportada/src/routing/**` e
`resolveDeliveryWindow` intocados), nenhuma tela, nada publicado (push é de quem orquestra).

- **Contrato antes** (`7dde3c838`, vermelho): HTTP por rota (`test/business-calendar-rules/`), casos de uso, geração
  pura, tenant no fonte (`test/business-calendar-schema/tenant-safety.contract.ts`), integração contra Postgres
  (`test/integration/`) e o caso novo do roteirizador no worker. Vermelho pelo motivo certo: `Cannot find module
'../../src/business-calendar/…'` (domínio, aplicação, infraestrutura e apresentação não existiam).
- **Repositório, geração e casos de uso** (`a5db911aa`): `src/business-calendar/{domain,application,infrastructure}`.
- **Rotas** (`ccb178d57`): `src/business-calendar/presentation`, `main.ts`, `shared/api.constant.ts`; as rotas antigas de
  `/municipal-holidays` saem de `delivery-clients/` para o módulo do calendário (o código, o caso de uso e o repositório
  vão juntos: `contractor.routes.ts` já tinha mais de 300 linhas).
- **Estilo** (`04fa2e546`).
- **Docs** (commit seguinte): tasks, evidence, ADR-0096 §6, `docs/ai-context/api-transportada.md`,
  `apps/api-transportada/CLAUDE.md`, `docs/SECURITY.md`.

### O que mudou de observável nas rotas antigas de `/municipal-holidays`

Só acréscimo, mais cinco comportamentos. **Nenhum consumidor tem guarda de chave exata**: o painel não chama a rota
(sem tela, spec 238 Fase 2), o worker lê a tabela por SQL, e o único teste que a cobria (`contractor.contract.ts`)
comparava a resposta do dublê.

| Antes                                                                                    | Agora                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `holidayOn`, `from`, `to` só por regex: `2026-02-30` chegava ao Postgres (erro de banco) | `parseCivilDate` dentro de um `z.string().transform`: **400**                                                                             |
| `from > to` devolvia lista vazia                                                         | **400**                                                                                                                                   |
| resposta `{ cityIbgeCode, holidayOn, id, name }`                                         | acrescenta `kind` e `generatedByRuleId`                                                                                                   |
| `POST` sem `kind`                                                                        | continua **201**; o feriado novo é `holiday` e o recadastro mantém o tipo da linha                                                        |
| `POST` numa data gerada por regra: mudava só o nome e deixava `source_rule_id`           | **adoção**: nome, tipo e `source_rule_id = NULL` (a linha vira do operador)                                                               |
| `DELETE` apagava qualquer linha                                                          | de linha **gerada**: **409** `MUNICIPAL_HOLIDAY_GENERATED_BY_RULE`; de digitada sobre o dia de uma regra: apaga e gera de novo a da regra |
| sem `PATCH`                                                                              | `PATCH /:id` (`name`, `kind`), 409 na gerada, 404 se não existe                                                                           |
| nenhuma escrita auditava                                                                 | toda escrita grava `audit_logs` na mesma transação (ator, alvo, IP, antes/depois)                                                         |

Inalterado: `fleet.read` para ler, `settings.manage` para escrever; município em sete dígitos (o CHECK do banco antigo — a
política recusa a cidade fora do padrão quando for lida); campo desconhecido no corpo continua 400; apagar o que não
existe continua 204.

### Gates

- `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `npx prettier --check` (api e testes do worker) →
  limpo; `bun run build` → ok; `bun run db:generate` → `no_changes`.
- Contratos da API (`bun --env-file=../../.env.test test --timeout 120000` e `run test`, a lista do `package.json`) →
  **10575 pass / 25 skip / 0 fail**, 202 arquivos. Antes (T1.2): **10523 / 25 / 0**. +52 líquido: os novos contratos, menos
  os quatro testes de feriado que saíram de `contractor.contract.ts` e foram reescritos em `test/business-calendar-rules/`.
- `db:test` (`DRIZZLE_TEST_DATABASE_URL`) → **153 pass / 0 fail** (igual à T1.2: não há migration nova);
  `migration-completeness.integration.ts` → 3 pass.
- Integrações novas, **um arquivo por vez**, banco descartável de cada teste (`transportada_bizcal_*`, criado, migrado e
  derrubado pela fixture): `business-calendar-rules` 3, `…-rule-conflicts` 3, `…-rule-edit` 3, `…-rule-validation` 2,
  `municipal-holiday-interplay` 5, `municipal-holiday-generated` 4, `business-calendar-load-rules` 4,
  `…-load-limits` 2, `…-tenant-safety` 2, `…-tenant-writes` 3, `…-state-and-settings` 6 → **37 pass / 0 fail**.
  Existentes tocadas de perto, uma por vez: `delivery-charge-end-to-end` 1, `contractor-receiving-profile` 4,
  `company-settings-repository` 3, `location-retention-settings` 7 → todas verdes. Nenhuma integração antiga lê
  `municipal_holidays`.
- **Roteirizador:** `route-optimization-municipal-holiday.integration.test.ts` no banco descartável próprio
  `t238_t13_worker_it` (criado no Postgres do `.env.test`, migrado com `db:migrate` desta árvore, derrubado ao fim) →
  **9 pass / 0 fail**: os 7 da T1.2a e o da data materializada **sem alteração**, mais o novo — uma regra "todo ano"
  **sem** linha gerada para o ano do roteiro **não** fecha o cliente (só a data fixa vale).
  `git diff 7f739a288 HEAD -- apps/worker-transportada/src apps/api-transportada/drizzle` vazio (nada de roteirizador nem de migration).

### Prova por mutação (cada uma derrubou teste; restaurada com `git checkout`; `git diff --quiet` → 0 depois de cada)

| Mutação                                              | Vermelho                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| M1 `DO UPDATE` no lugar de `DO NOTHING` na geração   | 2 fail — "a data que o operador já digitou vence", "gerar de novo não muda nada, nem os ids" |
| M2 sem o caso bissexto (29/02 em todo ano)           | 3 fail — as duas da conta pura e "29/02 só gera os anos bissextos" (integração)              |
| M3 `loadRules` inclui as geradas                     | 3 fail — o contrato de fonte (`isNull(sourceRuleId)`) e duas da leitura                      |
| M4 `loadRules` sem o filtro de empresa               | 1 fail — "a empresa B não lê regra, feriado, estadual nem configuração"                      |
| M5 editar apaga a digitada junto (escopo do cascade) | 1 fail — "editar regenera … nem apaga a digitada"                                            |
| M6 sem `.strict()` no corpo da regra                 | 1 fail — "campo desconhecido é 400"                                                          |
| M7 sem `parseCivilDate`                              | 4 fail — rotas antigas e estadual (`2026-02-30`, `2027-02-29`, `2026-13-01`)                 |
| M8 adoção sem zerar `source_rule_id`                 | 2 fail — "adotar … sobrevive à exclusão da regra" e "apagar a digitada gera de novo"         |
| M9 `DELETE` de gerada aceito                         | 1 fail — "apagar a gerada é 409 e a linha continua lá"                                       |
| M10 apagar a digitada não regenera a da regra        | 1 fail — "apagar a digitada sobre o dia da regra gera de novo"                               |
| M11 apagar feriado sem filtro de empresa             | 1 fail — "a empresa B não apaga nenhum deles, nem a gerada"                                  |

⚠️ **"CASCADE apagando linha digitada"** (M5): o `ON DELETE CASCADE` é a FK da T1.2, que só alcança linhas com
`source_rule_id` (MATCH SIMPLE) e já tem a prova dela em `db:test`. A mutação da T1.3 é o equivalente na aplicação — o
`DELETE` das geradas antes de regenerar numa edição, que é o outro lugar onde a digitada correria risco.
⚠️ M4 não é pega pelo contrato de fonte (a janela de 700 caracteres a partir do `.from(` já contém `companyId` da
consulta vizinha); quem a pega é o teste com dois tenants. O contrato de fonte é rede grossa, não prova.

### Decisões que divergiram do desenho ou o completaram (todas com motivo)

1. **`PATCH /municipal-holidays/:id` muda só `name` e `kind`.** Data e cidade são a identidade da linha (unique) e mexer
   nelas tornaria o "regenera a da regra" ambíguo; para mudar o dia, apaga-se e cadastra-se.
2. **Auditoria também nas escritas das rotas antigas** (`POST`/`PATCH`/`DELETE /municipal-holidays`): leio "toda escrita
   grava `audit_logs`" como global, e o `POST` ganhou efeito colateral (adoção). Efeito: a rota antiga recebe o ator.
3. **As rotas, o caso de uso e o repositório antigos de feriado saíram de `delivery-clients/`** para `business-calendar/`
   (arquivo ≤ 200 linhas; `contractor.routes.ts` tinha 300). `createContractorRoutes` perdeu `listHolidays`,
   `removeHoliday` e `saveHoliday`; os testes de feriado foram para `test/business-calendar-rules/`.
4. **Regeneração ao apagar a digitada só dentro do horizonte** (ano corrente até `materialized_through_year`). Fora dele a
   data nunca foi da regra; regenerar mentiria sobre o alcance.
5. **`PATCH /state-holidays/:id` exige `recurrence`** (a forma da união) e, no `yearly`, `month` e `day` juntos (ou
   nenhum); forma diferente da gravada → 400 `STATE_HOLIDAY_RECURRENCE_MISMATCH`.
6. **O mapper usa os tipos reais da T1.1** (`occurrence: { recurrence, … }`), não o formato plano do enunciado.
7. **Id que não é UUID canônico em `PATCH`/`DELETE` dá 404**, não 400: o roteador (`canonicalUuid`, padrão) nem entrega
   a rota. Id de **outra empresa** é ausência (null → 404 no `PATCH`, no-op no `DELETE`), nunca 409 — que confirmaria
   que a linha existe.
8. **`DrizzleBusinessCalendarRepository` não está ligado ao `main.ts`**: ainda não há consumidor (236/237 o usarão). Está
   coberto por integração e pelo contrato de fonte.
9. **`materialize` conta `rulesProcessed` = todas as regras examinadas** (inclusive as que já estavam completas); sem
   regras não audita.
10. **Município das rotas antigas segue com sete dígitos**; só as rotas novas exigem UF existente (CA4).
11. **Sem `rateLimit`** nas rotas novas (escritas de configuração, como `driver-allowance`; só o `impact` da 239 tem teto
    por ser consulta cara). O `POST …/materializations` é a mais cara (até 11 linhas por regra, lote de 1000): vale um
    teto se a tela a expuser num botão repetível.
12. **Sem OpenAPI** (ADR-0096 §6): não existe gerador nesta API e não foi inventado.

### Para a T1.4 e a Fase 2

- A tela avisa quando `materializedThroughYear < ano corrente + 2` e chama `POST …/materializations`.
- As quatro fábricas de rota entram nas listas exaustivas `separator-role` e `helper-role`; o separador alcança só
  `GET /municipal-holidays` (já alcançava desde a spec 060; agora está enumerado).
- O defeito do roteirizador da T1.2a (feriado de uma cidade fecha o cliente de outra no mesmo roteiro) segue de pé e agora
  alcança até 11 linhas por regra "todo ano".

### O que não rodou

- `test:integration` da API inteiro (~17 min): rodei as 11 novas, as quatro vizinhas e `migration-completeness`.
- `make check` completo, frontend e `make migration-test` (não há migration; `db:test` rodou, 153 pass).
- Push, deploy, qualquer banco de produção.

## T1.3b — correções da revisão `opus` da Fase 1 (2026-10-07)

Executada com `sonnet` no worktree `angry-hamilton-090c30`, branch `work/spec-232-momento-do-evento`. `git fetch origin` e `git rebase
origin/staging` com saída 0 (staging avançou ~50 commits, nenhuma migration nova depois da `20261007133324_cargo_preview_retention`);
`bun install --frozen-lockfile` sem mudança. Nada publicado: os commits `(spec 238 T1.2)`, `(T1.3)` e estes seguem só locais.

A migration `20261007140303_business_calendar` **não foi publicada**, então foi **editada no lugar** (migration.sql, snapshot.json,
schema TS, contratos), autorizado pelo usuário só para staging. `rollback.sql` não mudou (`DROP TABLE` leva o CHECK novo). Nenhuma
migration nova; `bun run db:generate` → `no_changes`; o snapshot continua encadeado ao da `…133324`. Nada de roteirizador,
`resolveDeliveryWindow` nem cópia do schema do worker.

### O que mudou, item a item

| #   | Achado                                 | Correção                                                                                                                                                                                                                          |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | lock da `municipal_holidays` (MÉDIO)   | os seis comandos foram para o **fim** do arquivo (mesmos seis, mesma ordem entre si); o cabeçalho diz a verdade: ACCESS EXCLUSIVE retido até o COMMIT do lote inteiro, `NOT VALID` não encurta, `lock_timeout` só limita a espera |
| 2   | adoção silenciosa (MÉDIO)              | `POST /municipal-holidays` devolve `adoptedFromRuleId`; `PATCH`/`GET` da regra devolvem `typedHolidaysKept`; `DELETE` da regra grava a contagem no `metadata` (ver decisão 1)                                                     |
| 3   | editar apaga ano passado (MÉDIO)       | o `DELETE` das geradas só alcança `holiday_on >= '<ano corrente>-01-01'`; limite para a 236 registrado no ADR-0096                                                                                                                |
| 4   | `…/materializations` não lia o corpo   | `parseOptionalBody(z.object({}).strict())`: vazio ou ausente vale, campo desconhecido é 400                                                                                                                                       |
| 5   | auditoria de não-mudança               | geração sem linha nova e sem regra avançada, `PUT` do sábado com o mesmo valor e `POST` do mesmo nome/tipo não gravam `audit_logs`                                                                                                |
| 6   | alvo incoerente da geração             | alvo `municipal_holiday_rules` (coleção), `entityId` = empresa                                                                                                                                                                    |
| 7   | idempotência do estadual               | idêntico → 200 com a existente; mesma data com outro nome → 409 `STATE_HOLIDAY_CONFLICT`; criação → 201                                                                                                                           |
| 8   | `materialized_through_year` sem CHECK  | `CHECK (… between 1583 and 9999)` na migration, no snapshot e no schema TS; os limites moraram em `shared/business-calendar.constant.ts` (o domínio os reexporta)                                                                 |
| 9   | repetições e tipos                     | um `readFilter`; `BUSINESS_CALENDAR_MANAGE_POLICY`/`_READ_POLICY` em `presentation/business-calendar-policy.constant.ts`; `LEGACY_CITY_IBGE_CODE_SOURCE` em `shared/`; visões tipadas; guarda `isMunicipalHolidayKind` no mapper  |
| 10  | `helper-role.contract.test.ts` com 202 | a lista de fábricas foi para `test/fixtures/role-contract-routes.fixture.ts`; o teste ficou com 145 linhas                                                                                                                        |
| 11  | só registro                            | rollback+reaplicação, uma ocorrência não suprimível, parâmetro desconhecido em `GET /municipal-holidays` e leituras sem paginação estão em ADR-0096 § Riscos aceitos                                                              |

### O que mudou de observável nas respostas (só acréscimo de chaves, mais três comportamentos)

- `POST /municipal-holidays` (201): `data` ganhou `adoptedFromRuleId` (`string | null`). `GET`, `PATCH` e as demais não ganham a chave.
- `PATCH /municipal-holiday-rules/:id` e `GET /municipal-holiday-rules`: cada regra ganhou `typedHolidaysKept` (`number`). O `POST` da
  regra segue com as nove chaves de sempre (contrato prova a lista). `DELETE` segue **204 sem corpo**.
- `POST /municipal-holiday-rules/materializations` passou a **ler o corpo**: antes ignorava qualquer coisa, agora campo desconhecido é 400.
- `POST /state-holidays` idêntico passou de 409 para **200** com a linha existente; o 409 ficou para o mesmo dia com outro nome.
- `audit_logs`: sem linha nos três no-ops; `municipal-holiday-rule.materialized` agora tem `targetType = 'municipal_holiday_rules'`
  (antes `municipal_holiday_rule` com o id da empresa) e `metadata.rulesAdvanced`; `municipal-holiday.saved` ganhou
  `metadata.adoptedFromRuleId`; `municipal-holiday-rule.updated`/`deleted` ganharam `metadata.typedHolidaysKept`.
- `PATCH` da regra não apaga mais as geradas de anos que já passaram; a política (236) segue lendo a regra `yearly` em todo ano da cobertura.

### Contrato antes (vermelho, comitado) e depois

- Vermelho (`47269e07e`, `2a9ea23d5`): static da migration (ordem, cabeçalho, CHECK) → 3 fail pelo motivo certo; contratos HTTP e
  casos de uso → 15 fail (`typedHolidaysKept` ausente, `adoptedFromRuleId` ausente, `create` sem `{created, holiday}`…); integração
  nova (`rule-typed-dates` 6 fail, `audit-on-change` 4 fail de 7).
- Verde: `ed5018260` (migration), `730a13ca8` (código), `78f2b352b` (helper do ajudante).

### Gates

- `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `bun run build` → ok; `bun run db:generate` → `no_changes`;
  `bun run format:check` (raiz) → limpo.
- Contratos (`bun --env-file=../../.env.test run test`): **10591 pass / 25 skip / 0 fail**, 202 arquivos. Antes (T1.3): 10575 / 25 / 0
  (+16: contratos novos da adoção, da contagem, do corpo, do estadual idempotente e das definições únicas).
- `db:test` (`DRIZZLE_TEST_DATABASE_URL` = `DATABASE_URL` do `.env.test`): **156 pass / 0 fail** (antes 153; +3 da migration: ordem,
  cabeçalho, CHECK). `make migration-test`: 156 pass, saída 0. `migration-completeness`: 3 pass (com a variável; sem ela
  pula — o sinal de que a variável precisa estar exportada).
- Integrações, **um arquivo por vez**, banco descartável de cada teste: `business-calendar-rules` 3, `-rule-conflicts` 3,
  `-rule-edit` 3, `-rule-validation` 2, `-load-rules` 4, `-load-limits` 2, `-tenant-safety` 2, `-tenant-writes` 3,
  `-state-and-settings` 6, `municipal-holiday-interplay` 6 (eram 5), `municipal-holiday-generated` 4, e as duas novas
  `-rule-typed-dates` 6 e `-audit-on-change` 7 → **51 pass / 0 fail**. Vizinhas: `delivery-charge-end-to-end` 1,
  `contractor-receiving-profile` 4, `company-settings-repository` 3, `location-retention-settings` 7.
- **Roteirizador do worker**, banco migrado **próprio** `t238_t13b_worker_it` (criado com `psql … create database`, migrado com
  `db:migrate` desta árvore, derrubado ao fim): `route-optimization-municipal-holiday.integration.test.ts` → **9 pass / 0 fail**,
  iguais à T1.3. `git diff` de `apps/worker-transportada/src` vazio.

### Prova por mutação (cada uma derrubou teste; restaurada com `git checkout`; `git diff --quiet` → 0 depois de cada)

| Mutação                                                         | Vermelho                                                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| M1 (item 2) `adoptedFromRuleId` sempre `null`                   | 2 fail — "adotar a data gerada…" (interplay) e "adotar com o mesmo nome e tipo… continua sendo adoção" (typed-dates) |
| M2 (item 2) contagem sem o corte do ano corrente                | 2 fail — a contagem do `PATCH` e a do `GET`                                                                          |
| M3 (item 3) editar a regra apaga também o ano passado           | 1 fail — "regra criada em 2026 e editada em 2027 mantém a linha de 2026 e regenera de 2027 em diante"                |
| M4 (item 5) geração audita sempre                               | 1 fail — "sem data nova e sem regra avançada, nenhuma linha de auditoria"                                            |
| M5 (item 5) `PUT` do sábado sem o curto-circuito do mesmo valor | 1 fail — "o mesmo valor de novo não grava linha, nem mexe em updated_at"                                             |
| M6 (item 5) `POST` idêntico sem o curto-circuito                | 1 fail — "recadastrar a mesma data com o mesmo nome e tipo não muda nada e não audita"                               |
| M7 (item 7) estadual idêntico volta a ser conflito              | 1 fail — "repetir igual devolve o existente, sem auditar; nome diferente é conflito"                                 |
| M8 (item 6) alvo da geração volta a `municipal_holiday_rule`    | 1 fail — "com data nova, audita contra a coleção de regras da empresa"                                               |
| M9 (item 4) rota sem `parseMaterializationBody`                 | 1 fail — "gerar os próximos anos aceita corpo vazio ou ausente e recusa campo desconhecido"                          |
| M10 (item 8) migration sem o CHECK do ano                       | 1 fail — "o ano até onde a regra foi gerada é limitado ao intervalo do domínio (1583 a 9999)"                        |

### Decisões que divergiram ou completaram o enunciado

1. **`DELETE` da regra segue 204 sem corpo** (o enunciado mandava parar e relatar antes de mudar o status). A contagem sai no `PATCH`,
   no `GET` por regra e no `metadata` da auditoria do `DELETE`. **Decisão aberta do usuário**: se a tela precisar da contagem ao
   apagar, ela lê o `GET` antes (ou o `DELETE` passa a 200 com corpo, mudança de contrato do verbo).
2. **`typedHolidaysKept` conta no dia ANTIGO da regra mesmo quando o `PATCH` só muda nome ou tipo** (a digitada segue lá, valendo).
3. **`PUT` do sábado com o mesmo valor devolve a linha guardada sem escrever**: `updated_at` e `updated_by_user_id` não mudam.
   O primeiro `PUT`, mesmo com o valor padrão (`false`), grava a linha e audita (é mudança: a linha passa a existir).
4. **Adotar com o mesmo nome e tipo que a regra gerou continua sendo adoção** (muda `source_rule_id`): audita e sinaliza.
5. **`BUSINESS_CALENDAR_MANAGE_POLICY` lê a permissão de `BUSINESS_CALENDAR_AUDIT_PERMISSION`**: a trilha registra a que a rota exigiu,
   uma constante só.
6. `LEGACY_CITY_IBGE_CODE_SOURCE` entrou em `shared/` e `database/delivery-client.schema.ts` passou a usá-la (a regex literal saiu
   dali): schema publicado tocado, `db:generate` → `no_changes` prova que o CHECK é o mesmo.
7. O mapper agora **lança** `BusinessCalendarPersistenceError` com tipo fora do vocabulário (antes um `as` deixava a política
   recusar depois, com 422). O CHECK do banco já impede o caso; é defeito, não entrada.

### O que NÃO rodou / limites

- `test:integration` da API inteiro (~17 min), `make check` completo, frontend, `make smoke` — rodei as 13 do calendário, as quatro
  vizinhas e `migration-completeness`.
- O "sem N+1" do `GET` é por construção (uma consulta de regras, uma agregada); **não medi contagem de consultas** num teste.
- `withoutUndefined(...) as MunicipalHolidayRuleChanges` (e o do estadual) continuam como `as`: o item 9 pedia o type guard no mapper.
- `PATCH` da regra sem mudança de valor ainda apaga e regenera as geradas do ano corrente em diante (novos ids) e audita; não pedido.
- Push, deploy, qualquer banco de produção, migration em staging.

## Fase 2 — T2.1 a T2.3: a aba Calendário em Configurações (2026-10-07)

Executada com `sonnet` no worktree `agent-a1862ddacde50ffea`, branch `work/238-fase2`, a partir de `origin/staging` (`git fetch` e `git switch -c` com saída 0;
`bun install --frozen-lockfile` sem mudança). **Só o painel e os docs/prints da spec**: nenhuma linha da API nem do worker. Nada foi publicado (push é de quem
orquestra, depois dos prints aprovados — T2.4 segue `[ ]`).

### O que foi construído

Aba **Calendário** de `/company-settings` (`?tab=businessCalendar`), só com `settings.manage`, sobre as rotas da T1.3: **Sábado é dia útil**; **feriados
municipais** (UF → município pelo IBGE, "todo ano" = regra, "só esta data" = data fixa, adoção e datas mantidas ditas, aviso de horizonte com "Gerar próximos
anos"); **feriados estaduais**. Aviso fixo do roteiro (pt-BR e en) com o MENOR "gerado até". Detalhe e decisões: `docs/ai-context/frontend-transportada.md`
§ "Spec 238 Fase 2" e `apps/frontend-transportada/CLAUDE.md`.

### Contrato antes (vermelho, comitado) e depois

- **Vermelho** (`5d2982d38`): 8 arquivos sem DOM (`test/business-calendar/*.contract.ts`, 96 testes) e 10 de DOM (`test/trip-hooks/business-calendar-*.contract.ts`, 73 testes),
  mais a linha nova de `tabs.contract.ts`. Falha pelo motivo certo: `Cannot find module '@/modules/company-settings/shared/businessCalendarGuards.validation'` e
  `SETTINGS_PANEL_PLACEMENT.businessCalendar` indefinido — os módulos não existiam.
- **Verde** (`c6c17e064`): implementação; mais um achado do contrato de design (`modal-dialog-fullscreen.contract.ts`: overlay fixo fora da lista) — o diálogo de exclusão
  segue o molde tela-cheia no celular e ganhou a linha dele na lista.
- **Guardas de chave exata** provadas com o formato REAL (`test/fixtures/businessCalendar.fixture.ts` espelha `presentation/*.schema.ts`); o dublê da API dos contratos de DOM
  (`businessCalendarClientMocks.helper.ts`) aplica as MESMAS transições da T1.3 (gera 11 datas, a digitada vence, adoção, 409 na gerada).

### Contagens (`bun run test` dentro de `apps/frontend-transportada`)

| Suíte                                | Antes (origin/staging) | Depois                                                                                                               |
| ------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| contratos sem DOM (36 → 37 arquivos) | 7393 pass / 0 fail     | **7492 pass / 0 fail** (+99: 96 do calendário, 2 do `tabs`, 1 da linha nova do diálogo em `modal-dialog-fullscreen`) |
| `test:hooks` (DOM, processo à parte) | 956 pass / 0 fail      | **1029 pass / 0 fail** (+73)                                                                                         |

Gates: `bun run typecheck` → 0; `bun run lint` (cwd na app) → **0 erros** (16 avisos antigos, nenhum em arquivo do calendário); `bun run format:check` na raiz → limpo;
`bun test ./test/shared.contract.test.ts` → 409 pass (o helper de prints obedece ao contrato de mock da foto).

### Estabilidade do DOM (`test:hooks`)

Nenhum `expect(nó).toBeNull()` dentro de `waitFor` (só `querySelectorAll(...).length`, ou fora do `waitFor`); todo arquivo de DOM instala `stubVisibleLayout()` por
`startScenario()` (`businessCalendarHarness.helper.ts`). **10 execuções ociosas: 1029 pass / 0 fail em todas**; **3 execuções com um `yes > /dev/null` por núcleo**
(processos iniciados e mortos por PID por mim): **1029 pass / 0 fail em todas**. Observação: quando um lote de mutação coincidiu com outra sessão carregando a máquina (load 10+),
caíram testes de OUTRAS specs (`occurrence-*`) por estouro do prazo de 1 s do `waitFor`; os do calendário não oscilaram.

### Prova por mutação (cada uma derrubou teste; restaurada; `git diff --quiet` → 0 no fim)

| Mutação                                                                             | Vermelho (primeiro teste)                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| M1a `resolveVisibleCompanySettingsTabs` devolve as abas sem `settings.manage`       | 1 fail — "sem `settings.manage` nenhuma aba de configurações existe, nem a do calendário"                     |
| M1b painel renderiza os blocos sem `settings.manage` (`canManage ? …` → `true ? …`) | 67 fail (cascata) — "sem `settings.manage`: só o aviso de permissão, nenhum bloco e nenhuma chamada"          |
| M2 dia inválido aceito (`LAST_DAY_OF_MONTH` todo 31)                                | 59 fail — "31/04 e 30/02 não existem; 29/02 vale" e a validação nos dois blocos                               |
| M3 data GERADA pela regra vira linha editável                                       | 7 fail — "a regra é uma linha; as onze datas geradas por ela não são linhas"                                  |
| M4 erro mudo (`feedback.refuse` descarta o erro)                                    | 50 fail — "nomeia todos os campos recusados… e cada nome leva ao campo"                                       |
| M5 guarda aceita chave a mais (`isBusinessCalendarSettings`)                        | 2 fail — "recusa chave a mais…" (guarda) e "resposta com chave a mais é recusada" (cliente)                   |
| M6 filtro único no lugar do múltiplo (`setKinds` guarda só o último)                | 8 fail — "filtro de tipo aceita mais de um valor; a URL guarda os dois", "filtro de UF…"                      |
| M7 aviso de horizonte ausente                                                       | 29 fail — "uma regra que só vai até o ano corrente + 1 dispara o aviso", "avisa até que ano e oferece a ação" |
| M8 ordenação sem o estado neutro (desc volta a asc)                                 | 2 fail — "asc → desc → neutro…" e "cabeçalho de nome: crescente, decrescente e neutro"                        |
| M9 adoção sem aviso (`adoptedFromRuleId` ignorado)                                  | 22 fail — "digitar a data que a regra gerou avisa que ela agora é do operador"                                |
| M10 sem o aviso `typedHolidaysKept`                                                 | 38 fail — "datas digitadas no dia antigo continuam valendo: a edição avisa quantas"                           |
| M11 submit ignora o resultado da validação (manda 31/04)                            | 56 fail — "31 de abril não existe: o campo do dia aponta o erro e nada vai ao servidor"                       |
| M12 mudar mês OU dia manda só um dos dois                                           | 43 fail — "mudar o mês OU o dia manda os dois, para o servidor conferir o par"                                |

⚠️ As contagens grandes (M1b, M2, M4, M10…) são **cascata**: teste de DOM que falha dentro de `act` deixa estado pendente e derruba os seguintes. O que prova a mutação é o PRIMEIRO
fail, por nome; o número não mede cobertura.

### Revisão de design (`web.md` §15) — prints e estilo calculado

Prints em `specs/238-.../prints/` (48 PNGs, fictícios): `calendario-aba`, `calendario-regra-form` (31/04 com `aria-invalid` e mensagem), `calendario-regra-atalho` (recusa do servidor
"Confira: Dia, Nome." com o foco no campo), `calendario-regra-lista` (regras com "gerado até" e o aviso de horizonte), `calendario-estadual`, `calendario-adocao`,
`calendario-datas-mantidas` e `calendario-excluir`, em **375, 768 e 1280 px, escuro e claro**. Método de `spec-237-prints-smoke.helper.ts`: build em pasta temporária com
`VITE_SMOKE_AUTH_BYPASS=true`, `vite preview` em porta própria (53447, encerrada pelo PID), config Playwright descartável (apagada), API inteira dublada
(`spec-238-prints-smoke.helper.ts`); a CI e a porta reservada não foram tocadas. Em todo print: sem rolagem lateral (`readOverflow ≤ 0`), nada cortado (`expectNoClipping`),
sem células sobrepostas (`readCellOverlaps`); **49/49 testes de print verdes**.

Achados do olhar real, consertados na mesma tarefa:

1. O gatilho do campo de busca de município (`SearchableSelect`) nasce compacto — **38,4 px** a 375, abaixo do alvo de toque e desencontrado dos 48 px do `Select` ao lado → mesma medida
   do formulário (`.field button[aria-haspopup='listbox']`, 48 px).
2. A caixa "Sábado é dia útil" tinha 24 px de rótulo → `min-height: var(--touch-target)` (44 px).
3. Contraste claro do atalho da recusa: **4,19:1** (`--color-alert` sobre o fundo tingido) → `--calendar-alert-ink` (alerta misturado ao texto do tema): 5,85:1 claro / 6,38:1 escuro.
4. `.ui-button` não define a fonte: o botão caía em Arial 13 px, desencontrado do `.primaryAction` vizinho (Avenir 16 px, 700) → `:where(.panel) button` com a fonte do vizinho.

Estilo calculado (375, escuro; campo e botão do calendário × os da aba Empresa): altura do campo **48 px = 48 px** (campo de texto = `Select` = campo do vizinho), fonte 14,4 px, borda 1 px;
botão primário **48 px, Avenir 16 px, 700 = vizinho**. ⚠️ A aba vizinha **Diária do motorista** tem o `<input>` cru com **21 px, Arial 13,3 px e borda de 2 px** (medido): defeito dela, fora desta
spec — pendência registrada, não consertada aqui.

Contraste mínimo medido por elemento nos 48 prints (limite 4,5:1), escuro / claro: aviso fixo do roteiro 12,98 / 11,44; dica do bloco 5,86 / 5,67; rótulo do campo 5,86 / 5,67; erro do campo
6,46 / 6,93; recusa do servidor 13,29 / 11,31; atalho da recusa 6,38 / 5,85; aviso do horizonte 12,98 / 11,44; avisos de adoção e de datas mantidas 6,13 / 5,82; cabeçalho da tabela 13,47 / 13,40;
célula 13,47 / 13,40; texto do diálogo 12,92 / 13,81. Alvo de toque a 375 px (`main button`, rótulo da caixa, botões do diálogo): **0 problemas** nos 16 cenários.

### Decisões que divergiram do enunciado (todas com motivo)

1. **Mais prints que os cinco pedidos** (`calendario-regra-atalho`, `calendario-datas-mantidas`, `calendario-excluir`): o erro de CAMPO e a recusa do SERVIDOR com atalho não coexistem numa tela.
2. **`GET /municipal-holidays` é `fleet.read`** (a T1.3 manteve): quem tem só `settings.manage` vê a falha da lista municipal dita na tela. Não mudei a API.
3. **Sem seleção em lote** na tabela (`web.md` §7): não há ação em lote definida — excluir exige a confirmação que diz o efeito.
4. **Filtro por UF e página de 10 no cliente** (as listas da API não paginam nem filtram por UF).
5. **`Select` com `aria-invalid`**: o design system não aceita as props; o erro vai no invólucro `role="group"` (`aria-invalid` + `aria-describedby`) e no `<input>` quando é campo de texto.
6. **Fallback do município**: com a lista do IBGE fora do ar o campo vira "Código IBGE do município" (7 dígitos), para o cadastro não parar por provedor externo.
7. O aviso fixo usa o **menor** "gerado até" entre as regras; sem regra, ano corrente + 10 (o que uma regra nova geraria).

### O que NÃO rodou

- `make check` completo, `make smoke` e a CI (só os gates da app + `format:check` na raiz); nada mudou na API nem no worker.
- Prints com a API real (todos dublados); o preview do orquestrador (`preview-local-antes-de-subir`) é passo seguinte.
- T2.4: **aprovação do usuário sobre os prints e a publicação em staging** — pendentes.

## F1 do roteirizador — feriado por cidade (2026-10-07)

O usuário aprovou, no chat, abrir o contrato congelado do roteirizador **só** para isto: o feriado municipal deixa de
fechar todos os clientes do roteiro e passa a fechar só o cliente cuja **parada** está na cidade do feriado. Motivo da
pressa: com a importação de centenas de cidades, cerca de um dia útil em cinco fecharia todos os clientes de um
roteiro de ~20 cidades.

- **Mudança:** a janela do cliente é resolvida por `(cidade da parada, CNPJ)`, chave `${cityCode}\u0000${taxId}`.
  `readPoolWindows` passa a trazer `cityIbgeCode` junto de `holidayOn`, e cada parada recebe **só** os feriados da
  cidade dela (o destino físico, `resolvePhysicalDestination`). `resolvePoolWindow` recebe a cidade do grupo. A
  exceção do cliente continua vencendo o feriado; `resolveDeliveryWindow` e o contrato com o solver
  (`startSeconds`/`endSeconds` por parada) **não mudaram**, e não há consulta nem migration nova (as mesmas três
  consultas em `Promise.all`).
- **Arquivos:** `readPoolWindows`/`resolvePoolWindow` saíram do repositório (que já passava de mil linhas) para
  `infrastructure/drizzle-pool-window.query.ts` (consultas) e `domain/pool-window.policy.ts` (resolução pura); o
  repositório encolheu em ~157 linhas. Divergência da correção mínima pedida: a extração, justificada pelo tamanho do
  arquivo.
- **Contrato antes (vermelho pelo motivo certo, commit `1986d7ad2`):** 5 dos 15 testes falharam com o defeito — a
  parada da cidade A aparecia fechada pelo feriado da B. A asserção do defeito foi invertida (`[CITY_B]`), e entraram:
  o mesmo CNPJ com paradas em A e em B (feriado só em B, só em A), feriado nas duas, cliente sem janela cadastrada em
  cidade sem feriado (aberto) e em feriado (fechado), e feriado de cidade que não é a da parada. Os 8 testes antigos
  seguiram **sem alteração** (a cidade "sem parada" continua `3304557`; o cliente novo sem janela usa Curitiba).
- **Depois:** 15 pass / 0 fail no arquivo; typecheck e lint do worker limpos.

| Mutação (cada uma restaurada; diff limpo depois)       | Vermelho                                 |
| ------------------------------------------------------ | ---------------------------------------- |
| Tirar o filtro por cidade (volta a fechar tudo)        | 5 fail                                   |
| Chave só com o CNPJ                                    | 2 fail (mesmo CNPJ em A e em B)          |
| Cidade do cliente (1ª parada dele) em vez da da parada | 2 fail (mesmo CNPJ em A e em B)          |
| Remover o filtro por empresa                           | 1 fail: "feriado de outra empresa"       |
| Trocar a data do filtro SQL por `'2000-01-01'`         | 8 fail                                   |
| Remover o filtro por data **só no SQL**                | 0 fail — mutante equivalente (ver T1.2a) |

⚠️ O filtro por data continua em duas camadas (SQL e `resolveDeliveryWindow`): tirar só a do SQL não muda o
comportamento, igual à T1.2a; trocar a data por outra, sim.
