# Tarefas — 252

> **Q3 e Q4 estão `[NEEDS CLARIFICATION]`** (`spec.md`): não bloqueiam nenhuma task de código; bloqueiam **ligar a
> rotina** (configurar `FERIADOS_API_TOKEN` e despausar a rotina, que nasce pausada de fábrica — D13), que é passo do
> usuário. Migration **só staging** (Q2). **Fases 0 a 5 feitas e publicadas em staging** (2026-10-07 e 2026-10-09; SHAs e deploys
> no quadro de `evidence.md` § "T6.1 — fechamento"); a rotina nasce inerte sem token e pausada. **Produção ainda não leva a 252**
> (só o roteirizador por cidade e os clientes tolerantes, PR #154). **T6.1: a documentação viva está feita** (2026-10-09, branch
> `work/252-t6`); **faltam a revisão final `opus` e a revisão de design com o usuário.**

Uma task por vez, na ordem. Cada task fecha com: **contrato vermelho antes** (pelo motivo certo), `bun run typecheck`,
lint com a app como cwd, teste pelo **script `test` do `package.json`** (nunca `bun test` cru; na API contrato e
integração são dois comandos — `bun --env-file=../../.env.test test --timeout 120000` e
`bun --env-file=../../.env.test run test:integration`), integração contra um Postgres **que responda** (pular não é
passar), **prova por mutação**, `bun run format:check` na raiz, **commit isolado** com caminhos explícitos
(`--no-verify`, nunca `git add -A`) e evidência em `evidence.md`. Teste novo entra na lista explícita do `package.json`
da app. Migration pede também `make migration-test` e `db:generate` = `no_changes`.

## Quadro

| Task  | Modelo                          | Migration | Prints  | Depende de     |
| ----- | ------------------------------- | --------- | ------- | -------------- |
| T0.1  | 🧠 `opus`                       | —         | —       | —              |
| T0.2  | `haiku`                         | —         | —       | T0.1           |
| T1.1  | `haiku`                         | —         | —       | T0.2           |
| T1.2  | `sonnet`                        | —         | —       | T1.1           |
| T2.1  | `sonnet`                        | —         | —       | T1.2 (staging) |
| T2.2  | 🧠 `sonnet` (revisão `opus`)    | **sim**   | —       | T2.1           |
| T2.3  | `haiku`                         | —         | —       | T2.1           |
| T3.1  | `sonnet`                        | —         | —       | T2.2           |
| T3.2  | `sonnet`                        | —         | —       | T2.2           |
| T3.3  | `sonnet`                        | —         | —       | T3.1, T3.2     |
| T3.4  | `sonnet`                        | —         | —       | T3.3           |
| T3.5  | `haiku`                         | —         | —       | T3.4           |
| T4.1  | `sonnet`                        | —         | —       | T2.2           |
| T4.2  | `sonnet`                        | —         | —       | T2.2           |
| T4.3  | `sonnet`                        | —         | —       | T4.2           |
| T5.1  | `haiku`                         | —         | —       | T0.1           |
| T5.1b | `haiku`                         | —         | —       | T0.1           |
| T5.2  | `sonnet`                        | —         | **sim** | T5.1, T4.1     |
| T5.3  | `sonnet`                        | —         | **sim** | T5.1, T4.2     |
| T5.4  | `sonnet`                        | —         | **sim** | T5.1b, T4.3    |
| T6.1  | `sonnet` (revisão final `opus`) | —         | **sim** | todas          |

## Fase 0 — Decisão e conferência

> 🤖 Modelo: `haiku` (T0.1 é 🧠 — `opus`)

- [x] **T0.1** 🧠 Validar o **ADR-0100** (redigido em 2026-10-07 a partir do desenho do `architect`) com `architect`
      `opus`: D1–D12, modelo de dados, emendas ao ADR-0048 §3 e à 238. Status de "proposta" para "aceita"; divergência
      vira emenda no ADR e nota em `evidence.md`. **Feita em 2026-10-07** (executor `opus`, não o agente `architect`,
      contra `origin/staging` `eaa2a7eb7`): 22 divergências corrigidas no lugar, nenhuma decisão do usuário reaberta, D13 acrescentada por
      delegação (a rotina nasce pausada); ADR-0100 **aceita**. `evidence.md` § T0.1.
- [x] **T0.2** Conferir os fatos do `plan.md` § Contexto contra `origin/staging` (arquivo e linha) e o próximo
      timestamp de migration livre. Divergência vira nota em `evidence.md`. **Feita em 2026-10-07**: tabela "citado →
      real" em `evidence.md` § T0.2 (mudaram só as citações do roteirizador, pela correção da Fase 1; corrigidos o
      contrato do catálogo do painel, as linhas do `SECURITY.md` e o nome do módulo, `src/holiday-provider-pull/`).

## Fase 1 — O roteirizador fecha só a cidade em feriado (sem migration)

> 🤖 Modelo: `sonnet` (T1.1 em `haiku`)

- [x] **T1.1** Inverter o teste de `route-optimization-municipal-holiday.integration.test.ts` ~199–206 para esperar
      **`[CITY_B]`** e acrescentar o caso do **mesmo CNPJ com paradas em duas cidades** (feriado em B não fecha a
      parada em A). Vermelho contra o código atual, pelo motivo certo. (CA1) **Feita** como "F1 do roteirizador" da
      spec 238: `913aad994` em staging (5 de 15 vermelhos pelo motivo certo; casos novos em 231–264).
- [x] **T1.2** `readPoolWindows`: select com `cityIbgeCode`, janela por `${cityCode}\u0000${taxId}`, `resolvePoolWindow`
      com a cidade da parada; política e contrato do solver intactos. Mutação: tirar o filtro por cidade deixa a T1.1
      vermelha. Publicar o worker em staging **sozinho** e confirmar o deploy. (CA1) **Feita:** `4454228ac` (correção,
      extraída para `drizzle-pool-window.query.ts` e `pool-window.policy.ts`) e `1754e36e7` (evidência), em staging
      desde 2026-10-07; 15/15 no arquivo, 5 mutações vermelhas (tirar o filtro por cidade: 5 fail) e 1 equivalente
      documentada; 234 integrações do worker sem falha (relato da sessão que publicou). Evidência:
      `specs/238-os-dias-uteis-contam-feriado-e-aniversario-da-cidade/evidence.md` § T1.2a (nota de correção) e §
      "F1 do roteirizador — feriado por cidade".

## Fase 2 — Dado e catálogo

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — revisão `opus`; T2.3 em `haiku`)

- [x] **T2.1** Contratos e integração do modelo **antes**: tabelas, únicos, CHECK de exclusão mútua
      `source_rule_id`/`provider_entry_id`, CHECK de importada só `once` no estadual, índices parciais, CHECK de `job`
      com o nome novo, a linha de `job_schedules` **pausada de fábrica** (D13), os **nomes** de constraint e índice do
      ADR-0100 §3 (todos ≤ 63 bytes, nenhum padrão do drizzle), `rollback.sql` (estático). **Feita em 2026-10-07**
      (`76d9245c2`, 118 pass / 13 fail pelo motivo certo). `evidence.md` § T2.1.
- [x] **T2.2** 🧠 Migration aditiva (`<timestamp>_holiday_provider_import`; timestamp depois do último de staging na
      hora de gerar — hoje `20261007205304`, da 250) + `rollback.sql` + `snapshot.json` + schema
      Drizzle; comandos em tabela publicada no fim do arquivo; `make migration-test`; `db:generate` = `no_changes`;
      integração do roteirizador verde depois dela. Revisão `opus` em passada separada. **Só staging.** (CA2)
      **Entregue em `54539fce7`** (`20261009040622_holiday_provider_import`, rebaseada em staging `4f04022ba`), **fechada pela T2.3 (`b49b22102`):** o snapshot traz
      `holiday.provider.pull` nas duas CHECK de `job` e o nome ainda não está no catálogo TS, então
      `schema-snapshot.contract` fica vermelho e `db:generate` não dá `no_changes` (com o nome provisório no catálogo:
      138 pass e `no_changes`). Rollback recusa feriado importado, supressão e execução aberta. **2ª rodada
      (revisão `opus`, 2026-10-09):** NOT NULL e identidade D2 do cache, FK composta entrada×linha e escopo×tipo na entrada,
      rollback recusa também a empresa com a importação desligada e trava as tabelas, rollback da 238 recusa enquanto a
      importação existir, testes de índice/default/`RESTRICT`. `evidence.md` § T2.2 (2ª rodada).
- [x] **T2.3** `holiday.provider.pull` nas quatro cópias do catálogo de jobs — **painel primeiro** — com
      `minimumIntervalSeconds: 3_600` e o vocabulário de falha (**sem** rótulo nem locale: o painel não tem mecanismo de rótulo
      por rotina e mostra o nome cru em `OperationsDashboard.page.tsx` — lacuna conhecida, sem criar mecanismo); paridade verde nas quatro apps
      (`test/job-catalog/catalog.contract.ts` na API, no worker e no cron; `test/shared/job-catalog.contract.ts` no
      painel). **Fecha também o contrato `schema-snapshot` da T2.2** (a CHECK de `job` do schema vem do catálogo da API) e o
      `db:generate` = `no_changes`: rodar `bun run test` da API e `bun run db:generate` (esperado `no_changes`) ao fim. **Feita em 2026-10-09** (`2f6add63f`, `b49b22102`, `f02ccbef6`, `fc777a9d5`): `db:generate` = `no_changes`, `schema-snapshot` verde, paridade verde nas quatro. **Rótulo e locale do painel não feitos**: o molde não tem mecanismo de rótulo por rotina, então é decisão pendente (`evidence.md` § T2.3).

## Fase 3 — A rotina no worker

> 🤖 Modelo: `sonnet` (T3.5 em `haiku`)

- [x] **T3.1** Cliente HTTP da FeriadosAPI: `Authorization: Bearer`, guarda Zod com as chaves esperadas, erros tipados
      (`provider_unreachable`, `provider_unauthorized`, `malformed_response`), `data` `DD/MM/AAAA` → `YYYY-MM-DD`
      validada; nome de 1 a 120 caracteres (`state_holidays_name_check`); duas entradas na mesma `(escopo, ibge,
data)` → vence a não facultativa; fixture no formato da documentação (cidade, estado, nacional, facultativo,
      página > 100). Token redigido em toda mensagem (molde `nota-rp-v2.client.ts` 158–161). **Feita em 2026-10-09**
      (`8571ad190` contrato vermelho, `ca44fe24a` código): o token fica fora de toda mensagem **por construção** (o erro só
      carrega o próprio código), 19 testes, 10 mutações vermelhas; **lacunas** da forma de resposta real em
      `evidence.md` § T3.1.
- [x] **T3.2** Descoberta por cursor (`nfe_documents_company_updated_issued_id_idx`, 2.000 por lote, 20 lotes por ciclo),
      destino físico pela mesma junção do roteirizador (uma consulta dos dois papéis por lote e a escolha com
      `resolvePhysicalDestination` em TypeScript; sem desvio manual), upsert em `holiday_import_cities`; empresa com
      `is_enabled = false` pulada. `EXPLAIN` do lote registrado (`nfe_addresses` sem índice por participante; índice,
      se preciso, em migration própria). Integração contra Postgres. **Lote venenoso (M2):** o código de cidade que
      sai de `resolvePhysicalDestination` é filtrado **em TypeScript, antes do upsert**, com `^[1-5][0-9]{6}$` mais prefixo
      de UF válido (`BRAZILIAN_STATE_IBGE_CODE_LIST`), descartando `null`, `''`, `9999999` e `3909502`: a CHECK
      `holiday_import_cities_city_check` recusaria o lote inteiro por um só código lixo. O descarte vira contador (sem PII:
      só a contagem e o motivo) e o **cursor avança**, para o lote não travar a empresa. Contrato com um lote misto
      (válidos + os quatro lixos): só os válidos entram, o contador diz quantos saíram, o cursor andou. **Feita em
      2026-10-09** (`35d04a1d2` contratos e integração vermelhos, `601237d60` código): 6 integrações contra Postgres
      nativo, 13 mutações vermelhas, cursor em texto com microssegundos; o `EXPLAIN` confirma o índice do cursor e um
      `Seq Scan` em `nfe_addresses` por lote (sem índice novo; decisão do usuário, `evidence.md` § T3.2).
- [x] **T3.3** Busca: ordem por `sum(document_count)`, horizonte (D8), limitador 1,2 s com relógio e `sleep` injetados,
      teto de 100 por ciclo, orçamento mensal incrementado antes da chamada por **upsert** (o primeiro pedido do mês
      cria a linha; mutação: `UPDATE` cru para no dia 1º), backoff 1 h/6 h/24 h até 7 dias, 401/403, 429 com
      `Retry-After`, `quota_exhausted`, `not_covered` (90 dias), cancelamento do operador conferido entre
      requisições. (CA3, CA7) **Feita em 2026-10-09** (`d7b7fd062` contratos e integração
      vermelhos, `e98589cb4` código, `524643828` e `3380298b3` reforços): CA3 e CA7 provados com relógio injetado e contra
      Postgres (ciclo repetido = 0 requisições e 0 escritas por `xmin`), 23 mutações vermelhas, orçamento por upsert
      (`UPDATE` cru derruba 7 testes); `evidence.md` § T3.3. **2ª rodada (revisão `opus`, 2026-10-09):** 404 de contrato,
      `Retry-After` domado, corpo com teto, controle removido, disjuntor, `provider_plan_restricted` por par e **cota
      esgotada que só encerra o ciclo** (sem `quota_exhausted` por par) — `evidence.md` § "2ª rodada da Fase 3".
- [x] **T3.4** Aplicação: municipal `ON CONFLICT DO NOTHING` pulando supressões, estadual `once` marcado (D6, `ON
CONFLICT` sobre o predicado do único parcial `once`), só datas
      `>=` hoje em São Paulo (D7), nacional só paridade (`national_mismatch`), facultativo só no cache, `removed_at`
      sem apagar a linha da empresa. Confere no início que a Fase 1 está em staging. (CA4, CA6, CA10, CA11)
      **Contrato com a T4.1 (revisão):** a aplicação lê o **cache** a cada ciclo — não só os pares recém-buscados —,
      pulando as supressões, **sob o mesmo advisory lock** `['business-calendar', companyId]` da API
      (`business-calendar-lock.support.ts`) e **relendo as supressões dentro da transação**: é o que faz a data
      restaurada voltar na próxima execução diária e o `DELETE` (que agora suprime a data digitada/adotada de hoje em
      diante) não perder para a importação. **Feita em 2026-10-09** (`938a4357e` contratos e
      integração vermelhos, `9b1450794` código, `a52a193ad` ajuste de dado de teste): Fase 1 conferida em `origin/staging`
      (`4454228ac`), aplicação por empresa sob a trava de calendário da 238, 11 integrações contra Postgres, 18 mutações
      vermelhas; `evidence.md` § T3.4.
- [x] **T3.5** `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` (inteiro `>= 1`) no schema do worker
      (vazio = ausente), registro condicional da rotina (`job_run_routine_missing` sem token), `.env.example` sem valor,
      `.railway/railway.ts` com `preserve()`, contrato de que o token não aparece no log (inclusive em erro). (CA8, CA9) **Feita em 2026-10-09** (`9b64e1726` contratos
      vermelhos, `264b7f31a` código): sem token a rotina não é registrada e o boot segue verde; orçamento inteiro `>= 1`
      (padrão 4500, Q3 aberta); o token não aparece em log, contador nem erro com o cliente HTTP de verdade e um
      fornecedor que o ecoa de seis jeitos; 13 mutações vermelhas; `evidence.md` § T3.5 e "Fechamento da Fase 3".

## Fase 4 — API

> 🤖 Modelo: `sonnet`

- [x] **T4.1** Rotas de gestão (`settings.manage`, `.strict()`, `companyId` do contexto, `audit_logs` na mesma
      transação): desligar (só de hoje em diante)/restaurar importado, adoção pelo `PATCH` de nome/tipo **e pelo
      `POST` da mesma data** (zeram `provider_entry_id`; `isSameTypedHoliday` não vale para importada), o `DELETE` da
      238 numa importada **é** o desligar (supressão + auditoria; regenera a data da regra do dia, ADR-0096 §6.6),
      `typedHolidaysKept` conta só `provider_entry_id IS NULL`, o mesmo nas rotas de `state_holidays`; status da
      importação (o cache global só agregado para as cidades da empresa). Arquivos: `drizzle-municipal-holiday.repository.ts`
      65–182, `municipal-holiday.support.ts` 54–61, `municipal-holiday-typed.queries.ts` 37–48 e os de
      `state_holidays`. Integração contra Postgres. (CA5) **Isolamento da tabela global:** contrato de isolamento
      (molde `test/trip-domain/delivery-deadline-isolation.contract.ts`) — nenhum arquivo de `presentation` ou de
      repositório importa as três tabelas globais (`holiday_provider_fetches`, `_entries`, `_monthly_usage`), exceto a
      consulta agregada do status, que filtra pelas cidades da própria empresa.
- [x] **T4.2** `holidayWarnings` nas paradas do `GET /trips/:id` e `POST /business-calendar/day-checks` (`fleet.read`,
      até 200 itens, 400 a campo desconhecido e a > 200); `origin` (`code`/`typed`/`rule`/`imported`) nas regras e em
      `HolidayReason` (mapeadores leem `provider_entry_id`; o filtro de `readTypedHolidays` não muda); `cityName` de
      `listStopAddresses` (+0 no detalhe), nulo quando o `city_code` do endereço não é a cidade da parada; contrato de
      contagem de consultas (+0 ou +4 fixas), leituras em série dentro de transação
      (`transaction-serial-queries.contract.test.ts`). (CA12, CA13)
- [x] **T4.3** `holidayWarnings` nas paradas de `GET /me/trips/current` (D12): data = dia civil de São Paulo do
      `estimated_arrival_at`, ou **hoje** com a parada em andamento; paradas concluídas sem aviso; mesmo formato do
      detalhe, com `cityName`. **Antes do código:** medir e fixar em contrato a contagem de consultas atual da leitura
      do motorista; depois dela, **+5 fixas** com uma cidade ou com várias (4 do calendário carregado uma vez, em
      série, e 1 de endereços para o `cityName`; sem N+1). O módulo do aviso é chamado pelo **caso de uso**
      (`find-current-driver-trip.use-case.ts`), nunca pelo repositório da leitura, e usa `loadBusinessCalendarRules` +
      `buildBusinessCalendar` direto — não `trip-delivery-deadline-calendar.support.ts`, cujo nome casa a agulha do
      contrato de isolamento. Falha na carga do calendário **não derruba o snapshot**: sai sem aviso e loga só ids e
      contagem (molde dos produtos da 247 T4.6, `driver-snapshot-products.integration.ts`). Recorte pelo vínculo do
      motorista intacto
      (BOLA: o motorista de outra viagem não recebe o aviso dela). **Não-regressão:** `computeDriverScore`, a
      pontualidade do comprovante e `missingAfterHours` idênticos com e sem feriado (integração), e o contrato de
      isolamento (`trip-domain/delivery-deadline-isolation.contract.ts`) ganha a agulha do calendário/aviso para
      `driver-score.policy.ts`, `delivery-proof-*.ts` e `proof-pending.query.ts`. Mutação: o aviso de outra cidade
      na parada, a nota descontar o feriado. (CA15, CA16) **Feita em 2026-10-09** (`c4357c333` linha de base de 25
      consultas, `44b020cf5` testes, `8a5356eb5` código, `70a6621e2` bordas): +5 fixas medidas (1 de contexto + 4 do
      calendário; +1 se nenhuma parada aberta avisa, +0 sem parada aberta), a agulha ficou num contrato próprio
      (`driver-holiday-warning-isolation.contract.ts`, que vigia também o repositório da leitura), 21 mutações mortas,
      11157 contratos e 24 arquivos de integração sem falha. Parada **em andamento sem ETA também avisa para hoje** (ADR D12;
      corrigido na rodada de fechamento); sem ETA e sem começar, nada. `evidence.md` § T4.3.
      **Fronteira do módulo (revisão da T4.2):** o aviso do motorista usa `readHolidayWarnings`
      (`business-calendar/infrastructure/holiday-warning.reader.ts`) **direto** e **nunca** importa
      `trips/infrastructure/trip-holiday-warning.support.ts`: este é o suporte do detalhe da viagem e carrega a agulha
      `delivery-deadline` (reaproveita o coalescedor de avisos do prazo), que o contrato de isolamento da nota proíbe.

## Fase 5 — Painel e app do motorista

> 🤖 Modelo: `sonnet` (T5.1 e T5.1b em `haiku`). **T5.1 e T5.1b executam e publicam antes da Fase 4** (API depois dos
> clientes tolerantes).

- [x] **T5.1** Painel tolerante aos campos novos: validação aceita `holidayWarnings` ausente ou presente; `day-checks`
      indisponível cai no aviso nacional de hoje. Sai antes da API. (Feito para `holidayWarnings`; a queda do `day-checks` no aviso nacional vem com o
      consumo do endpoint, na T5.3 — a rota ainda não existe. Evidência: `evidence.md` § T5.1/T5.1b.)
- [x] **T5.1b** App do motorista tolerante (`apps/frontend-driver`): a guarda `driverTripResponse.validation.ts`
      (`toStop`) passa a ler `holidayWarnings` como **acessório** — ausente ou malformado vira lista vazia, **nunca**
      `DriverTripResponseError` (molde do motivo da recusa do canhoto, spec 220 RF29) — e o campo entra no tipo
      `DriverTripStop`, para o snapshot guardado no aparelho (`tripSnapshot.service.ts`) carregá-lo (snapshot antigo
      sem o campo lê como lista vazia). Sem tela ainda.
      Nenhum código importado do painel (ADR-0075). Sai antes da API.
- [x] **T5.2** Aba Calendário: origem (nacional, estadual, cadastrado, importado), desligar/restaurar, removidos pelo
      fornecedor, status da importação; locale pt-BR/en. **Prints** 375/768/1280, claro e escuro, aprovados pelo
      usuário antes de publicar. **Critérios da API (T4.1):** "restaurar" volta **na próxima execução diária**, não na
      hora (a tela não promete o contrário); `409 HOLIDAY_IMPORT_PAST_DATE` ao desligar data anterior a hoje e
      `409 HOLIDAY_IMPORT_DATE_LOCKED` ao mudar a **data** de uma estadual importada ("desligue e cadastre") têm
      mensagem própria; `removedByProvider` é `{ items, truncated }` (com `truncated`, a tela avisa que há mais) e
      `GET /holiday-imports/suppressions` é paginada como `/cities` (`page`/`perPage ≤ 100`).
      **Feita em 2026-10-09 (código e prints; prints aprovados pelo usuário em 2026-10-09 e publicados):** `evidence.md` § T5.2 e T5.3.
      **Origem e ordem de publicação:** as listas e as respostas de `POST`/`PATCH` de `/municipal-holidays` e `/state-holidays`
      trazem `origin: 'typed' | 'imported'` (branch `work/252-origin`; `evidence.md` § "origin nas listas"). O painel publicado
      tem guardas de chaves exatas e recusaria a chave: **painel (com `origin` opcional) primeiro, API depois**.
- [x] **T5.3** Avisos por parada na montagem (uma chamada a `day-checks` quando o solver termina, no lugar do aviso
      só nacional) e selo nas paradas do detalhe; texto neutro, nunca desabilita "Criar viagem". **Prints**
      375/768/1280, claro e escuro, aprovados pelo usuário. (CA14)
      **Feita em 2026-10-09 (código e prints; prints aprovados pelo usuário em 2026-10-09 e publicados):** `evidence.md` § T5.2 e T5.3.
- [x] **T5.4** Aviso no app do motorista, por parada da viagem dele, num componente próprio (molde dos
      `Driver*Notice.component.tsx`; o `DriverStopCard.component.tsx` já tem 75 KB): texto curto e de campo ("Hoje é
      feriado em Campinas (aniversário da cidade). Confirme com o cliente antes de ir."; em data futura, "Dia 13/10 é
      feriado em …"; "hoje" só quando a data do aviso é o dia civil de São Paulo no relógio do aparelho corrigido por
      `clockOffset.service.ts`), neutro, **nunca esconde nem
      bloqueia** iniciar trajeto, chegar, entregar ou registrar ocorrência; contraste nos dois temas; alvo ≥ 44 px se
      houver toque; locale pt-BR/en no padrão do app. **Offline:** o aviso vem do snapshot guardado; sem rede mostra
      o último conhecido e não inventa. **Prints** 375/768/1280, claro e escuro, aprovados pelo usuário antes de
      publicar. (CA15, CA17) **Feita no código em 2026-10-09** (branch `work/252-t5-4`); **publicação pendente da
      aprovação dos prints pelo usuário**. `evidence.md` § T5.4.

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final `opus`)

- [ ] **T6.1** Revisão de design e usabilidade (web.md §15) comparando a tela real com os prints aprovados,
      no painel e no app do motorista (T5.4); documentação viva (`plan.md` § Documentação viva), `feriadosapi.com` como
      destino de saída numa atualização da entrada da 252 em `docs/SECURITY.md` (61–148 depois da atualização; não há
      lista de destinos à parte); revisão final com `code-reviewer` `opus` em passada separada; auditoria do §15 do
      `code-standart.md` (N+1, `Promise.all`, logs sem PII, sanitização).
      **Feito em 2026-10-09 (executor `sonnet`, só documentação, branch `work/252-t6`, sem push):** `docs/SECURITY.md`
      (destino de saída, estado publicado, códigos de falha do par, pontos aceitos e riscos abertos), `plan.md` § "Conferência da
      T6.1", docs que faltavam (`domain-model.md`, `frontend-driver.md` e o `CLAUDE.md` do app do motorista, `cron-transportada.md`),
      ADR-0100 §4/§5/§6, e o quadro único da spec em `evidence.md` § "T6.1 — fechamento". **Falta para marcar `[x]`:**
      (a) a revisão final `code-reviewer` `opus` + auditoria do §15; (b) a revisão de design e usabilidade com o usuário,
      tela real contra os prints aprovados, no painel e no app do motorista; (c) decidir os achados abertos listados em
      `evidence.md` § "T6.1 — fechamento" (manchete "Sem cota" inalcançável, ordem painel/API em produção).
      **Decidido em 2026-10-09 (usuário: "fecha as decisões abertas"), branch `work/252-status`, sem push:** a manchete de cota saiu e o cartão de status dá a
      verdade pelo último ciclo da rotina (`lastRun`) e pelas buscas fora do plano (`pairs.planRestricted`); painel com os campos opcionais ANTES da API.
      `evidence.md` § "Cartão de status honesto". Falta só a aprovação dos prints pelo usuário para publicar.

## Publicação

**Estado real (2026-10-09):** T1.2 saiu sozinha (`4454228ac`, staging em 2026-10-07 e em produção pelo PR #154) → painel
tolerante (T5.1) e app do motorista tolerante (T5.1b) (staging em 2026-10-07; produção pelo PR #154) → migration com o catálogo
(T2.2 e T2.3, staging em 2026-10-09 04:53Z) → API da gestão e dos avisos (T4.1, T4.2) e worker inerte (Fase 3) → API do
motorista (T4.3) → app do motorista (T5.4) → painel (T5.2, T5.3) → API com `origin` (**depois** do painel). Tudo em staging, com
Deploy verde (quadro em `evidence.md` § "T6.1 — fechamento"). **Faltam, nesta ordem:** o usuário confirma termos e plano (Q3, Q4),
configura o token em staging e despausa a rotina → acompanhar o 1º ciclo e registrar em `evidence.md` → revisão final
`opus` e revisão de design → produção por PR `staging → main` com aprovação humana (a migration com aprovação própria, e o painel
antes da API por causa do `origin`).

### Roteiro do 1º ciclo real (passo do usuário, depois de Q3 e Q4)

Configurar `FERIADOS_API_TOKEN` e **deixar o orçamento no valor do plano — não testar com orçamento baixo** (o orçamento
esgotado só encerra o ciclo e o ciclo seguinte já parte do mês gasto). Despausar `holiday.provider.pull` e conferir, em
staging, só por leitura:

- `select last_error_code, status, count(*) from holiday_provider_fetches group by 1, 2` — esperado `done` e, no
  máximo, `not_covered`; `malformed_response`, `provider_unreachable`, `provider_plan_restricted` e `persistence_failed`
  pedem leitura do log (só tem código, nome do erro e par);
- `holiday_provider_monthly_usage.requests` do mês contra o contador `requests` da execução no painel de rotinas;
- `national_mismatch` maior que zero **é esperado** (o fornecedor lista a Páscoa; o código conta Carnaval e Corpus Christi);
- as lacunas da forma de resposta (`evidence.md` § T3.1) se confirmam ou se corrigem aqui.

## Prompt de execução

Fases 0 a 5 estão feitas e em staging, e a documentação da T6.1 também (branch `work/252-t6`, ainda sem push). O que resta é a
revisão final, a revisão de design com o usuário e, depois dos passos do usuário (Q3, Q4, token, despausar), a promoção. **A spec
tem `[NEEDS CLARIFICATION]` aberto (Q3, Q4): isso não bloqueia a revisão, bloqueia ligar a rotina.**

```text
/oh-my-claudecode:autopilot Feche a T6.1 da spec specs/252-os-feriados-vem-da-feriadosapi-e-avisam-na-montagem/ (leia spec.md,
plan.md, tasks.md e evidence.md § "T6.1 — fechamento" antes de começar; a documentação viva já está feita). Em worktree/branch
próprios a partir de origin/staging (fetch antes; confira que a branch work/252-t6 foi publicada).
Modelos: revisão final → code-reviewer model=opus, em passada separada, sobre o código das Fases 2 a 5 (migration, rotina, rotas,
avisos, telas), com a auditoria do §15 do code-standart.md (N+1, Promise.all, logs sem PII, sanitização); achados viram tasks
em fase barata (executor model=sonnet) e fecham com contrato vermelho antes, typecheck, lint com cwd na app, teste pelo script do
package.json, mutação, format:check na raiz e commit isolado com caminhos explícitos (--no-verify, nunca git add -A).
Decida ou pergunte os achados abertos de evidence.md § "T6.1 — fechamento" (manchete "Sem cota" inalcançável; ordem painel/API
em produção; índice de nfe_addresses).
A revisão de design e usabilidade (web.md §15, tela real contra os prints aprovados, painel e app do motorista) é com o usuário.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Pare e pergunte antes de: produção (deploy, PR staging→main, migration em produção), configurar ou pedir FERIADOS_API_TOKEN,
despausar a rotina holiday.provider.pull, mudar o contrato do solver e qualquer tela publicada sem print aprovado.
```
