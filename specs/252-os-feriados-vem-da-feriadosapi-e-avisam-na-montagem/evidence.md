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

## T5.1 e T5.1b — painel e app do motorista toleram `holidayWarnings` (2026-10-07)

**Commits:** `928c7bb8c` (app do motorista; a mensagem diz "painel" por engano do executor) e `f37457a8d` (painel).
O contrato vermelho não foi commitado antes do código nesta task — a ordem do ritmo ficou invertida; a prova de que
os testes seguram a regra é a mutação abaixo.

- **Painel** (`tripResponse.validation.ts`, `trip.constant.ts`, `trip.types.ts`): `holidayWarnings` entra em
  `TRIP_STOP_OPTIONAL_KEYS`; `isStopDetail` aceita ausente ou lista de avisos bem formados. Presente e malformado é
  recusado (o painel valida a resposta inteira, como nos demais campos opcionais da parada).
- **App do motorista** (`driverTripResponse.validation.ts`, `driverTrip.types.ts`): `readHolidayWarnings` lê o campo como
  acessório — ausente ou malformado vira lista vazia, item sem motivo é descartado, nunca `DriverTripResponseError`; o
  campo só entra na parada quando há aviso. Tipos duplicados por valor (ADR-0075, nada importado do painel).
- **Gates (conferidos por mim, fora do relato do executor):** painel `typecheck` 0, `lint` 0, `bun run test` 7581 pass / 0 fail
  e `test:hooks` 1104 pass / 0 fail; app do motorista `typecheck` 0, `lint` 0, `bun run test` 1411 pass / 0 fail.
- **Mutação:** tirar `'holidayWarnings'` de `TRIP_STOP_OPTIONAL_KEYS` → 1 teste do painel falha (7580 pass / 1 fail);
  tirar o spread de `holidayWarnings` em `toStop` → 1 teste do motorista falha (1410 pass / 1 fail); restaurado,
  `git diff --quiet` verde.
- **Fora desta task:** nenhuma tela; a queda do `day-checks` no aviso nacional de hoje fica na T5.3.

## T2.1 — contratos do modelo, antes da migration (2026-10-07)

Executor `sonnet`, worktree isolado, branch `work/252-t2` a partir de `origin/staging` (`c579e5107`; depois rebaseada em `4f04022ba`, 223 commits à frente), sem push. Postgres
**nativo** descartável (Homebrew 18.4, porta 65433, cluster no scratchpad; o Docker 65432 segue com I/O error), com
`DRIZZLE_TEST_DATABASE_URL`; o `.env`/`.env.test` do worktree são links para o checkout principal. Linha de base antes de
tocar em qualquer coisa: `bun test ./test/database-migration.contract.test.ts` → **119 pass, 0 fail**.

Commit `76d9245c2` (era `20b0cff74` antes do rebase) — só teste, vermelho **pelo motivo certo**:

- `test/database-migration/holiday-provider-import.constant.ts`: a lista de nomes do ADR-0100 §3 (tabelas, PK, únicos,
  FK, CHECK, índices e o que entra nas duas tabelas publicadas), lida pelos dois contratos.
- `holiday-provider-import.static.contract.ts` (11 testes sobre o texto da migration e do rollback): seis tabelas e
  nenhuma outra; todo nome explícito e todo identificador ≤ 63 bytes; os **dez comandos** das tabelas publicadas, nessa
  ordem e **os últimos** (`state_holidays` antes, `municipal_holidays` por último); as duas CHECK de `job` com a lista de
  antes mais o nome novo, `NOT VALID` + `VALIDATE`; a linha de `job_schedules` **pausada de fábrica**
  (`enabled = false`, `paused_origin = 'system'`, 86.400 s); uma única linha escrita; `lock_timeout` de 3 s devolvido ao
  padrão; rollback que recusa antes de tocar em qualquer coisa, devolve as listas de `job` e desfaz a coluna antes de
  derrubar a tabela que a FK referencia.
- Integração (`holiday-provider-import*.assertion.ts`, ligada em `database-migration.integration.ts` e nas listas de
  `support.ts`/`readBusinessTables`): nomes lidos de `pg_constraint`/`pg_indexes` contra a lista (o Postgres trunca calado
  acima de 63 bytes); cada CHECK por um valor ruim e um bom; os únicos (inclusive o nacional `'BR'` duplicado); o upsert
  do orçamento (1º pedido do mês cria a linha, o teto devolve vazio); a CHECK de exclusão `source_rule_id`/`provider_entry_id`;
  importada só `once` no estadual; FK `RESTRICT` (`23001` ou `23503`); os dois índices parciais; a rotina pausada;
  o rollback recusando e passando.
- Vermelho medido: **118 pass, 13 fail** — 12 do contrato estático (`_holiday_provider_import migration is required`) e 1 da
  integração (`readBusinessTables` sem as seis tabelas novas). Nada vermelho por erro de teste.

## T2.2 — a migration (2026-10-07)

Commit `54539fce7` (era `7e7a9ae4a`): `drizzle/20261009040622_holiday_provider_import/` (`migration.sql`, `rollback.sql`, `snapshot.json`; o
timestamp é posterior ao de `20261008183714_trip_document_link_events`, a última em staging depois do rebase), schema Drizzle
(`holiday-provider.schema.ts`, `holiday-import.schema.ts`, `provider_entry_id` em `delivery-client.schema.ts` e
`state-holiday.schema.ts`, `holidayScopeCodeSql` em `schema-check.constant.ts`, vocabulário em
`src/shared/holiday-provider.constant.ts`). O SQL das tabelas e das CHECK é o que o `db:generate --name tmp` gerou; à mão
foram o `NOT VALID` + `VALIDATE`, as duas CHECK de `job`, o `INSERT` da rotina, a ordem do arquivo e o cabeçalho.

### Escolhas dentro do ADR (para revisão)

- **Rollback recusa** com feriado importado (municipal ou estadual), supressão do operador ou execução aberta da rotina. O
  `plan.md` dizia "deixa as linhas importadas como datas digitadas"; o pedido da sessão mandou recusar linha importada, e
  recusar é o lado seguro (sem recusa a proveniência some e a data vira "digitada" sem ninguém decidir). Para seguir, o
  operador apaga ou adota os importados (o cabeçalho do `rollback.sql` diz como). Troca de critério = uma linha do `IF`.
- Os ALTER vão **`state_holidays` primeiro, `municipal_holidays` por último**: o ACCESS EXCLUSIVE fica retido até o COMMIT
  do lote, e a tabela que o roteirizador lê é a trancada por menos tempo.
- FK com `ON DELETE RESTRICT ON UPDATE CASCADE` (convenção do repositório; o ADR só fixa o `RESTRICT`); índices parciais em
  `(company_id, provider_entry_id)` (espelha `municipal_holidays_company_source_rule_idx`); ano do cache entre 1583 e 9999
  (domínio do calendário); `month` do orçamento validado por `extract(day from "month") = 1`.
- O código de cidade do cache, da demanda e da supressão usa `^[1-5][0-9]{6}$` (município IBGE de UF de 1 a 5), mais estrito
  que a CHECK antiga de `municipal_holidays` (`^[0-9]{7}$`). **A descoberta (T3.2) tem de filtrar `nfe_addresses.city_code`
  com o mesmo padrão antes do upsert**, ou um código lixo (ex.: `9999999`) derruba o lote inteiro.
- PK inline leva o nome do Postgres (`<tabela>_pkey`); o integration confere os seis contra `pg_constraint`. Maior
  identificador novo: `company_holiday_import_settings_company_id_companies_id_fk`, **58 bytes**.

### Conflito com a regra "não adicionar o nome ao catálogo TS" (relatado, não burlado)

A CHECK de `job` do schema TS é `inList(SCHEDULED_JOBS)`, derivada do catálogo de jobs. O `snapshot.json` da migration traz
`holiday.provider.pull` nas duas CHECK (é o que o banco tem). Sem o nome no catálogo, o contrato
`schema-snapshot.contract.ts › the latest snapshot matches the TypeScript schema` fica **vermelho** (o diff são exatamente
as duas CHECK de `job`) e `db:generate` não responde `no_changes`. O snapshot "verde" seria o gerado do schema atual, sem o
nome — mas aí ele mentiria sobre as duas CHECK e a T2.3 teria de editá-lo ou geraria uma migration redundante. Escolhido:
snapshot fiel ao SQL, vermelho conhecido até a T2.3. **Prova de que é só isso:** com uma linha provisória no catálogo da API
(`{ failureOutcomes: [], job: 'holiday.provider.pull', minimumIntervalSeconds: 3_600 }`, revertida em seguida) o
`database-migration.contract.test.ts` deu **131 pass, 0 fail** e `bun run db:generate` respondeu `{"status":"no_changes"}`.
Consequência: **a migration só vai ao ar junto com a T2.3** (catálogo nas quatro cópias), como já diz a ordem de publicação.

### Infra de teste ajustada

- `canhoto-read-queue.assertion.ts` e `business-calendar.assertion.ts` desfazem migrations **anteriores** com a nova ainda
  aplicada: agora a nova sai antes (`rollbackHolidayProviderImportIfApplied`) e a reaplicação do fim delas a devolve. Sem
  isso, o rollback da retenção recusava (linha de `job_schedules` fora da CHECK antiga) e o da `business_calendar` deixava
  `provider_entry_id` e as FKs para trás.
- `static-migration.contract.ts` ganhou o nome da pasta; `support.ts` e `database-migration.integration.ts`, as seis tabelas.
- Três contratos de forma da 238 foram atualizados porque a coluna nova é a mudança pedida:
  `municipal-holidays-additions`, `state-holidays-and-settings` (colunas, índice, FK) e `single-definitions`.
- Dois acertos no contrato estático do T2.1 depois de escrever o SQL (não mudam o que ele prova): a PK inline não tem nome no
  texto (o integration a confere), e a recusa do rollback cita o nome da rotina uma vez a mais (contagem de execução aberta).
  E o teste de rollback da integração passou a isolar cada causa de recusa (a primeira versão deixava uma mutação sobreviver).

### Rebase em `origin/staging` (2026-10-09) e reexecução dos gates

`origin/staging` andou 223 commits e trouxe quatro migrations depois da minha (`20261008024137_occurrence_type_icon`,
`…163250_nfe_recipient_email`, `…164340_nfe_recipient_email_backfill_job`, `…183714_trip_document_link_events`). Efeitos:

- A pasta foi **renomeada** para `20261009040622_holiday_provider_import` (depois de `20261008183714`); o `rollback.sql`
  (nome do journal) e o `CLAUDE.md` foram ajustados, e o `snapshot.json` foi **regerado** sobre a cadeia nova
  (`db:generate --name tmp` com a minha pasta fora, snapshot movido para a minha, `migration.sql` gerado conferido
  statement a statement contra o meu) e só então recebeu o nome da rotina nas duas CHECK de `job`.
- A 248 (`nfe.recipient-email.backfill`) também ampliou a CHECK de `job` e semeia a linha **pausada de fábrica** (mesmo padrão
  da D13). A lista da minha migration passou a ter 18 nomes (os 16 de antes, `nfe.recipient-email.backfill` e
  `holiday.provider.pull`); o rollback devolve a lista com 17. O contrato estático lê a "lista de antes" da migration da 248.
- Conflitos de rebase: `canhoto-read-queue.assertion.ts` (a staging já tinha virado uma lista de migrations posteriores;
  a nova entra antes) e `static-migration.contract.ts` (lista de pastas) — resolvidos mantendo os dois lados.

### Gates (Postgres nativo 65433, depois do rebase)

| Gate                                                                                                 | Resultado                                                                                |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bun run db:test` (corpo do `make migration-test`; o alvo `make` usa o Docker quebrado)              | 174 pass, **1 fail** = `schema-snapshot` acima                                           |
| `bun test ./test/database-migration.contract.test.ts` com o nome provisório no catálogo              | **138 pass, 0 fail** (a pasta sobe, desce na ordem inversa e sobe de novo)               |
| `bun run db:generate` com o nome provisório no catálogo                                              | `{"status":"no_changes"}` (provisório revertido; `git diff` do catálogo vazio)           |
| `bun --env-file=../../.env.test run test` (contratos da API, script do `package.json`)               | 11077 pass, 1 skip (corpus PII sem env), **1 fail** (o mesmo `schema-snapshot`)          |
| Integrações `business-calendar-*`, `municipal-holiday-*` e prazo da 236 (20 arquivos)                | 70 pass, 0 fail, 0 skip                                                                  |
| Worker, roteirizador (`route-optimization-municipal-holiday`, `-pool`, `geocoded-…`, `-trip-weight`) | 19 pass, 0 fail (banco recriado e migrado pela API, journal termina em `20261009040622`) |
| `bunx tsc --noEmit` / `bunx eslint src test … --max-warnings=0` (cwd na app)                         | exit 0 / exit 0                                                                          |
| `bun run format:check` na raiz                                                                       | verde (`All matched files use Prettier code style`)                                      |

Mutações: as onze do quadro abaixo foram **reexecutadas depois do rebase**, com os mesmos números de falha.

### Mutações (cada uma em cópia do arquivo, revertida; baseline = 1 fail conhecido do snapshot)

| Mutação                                                                                | Resultado                                                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| CHECK de exclusão `rule_or_provider` vira `CHECK (true)`                               | **3 fail**: estático (dez comandos) + integração (`Expected PostgreSQL SQLSTATE 23514`)           |
| CHECK `state_holidays_provider_once_check` vira `CHECK (true)`                         | **3 fail**: estático + integração (`23514` esperado)                                              |
| Único do cache enfraquecido (`UNIQUE(scope, ibge_code, year, id)`, mesmo nome)         | **2 fail**: integração (`Expected PostgreSQL SQLSTATE 23505`: o nacional `'BR'` duplicado aceito) |
| Único do cache removido                                                                | **3 fail**: estático (nome ausente) + integração (nomes ≠ `pg_constraint`)                        |
| FK com o nome padrão do drizzle (67 bytes)                                             | **4 fail**: estático (nome/63 bytes e comando) + integração (o Postgres truncou calado)           |
| Rotina sem a pausa de fábrica (`enabled = true`)                                       | **3 fail**: estático (D13) + integração (retrato da rotina)                                       |
| Rollback ignora supressão / execução aberta / importado estadual / importado municipal | cada uma **2 fail** na integração (a recusa não veio)                                             |
| Rollback devolve a CHECK de `job` com o nome novo                                      | **3 fail**: estático + integração                                                                 |

### O que não foi feito

T2.3 (catálogo nas quatro cópias, com rótulo e locale); nenhuma rota, rotina ou cliente do fornecedor; nada em
`apps/worker-transportada`; nada publicado (sem push); `make migration-test` literal (usa o Docker 65432 com I/O error: o
corpo dele, `db:test`, rodou no Postgres nativo). Produção: nenhuma conexão.

## T2.3 — `holiday.provider.pull` nas quatro cópias do catálogo (2026-10-09)

Branch `work/252-t2-3`, a partir de `work/252-t2` (`ef512a6d6`). Commits, painel primeiro:

- `2f6add63f` painel: `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`.
- `b49b22102` API: `src/shared/job-catalog.constant.ts` e `test/job-catalog/catalog.contract.ts` (lista literal e
  `SEED_MIGRATIONS` com `20261009040622_holiday_provider_import`).
- `f02ccbef6` worker: `src/shared/job-catalog.constant.ts` e `test/job-catalog/catalog.contract.ts`.
- `fc777a9d5` cron: idem.

A entrada é a mesma nas quatro: `failureOutcomes: ['provider_unreachable', 'provider_unauthorized', 'malformed_response']`
(ADR-0100, seção de erros), `minimumIntervalSeconds: 3_600`, no **fim** do `JOB_CATALOG` (a ordem é a das CHECK de `job`
da migration).

### Rótulo e locale no painel: não feitos (divergência do pedido)

O pedido e `plan.md` linha 115 mandam rótulo e locale pt-BR/en no painel, "seguindo o molde". O molde não tem isso. A busca
por `nfe.recipient-email.backfill`, `cargo-preview.retention.apply` e as demais rotinas em `apps/frontend-transportada` acha
só `src/modules/shared/jobCatalog.constant.ts` e o teste de paridade. `OperationsDashboard.page.tsx` renderiza
`<strong>{job}</strong>` com o nome cru, e `operationsWorkspace.locale.json` não tem nenhum rótulo de rotina. Não criei um
mecanismo de rótulo só para esta rotina: isso é decisão de produto (um mapa cobrindo as 18 rotinas, ou chaves de locale por
rotina). **Pendente de decisão.**

### Paridade e a ordem de commits

- O commit do painel **não passa sozinho**. O teste de paridade do painel lê o fonte da API
  (`../../../api-transportada/src/shared/job-catalog.constant.ts`). Em `2f6add63f~1` esse fonte não tem a rotina (`grep -c` = 0),
  então o teste fica vermelho até `b49b22102`. A ordem "painel primeiro" é de publicação, não de verde por commit.
- Os commits de API, worker e cron passam sozinhos: cada teste de paridade lê só a própria app.

### TDD: vermelho pelo motivo certo, antes do código

- API, com a entrada só no teste: `bun test ./test/job-catalog.contract.test.ts ./test/database-migration.contract.test.ts`
  → **6 fail**: `names every routine`, `accepts every interval the migration already seeded`, `gives each routine its own
failure vocabulary`, `offers each routine…`, `never lends one routine…`, e o `schema-snapshot` com o diff de exatamente
  as duas CHECK de `job` sem `holiday.provider.pull`.
- Worker e cron, com a entrada só no teste: **2 fail** cada (`matches the API catalog…` e `offers each routine…`), diff da
  entrada que falta.
- Painel, com a API já atualizada e o painel sem a entrada: **1 fail**, diff de `{ failureOutcomes…, job: 'holiday.provider.pull' }`
  removido (`Expected - 9, Received + 0` no bloco de paridade).

Depois do código, verde: API 6/6 no arquivo de paridade e `schema-snapshot` verde; worker 5/5; cron 6/6; painel 6/6.

### Gates

Todos com a app como cwd.

| Gate                                                                                                                        | Resultado                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API `bun run typecheck` / `bun run lint`                                                                                    | exit 0 / exit 0                                                                                                                                                                                                                                                                      |
| API `bun --env-file=../../.env.test run test` (contratos)                                                                   | **11045 pass, 34 skip, 0 fail** (208 arquivos). Os 34 skip vêm de testes que dependem de ambiente; este worktree não tem `.env.test` (o do repositório principal aponta para a infra de E2E em 65432, que não usei). Na T2.2 havia 1 skip. Causa não confirmada além dessa hipótese. |
| API `schema-snapshot` (T2.2, era vermelho)                                                                                  | **verde**                                                                                                                                                                                                                                                                            |
| API `bun run db:generate`                                                                                                   | `{"status":"no_changes","dialect":"postgresql"}`                                                                                                                                                                                                                                     |
| API `bun run db:test` (corpo do `make migration-test`) com `DRIZZLE_TEST_DATABASE_URL` em Postgres 18.4 nativo, porta 65433 | **175 pass, 0 fail** (T2.2: 174 pass, 1 fail). Postgres descartável em `scratchpad/pgdata-t23`, `LC_ALL=C` e socket Unix desligado (o locale `pt_BR` do cluster fazia o postmaster cair).                                                                                            |
| Worker `bun run typecheck` / `bun run lint` / `bun run test`                                                                | exit 0 / exit 0 / **2191 pass, 0 fail** (102 arquivos)                                                                                                                                                                                                                               |
| Cron `bun run typecheck` / `bun run lint` / `bun run test`                                                                  | exit 0 / exit 0 / **101 pass, 0 fail** (8 arquivos)                                                                                                                                                                                                                                  |
| Painel `bun run typecheck` / `bun run lint` / `bun run test`                                                                | exit 0 / exit 0 / **8912 pass, 0 fail** (script com duas invocações: 7736 em 39 arquivos e 1176 em 1). Lint: 16 warnings preexistentes em `TripDocumentSearch.component.tsx` e `useTripAssemblyDraftLifecycle.hook.ts`, fora do diff                                                 |
| Painel `test/shared/job-catalog.contract.ts` isolado                                                                        | **6 pass, 0 fail**                                                                                                                                                                                                                                                                   |
| `bun run format:check` na raiz                                                                                              | exit 0 (`All matched files use Prettier code style!`)                                                                                                                                                                                                                                |

### Mutação: o nome sai de uma cópia (cada uma restaurada; `git diff --quiet` em seguida = exit 0)

Troquei `holiday.provider.pull` por `holiday.provider.pulls` numa cópia.

| Cópia mutada                      | Teste que roda                                                         | Resultado                                                                      |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Painel (`jobCatalog.constant.ts`) | `bun test ./test/shared/job-catalog.contract.ts`                       | **1 fail**: diff `"job": "holiday.provider.pull"` → `"holiday.provider.pulls"` |
| API (`job-catalog.constant.ts`)   | `job-catalog.contract.test.ts` + `database-migration.contract.test.ts` | **6 fail** (incluindo o `schema-snapshot`)                                     |
| Worker                            | `bun test ./test/job-catalog.contract.test.ts`                         | **2 fail**                                                                     |
| Cron                              | `bun test ./test/job-catalog.contract.test.ts`                         | **2 fail**                                                                     |

API, worker e cron foram mutados juntos porque cada teste lê só a própria app, então não se contaminam. O painel foi
mutado sozinho porque lê a API. Restaurados: `git diff --quiet` das quatro cópias = exit 0 e `git status` limpo.

### Comentários

Os comentários das entradas novas não citam o número da spec, ao contrário dos vizinhos. Segui a regra global de código
(sem referência a tarefa nos comentários). Não é divergência de comportamento.

### O que não foi feito

- Rótulo e locale do painel (acima), por ser decisão.
- `make migration-test` literal: o Docker 65432 segue com I/O error. O corpo dele (`db:test`) rodou no Postgres nativo.
- `test:integration` da API não rodou: a T2.3 não muda SQL nem comportamento de banco, só o catálogo.
- Nada de push, nenhum registro da rotina no worker (T3.5), nenhum tick, nenhuma rota.
- **Revisão `opus` da T2.2 (🧠) segue pendente**, em passada separada, como o próprio `tasks.md` pede.
- Postgres descartável da porta 65433 é parado ao fim desta sessão.

## T2.2 — 2ª rodada: correções da revisão `opus` (2026-10-09)

Executor `sonnet`, branch `work/252-t2-fix` a partir de `work/252-t2-3` (T2.3 já dentro: o catálogo tem o nome, então
`schema-snapshot` está verde e `db:generate` dá `no_changes` sem nome provisório). `origin/staging` não tinha migration mais
nova que `20261008183714`; a pasta continua `20261009040622_holiday_provider_import`, editada no lugar (ainda não publicada),
sem migration nova. Postgres 18.4 nativo na 65433, parado ao fim. Contratos primeiro e vermelhos
(`648a346b8`: 135 pass, 7 fail — 6 do contrato estático e a integração, que cai na comparação de nomes e esconde o resto),
depois o SQL e o schema (`e24f3326b`), depois estes docs.

| Item  | O que mudou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1    | Testes de NOT NULL (`scope`, `ibge_code`, `year`, `holiday_on`) em `holiday_provider_fetches` e `_entries`: 23502. **Guardam comportamento que já existia** (nasceram verdes); a prova é a mutação.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M3    | Identidade D2: `FACULTATIVO` no mesmo `(scope, ibge, data)` de um `MUNICIPAL` e a mesma chave com outro `external_id` dão 23505. Também nasceram verdes (o único já era `(scope, ibge_code, holiday_on)`); a mutação que alarga o único os derruba.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M4    | `rollback.sql` recusa também `company_holiday_import_settings.is_enabled = false` (mensagem com 5 contagens); cabeçalho diz que o cache é descartado e refazer custa cota. Um teste por causa isolada e todas juntas; empresa com a importação ligada não segura o rollback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| M5    | `unique (id, ibge_code, holiday_on)` em `holiday_provider_entries` (`holiday_provider_entries_id_code_day_unique`, 43 bytes); FK composta `municipal_holidays (provider_entry_id, city_ibge_code, holiday_on)` e `state_holidays (provider_entry_id, state_ibge_code, holiday_on)`, `MATCH SIMPLE`, `RESTRICT/RESTRICT` (antes `RESTRICT/CASCADE`); CHECK `holiday_provider_entries_scope_type_check` (41 bytes) com o vocabulário real: `city` → `MUNICIPAL`/`FACULTATIVO`, `state` → `ESTADUAL`/`FACULTATIVO`, `national` → `NACIONAL`/`FACULTATIVO`. A ordem dos comandos nas tabelas publicadas não mudou (state antes de municipal, no fim). O teste antigo que ligava uma linha estadual a uma entrada `city` (`published.assertion.ts`) foi corrigido: agora há uma entrada `state` própria. |
| L3    | `LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` (as 6 tabelas que a recusa lê ou o rollback altera, `company_holiday_import_settings` incluída) antes do `DO` da recusa. Só contrato estático (a janela é de concorrência).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| L5    | `drizzle/20261007140303_business_calendar/rollback.sql` recusa se `to_regclass('public.holiday_provider_entries') is not null`, mandando desfazer a `20261009040622_holiday_provider_import` antes. Teste de integração roda o rollback da 238 com a 252 aplicada e espera a recusa; as asserções que já desfaziam a 238 desfazem a 252 antes.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| L1/L2 | Só texto: o lock é retido até o COMMIT do lote (não "só durante o comando"), `job_executions`/`job_schedules` ficam trancadas durante o trecho do calendário, e são **três varreduras completas** de cada tabela publicada (FK, `VALIDATE`, índice) sob ACCESS EXCLUSIVE.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L7    | `indexdef` de `holiday_provider_fetches_status_next_attempt_idx` e `holiday_import_cities_city_idx`; defaults `status 'pending'`/`attempts 0` inserindo sem as colunas; NOT NULL de `suppressed_by_user_id`; `ON DELETE RESTRICT` das 3 FKs para `companies` (aceita 23001 e 23503); `cursor_check` com "só issued" e "updated + document".                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Medir antes de produção (L1/L2):** `count(*)` de `municipal_holidays` e `state_holidays` e a duração do lote; se forem
grandes, o `VALIDATE` vai para migration própria e o índice parcial para `CREATE INDEX CONCURRENTLY` (fora da transação).
Sem mudar SQL por isso agora.

**Docs:** ADR-0100 §3 (entrada, unique composto, escopo×tipo, estadual vindo da resposta de uma cidade gravado com
`scope='state'` e a UF, FK composta), `spec.md` RF2, `plan.md` (FK composta e a lacuna do rótulo), `tasks.md` (T2.3 sem
"rótulo e locale": o painel não tem mecanismo de rótulo por rotina e mostra o nome cru em `OperationsDashboard.page.tsx`,
lacuna conhecida sem criar mecanismo; T3.2 com o lote venenoso M2; T4.1 com o contrato de isolamento da tabela global).

### Gates (2ª rodada, Postgres nativo 65433)

| Gate                                                                                               | Resultado                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `bun run db:test` (corpo do `make migration-test`)                                                 | 179 pass, 0 fail                                    |
| `bun test ./test/database-migration.contract.test.ts` (sobe, desce na ordem inversa, sobe de novo) | 142 pass, 0 fail (`schema-snapshot` verde)          |
| `bun run db:generate`                                                                              | `{"status":"no_changes"}`                           |
| `bun --env-file=../../.env.test run test` (contratos da API, script do `package.json`)             | 11082 pass, 0 fail, 1 skip (corpus PII sem env)     |
| Integrações `business-calendar-*`, `municipal-holiday-*` e prazo da 236 (20 arquivos)              | 70 pass, 0 fail, 0 skip                             |
| Worker, roteirizador (4 arquivos) em banco migrado pela API                                        | 19 pass, 0 fail                                     |
| `bunx tsc --noEmit` / `bunx eslint src test … --max-warnings=0` (cwd na app)                       | exit 0 / exit 0                                     |
| `bun run format:check` na raiz                                                                     | verde (`All matched files use Prettier code style`) |

### Mutações da 2ª rodada (cada uma em cópia do arquivo, revertida; baseline 0 fail)

| Mutação                                                                                                                                       | Resultado                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `year` / `holiday_on` / `ibge_code` sem NOT NULL (3 mutações)                                                                                 | cada uma 1 fail na integração (`Expected PostgreSQL SQLSTATE 23502`) |
| Único da entrada alargado (`+ provider_type, external_id`)                                                                                    | 1 fail na integração (23505)                                         |
| Rollback ignora a empresa com a importação desligada                                                                                          | 1 fail na integração (a recusa não veio)                             |
| FK do estadual / do municipal volta a simples                                                                                                 | cada uma 2 fail: estático (comandos) + integração (23503 esperado)   |
| `scope_type_check` neutralizada (`true or …`)                                                                                                 | 2 fail: estático + integração (23514 esperado)                       |
| `LOCK TABLE` sem `municipal_holidays`                                                                                                         | 1 fail estático                                                      |
| Guarda do rollback da 238 desarmada (`IF false`)                                                                                              | 2 fail: estático + integração (a 238 desfez com a 252 aplicada)      |
| Índice da demanda alargado; default `status = 'done'`; `suppressed_by` anulável; FK de `companies` com `CASCADE`; `cursor_check` enfraquecida | cada uma 1 fail na integração                                        |

As mutações da 1ª rodada (CHECK de exclusão, único nacional, nome de 67 bytes, pausa de fábrica e as quatro causas de recusa)
foram reexecutadas sobre a pasta nova e seguem vermelhas.

### O que não foi feito

Nada de T3 (rotina, cliente, descoberta) nem de rota; nenhum mecanismo de rótulo no painel; sem push. `make migration-test`
literal não rodou (Docker 65432 com I/O error): o corpo dele, `db:test`, rodou no Postgres nativo. Produção: nenhuma conexão.

## T4.1 — a gestão da importação de feriados na API (2026-10-09)

Executor `sonnet`, worktree isolado, branch `work/252-t4` a partir de `origin/staging` (`6548ead27`), sem push. Postgres 18.4
**nativo** descartável (porta 65441, cluster no scratchpad, `LC_ALL=C`, socket Unix desligado); o Docker 65432 segue quebrado.
`DRIZZLE_TEST_DATABASE_URL`/`API_TEST_DATABASE_URL`/`DATABASE_URL` apontados para ele; integrações **uma por vez**, nenhuma pulou.
Commits: `929cca352` (testes, vermelhos), `c01dc388b` (código) e o de documentação.

### Contratos antes do código (vermelho pelo motivo certo)

`holiday-import-municipal.integration.ts` **3 pass / 9 fail** (a importada não era adotada, o `DELETE` não gravava supressão nem
auditoria, `typedHolidaysKept` contava a importada; os 3 verdes são o `DELETE` da digitada, a regeneração da regra e o isolamento da
empresa B, que já valiam); `holiday-import-state.integration.ts` **3 pass / 5 fail** (mesmos motivos). Os contratos de rota, de caso de uso
e as integrações das supressões e do status falham por **módulo ausente** (`holiday-import.use-case.js`, `…routes.js`,
`drizzle-holiday-import-*.repository.js`), e o contrato estático de isolamento por 2 asserções (as consultas agregadas não existiam).

### O que a API passou a fazer

| Pedido do `tasks.md` T4.1                                    | Onde                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` na mesma data adota (zera `provider_entry_id`)        | `upsertTypedHoliday` (municipal) e `adoptImportedStateHoliday` (estadual); `isSameTypedHoliday` é falso para a importada                          |
| `PATCH` adota                                                | repositórios municipal e estadual (`.set({ …changes, providerEntryId: null })`)                                                                   |
| `DELETE` numa importada **é** o desligar                     | `holiday-import-disable.support.ts`: supressão + auditoria `holiday-import.disabled` + regenera a regra do dia; D7 `409 HOLIDAY_IMPORT_PAST_DATE` |
| `typedHolidaysKept` só `provider_entry_id IS NULL`           | `municipal-holiday-typed.queries.ts`                                                                                                              |
| desligar/restaurar e status                                  | `/holiday-imports/{status,cities,suppressions}` (`settings.manage`, `POST` `.strict()`, `companyId` do contexto)                                  |
| cache global só agregado, filtrado pelas cidades da empresa  | `holiday-import-status.query.ts` (parte de `holiday_import_cities`) e `holiday-import-usage.query.ts` (contador do mês)                           |
| contrato de isolamento (molde `delivery-deadline-isolation`) | `test/business-calendar-schema/holiday-import-global-isolation.contract.ts`                                                                       |

### Gates (cwd na app, 2026-10-09)

| Gate                                                                            | Resultado                                                                                           |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `bunx tsc --noEmit`                                                             | exit 0                                                                                              |
| `bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0`      | exit 0                                                                                              |
| `bun --env-file=../../.env.test run test` (contratos, script do `package.json`) | **11103 pass, 1 skip (corpus PII sem env, como na linha de base), 0 fail** (era 11082)              |
| integração `holiday-import-municipal` / `-state` / `-suppressions` / `-status`  | **12 / 8 / 9 / 7 pass**, 0 fail, 0 skip                                                             |
| integrações tocadas pela assinatura de `remove` e pelo adotar                   | `business-calendar-*` (11 arquivos), `municipal-holiday-generated` 4 e `-interplay` 6: todas 0 fail |
| `bun run db:generate`                                                           | `{"status":"no_changes"}` (nenhuma migration, nenhum schema novo)                                   |
| `bun run format:check` na raiz                                                  | exit 0                                                                                              |

### Mutações (cada uma restaurada; `git diff --quiet` = 0 ao fim; baseline 0 fail)

| Mutação                                                                                   | Resultado                                                       |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| upsert municipal não zera `provider_entry_id`                                             | municipal: 4 fail                                               |
| `isSameTypedHoliday` trata a importada como a mesma digitada                              | municipal: 2 fail                                               |
| `PATCH` municipal não adota / `PATCH` estadual não adota                                  | municipal: 1 fail / estadual: 1 fail                            |
| `POST` estadual não adota                                                                 | estadual: 2 fail                                                |
| `DELETE` de importada não desliga (municipal / estadual)                                  | municipal: 3 fail / estadual: 2 fail                            |
| D7 removido / D7 com `<=`                                                                 | 1 fail em cada um dos 3 arquivos / municipal: 1 fail            |
| `typedHolidaysKept` conta a importada                                                     | municipal: 2 fail                                               |
| regeneração da regra do dia some / ação de auditoria errada / supressão sem o ator        | municipal: 1 fail cada                                          |
| restaurar sem filtro de empresa / desligar por id sem filtro de empresa                   | suppressions: 1 fail cada                                       |
| desligar aceita a digitada (sem `HOLIDAY_NOT_IMPORTED`)                                   | suppressions: 1 fail                                            |
| status agrega o cache de todas as empresas / removidos de outra empresa / cidades alheias | status: 2 / 1 / 2 fail                                          |
| rotas com a política de leitura / corpo sem `.strict()` / `perPage` sem teto              | rotas: 1 fail cada                                              |
| "hoje" em UTC no lugar de São Paulo                                                       | rotas e casos de uso: 5 fail                                    |
| arquivo de `presentation` importando `holidayProviderFetches`                             | contrato de isolamento: 2 fail (arquivo removido; árvore limpa) |

Mutação **equivalente documentada**: tirar o `inArray(cityCodes)` ou o filtro de empresa de `listCityFetches` não muda a saída, porque a
página de cidades já nasce da demanda da empresa e o repositório casa por `cityIbgeCode` — a fronteira está em `listCompanyCities`, mutada acima.

### Decisões e lacunas (para o orquestrador/usuário)

- **Restaurar volta no ciclo seguinte, não na hora.** O ADR-0100 §4 aceita "ou na hora, se o cache já o tem"; reinserir na hora exigiria uma
  segunda leitura do cache global fora das duas consultas agregadas, que o contrato de isolamento proíbe. **A T3.4 precisa reaplicar do cache a
  cada ciclo** (não só os pares recém-buscados), senão a data restaurada só volta quando o par for rebuscado (180 dias).
- **Os guardas do painel são de chaves exatas** (`businessCalendarGuards.validation.ts`): por isso nenhuma chave nova entrou nas respostas de
  `/municipal-holidays` e `/state-holidays`; a origem para a aba Calendário (T5.2) vem das rotas novas.
- **Sem rota para ligar/desligar `company_holiday_import_settings.is_enabled`**: o RF9/T4.1 não a pede; o status só a lê.
- **`monthlyRequests` é da instalação** (`holiday_provider_monthly_usage` não tem empresa): um inteiro, sem cidade nem data; registrado em
  `docs/SECURITY.md`. O arquivo dessa leitura é o único acréscimo ao `SUPPORT_ONLY` do `tenant-safety.contract.ts`.
- `remove` (municipal e estadual) ganhou `today` obrigatório; `createStateHolidaysUseCases` ganhou `now`.

### O que não foi feito

T4.2/T4.3; worker (T3); telas; nada publicado (sem push); `make migration-test` (sem migration nesta task); nenhuma conexão com produção.

## T4.2 — o aviso de feriado na API (2026-10-09)

Mesma sessão e mesmo Postgres nativo (65441) da T4.1. Commits: `d921cd91a` (testes, vermelhos) e `fb367ef51` (código), mais o de documentação.

### Contratos antes do código (vermelho pelo motivo certo)

Contratos de domínio, leitor, `day-checks` e isolamento: falham por **módulo ausente** (`holiday-warning.policy.js`, `day-checks.use-case.js`…), o que derruba o
arquivo inteiro. `trip-detail-holiday-warnings.integration.ts`: **4 pass / 5 fail**, e os 5 pelo motivo certo (`holidayWarnings` `undefined` onde se esperava o
aviso; contagem `+0` onde se esperava `+4`); os 4 verdes são os que já valiam (outra empresa, sem ETA/concluída, sem relógio, e o `+0` sem parada que avise).

### O que a API passou a fazer

| Pedido do `tasks.md` T4.2                                               | Onde                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin` (`code/typed/rule/imported`) nas regras e em `HolidayReason`   | `business-calendar.types.ts`, `business-calendar-build.policy.ts`, mapper (`provider_entry_id` → `imported`; regra anual → `rule`); o filtro de `readTypedHolidays` não mudou |
| `holidayWarnings` nas paradas do `GET /trips/:id`                       | `trip-holiday-warning.support.ts` + `drizzle-trip.repository.ts` (aditivo, só com relógio injetado, parada não concluída com ETA)                                             |
| `POST /business-calendar/day-checks` (`fleet.read`, ≤ 200, `.strict()`) | `day-checks.{schema,routes}.ts` + `day-checks.use-case.ts`; 400 a campo desconhecido, a 201 itens, a cidade de UF inexistente e a data impossível                             |
| `cityName` de `listStopAddresses` (+0), nulo se o `city_code` difere    | `resolveCityName` no suporte do detalhe; a chave sai **ausente** (o guarda do painel recusa `null`)                                                                           |
| contagem de consultas (+0 ou +4), em série dentro de transação          | `readHolidayWarnings` + `calendarSink` do prazo; `transaction-serial-queries.contract.test.ts` ganhou as duas funções                                                         |
| módulo reaproveitável pela T4.3, sem importar o prazo                   | `holiday-warning.{policy,reader}` em `business-calendar/`; contrato `holiday-warning-isolation` (nenhum arquivo do módulo cita `delivery-deadline`)                           |

### Gates (cwd na app, 2026-10-09)

| Gate                                                                                                                           | Resultado                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `bunx tsc --noEmit` / `bunx eslint src test drizzle.config.ts eslint.config.js …`                                              | exit 0 / exit 0                                                                                            |
| `bun --env-file=../../.env.test run test` (contratos, script do `package.json`)                                                | **11132 pass, 1 skip (corpus PII sem env), 0 fail** (11103 ao fim da T4.1)                                 |
| integração `trip-detail-holiday-warnings` / `holiday-warning-reader`                                                           | **9 / 3 pass**, 0 fail, 0 skip                                                                             |
| integrações da 236 e do detalhe: `trip-detail-delivery-deadline*` (6), `-query-count`, `delivery-deadline-driver-independence` | 3+5+4+1+1+4, 4 e 1 pass; 0 fail — o prazo e a contagem de antes não mudaram                                |
| as quatro da T4.1 e as 13 do calendário (`business-calendar-*`, `municipal-holiday-*`)                                         | todas 0 fail, 0 skip (incluindo `business-calendar-load-rules`, que agora confere a origem `rule`/`typed`) |
| `bun run db:generate`                                                                                                          | `{"status":"no_changes"}`                                                                                  |
| `bun run format:check` na raiz                                                                                                 | exit 0                                                                                                     |

### Mutações (cada uma restaurada; `git diff --quiet` = 0 ao fim; baseline 0 fail)

| Mutação                                                                                           | Resultado                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| feriado em fim de semana avisa / nome do nacional vazio / `cityName` vazio entra                  | policy: 1 fail cada                                           |
| origem sempre `typed` na razão (municipal 4 fail; estadual 1 fail)                                | contrato de domínio                                           |
| leitor recarrega sempre / reaproveita sem checar cobertura / carga por cidade (N consultas)       | leitor: 2 / 1 / 1 fail                                        |
| `Promise.all` no corpo do leitor                                                                  | `transaction-serial-queries`: 1 fail                          |
| empresa errada na carga do leitor / mapper `imported`→`typed` / mapper regra→`typed`              | integração do leitor: 3 / 1 / 1 fail                          |
| detalhe: data em UTC / parada concluída avisa / `cityName` sem conferir o código                  | integração do detalhe: 1 / 2 / 1 fail                         |
| detalhe: ignora os calendários do prazo (+10) / o prazo não entrega o calendário (`calendarSink`) | integração do detalhe: 1 / 1 fail (a contagem +6)             |
| cidade do 2º segmento do `address_key` (errado)                                                   | integração do detalhe: 5 fail                                 |
| `day-checks`: sem teto de 200 / sem `.strict()` no corpo / no item / exige `settings.manage`      | rotas: 1 fail cada (a última também no contrato do separador) |
| `day-checks`: sem dedupe / ignora recusa do calendário                                            | casos de uso: 1 fail cada                                     |
| o leitor cita `delivery-deadline` num comentário                                                  | contrato de isolamento: 1 fail                                |

Mutação **sem efeito no teste dela**, coberta pelo outro: `mapper imported→typed` não reprova `business-calendar-load-rules` (a fixture dele não tem linha importada); quem a
reprova é a integração do leitor.

### Decisões e lacunas (para o orquestrador/usuário)

- **O formato é o que os clientes publicados validam** (T5.1/T5.1b): `cityIbgeCode` **numérico** (a string faria o painel recusar o detalhe inteiro), `cityName` **ausente**
  quando não se sabe (o guarda recusa `null`), `reasons[{ scope, origin, name }]`. O ADR descreve `cityIbgeCode` sem tipo; o pedido (`cityIbgeCode` string) do `day-checks` ficou
  **string** no corpo (como toda rota do módulo) e **número** na resposta. O nome do feriado **nacional** é a chave estável (`independence_day`), porque o calendário nacional não
  tem texto: a T5.3/T5.4 mapeiam a chave pelo locale.
- **Só avisa o dia que fecha POR feriado.** Feriado num domingo (ou num sábado que não conta) fica no aviso de fim de semana que já existe — leitura do ADR §6 ("Fim de semana segue no
  aviso que já existe").
- **`day-checks` não devolve `cityName`**: o pedido não traz o endereço. A montagem (T5.3) já tem o nome da cidade.
- **Cobertura global por chamada**: datas a mais de 5 anos entre si recusam todas as cidades da carga (`422 BUSINESS_CALENDAR_COVERAGE_TOO_WIDE`); na prática as ETAs ficam num ano.
- **Sem rate limit** em `day-checks` (opt-in por rota na API; leitura sem custo externo) — registrado em `docs/SECURITY.md`.
- **`separator-role.contract` ganhou `POST /business-calendar/day-checks`** (`fleet.read`): o separador monta o roteiro. O ajudante e o motorista não o alcançam.
- **T4.3 (outro agente)** reaproveita `readHolidayWarnings` direto (sem `trip-delivery-deadline-*`) e acrescenta a agulha do calendário/aviso ao contrato de isolamento da nota; **não** foi
  feito aqui.

### O que não foi feito

T4.3 (`GET /me/trips/current`); worker (T3); telas; nada publicado (sem push); `make migration-test` (sem migration); nenhuma conexão com produção.

## T4 — 2ª rodada: correções da revisão `opus` (2026-10-09)

Mesma branch (`work/252-t4`), mesmo Postgres nativo (65441, banco descartável por teste). `git fetch origin`: `origin/staging` sem commit novo, então sem rebase;
`bun install --frozen-lockfile` sem mudança. Commits: `588fd37de` (testes, vermelhos), `0fa7e54bf` (código) e o de documentação.

### O que mudou

| Item | Decisão/correção                                                                                                                                                                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | `PATCH` estadual que **muda a data** de uma importada: `409 HOLIDAY_IMPORT_DATE_LOCKED` (`assertImportedDateNotMoved`); nome/tipo e a mesma data continuam adotando; a digitada muda de data. ADR-0100 §4.3                                                                                                          |
| M2   | Todo `DELETE` de digitada/adotada com data ≥ hoje (SP) grava a supressão `(escopo, código, data)` na mesma transação, `suppressionId` (ou `null`) na auditoria. Não grava: data passada, `yearly` estadual, e código de cidade fora de `CITY_IBGE_CODE_PATTERN`. ADR-0100 §4.4                                       |
| M3   | Texto: "restaurar volta na próxima execução diária" (ADR §4.2, `tasks.md` T5.2); `HOLIDAY_IMPORT_PAST_DATE` e `HOLIDAY_IMPORT_DATE_LOCKED` nos critérios da T5.2; contrato da T3.4 (cache a cada ciclo, pulando supressões, sob o advisory lock `['business-calendar', companyId]`, supressões relidas na transação) |
| L1   | `countPendingPairs` com piso em zero                                                                                                                                                                                                                                                                                 |
| L2   | Teto único (200) **depois** de juntar cidade e estado; `removedByProvider` virou `{ items, truncated }` (o painel ainda não consome; `ai-context`, `CLAUDE.md` e `tasks.md` atualizados)                                                                                                                             |
| L3   | `GET /holiday-imports/suppressions` paginada como `/cities` (`page`/`perPage ≤ 100`, envelope com `pagination`)                                                                                                                                                                                                      |
| L4   | `SECURITY.md`: `fetchedAt`/`attempts` do cache permitem inferir entrega entre empresas da mesma instalação — aceito, mesmo dono                                                                                                                                                                                      |
| L5   | O contrato de isolamento reprova `.select()` sem projeção nos dois `.query.ts` isentos                                                                                                                                                                                                                               |
| L6   | **Pendente de medida:** o teto agregado de `removedByProvider` (200) e a latência do `readStatus` em uma instalação com milhares de cidades não foram medidos (sem dados reais); a T5.2 deve medir antes de publicar a tela                                                                                          |
| L7   | `isBusinessCalendarErrorCode` (guarda de tipo) no lugar do `as` do leitor                                                                                                                                                                                                                                            |
| L8   | `tasks.md` T4.3: o aviso do motorista usa `readHolidayWarnings` direto e nunca importa `trip-holiday-warning.support.ts` (carrega a agulha `delivery-deadline`)                                                                                                                                                      |
| L9   | JSDoc do aviso movido para cima de `holidayWarnings` em `drizzle-trip.repository.ts`                                                                                                                                                                                                                                 |
| L11  | O contador de consultas do teste de custo do aviso conta também `execute`                                                                                                                                                                                                                                            |
| L12  | `GET /holiday-imports/status` recusa query desconhecida (`readListQuery` com conjunto vazio)                                                                                                                                                                                                                         |
| L10  | pulado, como pedido                                                                                                                                                                                                                                                                                                  |

### Vermelho antes do código

`holiday-import-municipal` 11 pass / 3 fail; `-state` 8 pass / 4 fail; `-suppressions` 8 pass / 2 fail; `-status` 6 pass / 2 fail (todos pelo comportamento novo); contratos de rota,
de casos de uso, de `countPendingPairs` e de isolamento vermelhos pelo formato novo.

### Gates (cwd na app, 2026-10-09)

| Gate                                                                                                     | Resultado                                                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `bunx tsc --noEmit` / `bunx eslint src test drizzle.config.ts eslint.config.js …`                        | exit 0 / exit 0                                                       |
| `bun --env-file=../../.env.test run test` (contratos)                                                    | **11137 pass, 1 skip (corpus PII sem env), 0 fail** (era 11132)       |
| integração `holiday-import-{municipal,state,suppressions,status}`                                        | **14 / 12 / 10 / 8 pass**, 0 fail, 0 skip                             |
| `holiday-warning-reader` / `trip-detail-holiday-warnings` (contador agora com `execute`)                 | **3 / 9 pass**, 0 fail (os +0/+4/+6 se mantêm)                        |
| as 13 do calendário (`business-calendar-*`, `municipal-holiday-*`)                                       | todas 0 fail, 0 skip (os `DELETE` de digitada agora gravam supressão) |
| `trip-detail-delivery-deadline*` (6), `trip-detail-query-count`, `delivery-deadline-driver-independence` | 3+5+4+1+1+4, 4, 1 pass; 0 fail                                        |
| `bun run db:generate`                                                                                    | `{"status":"no_changes"}`                                             |
| `bun run format:check` na raiz                                                                           | exit 0                                                                |

### Mutações (restauradas; `git diff --quiet` = 0)

| Mutação                                                                                  | Resultado                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PATCH` estadual deixa mudar a data da importada                                         | estadual: 1 fail                                                                                                             |
| `DELETE` municipal não suprime / suprime data passada / sem a guarda do código de cidade | municipal: 2 / 1 / 1 fail                                                                                                    |
| `DELETE` estadual não suprime / suprime data passada                                     | estadual: 2 / 1 fail                                                                                                         |
| pendentes sem o piso em zero                                                             | contrato: 1 fail                                                                                                             |
| removidos sem o teto único / nunca `truncated`                                           | status: 1 / 1 fail                                                                                                           |
| supressões sem paginação                                                                 | suppressions: 1 fail                                                                                                         |
| `status` aceita query                                                                    | rotas: 1 fail                                                                                                                |
| consulta isenta com `.select()` sem projeção                                             | isolamento: 1 fail                                                                                                           |
| guarda de código de erro trocada por prefixo de texto (L7)                               | **sobrevive** (equivalente: todo código do calendário começa com o prefixo); a guarda existe por tipo, não por comportamento |

### Notas

- O `tasks.md` T3.4 foi editado aqui e também pelo agente do worker: o conflito de merge, se houver, é só de texto.
- A supressão por `DELETE` de digitada usa a CHECK `holiday_import_suppressions_scope_code_check` (código `^[1-5][0-9]{6}$`); a linha antiga de `municipal_holidays` aceita
  qualquer sete dígitos (`0000000` num teste), por isso a guarda — sem ela o `DELETE` daria 500.

### O que ficou de fora

Rotas de `is_enabled`; a medida do teto agregado (L6); a agulha do contrato de isolamento da nota e o aviso do motorista (T4.3); worker (T3); telas; sem push.
## T3.1 — cliente HTTP da FeriadosAPI (2026-10-09)

Executor `sonnet`, worktree isolado, branch `work/252-t3` a partir de `origin/staging` (migration `20261009040622_holiday_provider_import` e catálogo de jobs já nele). Sem push. Nenhum teste chama a internet: o cliente recebe `fetch` e o token por injeção, e os testes usam respostas fixas (`test/fixtures/feriados-api.fixture.ts`, no formato da documentação pública). **Nenhuma resposta real da FeriadosAPI foi vista** — as lacunas estão abaixo.

- **Vermelho antes (`8571ad190`):** o contrato importa os módulos que ainda não existiam; `bun test ./test/holiday-provider-pull.contract.test.ts` → `0 pass, 1 fail, 1 error` (`Cannot find module .../domain/brazilian-state.constant.js`). Vermelho por funcionalidade ausente, não por erro de teste.
- **Verde (`ca44fe24a`):** `src/holiday-provider-pull/{domain,application,infrastructure}` — cliente, guarda Zod, erro tipado, política de classificação das entradas, data `DD/MM/AAAA`, sigla da UF. 19 testes novos em `test/holiday-provider-pull/` (lista explícita no `package.json`).
- **Gates (cwd `apps/worker-transportada`):** `bunx tsc --noEmit` exit 0; `bunx eslint ... --max-warnings=0` exit 0; `bun run test` **2210 pass, 0 fail** em 103 arquivos (linha de base 2191 em 102: +19 testes, +1 arquivo).

### Mutações (cada uma aplicada em cópia do arquivo, restaurada; `git diff --quiet` = exit 0 no fim)

| Mutação                                                                     | Resultado |
| --------------------------------------------------------------------------- | --------- |
| sem o cabeçalho `Authorization: Bearer`                                     | 1 fail    |
| erro de rede relançado cru (a mensagem da rede, com o token, sairia)        | 2 fail    |
| sem juntar a mesma `(escopo, ibge, data)`                                   | 1 fail    |
| facultativo vence o municipal                                               | 1 fail    |
| estadual da resposta de cidade gravado com o código da cidade               | 1 fail    |
| data sem conferir a volta (`31/02`)                                         | 2 fail    |
| 403 deixa de ser `provider_unauthorized`                                    | 1 fail    |
| nome sem o teto de 120 caracteres                                           | 1 fail    |
| `NACIONAL` numa resposta de cidade passa a ser gravado                      | 1 fail    |
| `receivedCount` conta o que sobrou depois de juntar (quebraria a paginação) | 2 fail    |

### Lacunas: o que a documentação não diz e o código assume

Registradas em vez de adivinhadas; nenhuma muda o ADR, e todas se confirmam (ou não) no 1º ciclo real, que é passo do usuário:

1. **Envelope da resposta.** Aceitam-se a lista pelada e `{ data: [...] }`; qualquer outra forma é `malformed_response` e nada é gravado. Chaves de paginação do envelope (total, página) não são lidas — a paginação decide por `receivedCount === 100`.
2. **Paginação.** `limit=100` sempre; `page=N` só da 2ª página em diante (1-based, a suposição comum). Se a API contar de 0, a página 2 pularia dados.
3. **Estado.** O caminho usa a **sigla** (`/estado/SP`), pela leitura de `/api/v1/feriados/estado/{uf}`; a tabela IBGE→sigla é nossa.
4. **`facultativos`.** O parâmetro não é enviado (a URL do ADR §5 não o tem); se o padrão da API é omitir facultativos, o cache simplesmente não os terá (D5: só cache, sem efeito).
5. **`codigo_ibge`/`uf` da resposta não são lidos.** A cidade da entrada é a do pedido; não há conferência cruzada, porque o formato do campo (7 ou 6 dígitos, texto ou número) não está documentado.
6. **Como a API sinaliza plano/cota do provedor.** Não documentado: 401/403 encerram o ciclo como `provider_unauthorized` (ADR), 429 como limite com `Retry-After`; outros 4xx e 5xx viram `provider_unreachable`. Se o plano gratuito responder 402/403 para cidade do interior, o ciclo vai parar em `provider_unauthorized` na 1ª cidade — o sinal certo para o usuário olhar o plano (Q3).
7. **Tipo desconhecido** (`tipo` fora de `NACIONAL`/`ESTADUAL`/`MUNICIPAL`/`FACULTATIVO`) recusa a resposta inteira, por desenho (contrato do fornecedor mudou).

### O que não foi feito

Rotina, descoberta, busca, aplicação, variáveis de ambiente e registro no `main.ts` (T3.2 a T3.5). Nada publicado.

## T3.2 — descoberta das cidades de destino (2026-10-09)

Mesmo worktree e branch (`work/252-t3`). Postgres 18.4 **nativo** descartável na porta 65442 (cluster no scratchpad, `LC_ALL=C`, socket Unix desligado), migrado pela API (`db:migrate`, journal até `20261009040622_holiday_provider_import`); o Docker 65432 segue com I/O error. Parado ao fim da sessão.

- **Vermelho antes (`35d04a1d2`):** contratos e integração importam módulos que não existiam (`Cannot find module .../src/database/holiday-import.schema.js`); 0 pass, 1 fail, 1 error.
- **Verde (`601237d60`, mais o reforço do teste de parada):** `domain/holiday-city-discovery.policy.ts`, `application/discover-holiday-cities.use-case.ts` + porta, `infrastructure/{holiday-discovery.query.ts,drizzle-holiday-discovery.store.ts}` e a cópia do schema `src/database/holiday-import.schema.ts` (três tabelas, só colunas).
- **Contratos:** `test/holiday-provider-pull/{discovery,parity,schema-parity}.contract.ts` — 18 testes novos; entre eles o **lote venenoso** (um lote com `3509502`, `null`, `''`, `9999999`, `3909502`, `3509502`, `3550308`: só os válidos entram, o contador diz 4 descartados, o cursor andou até a última nota) e o lote só de lixo (nada gravado, cursor avança). Paridade de cópia por valor: o vocabulário do cache (`holiday-provider.constant.ts`), a lista das 27 UFs, o padrão `^[1-5][0-9]{6}$` e as 16 colunas das três tabelas de importação, lidas do texto da API.
- **Integração (`test/integration/holiday-discovery.integration.ts`, contra o Postgres, 6 pass, 0 skip):** a entrega vence o destinatário e o CEP inutilizável cai para o destinatário; o lote venenoso real não derruba o `holiday_import_cities_city_check`; empresa com `is_enabled = false`, empresa `disabled` e a de outra empresa; cursor por vários lotes (`batchSize` 1 e 3) com **duas notas separadas por microssegundos** (o `Date` do JavaScript as juntaria) sem pular nem recontar; segundo ciclo sem nada novo não recontou.
- **Gates (cwd `apps/worker-transportada`):** `bunx tsc --noEmit` exit 0; `bunx eslint src test --max-warnings=0` exit 0; `bun run test` **2229 pass, 0 fail** (103 arquivos; antes 2210).

### Decisões de implementação dentro do ADR

- O cursor viaja como **texto do Postgres** (`::text`, `::timestamptz`), nunca `Date`: com milissegundos, a última nota de um lote voltava no lote seguinte e era recontada a cada ciclo (a mutação N6 prova).
- Lote e cursor na **mesma transação** (`saveBatch`): falhar entre os dois recontaria o lote. `document_count` soma por upsert (`+ excluded.document_count`) e é aproximado, como o ADR diz.
- Uma nota conta **uma vez**, na cidade do destino físico dela (`resolvePhysicalDestination`, cópia do worker); nota sem nenhum endereço de entrega/destinatário é contada à parte (`documentsWithoutDestination`) e o cursor passa por ela.
- O código descartado vira só um **contador** (`discardedCityCodes`); nenhum valor, nome ou endereço vai para log. A falha de uma empresa loga o `companyId` (identificador opaco), o `correlationId` e o **nome** do erro, nunca a mensagem.

### EXPLAIN do lote (Postgres 18.4, 2.100 notas da empresa de teste, `EXPLAIN (ANALYZE, BUFFERS)`)

| Consulta                                                                                      | Plano                                                                                                                                | Tempo   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| lote de 2.000 notas, sem cursor                                                               | `Index Only Scan Backward using nfe_documents_company_updated_issued_id_idx`, `Heap Fetches: 0`, 33 buffers                          | 0,66 ms |
| lote com cursor `(updated_at, issued_at, id) > (...)`                                         | mesmo índice, `Index Cond: ROW(...) > ROW(...)`, 1.501 linhas, 24 buffers                                                            | 0,42 ms |
| junção dos endereços do lote (`nfe_participants` ⋈ `nfe_addresses`, `document_id = ANY(...)`) | `nfe_participants_company_document_role_unique` por índice; **`Seq Scan on nfe_addresses`** filtrado por `company_id` (2.100 linhas) | 1,5 ms  |

**O índice do cursor serve o lote** (a comparação de linha entra no `Index Cond`, sem ordenar). **`nfe_addresses` não tem índice por `(company_id, participant_id)`** — como o ADR previu —, então cada lote varre os endereços da empresa. Na escala medida (2.100 notas) é 1,5 ms; a conta cresce com o tamanho de `nfe_addresses` da empresa × até 20 lotes por empresa por ciclo. **Não criei índice** (o ADR manda migration própria com `CONCURRENTLY`, e migration não é desta task): decisão para o usuário medir com `EXPLAIN` em staging; enquanto isso o custo é limitado pelo teto de 20 lotes por empresa por ciclo diário.

### Mutações (cada uma em cópia do arquivo, restaurada; `git diff --quiet` = exit 0 no fim da 1ª rodada)

| Mutação                                        | Resultado                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sem conferir a UF do prefixo (`3909502` entra) | 4 fail                                                                                                                                                  |
| sem a forma de sete dígitos (`350950` entra)   | 1 fail                                                                                                                                                  |
| sem filtro nenhum (só descarta nulo e vazio)   | 6 fail (inclui a CHECK do banco recusando o lote)                                                                                                       |
| cursor não avança dentro do ciclo              | 3 fail                                                                                                                                                  |
| cursor não é gravado (`setWhere false`)        | 1 fail                                                                                                                                                  |
| instantes truncados em milissegundos           | 1 fail (o caso dos microssegundos)                                                                                                                      |
| destinatário sempre vence a entrega            | 2 fail                                                                                                                                                  |
| importação desligada não é pulada              | 1 fail                                                                                                                                                  |
| empresa suspensa não é pulada                  | 1 fail                                                                                                                                                  |
| parada pedida não é lida entre lotes           | 1 fail                                                                                                                                                  |
| parada pedida não é lida entre empresas        | **sobreviveu** na 1ª rodada (a checagem por lote já impedia a leitura); o teste passou a afirmar `tally.companies`, e a mutação ficou vermelha (1 fail) |
| falha de uma empresa derruba o ciclo           | 1 fail                                                                                                                                                  |
| teto de 20 lotes alterado                      | 1 fail                                                                                                                                                  |

### O que não foi feito

Busca, aplicação, rotina, variáveis de ambiente e registro no `main.ts` (T3.3 a T3.5). Nenhum índice novo. Nada publicado.
