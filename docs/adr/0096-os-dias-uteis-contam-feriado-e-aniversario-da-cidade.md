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

### 5. Modelo de dados (T1.2) — forma B1

O desenho decidido na Q1, em tabelas. A migration é **aditiva** e a pasta é uma só
(`apps/api-transportada/drizzle/20261007140303_business_calendar/`).

**`municipal_holiday_rules`** — só as regras "todo ano". `id`, `company_id` (FK `RESTRICT`), `city_ibge_code`
(CHECK `^[1-5][0-9]{6}$` **e** prefixo entre as 27 UFs), `month`, `day` (CHECK: mês de 1 a 12 e dia de 1 ao último dia
do mês, com **29/02 válido**), `kind` (`holiday` | `city_anniversary`), `name` (1 a 120 caracteres),
`materialized_through_year` (CHECK entre 1583 e 9999, o intervalo do domínio), `created_at`, `updated_at`. Únicos:
`(company_id, id)` — alvo da FK composta — e `(company_id, city_ibge_code, month, day)`.

**`municipal_holidays`** (já publicada, lida pelo roteirizador) ganha **apenas**:

1. `ADD COLUMN "kind" text DEFAULT 'holiday' NOT NULL` (catálogo; linhas antigas viram `holiday`);
2. `ADD COLUMN "source_rule_id" uuid` (nulo = digitada à mão);
3. `ADD CONSTRAINT "municipal_holidays_kind_check"` (`NOT VALID` + `VALIDATE`);
4. `ADD CONSTRAINT "municipal_holidays_company_source_rule_fk"` — FK composta `(company_id, source_rule_id)` →
   `municipal_holiday_rules (company_id, id)`, `ON DELETE CASCADE ON UPDATE CASCADE`, MATCH SIMPLE: com
   `source_rule_id` nulo a chave não é conferida e a data digitada **nunca** é apagada;
5. `CREATE INDEX "municipal_holidays_company_source_rule_idx"` parcial (`source_rule_id` não nulo).

Nenhum INSERT, nenhum backfill; o unique `(company_id, city_ibge_code, holiday_on)`, `holiday_on`, o CHECK de cidade
antigo e o nome da tabela não mudam. A cópia do schema no worker não muda.

**Lock (revisão da T1.3b).** Os seis comandos em `municipal_holidays` ficam no **fim** do arquivo, depois de todo
`CREATE TABLE` e CHECK das tabelas novas. O `ADD COLUMN` toma `ACCESS EXCLUSIVE` nela e o Postgres só o solta no
`COMMIT`; o `migrate()` do drizzle aplica **todas as migrations pendentes numa transação só**, então o lock fica retido
até o `COMMIT` do **lote inteiro**, não até o fim do arquivo. `NOT VALID` + `VALIDATE` não encurta isso (roda na mesma
transação) e `lock_timeout` só limita a **espera** para adquirir, não quanto o lock fica retido. Em produção: aplicar
num deploy sem migration longa enfileirada atrás desta, e medir a duração do lote antes. A migration ainda não foi
publicada, então a revisão foi feita **no lugar** (autorizada só para staging).

**`state_holidays`** — `recurrence` (`once` | `yearly`), `holiday_on` **ou** `month`+`day`, nome de 1 a 120
caracteres, `state_ibge_code` entre as 27 UFs. CHECK de forma (`once` com data e sem mês/dia; `yearly` com mês e dia
válidos e sem data) e dois únicos **parciais**, um por forma. Não é materializado: o roteiro não lê feriado estadual.

**`company_business_calendar_settings`** — uma linha por empresa, `saturday_is_business_day boolean NOT NULL DEFAULT
false`, `updated_by_user_id` sem FK (rastro que sobrevive ao usuário, como na retenção da posição). Sem linha, a
leitura devolve `false`.

**Materialização.** A rota gera as datas de **10 anos** ao gravar a regra, sem rotina agendada; a tela mostra até que
ano foi gerado e oferece a ação idempotente "gerar próximos anos" (avança `materialized_through_year`). Data gerada que
colide com uma digitada é ignorada. Apagar a regra apaga, em cascata, só as datas que ela gerou.

**Rollback.** Tira a FK, o índice, as duas colunas e as três tabelas, e **deixa as datas materializadas em
`municipal_holidays` como datas fixas comuns**: o roteiro continua respeitando-as. Perdem-se as regras, o rótulo de
aniversário, o vínculo com a regra, os feriados estaduais e a configuração de sábado.

**Por que não colunas em `municipal_holidays` (a opção A).** `recurrence`/`month`/`day` ali tornariam `holiday_on`
anulável ou ganhariam o ano falso `2000-MM-DD` — o roteirizador nunca o casaria (medido na T1.2a) e o unique atual
mudaria de significado. Tabela própria deixa a tabela publicada e o contrato do roteirizador intocados.

**Armadilha de CHECK com coluna nula.** `month between 1 and 12` com `month` nulo dá NULL, e o CHECK aceita NULL: na
ponta `yearly` de `state_holidays` as colunas são exigidas `is not null` à parte.

### 6. Escrita, convivência das linhas e rotas (T1.3)

`municipal_holidays` guarda só datas fixas e é o que o roteirizador lê; a regra "todo ano" fica em
`municipal_holiday_rules`. Quem manda quando as duas convivem:

1. A geração (`INSERT … ON CONFLICT (company_id, city_ibge_code, holiday_on) DO NOTHING`) nunca sobrescreve: a data que
   o operador já digitou naquele dia fica, com o nome dele e `source_rule_id` nulo.
2. Excluir a regra apaga em cascata só as linhas com `source_rule_id` dela; a digitada nunca.
3. Editar a regra (mês, dia, nome, tipo; **a cidade não se edita**) apaga as linhas geradas dela **do ano corrente em
   diante** (`holiday_on >= '<ano corrente de São Paulo>-01-01'`, relógio injetado) e as gera de novo, na mesma
   transação. A linha de um ano que já passou fica como estava: é a data que o roteiro daquele ano usou.
4. `POST /municipal-holidays` numa data gerada é **adoção**: nome, tipo e `source_rule_id = NULL`; a linha vira do
   operador e sobrevive à exclusão da regra. Sem `kind` no corpo, o recadastro mantém o tipo da linha. **A adoção é
   sinalizada**: a resposta do `POST` ganha `adoptedFromRuleId` (id da regra, ou `null`) e a auditoria o grava no
   `metadata`. O mesmo cadastro de novo (digitada, mesmo nome, mesmo tipo ou tipo ausente) não grava nem audita.
   **Depois da adoção, a regra não conhece mais a data**: editar ou excluir a regra a deixa no dia antigo e ela segue
   valendo para o roteirizador. Por isso `PATCH /municipal-holiday-rules/:id` e `GET /municipal-holiday-rules` devolvem
   `typedHolidaysKept` (quantas datas digitadas ficaram no dia da regra — empresa, cidade, mês/dia,
   `source_rule_id IS NULL`, do ano corrente em diante; no `GET` uma consulta agregada para a lista, sem N+1) e o
   `DELETE`, que responde 204 sem corpo, grava a mesma contagem em `audit_logs.metadata.typedHolidaysKept`. Mudar o
   status do `DELETE` para devolver a contagem é decisão do produto, não feita aqui.
5. `DELETE`/`PATCH /municipal-holidays/:id` de linha **gerada** é 409 `MUNICIPAL_HOLIDAY_GENERATED_BY_RULE`: o caminho é
   editar ou excluir a regra. Apagar o que não existe segue no-op. `PATCH` muda só `name` e `kind` (a data e a cidade
   são a identidade da linha).
6. `DELETE` de linha **digitada** sobre o dia de uma regra gera de novo a linha da regra daquela data — só dentro do
   horizonte (do ano corrente até `materialized_through_year`), senão o roteiro perderia a data.

**Auditoria só quando muda** (como o `PUT` do perfil da 237): gerar os próximos anos sem data nova e sem regra avançada,
`PUT` do sábado com o mesmo valor e `POST` da mesma data com o mesmo nome não gravam `audit_logs`. A geração, quando
audita, mira a **coleção** (`municipal_holiday_rules`, `entityId` = a empresa), não uma regra que não existe. O
`POST /municipal-holiday-rules/materializations` lê o corpo: vazio ou ausente vale; qualquer campo é 400. O
`POST /state-holidays` idêntico (mesma UF, forma, data e nome) devolve 200 com a linha existente, como o municipal;
a mesma data com outro nome é 409 `STATE_HOLIDAY_CONFLICT`.

**Geração.** Na escrita da regra, do ano corrente até o corrente + 10 (11 anos), ano corrente em `America/Sao_Paulo` pelo
relógio **injetado** no caso de uso; 29/02 só nos bissextos. **Sem rotina agendada** (custaria um job novo nos quatro
catálogos e uma migration de CHECK): `POST /municipal-holiday-rules/materializations` completa o horizonte de todas as
regras da empresa, idempotente (`DO NOTHING`; os ids não mudam), e a leitura da regra devolve `materializedThroughYear`
para a tela avisar quando ficar abaixo do ano corrente + 2.

**Leitura para a política** (`DrizzleBusinessCalendarRepository.loadRules`): uma consulta por tabela — regras, datas
digitadas (`source_rule_id IS NULL` e `holiday_on` dentro da cobertura; a gerada é a mesma causa que a regra), feriados
estaduais da UF (dois primeiros dígitos das cidades; `yearly` ou `once` na cobertura) e a configuração da empresa (sem
linha = `false`) —, cada uma com `limit(BUSINESS_CALENDAR_MAX_RULES + 1)` para a política recusar com `TOO_MANY_RULES`.
`Promise.all` está certo ali: calendário parcial é prazo errado, falhar é o comportamento correto.

**Rotas.** `settings.manage` para ler e escrever em todas as novas; Zod `.strict()`; `companyId` do contexto
autenticado, nunca do corpo; IP por `resolveClientIp`; toda escrita grava `audit_logs` **na mesma transação**, sob um
lock por empresa (`pg_advisory_xact_lock`) que serializa a conferência de conflito, a geração e a regeneração.

| Rota                                                      | Efeito                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET/POST /municipal-holiday-rules`, `PATCH/DELETE …/:id` | regra "todo ano"; `POST` idêntico → 200 com a existente                 |
| `POST /municipal-holiday-rules/materializations`          | completa o horizonte de todas as regras (idempotente)                   |
| `GET/POST /state-holidays`, `PATCH/DELETE …/:id`          | feriado estadual `once`/`yearly` (`z.discriminatedUnion('recurrence')`) |
| `GET/PUT /company-settings/business-calendar`             | `saturdayIsBusinessDay`; sem linha = `false`, `origin: 'default'`       |
| `GET/POST/PATCH/DELETE /municipal-holidays`               | as antigas, com as regras acima; `GET` segue `fleet.read`               |

**Códigos novos** (`BUSINESS_CALENDAR_RULE_ERROR_CODE`): `MUNICIPAL_HOLIDAY_RULE_CONFLICT` (409, mesma cidade e dia com
nome ou tipo diferente), `MUNICIPAL_HOLIDAY_RULE_NOT_FOUND` (404), `MUNICIPAL_HOLIDAY_RULE_INVALID_DAY` (400, mês e dia
mesclados que não existem, p.ex. `PATCH {month: 4}` numa regra de dia 31), `MUNICIPAL_HOLIDAY_GENERATED_BY_RULE` (409),
`MUNICIPAL_HOLIDAY_NOT_FOUND` (404), `STATE_HOLIDAY_CONFLICT` (409), `STATE_HOLIDAY_NOT_FOUND` (404) e
`STATE_HOLIDAY_RECURRENCE_MISMATCH` (400, o `PATCH` traz a forma errada). Os da política seguem 422.

**Não existe gerador de OpenAPI nesta API** e esta task não inventou um: o RF8 ("documentação OpenAPI gerada das
rotas") fica registrado como divergência; a tabela acima e `docs/ai-context/api-transportada.md` são a documentação
das rotas até existir o gerador.

## Riscos aceitos

- **Limite para a spec 236 (T1.3b): a regra `yearly` na política vale em todo ano da cobertura, sem ano inicial.** A
  edição preserva as datas geradas de anos passados em `municipal_holidays` (o roteirizador não as relê), mas a política
  lê a regra, não as linhas: **editar o dia recalcula os prazos de anos passados** com o dia novo. É decisão aceita, não
  bug; quem precisar do dia antigo num ano passado tem de digitar a data (ela vira `once` e vence).
- **Rollback seguido de reaplicação vira as datas geradas em digitadas.** O `rollback.sql` deixa as linhas como datas
  fixas comuns (§5); ao reaplicar a migration elas continuam sem `source_rule_id`. É coerente com o CA3 (a digitada
  nunca é apagada pela regra) e significa que uma regra recriada depois não as reconhece como suas.
- **Não há como suprimir UMA ocorrência de uma regra.** `DELETE` da data gerada é 409 e adotar e apagar regenera a da
  regra; para um ano sem o feriado, só excluir a regra (e digitar as datas que ficam) ou aceitar a data.
- **`GET /municipal-holidays` aceita parâmetro desconhecido** (compatibilidade com o contrato antigo, spec 060); as rotas
  novas recusam. Assimetria conhecida.
- **As leituras do calendário não têm paginação.** O volume é de cadastro à mão e a política recusa acima de
  `BUSINESS_CALENDAR_MAX_RULES`; se a tela passar a listar milhares de datas, pagina-se.

- **Consciência Negra (20/11) é listada em todo ano**, por paridade com o painel, embora só seja feriado
  nacional desde 2024 (Lei 14.759/2023). Afeta só contas sobre datas anteriores a 2024.
- **Carnaval e Corpus Christi contam como feriado** (decisão da spec 238, como o painel já faz), embora
  não sejam feriados nacionais por lei. Cidade que trabalha nesses dias conta um dia útil a menos.
- **Fuso fixo de São Paulo**, sem coluna por empresa (decisão do usuário, Q3 abaixo): a política recebe a data;
  quem chamar converte o instante com `toCivilDate({ timeZone: 'America/Sao_Paulo' })`.
- **O erro da política sai como 422** (`ApiError`) em todos os códigos; as rotas de cadastro da T1.3 têm os próprios
  códigos (§6) e a política ainda não é exposta numa rota.

## Decisões do usuário (2026-10-06) e pendências

- **Q1 — DECIDIDA: o aniversário da cidade (e todo feriado anual) vira uma data fixa por ano, materializada
  automaticamente.** A política conhece a regra "todo ano" (`yearly`); o banco, para o roteirizador, recebe uma
  linha de data fixa por ano em `municipal_holidays`, gerada na escrita da regra, sem rotina agendada (§5). Assim o roteirizador continua lendo
  só `holiday_on = data` e **não é alterado** (contrato dele segue congelado; a busca em
  `drizzle-route-optimization.repository.ts` ≈1050–1060 não muda). O desenho dos dados está em §5 (T1.2, só
  staging; **produção continua exigindo aprovação humana específica**) e a geração das datas é da T1.3.
- **Q2 — DECIDIDA: a cidade do feriado é sempre onde a carga será entregue**, isto é, o destino físico: o desvio
  manual (`delivery_address_overrides`, um por `trip_document`, vale o mais recente) por cima do que
  `resolvePhysicalDestination` decide (`<entrega>` → `<enderDest>`, spec 073; a função só conhece `delivery` e
  `recipient`, o desvio manual **não** é dela), e **não** o endereço cadastrado do destinatário. A política recebe só um `cityIbgeCode`; quem a chamar resolve esse código pelo
  destino físico. Isso substitui o que as specs 236 e 238 diziam sobre `nfe_addresses.city_code` e é a mesma
  cidade usada para o grupo rota×cidade da separação (spec 237).
- **Q3 — Fuso fixo de São Paulo** (padrão do repositório, `FISCAL_TIME_ZONE`), sem coluna por empresa; registrado
  como limite: uma transportadora em MT, MS, AM, RO, RR ou AC terá o dia civil errado na virada da noite.
