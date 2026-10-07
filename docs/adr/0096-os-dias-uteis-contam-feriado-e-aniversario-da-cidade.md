# ADR 0096 — Os dias úteis contam feriado e aniversário da cidade

- **Status:** aceita
- **Data:** 2026-10-06
- **Nasce da spec 238** (T1.1)
- **Citações:** spec 238, spec 236, spec 073, ADR-0048 §3

## Contexto

O prazo de entrega de alguns contratantes é em dias úteis (spec 236), contando feriados e o aniversário
das cidades. O backend não sabia contar dia útil: o feriado nacional existia só no painel
(`brazilianHoliday.service.ts`), sem estadual, e `municipal_holidays` guarda datas absolutas, sem
recorrência. A T1.1 entrega a política pura; dado (T1.2), rotas (T1.3) e tela (Fase 2) vêm depois.

## Decisão

### 1. Um módulo só da API, puro e sem fuso

`apps/api-transportada/src/business-calendar/domain/`: `buildBusinessCalendar`, `isBusinessDay`,
`explainDay`, `addBusinessDays`, `countBusinessDays` (`business-calendar.policy.ts`) e
`listNationalHolidays` (`national-holiday.policy.ts`). Sem consumidor no worker nem no cron.

- **Data civil é texto `YYYY-MM-DD`.** Não há `Temporal` no Bun 1.3.14. A conta usa `Date.UTC` e getters
  `getUTC*`; nunca `new Date(texto)`, getter local, `Date.now()` ou cache de módulo. `parseCivilDate`
  confere o formato e a data de volta (`2027-02-29` e `2026-13-01` são recusadas).
- **A política não lê relógio nem fuso.** Quem chama passa a data. O instante vira data civil na borda,
  em `toCivilDate({ instant, timeZone })` (`application/civil-date.service.ts`, molde de
  `formatFiscalDay`).
- **O calendário é montado uma vez e congelado**: nacionais ∪ estaduais da UF ∪ municipais da cidade,
  expandidos para os anos da cobertura (no máximo 5 anos de distância entre o primeiro e o último). A UF
  são os dois primeiros dígitos do código IBGE da cidade.

### 2. A semântica

- **Dia 0:** se a data inicial é útil, ela é o dia 0; senão, o dia 0 é o **primeiro dia útil seguinte**.
  Sábado + 3 cai na quinta, não na quarta como o `WORKDAY` do Excel. `addBusinessDays` devolve
  `{ date, dayZero }`.
- **Contagem:** `countBusinessDays` conta os dias úteis d com `from < d ≤ to`; negativo quando `to` vem
  antes de `from`.
- **Domingo nunca é útil.** Sábado só com `saturdayIsBusinessDay` (configuração da empresa, padrão
  `false`, RF5).
- **Feriado em fim de semana não é transferido** para a segunda.
- **Duas causas no mesmo dia contam uma vez**, e a data guarda a lista das causas
  (`explainDay(...).reasons`, na ordem nacional → estadual → municipal).
- **Recorrência:** `{ recurrence: 'once', date }` vale só na data gravada; `{ recurrence: 'yearly',
month, day }` vale todo ano, sem ano inicial. **29/02 só existe em ano bissexto** — não cai em 28/02 nem
  em 01/03.
- **Nacionais por Páscoa (Meeus):** Carnaval −48 e −47, Sexta-feira Santa −2, Corpus Christi +60, mais os
  nove fixos do painel. A causa nacional carrega uma **chave estável** (`carnival`, `good_friday`, …); o
  texto é do locale.

### 3. Paridade com o painel, não cópia do cache

O backend é a fonte da verdade do calendário; o painel continua com o seu até consumir a rota. Um
contrato (`test/business-calendar/national-holiday-parity.contract.ts`) carrega o módulo do painel por URL
de arquivo e compara o **conjunto** de datas por ano, de 1900 a 2199 — conjunto, não lista, porque em
1905, 1916, 2000, 2079 e 2152 a Sexta-feira Santa cai em 21/04 e o painel lista a data duas vezes. O backend
**não** copia o cache sem limite do painel: a lista de um ano custa treze contas.

### 4. Recusar, nunca assumir

Toda recusa é `BusinessCalendarError` com código estável: `BUSINESS_CALENDAR_INVALID_DATE`,
`_INVALID_DAYS` (inteiro de 0 a `BUSINESS_CALENDAR_MAX_DAYS = 366`; o teto de 1–60 é do perfil do
contratante), `_INVALID_CITY` (fora de `^[1-5][0-9]{6}$`), `_UNKNOWN_STATE` (prefixo fora das 27 UFs, também
em regra estadual ou municipal — dado corrompido não é ignorado), `_INVALID_RULE`, `_INVALID_COVERAGE`,
`_COVERAGE_TOO_WIDE`, `_OUT_OF_COVERAGE` (ano não carregado nunca vira "sem feriado") e `_TOO_MANY_RULES`
(mais de 5000 regras somadas). Toda caminhada para no fim da cobertura: um calendário em que todo dia é
feriado termina em `OUT_OF_COVERAGE`, não em laço.

## Riscos aceitos

- **Consciência Negra (20/11) é listada em todo ano**, por paridade com o painel, embora só seja feriado
  nacional desde 2024 (Lei 14.759/2023). Afeta só contas sobre datas anteriores a 2024.
- **Carnaval e Corpus Christi contam como feriado** (decisão da spec 238, como o painel já faz), embora
  não sejam feriados nacionais por lei. Cidade que trabalha nesses dias conta um dia útil a menos.
- **Fuso fixo de São Paulo**, sem coluna por empresa (decisão do usuário, Q3 abaixo): a política recebe a data;
  quem chamar converte o instante com `toCivilDate({ timeZone: 'America/Sao_Paulo' })`.
- **O erro sai como 422** (`ApiError`) em todos os códigos; quem expuser a política numa rota decide o
  mapeamento (T1.3).

## Decisões do usuário (2026-10-06) e pendências

- **Q1 — DECIDIDA: o aniversário da cidade (e todo feriado anual) vira uma data fixa por ano, materializada
  automaticamente.** A política conhece a regra "todo ano" (`yearly`); o banco, para o roteirizador, recebe uma
  linha de data fixa por ano em `municipal_holidays`, gerada por uma rotina. Assim o roteirizador continua lendo
  só `holiday_on = data` e **não é alterado** (contrato dele segue congelado; a busca em
  `drizzle-route-optimization.repository.ts` ≈1050–1060 não muda). O desenho exato dos dados e da rotina é da
  T1.2/T1.3, e a migration em `municipal_holidays` (tabela existente) **exige aprovação humana específica** quando
  chegar a hora; esta decisão aprova o desenho, não a migration.
- **Q2 — DECIDIDA: a cidade do feriado é sempre onde a carga será entregue**, isto é, o destino físico decidido
  por `resolvePhysicalDestination` (desvio manual → `<entrega>` → `<enderDest>`, spec 073), e **não** o endereço
  cadastrado do destinatário. A política recebe só um `cityIbgeCode`; quem a chamar resolve esse código pelo
  destino físico. Isso substitui o que as specs 236 e 238 diziam sobre `nfe_addresses.city_code` e é a mesma
  cidade usada para o grupo rota×cidade da separação (spec 237).
- **Q3 — Fuso fixo de São Paulo** (padrão do repositório, `FISCAL_TIME_ZONE`), sem coluna por empresa; registrado
  como limite: uma transportadora em MT, MS, AM, RO, RR ou AC terá o dia civil errado na virada da noite.
