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

### Defeito conhecido (fora de escopo da 238, não corrigido)

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
