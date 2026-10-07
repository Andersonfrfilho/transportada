# Evidência — 252

## Pesquisa e desenho (2026-10-07)

Antes de qualquer task. Desenho do `architect` (`opus`); spec, plano, tarefas e ADR-0100 redigidos a partir dele, só
documentação (nenhum código, nenhuma migration). Branch `work/spec-feriados-import` a partir de `origin/staging`
(`927335484`).

### Numeração conferida

- `git ls-tree --name-only origin/staging specs/` → a última é `251-emissor-nacional-gratuito`.
- `git ls-tree --name-only origin/staging docs/adr/` → o último é `0098-a-nfse-fala-a-nota-rp-v3.md`.
- `specs/251-emissor-nacional-gratuito/tasks.md:87` reserva o **ADR 0099** para a 251.
- Nenhum worktree (`git worktree list`, 70+ árvores) tem `specs/252*` nem `docs/adr/0099*`/`010*`.
- Usados: **spec 252** e **ADR 0100** (iguais à reserva do `architect`).

### Specs do mesmo assunto lidas (regra do `CLAUDE.md` da raiz)

- **238** (`spec.md`, `plan.md`, `tasks.md`, início da `evidence.md`): calendário de dias úteis; "fora do escopo" exclui
  importar de fonte pública — **emendado pelo ADR-0100**. T2.4 (revisão de design da tela) segue aberta.
- **236** (`spec.md`): o prazo lê o calendário pela cidade do destino físico, recalculado a cada leitura; D7 desta spec
  existe para não mudar o selo de nota já entregue.
- **060** (trechos de feriado): D2b, "o feriado é do município, não do cliente"; exceção do cliente vence o feriado.
- **073**: destino físico (`resolvePhysicalDestination`), sem trecho próprio de feriado.
- **ADR-0048 §3**: "nenhuma fonte pública de feriado municipal é confiável" — **emendado pelo ADR-0100**.
- **ADR-0096** inteiro: forma B1, leitura da política (`source_rule_id IS NULL` → `once`), convivência §6, leituras em
  série.

### Fatos do código conferidos em `origin/staging` (amostra; a T0.2 confere o resto)

- `readPoolWindows` (`drizzle-route-optimization.repository.ts`): o select de `municipal_holidays` traz só
  `holidayOn` (~1053) e a mesma lista vai a todo cliente (`holidays.map(...)` ~1076); o mapa resolvido é por `taxId`
  (~1088).
- `route-optimization-municipal-holiday.integration.test.ts` ~199–206: "comportamento atual (defeito conhecido, spec
  238 fora de escopo)", espera `[CITY_A, CITY_B]`.
- `environment.schema.ts` do worker ~82–92: `GOOGLE_MAPS_API_KEY` opcional, vazio = ausente.
- `20261007133324_cargo_preview_retention/migration.sql`: molde de CHECK de `job` + linha em `job_schedules`
  (`86400`). Última migration em staging: `20261007140303_business_calendar`.
- Catálogo de jobs em quatro cópias (`job-catalog.constant.ts` na API, worker e cron; `jobCatalog.constant.ts` no
  painel).
- `routeSchedule.service.ts` ~55–75: o aviso de hoje olha só feriado nacional (`findBrazilianHoliday`) e só a última
  parada.
- `route-suggestion.routes.ts` ~33–34: `trip.manage` e `fleet.read`.
- `docs/SECURITY.md` ~1771–1782: destinos de saída do CEP e do Google, termos do Google aceitos como risco (spec 186).

### BrasilAPI (conferida e descartada)

Conferida pela sessão orquestradora em 2026-10-07 (não refeita nesta redação). As **14 datas de 2026** da BrasilAPI
batem com o calendário nacional do código (`listNationalHolidays`, ADR-0096 §2: 9 fixas + 4 por Páscoa = 13), e a
única a mais é a **Páscoa (05/04/2026)**, que é domingo e não muda dia útil. Só cobre nacionais: não resolve o problema
(municipal).

### FeriadosAPI (o que a documentação pública afirma)

Lida pela sessão orquestradora em 2026-10-07 (`https://feriadosapi.com`); transcrita aqui.

- Afirma cobrir **5.571 municípios** e **13.500+ feriados por ano**.
- Endpoints, autenticação `Bearer`, formato da resposta e paginação: ADR-0100 § Contexto.
- **Gratuito:** nacionais, estaduais e as 27 capitais, **60 req/min**. Cidades do interior **consomem cota** / plano
  pago; a documentação **não diz quanto**.
- **Developer:** R$ 39/mês, 5.000 consultas/mês, 60 req/min.
- **Aniversário de cidade:** **não mencionado** na documentação.
- **Termos de armazenamento:** **não encontrados** — a página de termos respondeu **404** e a documentação não diz se
  os dados podem ser guardados (Q4).

### Amostra local de NF-e (destinos)

67 cidades de destino distintas, todas em SP, nenhuma capital. Estimativa: carga inicial ≈ 138 requisições (134
cidade×ano + 2 paridade nacional + 2 estaduais de SP), ≈ 3 min, 2 ciclos de 100; manutenção ≈ 25/mês. As 645 cidades
de SP × 2 anos = 1.290 consultas cabem no 1º mês do plano Developer.

### Abertos para o usuário

- **Q3** plano e cota — `[NEEDS CLARIFICATION]`.
- **Q4** termos de uso — `[NEEDS CLARIFICATION]`; risco no ADR-0100 e em `docs/SECURITY.md`.

Nenhum dos dois bloqueia código; os dois bloqueiam configurar `FERIADOS_API_TOKEN` (passo do usuário).

## Acréscimo do usuário — o aviso no app do motorista (2026-10-07)

Pedido no chat, depois do desenho: _"e o aviso no app do motorista também"_. Incorporado como Q5b, D12, RF10b, RF13,
RF14, CA15–CA17 e as tasks T4.3, T5.1b e T5.4; ADR-0100 §2 (D12) e §6. Só documentação.

Fatos conferidos em `origin/staging` (`927335484`) para o desenho:

- **A guarda do app escolhe campo a campo.** `apps/frontend-driver/src/modules/driver-trip/shared/driverTripResponse.validation.ts`
  (`toStop` ~215–235) monta a parada só com os campos que conhece; campo desconhecido na resposta é **ignorado**, e só
  campo essencial ausente (`documents`, `sequence`) vira `DriverTripResponseError`. O app de hoje já tolera
  `holidayWarnings`; a T5.1b o faz **ler** o campo como acessório (molde do motivo da recusa do canhoto, spec 220 RF29)
  e o leva ao `DriverTripSnapshot`.
- **Offline:** o que passa pela guarda é o snapshot guardado no aparelho (`tripSnapshot.service.ts`: 24 h, dono
  `SHA-256(sub)`, ADR-0075 §8). O aviso precisa estar no tipo validado para sobreviver sem rede.
- **A regra de ordem da API é de requisição.** `apps/api-transportada/CLAUDE.md` ~555: "Os esquemas `.strict()` exigem
  **API antes do app**: campo novo no app antes de a API aceitar dá `400`". `holidayWarnings` é campo de **resposta**:
  a ordem é a inversa (clientes tolerantes → API).
- **Contagem de consultas da leitura do motorista:** `test/integration/driver-snapshot-products.integration.ts` conta
  só as consultas a `nfe_products` (uma por viagem, 247 T4.6) e prova que a falha dos produtos não derruba o snapshot.
  **Não há contrato da contagem total** de `GET /me/trips/current`; a T4.3 mede a linha de base e a fixa antes do
  código.
- **Isolamento da nota:** `test/trip-domain/delivery-deadline-isolation.contract.ts` impede que
  `driver-score.policy.ts`, `delivery-proof-*.ts`, `proof-pending.query.ts` e `drizzle-current-driver-trip.repository.ts`
  importem o prazo da 236 (agulha `delivery-deadline`). A T4.3 acrescenta a agulha do calendário/aviso para os
  arquivos da nota e do comprovante (a leitura do motorista pode usar o aviso; a nota não).
- **App separada:** o cabeçalho da guarda diz "cópia por valor" da do painel (ADR-0075 §7); nada é importado. O
  módulo legado `driver-trip` do painel fica fora (spec 189 Fase 10) e já tolera o campo pela mesma guarda.

Escolha por delegação registrada: o aviso traz `cityName` (RF10b) para o texto "em Campinas" sair sem consulta no app.

## T0.1 — validação do ADR-0100 contra o código (2026-10-07)

Executor `opus`, worktree isolado, branch `work/252-t0` a partir de `origin/staging` (`eaa2a7eb7`). Cada afirmação do ADR,
da spec e do plano conferida no arquivo e na linha lidos agora. Só documentação: nenhum código, nenhuma migration.

**Veredito:** o desenho passa. Nenhuma divergência pede decisão nova do usuário; as 22 abaixo foram corrigidas no
lugar (spec, plano, tarefas, ADR), mantendo as decisões do usuário. Uma decisão por delegação nova (**D13**, a rotina
nasce pausada de fábrica) reforça o bloqueio da Q4 e é revogável. ADR-0100 passa a **aceita**.

### O roteirizador já foi corrigido (T1.1 e T1.2 fechadas)

A Fase 1 saiu antes desta validação, por decisão do usuário, na spec 238 ("F1 do roteirizador"):

| Commit em `origin/staging` | O quê                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `913aad994`                | teste vermelho antes: asserção do defeito invertida (`[CITY_B]`) e o mesmo CNPJ em A e em B |
| `4454228ac`                | correção: janela por `${cityCode}\u0000${taxId}`, `resolveDeliveryWindow` e solver intactos |
| `1754e36e7`                | evidência, ADR-0096 (nota de 2026-10-07), `CLAUDE.md` e contexto do worker                  |

Evidência: `specs/238-os-dias-uteis-contam-feriado-e-aniversario-da-cidade/evidence.md` § T1.2a (nota de correção,
linhas 140–142) e § "F1 do roteirizador — feriado por cidade" (653–687): 15/15 no arquivo, 5 mutações vermelhas e 1
equivalente documentada. Duas notas de fidelidade: a evidência da 238 cita o commit vermelho como `1986d7ad2` (SHA de
antes do rebase; em staging é `913aad994`), e a contagem "234 integrações do worker sem falha" é do relato da sessão
que publicou — o arquivo da 238 registra o arquivo do roteirizador (15/15), não a suíte inteira.

A correção **mudou de lugar** o que o plano citava: `readPoolWindows` saiu de `drizzle-route-optimization.repository.ts`
para `routing/infrastructure/drizzle-pool-window.query.ts` (27–120; o select de feriado em 102–116, já com
`cityIbgeCode`), e a resolução para `routing/domain/pool-window.policy.ts` (chave 16–21, `resolveStopWindows` 40–86
com o filtro por cidade em 52, `resolvePoolWindow` 98–118). O repositório chama os dois em 917 e 929.

### Divergências e correções

| #   | Item | Estava (spec/plano/ADR)                                                                             | O código mostra (arquivo:linha em `origin/staging`)                                                                                                                                                                                                                                                                                                                                                                                                                               | Correção                                                                                                                                                                                                                                                                           |
| --- | ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | a    | Fase 1 a fazer; `readPoolWindows` ~990–1092 no repositório; teste ~199–206                          | Feita (`913aad994`/`4454228ac`/`1754e36e7`); arquivos novos acima; os casos novos do teste estão em 231–264                                                                                                                                                                                                                                                                                                                                                                       | T1.1/T1.2 `[x]`; plano e ADR §1 apontam os arquivos novos                                                                                                                                                                                                                          |
| V2  | a    | "A importada entra sem mudar a consulta"; `reasons[]` com origem (RF10b)                            | **Confirmado o filtro:** `readTypedHolidays` filtra só `isNull(sourceRuleId)` (`business-calendar-rules.query.ts:53–74`) e a importada (com `provider_entry_id`, `source_rule_id` nulo) entra como `once`. **Mas a origem não existe:** `HolidayReason` só tem `source` (`business-calendar.types.ts:44–47`), as regras não têm origem (24–36) e os mapeadores a descartam (`business-calendar-rule.mapper.ts:56–73`, 87–93)                                                      | Filtro **não muda** (nem incluir nem excluir `provider_entry_id`). A T4.2 acrescenta `origin` (`code`/`typed`/`rule`/`imported`) às regras e à razão; o mapeador lê `providerEntryId` (o `select()` já traz a coluna)                                                              |
| V3  | a    | Adoção "pelo `PATCH`"; desligar só pela rota nova                                                   | Toda escrita da 238 trata a importada como digitada: `save` (`drizzle-municipal-holiday.repository.ts:65–111`) faz `onConflictDoUpdate` sem zerar `provider_entry_id`; `isSameTypedHoliday` (`municipal-holiday.support.ts:54–61`) veria a importada de mesmo nome como "nada a gravar"; `update` (113–150) idem; `remove` (152–182) apaga **sem supressão** (voltaria no ciclo seguinte); `typedHolidaysKept` (`municipal-holiday-typed.queries.ts:37–48`) a conta como digitada | T4.1 cobre os quatro: `POST` e `PATCH` numa importada são adoção (zeram `provider_entry_id`); `DELETE` numa importada **é** o desligar (supressão + auditoria na mesma transação); `typedHolidaysKept` conta só `provider_entry_id IS NULL`; o mesmo nas rotas de `state_holidays` |
| V4  | a    | D3: "a gerada por regra também vence a importada"                                                   | Vale só se a gerada já existe: a materialização é `ON CONFLICT DO NOTHING` (ADR-0096 §6.1); regra criada **depois** deixa a importada na linha                                                                                                                                                                                                                                                                                                                                    | D3 precisado: as duas convivem, o dia conta uma vez (as duas causas na lista), a geração da 238 não muda                                                                                                                                                                           |
| V5  | b    | Tabelas e colunas sem nomes de constraint                                                           | O nome padrão do drizzle da FK `municipal_holidays.provider_entry_id` tem **67 bytes** (passa de 63: o Postgres trunca calado e o `snapshot.json` diverge); o de `state_holidays` tem 63 exatos; o único padrão de `holiday_import_suppressions` tem 72                                                                                                                                                                                                                           | ADR §3 lista **todos** os nomes, explícitos, contados (o maior, 58 bytes)                                                                                                                                                                                                          |
| V6  | b    | Único `(scope, ibge_code, year)` com nacional                                                       | Com `ibge_code` nulo no nacional, o único não segura (NULL é distinto); `NULLS NOT DISTINCT` depende da versão do Postgres e a da CI difere da local                                                                                                                                                                                                                                                                                                                              | `ibge_code` NOT NULL, nacional = `'BR'`, CHECK de forma por escopo; `month` é `date` do dia 1º                                                                                                                                                                                     |
| V7  | d    | Orçamento: `UPDATE … SET requests = requests + 1 WHERE month = $m AND requests < $budget RETURNING` | No 1º pedido de cada mês **não há linha**: o `UPDATE` não devolve nada e a rotina pararia para sempre                                                                                                                                                                                                                                                                                                                                                                             | Upsert: `INSERT … VALUES ($m, 1) ON CONFLICT (month) DO UPDATE SET requests = … + 1 WHERE … < $budget RETURNING`; orçamento `>= 1` no schema                                                                                                                                       |
| V8  | b    | Estadual `once` com `ON CONFLICT DO NOTHING`                                                        | O único de `state_holidays` é **parcial** (`state_holidays_company_state_once_unique … WHERE recurrence = 'once'`, `state-holiday.schema.ts:58–60`); o nome é CHECK 1–120 (72–75)                                                                                                                                                                                                                                                                                                 | O `ON CONFLICT` nomeia o predicado do índice parcial; a guarda Zod exige nome de 1 a 120                                                                                                                                                                                           |
| V9  | c    | Molde "4 CHECK"; contrato do catálogo em `test/job-catalog/catalog.contract.ts` nas quatro apps     | Das 4 CHECK do molde (`20261007133324_cargo_preview_retention/migration.sql`), só 2 são de `job`; as outras 2 são da trilha da prévia. O painel guarda a paridade em `apps/frontend-transportada/test/shared/job-catalog.contract.ts`. Catálogo em staging: 16 rotinas                                                                                                                                                                                                            | A 252 usa só as 2 de `job` (`NOT VALID` + `VALIDATE`); caminho do contrato do painel corrigido                                                                                                                                                                                     |
| V10 | c    | "Piso de 3.600 s"                                                                                   | O piso do banco é a batida (`JOB_TICK_INTERVAL_SECONDS = 300`, `job_schedules_interval_check`, `job-schedule.schema.ts:72–75`); o piso por rotina é `minimumIntervalSeconds` do catálogo (`job-catalog.constant.ts:269–271` no molde); trava `job_executions_open_unique` (145–147), lease 30 s (`run-job-cycle.ts:27`) renovado a cada 10 s                                                                                                                                      | D9: `minimumIntervalSeconds: 3_600` no catálogo e linha de `job_schedules` com 86.400                                                                                                                                                                                              |
| V11 | c    | "Sem token: rotina não registrada, boot verde"                                                      | Verdade, e **não é silencioso**: cada janela loga erro `job_run_routine_missing` e fecha `unexpected_error` (`run-job-cycle.ts:102–113`) — todo dia, até alguém configurar. O schema prevê a "pausa de fábrica" (`paused_origin = 'system'`, `job-schedule.schema.ts:58–63`)                                                                                                                                                                                                      | **D13 (delegação, revogável):** a linha de `job_schedules` nasce pausada de fábrica; despausar é passo do usuário junto com o token (reforça a Q4)                                                                                                                                 |
| V12 | d    | "A mesma junção do roteirizador"                                                                    | A junção é SQL (`nfe_participants` papel `delivery`/`recipient` + `nfe_addresses`, `drizzle-route-optimization.repository.ts:797–830`), mas a **escolha** é em TypeScript (`resolvePhysicalDestination`, 854–862; `physical-destination.policy.ts`): o critério "monta chave de parada" normaliza CEP e número                                                                                                                                                                    | A descoberta carrega as linhas do lote e escolhe com a mesma função (cópia do worker), nunca um `COALESCE` em SQL                                                                                                                                                                  |
| V13 | d    | Destino físico sem falar do desvio manual                                                           | O roteirizador não lê `delivery_address_overrides` (nenhuma referência em `apps/worker-transportada/src`); o prazo da 236 lê (`trip-delivery-deadline.support.ts:76`) e o desvio move a parada (`drizzle-delivery-address-override.repository.ts:137–190`), então o aviso por parada já o vê                                                                                                                                                                                      | A descoberta ignora o desvio, como o roteirizador: cidade alcançada só por desvio fica sem importação (o estado de hoje). Limite registrado no ADR §5                                                                                                                              |
| V14 | d    | Cursor sobre `nfe_documents_company_updated_issued_id_idx`                                          | O índice existe (`nfe.schema.ts:304–309`, `company_id`, `updated_at`, `issued_at`, `id`, todos `DESC`). **`nfe_addresses` não tem índice por `(company_id, participant_id)`** (416–429): a junção de cada lote varre a tabela                                                                                                                                                                                                                                                     | A T3.2 mede o lote com `EXPLAIN`; se precisar, o índice vai em migration própria (`CONCURRENTLY`, fora da transação do drizzle), não nesta                                                                                                                                         |
| V15 | g    | "≈ 3 min, em 2 ciclos de 100"                                                                       | 138 × 1,2 s ≈ 2,8 min de relógio, mas o teto é 100 por ciclo e o ciclo é diário                                                                                                                                                                                                                                                                                                                                                                                                   | Carga da amostra em **2 dias** (100 + 38); as 645 cidades de SP em 13 dias; manutenção ≈ 4 buscas por cidade por ano (o par vive 24 meses, rebuscado a cada 180 dias) ≈ 23/mês                                                                                                     |
| V16 | g    | Orçamento mensal como teto da conta                                                                 | O contador é por banco, e a instalação é dedicada (ADR-0021): uma chave compartilhada entre instalações dividiria os 60/min e a cota sem nenhum banco ver o outro                                                                                                                                                                                                                                                                                                                 | Registrado na Q3 (passo do usuário: uma chave por instalação, ou dividir o orçamento)                                                                                                                                                                                              |
| V17 | e    | `cityName` "do mesmo endereço do destino físico"; motorista "+4 fixas"                              | `trip_stops` não guarda cidade (`trip.schema.ts:770–800`; `label` é "rua, número, cidade, UF", `stop-label.policy.ts`, não se desmonta com segurança). O detalhe já lê o endereço com `city` (`listStopAddresses`, `nfe-destination-address.support.ts:102–150`); a leitura do motorista **não** lê `nfe_addresses`                                                                                                                                                               | Detalhe: `cityName` a +0. Motorista: **+5 fixas** (4 do calendário + 1 de endereços). Com desvio, o `city_code` do endereço difere da cidade da parada → `cityName` nulo                                                                                                           |
| V18 | e    | Guarda do app: "só `documents` e `sequence` são essenciais"                                         | `toStop` (`driverTripResponse.validation.ts:215–235`) também exige `id` e `label` (`readString` lança)                                                                                                                                                                                                                                                                                                                                                                            | Texto do plano corrigido                                                                                                                                                                                                                                                           |
| V19 | e    | "Hoje" = "dia civil do aparelho" (RF14) e "do aparelho em São Paulo" (T5.4)                         | O app já corrige o relógio pelo `Date` das respostas (`clockOffset.service.ts`, `driverClockOffset`); o fuso do produto é fixo em São Paulo (ADR-0096 Q3)                                                                                                                                                                                                                                                                                                                         | Uma redação só: dia civil de São Paulo no relógio do aparelho corrigido pelo desvio                                                                                                                                                                                                |
| V20 | e    | O aviso do motorista mora "num módulo de aviso próprio"                                             | `drizzle-current-driver-trip.repository.ts` está no contrato de isolamento com a agulha `delivery-deadline` (`test/trip-domain/delivery-deadline-isolation.contract.ts:11–23`); `loadCityCalendars` mora em `trip-delivery-deadline-calendar.support.ts`, cujo nome contém a agulha. A leitura usa `Promise.all` fora de transação (330–371)                                                                                                                                      | T4.3: o módulo do aviso usa `loadBusinessCalendarRules` + `buildBusinessCalendar` direto, é chamado pelo caso de uso e nunca pelo repositório                                                                                                                                      |
| V21 | h    | D7 "o selo de nota já entregue não muda"                                                            | Provado para o **estado**: o feriado só empurra `dueOn` para depois (`addBusinessDays`); se `dueOn` < hoje, todo feriado ≥ hoje cai depois dele. Mas `businessDaysLate` conta `from < d ≤ to` (`delivery-deadline.policy.ts:59`): a nota **entregue hoje** atrasada perde 1 dia de atraso se o feriado de hoje for importado hoje                                                                                                                                                 | D7 precisado (o número fica mais certo, o estado nunca muda); desligar importada só para datas ≥ hoje, pelo mesmo motivo                                                                                                                                                           |
| V22 | f    | `docs/SECURITY.md` ~1771–1782 "destinos de saída"                                                   | 1768–1793 é a entrada do CEP sem limitador; os destinos e os termos do Google estão na atualização de 2026-09-24 (1795–1806). Não há uma "lista de destinos" à parte                                                                                                                                                                                                                                                                                                              | Plano corrigido; a T6.1 atualiza a entrada da 252 (`SECURITY.md:61–83`). Molde de redação do token: `nota-rp-v2.client.ts:158–161`                                                                                                                                                 |

Fora da tabela, uma regra de dado: o fornecedor pode trazer duas entradas na mesma `(escopo, ibge, data)` (um
`FACULTATIVO` e um `MUNICIPAL` no mesmo dia); a identidade do D2 as junta e a não facultativa vence (ADR §3).

### Segurança (f) — conferido, sem divergência de decisão

- O token mora só no worker: `environment.schema.ts:82–92` é o molde (`GOOGLE_MAPS_API_KEY`, vazio = ausente); a API
  e o painel não ganham variável. `.railway/railway.ts` já usa `preserve()` (linha 79 em diante) e `.env.example:59`
  traz a chave do Google sem valor.
- O que sai: código IBGE e ano. Nenhum `companyId`, nome ou endereço (o cache é global e a busca não sabe de empresa).
- Termos desconhecidos (Q4): risco registrado em `docs/SECURITY.md:61–83`, aceito só pelo usuário. Com a D13, ligar
  a rotina exige dois atos do usuário (token e despausar).
- A tabela global sem `company_id`: é a exceção declarada de `geocoded_addresses` (`geocoding.schema.ts:25–30`, "a
  tabela é ativo do produto, não do tenant"). O repositório dela fica no worker e nenhuma rota a devolve crua: as rotas
  de status (T4.1) leem as tabelas por empresa e só **agregam** o cache para as cidades da própria empresa.

### Conflitos com outras specs (h)

- **236:** o prazo é recalculado a cada leitura (`readTripDeliveryDeadlines`, `trip-delivery-deadline.support.ts:133–154`,
  via `loadCityCalendars`). D7 protege o estado do selo (V21). Sem colisão de arquivo: a 252 não escreve nada da 236.
- **238:** emenda do "fora do escopo" confirmada no topo da `spec.md` (linhas 3–5); a nota de 2026-10-07 do
  ADR-0096 (Q1) já registra a correção do roteirizador. T2.4 da 238 (revisão de design) segue aberta e não colide.
- **ADR-0048 §3:** emenda confirmada no topo (linhas 7–9).
- **249:** a migration dela (`20261007114250_trip_crew_events`) já está em staging; nenhuma tabela em comum.
- **250:** a migration `20261007205304_nfse_national_taxation` (`nfse_emission_profiles`) estava só no worktree
  `transportada-wt/spec-250` no começo da T0 e **entrou em staging durante ela** (`f052d897d`, Fase 2 da 250; o
  `git fetch` do fim achou staging 6 commits à frente, e esta branch foi rebaseada sem conflito — a 250 não tocou
  nenhum arquivo citado aqui, só o `.env.example`, onde a linha do Google segue 59). Sem tabela em comum; a migration
  da 252 nasce **depois** de `20261007205304`, a última em staging agora. A 250 também desenha um limitador por
  processo no worker (espaçamento ≥ 1 s, uma réplica): dois limitadores independentes, um por fornecedor; nenhum
  compartilhado.
- **251:** reserva o ADR 0099 (`specs/251-emissor-nacional-gratuito/tasks.md:87`), ainda não publicado; sem migration nem
  rotina nova.
- **Catálogo de jobs:** varridos os 79 worktrees; nenhum tem nome de rotina fora das 16 de staging. Sem colisão.
- **Numeração:** spec 252 e ADR 0100 só aparecem nesta spec (este worktree, `agent-a5499110de4d6b742` e
  `pub-t26-t12a`, as três com os mesmos arquivos de staging). Última migration em staging, depois do rebase:
  `20261007205304_nfse_national_taxation`.

## T0.2 — reconferência de arquivo e linha (2026-10-07)

Todos os pares citados em `plan.md` e `tasks.md` contra `origin/staging` (`eaa2a7eb7`). "Mudou" = moveu por outra
sessão ou pela própria correção da Fase 1.

| Citado                                                                                                   | Real                                                                                                                                     | Situação        |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `delivery-client.schema.ts` ~240–288 (`municipal_holidays`)                                              | 240–288; único 262–266; FK da regra 277–283; índice parcial 284–286                                                                      | igual           |
| `state-holiday.schema.ts`                                                                                | 36–81; únicos parciais 58–63; CHECK de nome 72–75                                                                                        | igual           |
| `business-calendar-rules.query.ts` (`loadBusinessCalendarRules`)                                         | 109–131; `readTypedHolidays` 53–74                                                                                                       | igual           |
| `trip-delivery-deadline-calendar.support.ts`                                                             | `loadCityCalendars` 22–44                                                                                                                | igual           |
| `drizzle-route-optimization.repository.ts` `readPoolWindows` ~990–1092 (select ~1050–1060, ~1076, ~1090) | `drizzle-pool-window.query.ts:27–120` (select 102–116) + `pool-window.policy.ts:16–118`; chamadas no repositório 917 e 929               | **mudou** (F1)  |
| `delivery-window.policy.ts` ~62–98                                                                       | `resolveDeliveryWindow` 66–97                                                                                                            | igual           |
| `route-optimization-municipal-holiday.integration.test.ts` ~199–206                                      | casos por cidade 231–264 (o antigo "comportamento atual" foi invertido)                                                                  | **mudou** (F1)  |
| `20261007133324_cargo_preview_retention/` e última migration `20261007140303_business_calendar`          | molde igual; a última agora é `20261007205304_nfse_national_taxation` (250, entrou durante a T0)                                         | **mudou** (250) |
| `job-catalog.constant.ts` (API, worker, cron) e `jobCatalog.constant.ts` (painel)                        | existem as quatro; molde `cargo-preview.retention.apply` em `api/src/shared/job-catalog.constant.ts:266–272`                             | igual           |
| `test/job-catalog/catalog.contract.ts` "cada uma"                                                        | API, worker e cron; o painel em `test/shared/job-catalog.contract.ts`                                                                    | **corrigido**   |
| `job-schedule.schema.ts` ~71 e ~149                                                                      | 71 e 149; `job_executions_open_unique` 145–147; lease `run-job-cycle.ts:27`                                                              | igual           |
| `worker/src/config/environment.schema.ts` ~82–92                                                         | 82–92                                                                                                                                    | igual           |
| `routeSchedule.service.ts` ~31–75                                                                        | `resolveRouteFinish` 30–51, `resolveWarnings` 60–74 (`findBrazilianHoliday` 64)                                                          | igual           |
| `TripAssemblyMap.component.tsx` ~1159–1170                                                               | 1166–1169                                                                                                                                | igual           |
| `useSolverCityOrder.hook.ts` ~102                                                                        | 102                                                                                                                                      | igual           |
| `routeSuggestion.types.ts` (`estimatedArrivalAt`)                                                        | 44                                                                                                                                       | igual           |
| `trip_stops.estimated_arrival_at`                                                                        | `trip.schema.ts:800`                                                                                                                     | igual           |
| `stop-address-key.ts`                                                                                    | `buildStopAddressKey` 53–61 (`${cityCode}\|${postalCode}\|${number}`)                                                                    | igual           |
| `route-suggestion.routes.ts` ~33–34                                                                      | 33–34                                                                                                                                    | igual           |
| `geocoding.schema.ts`                                                                                    | `geocoded_addresses` 25–30                                                                                                               | igual           |
| `docs/SECURITY.md` ~1771–1782                                                                            | 1768–1806 (entrada do CEP + atualização da 186); entrada da 252 em 61–83                                                                 | **corrigido**   |
| `me-trip.routes.ts`, `find-current-driver-trip.use-case.ts`, `drizzle-current-driver-trip.repository.ts` | existem; caminho `API_ME_CURRENT_TRIP_PATH` (`shared/api.constant.ts:188`); `findCurrentDriverTrip` 215; isolamento dos produtos 365–368 | igual           |
| `driverTripResponse.validation.ts` `toStop` ~215–235                                                     | 215–235                                                                                                                                  | igual           |
| `tripSnapshot.service.ts` (24 h, `SHA-256(sub)`)                                                         | `TRIP_SNAPSHOT_MAX_AGE_MS` 14, digest 43                                                                                                 | igual           |
| `frontend-transportada/src/modules/driver-trip/` (legado)                                                | existe                                                                                                                                   | igual           |
| `test/integration/driver-snapshot-products.integration.ts`                                               | existe                                                                                                                                   | igual           |
| `test/trip-domain/delivery-deadline-isolation.contract.ts`                                               | agulha 11, arquivos 15–23                                                                                                                | igual           |
| `test/transaction-serial-queries.contract.test.ts`                                                       | existe                                                                                                                                   | igual           |
| `apps/api-transportada/CLAUDE.md` ~555                                                                   | 555–556                                                                                                                                  | igual           |
| `DriverStopCard.component.tsx`, `driver-trip/locales/`                                                   | existem (`driverTrip.locale.json`, `driverTrip.en.locale.json`)                                                                          | igual           |
| `nfe_documents_company_updated_issued_id_idx`                                                            | `nfe.schema.ts:304–309`                                                                                                                  | igual           |

Mudaram por outra sessão: a última migration (a 250 publicou `20261007205304` durante a T0); além dela, só as duas
citações do roteirizador, pela correção da Fase 1. Corrigidos por citação errada desde o desenho: o contrato do
catálogo do painel e as linhas do `SECURITY.md`. Reconferido depois do rebase sobre `dc96b88ca`: nenhum arquivo citado
na tabela mudou.

**Nome do módulo da rotina** (o plano pedia confirmar): os módulos de rotina do worker levam o nome do job
(`fuel-price-pull/`, `nfse-status-pull/`, `geocoding-refine/`, `cargo-preview-retention/`), com
`application/<job>.routine.ts`. O da 252 passa a `src/holiday-provider-pull/` (era `holiday-provider-import/`).

**Próximo timestamp de migration:** qualquer um depois de `20261007205304_nfse_national_taxation` (a última em
staging depois do rebase), e depois da última que houver na hora de gerar.
