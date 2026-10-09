# ADR 0100 — Os feriados vêm da FeriadosAPI e avisam na montagem

- **Status:** aceita (2026-10-07, validada contra o código na T0.1 da spec 252; vale para staging, produção exige
  aprovação humana própria). As correções da validação estão no texto abaixo e em `specs/252-…/evidence.md` § T0.1.
- **Data:** 2026-10-07
- **Nasce da spec 252** (T0.1)
- **Emenda:** ADR-0048 §3 ("nenhuma fonte pública de feriado municipal é confiável") e o "Fora do escopo" da spec 238
  ("importar feriados de fonte pública … nunca carga automática")
- **Citações:** ADR-0021, ADR-0044 §3, ADR-0048 §3, ADR-0062, ADR-0094, ADR-0096, specs 060, 073, 186, 236, 237, 238

## Contexto

O calendário de dias úteis da 238 (ADR-0096) conta feriado nacional (no código), estadual (`state_holidays`) e
municipal (`municipal_holidays` + `municipal_holiday_rules`). Os dois últimos só entram **à mão**: o ADR-0048 §3
decidiu em 2026-08-27 que "nenhuma fonte pública de feriado municipal é confiável o bastante para virar dependência",
e a 238 repetiu a exclusão. Na prática a base fica vazia: a amostra local de NF-e tem **67 cidades de destino
distintas**, todas em SP, nenhuma capital, e ninguém digitou o feriado de nenhuma delas. Sem o feriado da cidade, o
prazo da 236 conta dia útil a mais e a montagem não avisa a entrega marcada para uma cidade fechada.

O usuário decidiu em 2026-10-07 puxar os feriados da **FeriadosAPI** (`https://feriadosapi.com`), aos poucos e
respeitando o limite, gravando no nosso banco, até cobrir as cidades **de destino das notas que já temos** (destino
físico de `resolvePhysicalDestination`, spec 073), e que os feriados importados **avisem na montagem e no detalhe da
viagem**.

Antes disso existe um defeito que a importação tornaria visível: o roteirizador
(`readPoolWindows`, `apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts`
~1050–1076) busca só `holidayOn` das cidades do roteiro e entrega a **mesma** lista a todos os clientes. O feriado da
cidade B fecha o cliente da cidade A. Está fixado como "comportamento atual" em
`apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts` ~199–206. Com ~4 feriados por
cidade e 20 cidades por roteiro, cerca de 1 dia útil em 5 fecharia todos os clientes do roteiro.

**A FeriadosAPI, pela documentação pública:** `Authorization: Bearer <chave>`; `GET /api/v1/feriados/nacionais?ano=`,
`/api/v1/feriados/estado/{uf}?ano=`, `/api/v1/feriados/cidade/{ibge}?ano=`; `GET /api/v1/estados`, `/municipios`,
`/municipio/{ibge}`. Resposta com `id`, `data` (`DD/MM/AAAA`), `nome`, `tipo` (`NACIONAL` | `ESTADUAL` | `MUNICIPAL` |
`FACULTATIVO`), `descricao`, `uf`, `codigo_ibge`, `bancario`; paginação `page`/`limit` (máx. 100) e `facultativos`.
Limite de 60 req/min no gratuito e no Developer. O gratuito cobre nacionais, estaduais e as 27 capitais; as demais
cidades "consomem cota" (a documentação não diz quanto). O plano Developer custa R$ 39/mês com 5.000 consultas/mês. A
página de termos de uso respondeu 404 e a documentação **não diz se os dados podem ser guardados**.

## Decisão

### 1. A ordem: primeiro o roteirizador, depois a importação

A rotina só grava em `municipal_holidays` **depois** de a correção do roteirizador estar em staging (spec 252 Fase 1).
A correção é mínima: o select traz `cityIbgeCode`, e a janela passa a ser resolvida por `(cidade da parada, CNPJ)`
(chave `${cityCode}\u0000${taxId}`). A política `delivery-window.policy.ts` e o contrato com o solver não mudam; sem
migration e sem consulta nova. O teste de caracterização passa a esperar `[CITY_B]` e ganha o caso do mesmo CNPJ com
paradas em duas cidades.

**Feito em 2026-10-07** (antes da validação deste ADR, por decisão do usuário, como "F1 do roteirizador" da spec 238):
`913aad994` (teste vermelho), `4454228ac` (correção), `1754e36e7` (evidência). A leitura e a resolução da janela
saíram do repositório: `routing/infrastructure/drizzle-pool-window.query.ts` e `routing/domain/pool-window.policy.ts`.
O "Contexto" acima descreve o código de antes.

### 2. As decisões por delegação (D1–D13, revogáveis pelo usuário)

- **D1 — Cache global do fornecedor, efeito por empresa.** O que a FeriadosAPI responde é fato público e vai para
  tabelas **sem `company_id`** (precedente: `geocoded_addresses`), nunca expostas por rota; pagar duas vezes a mesma
  cidade seria desperdício de cota. O que vale para a empresa (demanda de cidades, cursor, supressões, linhas em
  `municipal_holidays`/`state_holidays`) continua com `company_id` e o isolamento multiempresa intacto.
- **D2 — Identidade do feriado é `(escopo, ibge, data)`.** O `id` do fornecedor (`external_id`) é só rastro: se ele
  renumerar, nada se duplica.
- **D3 — A linha digitada vence; a gerada por regra também vence a importada.** A aplicação é
  `INSERT … ON CONFLICT (company_id, city_ibge_code, holiday_on) DO NOTHING`, como a geração da 238 (ADR-0096 §6.1).
  A precedência vale para a linha que **já existe**: a regra criada depois de uma importada no mesmo dia não a
  substitui (a geração da 238 também é `DO NOTHING` e não muda). As duas convivem: a importada fica na linha (o
  roteirizador a lê), a regra é lida pela política, e o dia conta uma vez, com as duas causas na lista.
- **D4 — Nacional não é importado.** O calendário nacional mora no código (ADR-0096 §2–3). A rotina busca a lista
  nacional uma vez por ano só para **conferir paridade** e conta as diferenças (`national_mismatch`), sem gravar.
- **D5 — `FACULTATIVO` fica só no cache**, não é aplicado. A 238 já trata Carnaval e Corpus Christi como feriado no
  código; isso não muda.
- **D6 — Estadual vai para `state_holidays` como `once`, marcado com a origem**, e é pulado quando já há um `yearly`
  digitado no mesmo dia e mês.
- **D7 — Só datas de hoje em diante entram em vigor** (dia civil de `America/Sao_Paulo`, relógio injetado). Data
  passada não é gravada: o **estado** do selo de prazo da 236 de nota já entregue (no prazo / atrasada) nunca muda por
  causa da importação — feriado só empurra o vencimento para depois, e um vencimento que já passou fica antes de todo
  feriado de hoje em diante. Um número pode mudar, e fica mais certo: a nota **entregue hoje** com atraso perde um dia
  de atraso se o feriado de hoje for importado hoje (`countBusinessDays` conta o dia da entrega). Pelo mesmo motivo,
  desligar uma importada (§4) só vale para datas de hoje em diante.
- **D8 — Horizonte: ano corrente e o seguinte.** Par `(cidade, ano)` já buscado é rebuscado depois de 180 dias.
- **D9 — Limitador:** espaçamento fixo de 1,2 s entre requisições (~50/min, abaixo dos 60), teto de 100 requisições
  por ciclo, orçamento mensal no banco (`FERIADOS_API_MONTHLY_REQUEST_BUDGET`), rotina agendada 1×/dia (linha de
  `job_schedules` com 86.400 s) com piso de 3.600 s (`minimumIntervalSeconds` do catálogo; o piso do banco é a batida de
  300 s); a trava de uma execução aberta por rotina (`job_executions_open_unique`, lease de 30 s renovado a cada 10 s)
  já impede duas instâncias.
- **D10 — O token mora só no worker** (`FERIADOS_API_TOKEN`, opcional; vazio = ausente = rotina não registrada e boot
  verde, molde `GOOGLE_MAPS_API_KEY`/ADR-0062).
- **D11 — O aviso fala da cidade, não da exceção do cliente.** "Feriado em Campinas" não sabe se aquele CD abre; o
  texto pede para conferir, nunca bloqueia (a exceção do cliente continua vencendo o feriado no roteirizador, ADR-0048
  §3).
- **D12 — O aviso também chega ao app do motorista, pronto, na leitura que ele já faz.** Pedido do usuário em
  2026-10-07 ("e o aviso no app do motorista também"); a forma é delegação. `GET /me/trips/current` ganha
  `holidayWarnings` por parada (§6); sem rota nova, o aviso viaja no snapshot guardado no aparelho e funciona sem rede.
  Para o motorista, a data é a do `estimated_arrival_at` da parada em dia civil de São Paulo, ou **hoje** quando a
  parada já está em andamento; parada concluída não tem aviso. A nota do motorista não lê o calendário.
- **D13 — A rotina nasce pausada de fábrica** (acrescentada na validação, T0.1). Sem token a janela diária não é
  silenciosa: ela loga erro `job_run_routine_missing` e fecha `unexpected_error` (`run-job-cycle.ts`), todo dia. A
  linha de `job_schedules` nasce com `enabled = false`, `paused_at = now()` e `paused_origin = 'system'` (a "pausa de
  fábrica" que o schema já prevê); despausar no painel é passo do usuário, junto com o token. Assim ligar a rotina
  exige dois atos do usuário, o que reforça a Q4.

### 3. Modelo de dados (uma migration aditiva, com `rollback.sql`, só staging)

Sem ENUM nativo (texto + CHECK), todo nome de constraint e de índice **explícito** — o nome padrão do drizzle para a
FK de `municipal_holidays.provider_entry_id` teria 67 bytes, acima dos 63 do Postgres, que trunca calado e faz o
`snapshot.json` divergir do banco. Os nomes abaixo foram contados (T0.1): o maior tem 58 bytes.

**Cache global (sem `company_id`):**

- `holiday_provider_fetches` — `id`, `scope` (`city` | `state` | `national`), `ibge_code` **NOT NULL** (cidade: 7
  dígitos; estado: os 2 da UF; nacional: `'BR'` — nulo deixaria o único sem efeito, e `NULLS NOT DISTINCT` depende da
  versão do Postgres), `year`, `status` (`pending` | `done` | `failed` | `quota_exhausted` | `not_covered`),
  `attempts`, `last_error_code`, `next_attempt_at`, `fetched_at`. Nomes: `holiday_provider_fetches_scope_code_year_unique`,
  `…_scope_check`, `…_scope_code_check` (forma do código por escopo), `…_status_check`, `…_year_check`,
  `…_attempts_check`, índice `holiday_provider_fetches_status_next_attempt_idx`.
- `holiday_provider_entries` — `id`, `scope`, `ibge_code`, `holiday_on`, `name` (1 a 120 caracteres, o teto de
  `state_holidays_name_check`), `provider_type`, `external_id`, `is_banking`, `first_seen_at`, `last_seen_at`,
  `removed_at`. Nomes: `holiday_provider_entries_scope_code_day_unique`, `…_id_code_day_unique` (`(id, ibge_code,
holiday_on)`, o alvo da FK composta abaixo), `…_scope_check`, `…_scope_code_check`, `…_provider_type_check`,
  `…_scope_type_check`, `…_name_check`. Duas entradas da mesma resposta na mesma `(scope, ibge_code, holiday_on)`
  (um `FACULTATIVO` e um `MUNICIPAL` no mesmo dia): vence a não facultativa — o banco recusa a segunda (23505), seja qual
  for o tipo ou o `external_id`. **O tipo combina com o escopo** (`…_scope_type_check`): `city` aceita `MUNICIPAL` e
  `FACULTATIVO`, `state` aceita `ESTADUAL` e `FACULTATIVO`, `national` aceita `NACIONAL` e `FACULTATIVO`. O feriado
  estadual que vem na resposta de uma **cidade** é gravado com `scope = 'state'` e a UF (os 2 primeiros dígitos do
  código da cidade), nunca com o código da cidade.
- `holiday_provider_monthly_usage` — `month` (`date`, sempre o dia 1º; chave primária), `requests`. Nomes:
  `holiday_provider_monthly_usage_month_check`, `…_requests_check`. O incremento é um **upsert** (`INSERT … VALUES
($m, 1) ON CONFLICT (month) DO UPDATE SET requests = requests + 1 WHERE requests < $budget RETURNING requests`): um
  `UPDATE` cru não acharia linha no primeiro pedido do mês e pararia a rotina para sempre.

**Por empresa:**

- `holiday_import_cities` — `company_id`, `city_ibge_code`, `document_count` (aproximado, serve para ordenar),
  `last_seen_at`: a demanda. Chave `(company_id, city_ibge_code)`; nomes `holiday_import_cities_company_id_companies_id_fk`,
  `…_city_check`, `…_document_count_check`, índice `holiday_import_cities_city_idx`.
- `company_holiday_import_settings` — `company_id` (chave), `is_enabled` (padrão `true`), `cursor_updated_at`,
  `cursor_issued_at`, `cursor_document_id`. Nomes `company_holiday_import_settings_company_id_companies_id_fk` (58),
  `…_cursor_check` (os três do cursor nulos juntos ou preenchidos juntos).
- `holiday_import_suppressions` — `id`, `company_id`, `scope` (`city` | `state`), `ibge_code`, `holiday_on`,
  `suppressed_by_user_id` (sem FK, rastro que sobrevive ao usuário, como `updated_by_user_id` da 238), `suppressed_at`.
  Nomes `holiday_import_suppressions_company_scope_code_day_unique` (57; o padrão do drizzle teria 72),
  `…_company_id_companies_id_fk`, `…_scope_check`, `…_scope_code_check`.

As três por empresa referenciam só `companies` (FK simples por `company_id`, como toda tabela de tenant); nenhuma aponta
para outra tabela de tenant, então não há FK composta a criar.

**Em tabelas já publicadas:** `municipal_holidays.provider_entry_id uuid null` e `state_holidays.provider_entry_id uuid
null`, cada uma com FK **composta** para `holiday_provider_entries(id, ibge_code, holiday_on)`: `municipal_holidays
(provider_entry_id, city_ibge_code, holiday_on)` e `state_holidays (provider_entry_id, state_ibge_code, holiday_on)`,
`MATCH SIMPLE` (sem `provider_entry_id` nada é conferido), `ON DELETE RESTRICT ON UPDATE RESTRICT` (o alvo é global, sem
`company_id`; a entrada nunca é apagada, só ganha `removed_at`, e um UPDATE nela nunca move o feriado de uma empresa).
Assim a linha importada **é** a data da entrada — uma linha estadual de SP não liga a entrada de Campinas, nem uma
data trocada: `municipal_holidays_provider_entry_fk` e `state_holidays_provider_entry_fk` (23503). CHECK `municipal_holidays_rule_or_provider_check` (`source_rule_id` e
`provider_entry_id` nunca os dois) e `state_holidays_provider_once_check` (importada só `once`, D6); índices parciais
`municipal_holidays_provider_entry_idx` e `state_holidays_provider_entry_idx` (`provider_entry_id is not null`). O
`ON CONFLICT` do estadual nomeia o predicado do único parcial `state_holidays_company_state_once_unique` (`WHERE
recurrence = 'once'`). O nome da rotina entra nas **duas** CHECK de `job` (`job_schedules_job_check`,
`job_executions_job_check`, `NOT VALID` + `VALIDATE`) e ganha linha em `job_schedules`, pausada de fábrica (D13) —
molde `20261007133324_cargo_preview_retention`, que tem mais duas CHECK da trilha da prévia que aqui não existem. O
roteirizador continua lendo `municipal_holidays` por data fixa: **o contrato dele não muda**, e ele nunca lê o cache.

**A exceção do `companyId`.** A regra "todo repositório filtra por `companyId`" tem uma exceção declarada,
`geocoded_addresses` ("a tabela é ativo do produto, não do tenant"); as três tabelas globais entram nela pelo mesmo
motivo. O repositório delas mora só no worker, e nenhuma rota as devolve cruas: o status da importação (T4.1) lê as
tabelas por empresa e só agrega o cache para as cidades da própria empresa.

**A leitura da política** (`loadBusinessCalendarRules`, `readTypedHolidays`) filtra só `source_rule_id IS NULL`, e a
importada (`provider_entry_id` preenchido, `source_rule_id` nulo) entra como `once` **sem mudar o filtro** — não é
preciso incluir nem excluir `provider_entry_id`. Falta a **origem**: `HolidayReason` só diz o escopo (nacional,
estadual, municipal) e os mapeadores descartam o resto; o aviso (§6) ganha `origin` (`code` | `typed` | `rule` |
`imported`) nas regras e na razão, lido de `provider_entry_id`.

### 4. Convivência das linhas

1. Digitada vence; gerada por regra vence a importada (D3).
2. **Desligar** um feriado importado apaga a linha, grava `holiday_import_suppressions` e `audit_logs` (ator) e ele
   **não volta** no ciclo seguinte. **Restaurar** apaga a supressão e o feriado volta na **próxima execução diária** da
   rotina (a API não relê o cache global: o contrato de isolamento da tabela global proíbe). Desligar vale só para datas de hoje em diante (D7). O `DELETE` que a 238 já tem
   (`/municipal-holidays/:id`, `/state-holidays/:id`), numa linha importada, **é** o desligar: sem a supressão a
   linha voltaria no ciclo seguinte. Como no `DELETE` da digitada, a data da regra do mesmo dia é gerada de novo
   (ADR-0096 §6.6).
3. **Editar nome ou tipo** de uma importada é **adoção**: `provider_entry_id = null`, a linha vira digitada (mesmo
   raciocínio do ADR-0096 §6.4). Vale para o `PATCH` e para o `POST` da mesma data (hoje os dois tratam a importada
   como digitada e não zerariam `provider_entry_id`; o "mesmo cadastro de novo não grava" da 238 não se aplica a uma
   importada). `typedHolidaysKept` (ADR-0096 §6.4) passa a contar só `provider_entry_id IS NULL`. O `PATCH` que **muda
   a data** de uma importada (só o estadual a aceita) não adota: é `409 HOLIDAY_IMPORT_DATE_LOCKED` — desligue e
   cadastre a data nova, como o municipal já é por desenho (a data e a cidade são a identidade da linha).
4. Todo `DELETE` de linha **digitada ou adotada** com data de hoje em diante (dia civil de São Paulo) também grava a
   supressão `(escopo, código, data)` na mesma transação, com o `suppressionId` na auditoria: senão a importação
   traria a data de volta, como "importada", no ciclo seguinte ao "apaguei". Data anterior a hoje não grava (D7); o
   "todo ano" estadual (sem data fixa) e o código de cidade que não cabe no padrão do cache também não.
5. Quando o fornecedor **remove** uma data, `removed_at` é marcado no cache e a linha da empresa **fica**, sinalizada
   para o operador decidir. Nada é apagado em silêncio.
6. **Contrato de resposta das listas.** `GET`, `POST` e `PATCH` de `/municipal-holidays` e `/state-holidays` trazem
   `origin: 'typed' | 'imported'` em cada feriado: `imported` é a linha com `provider_entry_id` preenchido; `typed` é o
   resto (digitada, adotada e gerada por regra — esta segue distinta por `generatedByRuleId`). É chave **aditiva**; o
   id do cache nunca sai. Os guardas do painel antigo são de chaves exatas, então a API com `origin` só vai ao ar
   **depois** do painel que a aceita (opcional): painel primeiro, API depois.

### 5. A rotina `holiday.provider.pull`

Cron → fila → worker, molde `cargo-preview.retention.apply`, nas quatro cópias do catálogo de jobs (API, worker, cron,
painel; painel primeiro). Três etapas idempotentes por ciclo:

1. **Descoberta (só banco).** Cursor por empresa sobre o índice `nfe_documents_company_updated_issued_id_idx`, até
   2.000 notas por lote e 20 lotes por ciclo; resolve o destino físico com a mesma junção do roteirizador e faz
   upsert em `holiday_import_cities`. A junção é SQL (`nfe_participants` nos papéis `delivery`/`recipient` +
   `nfe_addresses`), mas a **escolha** é a função `resolvePhysicalDestination` do worker sobre as linhas do lote —
   nunca um `COALESCE` em SQL, que seria uma segunda regra de "endereço utilizável". O desvio manual
   (`delivery_address_overrides`) não entra, como no roteirizador: ele nasce na viagem, por `trip_document`; a cidade
   alcançada só por desvio fica sem importação (o estado de hoje), enquanto o aviso por parada já a enxerga (o desvio
   move a parada). `nfe_addresses` não tem índice por `(company_id, participant_id)`: a T3.2 mede o lote com
   `EXPLAIN`, e o índice, se preciso, vai em migration própria (`CONCURRENTLY`), não nesta.
2. **Busca (HTTP).** Pares `(cidade, ano)` pendentes ou vencidos, por `sum(document_count)` decrescente; uma
   requisição por par (`GET /feriados/cidade/{ibge}?ano=Y&limit=100`, paginação só se vier mais de 100). Nacional: 1
   por ano, só paridade (D4). Estadual só se a resposta da cidade não trouxer os estaduais.
3. **Aplicação (só banco, SQL por conjunto).** `MUNICIPAL` → `municipal_holidays … ON CONFLICT DO NOTHING`, pulando as
   suprimidas; `ESTADUAL` → `state_holidays` `once` marcado (D6); só datas `>=` hoje em São Paulo (D7).

**Erros (texto da T0.1, corrigido pela 2ª rodada da revisão `opus` da Fase 3, 2026-10-09):** 401 encerra o ciclo com
`provider_unauthorized` sem nova requisição; **402/403 numa cidade** grava o par `failed` com `provider_plan_restricted`
por 30 dias e o ciclo segue (no nacional ou no estado encerra como `provider_unauthorized`); 429 encerra e respeita
`Retry-After` (entre 60 s e 24 h); **cota esgotada só encerra o ciclo** — nenhum par muda, então um orçamento maior solta
tudo no ciclo seguinte (o status `quota_exhausted` segue permitido pela CHECK da §3, mas a rotina já não o grava); 404 em
cidade ou fora da cobertura marca `not_covered` e retenta em 90 dias, enquanto 404 no **nacional ou no estado** é contrato
quebrado (`malformed_response`, recuo de 1 h, o ciclo para); 5xx/timeout → backoff 1 h, 6 h, 24 h, até 7 dias, e 3
`provider_unreachable` seguidos abrem o disjuntor; resposta fora do formato (guarda Zod com as chaves esperadas) →
`malformed_response`, nada gravado; resposta boa que o banco recusa → par `failed` com `persistence_failed` e recuo.
Vocabulário de falha **do job** (as quatro cópias do catálogo, sem mudança): `provider_unreachable`,
`provider_unauthorized`, `malformed_response`; `provider_plan_restricted`, `provider_rate_limited` e `persistence_failed`
são códigos **do par**. O contador mensal é incrementado por upsert **depois do limitador e imediatamente antes do envio**
(só a queda do processo nesse intervalo gasta uma requisição que não saiu) e a rotina para ao atingir o orçamento.

**Estimativa (amostra local):** carga inicial ≈ 138 requisições (67 cidades × 2 anos = 134, mais 2 de paridade nacional e
2 estaduais de SP, se a resposta da cidade não os trouxer), ≈ 2,8 min de relógio no total, em **2 dias** (o teto é 100
por ciclo e o ciclo é diário: 100 + 38); as 645 cidades de SP × 2 anos = 1.290 levariam 13 dias. Manutenção: cada par
vive 24 meses no horizonte e é rebuscado a cada 180 dias, ≈ 4 buscas por cidade por ano → 67 × 4 = 268/ano ≈ 23/mês.

**O orçamento é da instalação.** O contador mora no banco de cada instalação (ADR-0021, um deploy por
transportadora). Uma chave da FeriadosAPI compartilhada entre instalações dividiria os 60/min e a cota do plano sem que
um banco veja o outro: uma chave por instalação, ou o orçamento de cada uma dividido à mão (passo do usuário, Q3).

### 6. Os avisos

- **A data da entrega** é o `estimatedArrivalAt` de cada parada da sugestão (montagem) e o
  `trip_stops.estimated_arrival_at` das paradas não concluídas (detalhe), convertidos para dia civil em
  `America/Sao_Paulo`. A viagem não tem data planejada própria.
- **A cidade** é o 1º segmento da `addressKey` da parada (`trips/domain/stop-address-key.ts`), que já é o destino
  físico.
- **A regra** é o `explainDay` do calendário da cidade (municipal digitado, gerado ou importado; estadual; nacional):
  avisa quando o dia não é útil **por feriado**. Fim de semana segue no aviso que já existe.
- **O formato** só informa e nunca desabilita "Criar viagem", com a origem marcada (nacional, estadual, cadastrado,
  importado): "Entrega prevista ter 13/10 em Campinas: feriado municipal — Aniversário (importado). Confira se o
  cliente recebe."
- **Formato único:** `{ date, cityIbgeCode, cityName, reasons[] }` — `cityName` do mesmo endereço do destino físico
  que dá o código (nulo → o texto omite a cidade); `reasons[]` com escopo, origem e nome. Serve o painel e o app do
  motorista. `trip_stops` não guarda o nome da cidade (só a `addressKey` e o `label` montado, de onde a cidade não se
  recupera com segurança): ele vem de `nfe_addresses.city` pela escolha do destino físico (`listStopAddresses`), e
  só quando o `city_code` daquele endereço é a cidade da parada — com desvio manual os dois diferem e `cityName` sai
  nulo.
- **API:** `GET /trips/:id` ganha nas paradas o campo **aditivo** `holidayWarnings` nesse formato,
  reaproveitando o calendário que a 236 já carrega (+0 consultas quando já carregado; senão +4 fixas, em série, sem
  N+1); o nome da cidade sai dos endereços que o detalhe já lê, sem consulta a mais. `POST /business-calendar/day-checks` serve a montagem (a sugestão é efêmera): corpo `.strict()` com até 200
  itens `{ cityIbgeCode, date }`, `companyId` do contexto, responde só os dias não úteis, +4 consultas fixas. O painel
  chama **uma vez**, depois que o solver termina; se a rota falhar, cai no aviso nacional de hoje.
- **App do motorista** (`apps/frontend-driver`, app separada, ADR-0075): `GET /me/trips/current` ganha
  `holidayWarnings` nas paradas, com o recorte pelo vínculo do motorista intacto (ele só vê a viagem dele). O
  calendário das cidades das paradas é carregado **uma vez**, em série, **+5 consultas fixas** sobre a contagem atual
  da leitura (4 do calendário e 1 dos endereços para o `cityName`, que a leitura do motorista hoje não lê; medida e
  fixada em contrato antes do código); falha ao carregar não derruba a leitura, só tira o aviso. O módulo do aviso é
  chamado pelo caso de uso, nunca pelo repositório da leitura (que está no contrato de isolamento da 236), e usa
  `loadBusinessCalendarRules` + `buildBusinessCalendar` direto, não o `trip-delivery-deadline-calendar.support.ts`.
  A guarda do app (`driverTripResponse.validation.ts`) escolhe campo a campo e já ignora o desconhecido; ela passa a
  ler o aviso como **acessório** (ausente ou malformado → lista vazia, nunca recusa da viagem) e o guarda no snapshot
  do aparelho. Texto curto de campo ("Hoje é feriado em Campinas (aniversário da cidade). Confirme com o cliente
  antes de ir."), "hoje" só quando a data do aviso é o dia civil de São Paulo no relógio do aparelho (corrigido pelo
  desvio que o app já mede, `clockOffset.service.ts`); nunca esconde nem bloqueia iniciar
  trajeto, chegar, entregar ou registrar ocorrência. Sem rede, mostra o último aviso conhecido e não inventa. Nada é
  importado do painel. **Não-regressão:** `computeDriverScore`, a pontualidade do comprovante e `missingAfterHours`
  não leem o calendário nem o aviso (contrato de isolamento, como a 236 CA6).
- **Ordem de publicação:** painel tolerante e app do motorista tolerante → API → telas. O campo é de **resposta**: a
  regra "`.strict()` exige API antes do app" do `apps/api-transportada/CLAUDE.md` vale para corpo de requisição, e
  aqui a ordem é a inversa. **Cumprida em staging em 2026-10-09:** os clientes tolerantes (T5.1/T5.1b) já estavam em
  `main` (promoção de 2026-10-09, PR #154), a API dos avisos (T4.2, T4.3) entrou em seguida e as telas (T5.2 a T5.4) só depois dos prints
  aprovados.

## Consequências

- O calendário passa a ter feriado municipal sem digitação, e o prazo da 236 deixa de contar dia útil a mais nas
  cidades cobertas.
- O produto ganha um **destino de saída** novo (`feriadosapi.com`) e um custo recorrente possível (plano Developer).
- O cache global é a primeira tabela de dado de terceiro sem `company_id` desde `geocoded_addresses`; ela nunca é
  exposta por rota.
- Falha do fornecedor nunca derruba nada do negócio: o pior caso é feriado não importado, que é o estado de hoje.
- O roteirizador deixa de fechar clientes de uma cidade pelo feriado de outra — correção que vale mesmo sem a
  importação.
- O motorista passa a saber, na parada, que a cidade está em feriado, sem rede e sem consulta nova do app; a leitura
  dele custa +5 consultas fixas e a nota dele não muda.
- A rotina nasce pausada (D13): o painel de rotinas a mostra "pausada pelo sistema" até o usuário configurar o token
  e despausar, em vez de uma falha `unexpected_error` por dia.

## Riscos

- **Termos de uso desconhecidos** (Q4 da spec 252). A página de termos deu 404 e a documentação não diz se o dado pode
  ser guardado. Registrado em `docs/SECURITY.md` (2026-10-07). **Passo do usuário:** confirmar com o fornecedor
  antes de configurar o token. Precedente de risco aceito por decisão do usuário: termos do Google Maps Platform, spec 186.
- **Cota e plano** (Q3). A documentação não diz quanto uma cidade do interior consome. O orçamento mensal no banco
  impede ultrapassar o número configurado, mas não sabe o preço real de cada chamada.
- **Mudança de contrato do fornecedor.** A guarda Zod recusa a resposta inteira (`malformed_response`) e nada é
  gravado; o operador vê a falha no status da importação.
- **Dado errado do fornecedor.** A origem fica visível ("Importado (FeriadosAPI)"), o operador desliga (com auditoria)
  e a supressão impede a volta; D7 impede que um erro mude o passado.
- **Aniversário de cidade não aparece na documentação** do fornecedor. Se ele não vier, a cidade fica só com o que o
  fornecedor tem; o cadastro manual da 238 continua valendo e vence.
- **O aviso guardado no aparelho envelhece.** O snapshot vale até 24 h (ADR-0075 §8); um aviso calculado ontem pode
  não valer hoje. Por isso o app mostra a data do aviso e só diz "hoje" quando ela é o dia civil do aparelho.
- **Dia UTC no roteirizador** (fora de escopo): depois das 21 h em Brasília, o "dia" do roteiro vira o seguinte. Fica
  para outra spec.
- **Junção da descoberta sem índice.** `nfe_addresses` não tem índice por `(company_id, participant_id)`; cada lote de
  2.000 notas pode varrer a tabela. A T3.2 mede; o índice, se preciso, sai em migration própria.
- **Chave compartilhada entre instalações** (§5): o orçamento de um banco não vê o do outro.

## Alternativas descartadas

| Alternativa                                 | Por que não                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cache por empresa                           | Paga a mesma cidade uma vez por empresa; o dado é público e não muda por empresa                                        |
| Roteirizador lendo o cache direto           | Muda o contrato congelado do solver e ignora supressão, adoção e a precedência da linha digitada                        |
| Importar o país inteiro (5.571 municípios)  | ~11 mil requisições para cidades onde nunca houve entrega; estoura cota sem benefício                                   |
| Importar sem corrigir o roteirizador antes  | Cada feriado importado fecharia todos os clientes do roteiro, não só os da cidade                                       |
| App do motorista calculando o aviso sozinho | Copiaria o calendário para o app separado (ADR-0075) e divergiria da API; offline sem a lista da cidade                 |
| Rota nova só para o aviso do motorista      | Mais uma chamada no celular e um aviso que some sem rede; a leitura atual já é guardada no aparelho                     |
| Bloquear "Criar viagem" em feriado          | O cliente pode abrir (exceção do cliente, ADR-0048 §3); quem decide é o operador                                        |
| BrasilAPI                                   | Só nacionais (conferido em 2026-10-07: das 14 datas de 2026, 13 batem com o código e a outra é a Páscoa); sem municipal |
| Gravar feriado passado                      | Mudaria o selo de prazo de nota já entregue (236)                                                                       |
| Rotina horária                              | 1×/dia cobre a demanda (≈ 25 requisições/mês de manutenção) e gasta menos cota                                          |

## Emendas

- **ADR-0048 §3** — "Nenhuma fonte pública de feriado municipal é confiável o bastante para virar dependência" deixa de
  valer como proibição: a FeriadosAPI entra como **fonte opcional**, com a linha digitada vencendo, origem visível,
  supressão auditada e falha que nunca derruba o negócio. A frase "alimentado à mão" passa a ser "alimentado à mão e,
  quando configurado, pela importação". O texto histórico do ADR-0048 fica; uma nota no topo aponta para cá.
- **Spec 238, "Fora do escopo"** — "Importar feriados de fonte pública … nunca carga automática" é revogado pela spec
  252 para a FeriadosAPI. O CSV manual (P3 da 238) continua fora. Nota no topo da spec 238 aponta para cá.
