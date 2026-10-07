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

### Pendências [NEEDS CLARIFICATION] (não bloqueiam a T1.1; registradas na ADR-0096)

- **Q1** — `apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts:1053-1059`
  casa `holiday_on = input.date`: um feriado `yearly` nunca será visto pelo roteirizador. O desenho de dados da T1.2
  (A: `recurrence`/`kind` com `yearly` em `2000-MM-DD`; B: `month`/`day`) depende de decisão do usuário e de
  aprovação da migration em tabela existente.
- **Q2** — qual cidade vale: destinatário (`<enderDest>`, decidido na 236) × destino físico (`<entrega>`, spec 073).
- **Q3** — fuso fixo de São Paulo, sem coluna por empresa.

### O que não rodou

- Integração (`test:integration`): a T1.1 não toca banco, rota, migration, worker nem cron.
- `make check` completo (frontend, worker, build de todas as apps): só os gates da API e o `format:check` da raiz.
- Push/deploy: não é desta tarefa (quem publica é o orquestrador).
