# 056 — A nota anda pela viagem · tasks

> Ordem de trabalho: Fase 0 antes de qualquer linha de código. As fases 1 e 2 são o coração; a 3 e a
> 4 só compilam sobre elas.

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 ✅ — ADR-0043: a viagem tem fases, e a nota tem as suas

A máquina de dois eixos (D1), o derivado automático do estado da viagem, `dispatched` como porta de
não-retorno (D2), a parada agrupada por endereço e não por destinatário (D3), e a trilha de eventos
(D4). Registra explicitamente que **revisa o ADR-0023 §4** ("o ciclo é só aberto/fechado") — a
viagem continua sem falar com a SEFAZ, mas o ciclo deixa de ser binário, e sem essa frase escrita a
próxima leitura do 0023 conclui que esta feature o viola.

- **Arquivos:** `docs/adr/0043-a-nota-anda-pela-viagem.md`, `docs/adr/0023-*.md` (marca a §4 como
  revista), `docs/spec/domain-model.md` (§estados)
- **Aceite:** revisão humana
- **Verificação:** —
- **Evidência:** `docs/adr/0043-a-nota-anda-pela-viagem.md` (9 decisões, 5 alternativas recusadas);
  `docs/adr/0023-*.md` com nota de emenda no cabeçalho e o `NEEDS CLARIFICATION` do §4 substituído
  pela resposta; `docs/spec/domain-model.md` com Trip/TripStop nos agregados, 9 arestas novas no ER,
  3 constraints e as duas linhas de estado.

## Fase 1 — O modelo

> 🤖 Modelo: `sonnet` (T002 e T005 são 🧠 — migration com backfill)

### T002 🧠 ✅ — Os estados da viagem e da nota

`TRIP_STATUSES` passa de `['open','closed']` para os nove de D1; nasce `TRIP_DOCUMENT_SEPARATION_STATUSES`.
`trip_documents` ganha `separation_status`, `separated_at`, `loaded_at`, `returned_at`,
`return_reason`. Check constraints por `inList`, como o resto do schema. Backfill aditivo:
`open→draft`, `closed→completed`; nota com `delivered_at` → `delivered`, as demais de viagem
fechada → `returned` com motivo `migration`.

- **Arquivos:** `apps/api-transportada/drizzle/20260824200157_trip_status_machine/` (migration
  + `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts`
- **Aceite:** `test/trip-schema/status.contract.ts` (novo),
  `test/database-migration/static-migration.contract.ts` (atualizado)
- **Verificação:** `bun run --cwd apps/api-transportada typecheck` ✅,
  `bun run --cwd apps/api-transportada lint` ✅, `bun run --cwd apps/api-transportada test`
  (2910 pass, 0 fail) ✅
- **Evidência:** migration aplicada do zero num Postgres local e verificada por `\d trip_documents`;
  backfill testado (`open→draft`, `closed→completed`, `delivered_at`→`delivered`, demais de viagem
  fechada→`returned` com motivo `migration`); rollback escreve com guarda que recusa recuar viagem
  em estado que `open|closed` não representa. Blast radius fora do schema: 2 arquivos de produção
  (`trip.use-case.ts`, `drizzle-trip.repository.ts`) com literal `'closed'`→`'completed'` /
  `'open'`→condição de não-terminal — semântica completa (força + motivo, `dispatched` irreversível)
  fica para T006/T010, como escopado. 9 arquivos de teste com literais `'open'/'closed'` corrigidos
  para manter `tsc --noEmit` e a suíte verdes.

### T003 ✅ — `trip_stops`

Parada com `sequence` (unique por viagem), chave de endereço normalizada, rótulo legível,
`arrived_at`, `completed_at`, e `delivery_window_start`/`end` nulas e reservadas. FK composta
`(company_id, trip_id)` seguindo o padrão de `trips`. Sem coordenada — a 058 a adiciona.

- **Arquivos:** `apps/api-transportada/drizzle/20260824202501_trip_stops/` (migration +
  `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts`,
  `apps/api-transportada/src/database/database.schema.ts` (registro no barrel)
- **Aceite:** `test/trip-schema/stops.contract.ts` (novo, 7 testes),
  `test/trip-schema/tenant-safety.contract.ts` (tripStops adicionada a `TRIP_TABLES`),
  `test/database-migration/support.ts` (idem, para a checagem de existência),
  `test/database-migration/static-migration.contract.ts` (migration nova na lista exaustiva; o
  teste da migration histórica `_trip_planning_expansion` foi desacoplado do `TRIP_TABLES`
  compartilhado — ele valida um snapshot de três tabelas no passado, não a família atual)
- **Verificação:** `bun run --cwd apps/api-transportada typecheck` ✅,
  `bun run --cwd apps/api-transportada lint` ✅, `bun run --cwd apps/api-transportada test`
  (2917 pass, 0 fail) ✅
- **Evidência:** migration puramente aditiva (`CREATE TABLE`, sem backfill — tabela nova, sem
  linha existente); FK composta `(company_id, trip_id)` → `trips`, `on delete cascade` (a parada é
  derivada, some com a viagem); `unique(company_id, trip_id, sequence)`; checks para `sequence >= 1`,
  chave/rótulo não vazios, janela de entrega reservada mas coerente (início e fim nulos juntos), e
  `completed_at` nunca sem `arrived_at`. Sem coordenada — a spec 058 adiciona. Rollback recusa
  `DROP TABLE` se alguma parada já registrou chegada ou conclusão.

### T004 ✅ — `trip_documents.stop_id` e `trip_document_events`

FK da nota para a parada, e a tabela de eventos com `from_status`, `to_status`,
`actor_membership_id`, `occurred_at`, `note`. Contrato negativo obrigatório: **nenhuma coluna de
PII** na tabela de eventos.

- **Arquivos:** `apps/api-transportada/drizzle/20260824204404_trip_document_events/` (migration
  + `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts` (tripStops movida para
  antes de tripDocuments — referência direta exige declaração prévia em JS),
  `apps/api-transportada/src/database/database.schema.ts` (registro no barrel)
- **Aceite:** `test/trip-schema/events.contract.ts` (novo, 6 testes — inclui o contrato negativo de
  PII por nome de coluna), `test/trip-schema/tenant-safety.contract.ts` (dois testes novos: trilha
  cascade por documento, e vínculo nota↔parada com `set null`)
- **Verificação:** `bun run --cwd apps/api-transportada typecheck` ✅,
  `bun run --cwd apps/api-transportada lint` ✅, `bun run --cwd apps/api-transportada test`
  (2925 pass, 0 fail) ✅
- **Evidência:** `actor_user_id` (não `actor_membership_id` como o texto da spec sugeria) com FK
  composta para `user_company_memberships(user_id, company_id)` — mesmo padrão de
  `audit_logs_actor_membership_fk`, que já resolve "ator precisa ser membro desta empresa" sem
  precisar guardar o id da membership em si. `stop_id` é `on delete set null` (a parada é derivada
  e pode ser reconciliada/apagada sem travar a nota), `trip_document_events` é `on delete cascade`
  a partir de `trip_document` (a trilha morre com a nota, nunca com a viagem diretamente). Check
  `from_status is distinct from to_status` reforça em banco a idempotência que a T008 implementa em
  código: nenhum evento é gravado quando a transição não muda nada. Tabela append-only por
  convenção de código — sem `updated_at`, e o teste confere isso.

### T005 🧠 ✅ — O snapshot congelado do roteiro

Tabela (ou JSONB em `trips`) escrita na transição a `dispatched`, guardando a ordem das paradas e as
notas de cada uma. Imutável por constraint, não por convenção.

- **Arquivos:** `apps/api-transportada/drizzle/20260824204913_trip_dispatch_snapshots/` (migration
  + `rollback.sql`), `apps/api-transportada/src/database/trip.schema.ts`,
  `apps/api-transportada/src/database/database.schema.ts`
- **Aceite:** `test/trip-schema/dispatch-snapshot.contract.ts` (novo, 8 testes + 1 de contrato de
  trigger)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (2934 pass, 0 fail) ✅, banco recriado do zero
  com as 91 migrations em sequência ✅
- **Evidência — "imutável por constraint, não por convenção" resolvido:** o repositório já tinha a
  resposta e eu não sabia. `audit_logs` e `fiscal_sequence_reservations` são append-only por
  **trigger** (`20260720003709_company_fiscal_settings`): função `reject_<tabela>_mutation()` com
  `RAISE EXCEPTION ... USING ERRCODE = '55000'` em `BEFORE UPDATE OR DELETE ... FOR EACH ROW`.
  Adotei o mesmo padrão. Provado em execução, com linha real no banco: `UPDATE` e `DELETE` os dois
  recusados pelo Postgres, linha intacta depois.

  **Isso também decidiu tabela vs coluna JSONB em `trips`**, que era a dúvida aberta da task:
  `trips` sofre `UPDATE` a cada transição de estado, então uma coluna lá jamais poderia carregar o
  trigger. Só tabela própria torna a imutabilidade real.

  O `snapshot` guarda as paradas e os ids das notas **sem FK para `trip_stops`** — de propósito, e
  há teste para isso: uma FK faria a parada apagada levar o snapshot junto (cascade) ou travar a
  reconciliação (restrict), e as duas desfazem o congelamento. `sha256` do conteúdo segue
  `cte_issuance_payloads`. `forced`/`force_reason` nascem aqui em par coerente, prontos para a
  regra de despacho com pendência da T010.

  **Retrofit de T004 na mesma migration:** `trip_document_events` tinha ficado append-only só por
  convenção de código. Ganhou o mesmo trigger — a trilha de quem separou o quê tem o mesmo peso de
  auditoria que `audit_logs` e merece a mesma proteção. Deixar as duas tabelas com garantias
  diferentes seria pior que qualquer uma das duas escolhas.

  O trigger é escrito à mão na migration (o `drizzle-kit generate` não o produz), então é
  exatamente o tipo de coisa que some num `db:generate` futuro sem ninguém notar — o último teste
  do contrato lê o SQL da migration e falha se qualquer uma das quatro linhas do trigger sumir.

## Fase 2 — O domínio

> 🤖 Modelo: `sonnet` (T006 é 🧠 — é a máquina inteira)

### T006 🧠 ✅ — A máquina de transição, isolada e pura

Módulo sem I/O: recebe estado atual + transição pedida, devolve estado novo ou erro tipado. É ele
que define **cada aresta**, inclusive as proibidas. Estar isolado é o que torna testável toda
transição inválida sem subir banco.

- **Arquivos:** `src/trips/domain/trip-state.policy.ts` (novo — nome segue
  `mdfe-manifest-state.policy.ts`, que é o precedente do repositório para máquina de estado pura,
  em vez do `*-state-machine.ts` que esta task tinha chutado antes de eu olhar o código),
  `src/trips/domain/trip.error.ts` (classe de erro nova; o repositório não tem
  `shared/errors/codes.ts` — cada domínio guarda os seus, e essa é a convenção)
- **Aceite:** `test/trip-domain/trip-state.contract.ts` (novo, 34 testes)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (2960 pass, 0 fail) ✅
- **Evidência:** módulo sem I/O nenhum — nem banco, nem relógio, nem `Date`. Três desfechos em vez
  de dois: `applied` / `unchanged` / `blocked`, porque `unchanged` é o que sustenta a idempotência
  da RF-8 e não cabe em "permitido ou não".

  **Cobertura exaustiva de verdade:** dois testes varrem a grade inteira — 4 ações × 5 estados de
  nota × 8 estados de viagem = **160 arestas** no eixo da nota, e 3 ações × 8 estados × 2 (com e
  sem roteiro) = **48** no eixo da viagem. Toda célula tem resposta nomeada; nenhuma cai no vazio.

  **Precedência dos portões, decidida e comentada no código.** O no-op idempotente é checado
  **antes** do estado da viagem. Descobri isso escrevendo os testes: dois falharam, e a análise
  mostrou que o teste é que estava errado. Se o portão da viagem viesse primeiro, uma confirmação
  de entrega duplicada drenada da fila offline (spec 057 D5) **depois** de a viagem completar
  voltaria como 409 — conflito na cara do motorista para uma entrega que funcionou. O no-op nunca
  escreve nada e é o que torna todo replay seguro, então ele vence.

  Decisões que a task não especificava e eu tomei:
  - **Separar exige `route_planned`** (`draft` bloqueia). Separar carga cujo roteiro ninguém
    conferiu é separar carga que talvez não vá — e é o que dá função ao `route_planned`, que
    senão seria decorativo. É a decisão mais discutível das três; se atrapalhar a operação, o
    portão sai de um lugar só.
  - **Entregar e devolver exigem `dispatched`**, e separar/carregar exigem que ela **não** tenha
    saído. Barracão e rua são fases disjuntas, e é isso que garante que `completed` nunca aconteça
    numa viagem que nunca saiu.
  - **Cancelar vale até com o motorista na rua** — a tabela do ADR §1 diz "antes de `dispatched`",
    mas o texto do §2 e a spec 057 (viagem cancelada com o motorista na rua) descrevem o
    cancelamento pós-despacho como incidente real. Segui os dois que concordam; só `completed`
    recusa.
  - **`deriveTripStatus` só anda para a frente**, e viagem sem nota não deriva nada — "toda nota
    entregue" é vacuamente verdade num saco vazio, e sem essa guarda uma viagem vazia completaria
    sozinha. Tem teste para os dois.

### T007 ✅ — Normalização de endereço e derivação de parada

Função única e testada de `(postal_code, number, city_code)` → chave. `01310-100`/`01310100`,
`nº 45`/`45`/`45 A` resolvidos por teste, não por leitura. Mais o reconciliador: vincular cria a
parada se faltar, desvincular a última apaga.

- **Arquivos:** `src/trips/domain/stop-address-key.ts` (novo),
  `src/trips/application/reconcile-trip-stops.use-case.ts` (novo — inclui o port
  `TripStopReconciliationPort`, escopo mínimo do que o reconciliador precisa do banco; a T012 liga
  isso ao repositório real quando as rotas de vínculo passarem a chamá-lo), `test/trip-stops.contract.test.ts`
  (novo, umbrella), `package.json` (registrado no script `test`)
- **Aceite:** `test/trip-stops/address-key.contract.ts` (15 testes), `test/trip-stops/reconcile.contract.ts`
  (7 testes, com port falso no padrão de `trip-use-case.contract.ts`)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (2975 pass, 0 fail) ✅
- **Evidência:** normalização de CEP (só dígitos, exige 8) e de número (remove prefixo `nº`/`n°`,
  maiúsculas) conforme os dois pares literais do D3. Adicionei um terceiro caso que o D3 não citava
  mas que quebraria o agrupamento na prática: endereço **sem número** — `S/N`, `SN`, `sem número` —
  vira a chave canônica `S/N` em vez de string vazia, senão duas notas sem número no mesmo CEP
  virariam duas paradas por acidente de string. CEP que não normaliza para 8 dígitos devolve `null`
  em vez de chave inventada — é o sinal que T010 usa para o balde `SEM ENDEREÇO` do RF-9.

  O reconciliador é as duas metades exigidas: `reconcileStopOnLink` reaproveita a parada existente
  ou cria uma nova com a próxima sequência; `reconcileStopOnUnlink` apaga a parada só quando a
  contagem de documentos vivos chega a zero, e documenta explicitamente que precisa ser chamado
  **depois** de a nota perder a referência ao `stopId` — senão ela mesma se conta como razão para
  a parada continuar existindo.

### T008 ✅ — Transição de nota, com evento e derivação da viagem

Use case único por trás de `separate`/`load`/`deliver`/`return`: valida pela T006, escreve estado +
timestamp + evento, e recalcula o estado da viagem **na mesma transação**. Idempotente (RF-8).

- **Arquivos:** `src/trips/application/transition-trip-document.use-case.ts` (novo, com o port
  `TripDocumentTransitionPort`), `src/trips/infrastructure/drizzle-trip-document.repository.ts`
  (novo — nome corrigido de `trip-document.repository.ts`, seguindo a convenção `drizzle-*` já
  usada por `drizzle-trip.repository.ts`), `src/trips/domain/trip.error.ts` (3 erros novos),
  `test/trip-documents.contract.test.ts` (novo, umbrella), `package.json`
- **Aceite:** `test/trip-documents/transition.contract.ts` (8 testes, port falso — idempotência,
  bloqueio, motivo de devolução, corrida convergindo)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (2983 pass, 0 fail) ✅
- **Evidência:** três desfechos da T006 mapeados para efeito real — `unchanged` não toca o banco,
  `blocked` lança `TripStateTransitionNotAllowedError` com o motivo, `applied` chama
  `repository.applyTransition`, que faz tudo **numa transação só**: `UPDATE` guardado por
  `WHERE separation_status = fromStatus` (mesmo padrão de corrida que `tripStillOpen` já usa no
  repositório de viagem), `INSERT` do evento, recontagem de `tally` e `deriveTripStatus` — só
  escreve `trips.status` quando a derivação muda algo.

  **Corrida tratada como primeira classe, não como exceção.** Quando o `UPDATE` guardado não acha
  linha, o repositório devolve `raced: true` com o estado fresco em vez de lançar; o use case
  re-roda o `checkTripDocumentTransition` (T006) contra esse estado — e nesta máquina toda corrida
  real converge em `unchanged`, nunca numa segunda escrita, porque só uma ação alcança cada estado
  alvo. Escrevi um teste que tentava o cenário contrário (raced convergindo para uma segunda
  escrita) e ele revelou que esse caso é **impossível no grafo desta máquina** — removi o teste em
  vez de forçar um cenário sintético que o domínio não produz. O teto de tentativas (3) continua
  como rede de segurança, não como caminho esperado.

  **Provado contra o Postgres real, não só com port falso.** Um probe temporário (apagado depois)
  seguiu o encadeamento inteiro de FKs até `stored_objects`, rodou as três chamadas em sequência —
  `pending→separated`, a mesma corrida de propósito (recebeu `raced: true`, **zero** eventos
  escritos), `separated→loaded` — e conferiu: `trips.status` derivou para `loading` sozinho,
  exatamente 2 eventos gravados (não 3), e um `UPDATE` direto em `trip_document_events` foi
  recusado pelo trigger append-only da T005 — a primeira prova real de que o trigger protege
  linha **escrita pela aplicação**, não só a linha semeada à mão do probe de T005.

### T009 ✅ — Transição em lote

50 notas em uma transação e uma ida ao banco por tabela. É a operação real do armazém; uma a uma é
a que o produto não deve incentivar.

- **Arquivos:** `src/trips/application/transition-trip-documents-batch.use-case.ts` (novo, com o
  port `TripDocumentBatchTransitionPort`),
  `src/trips/infrastructure/drizzle-trip-document-batch.repository.ts` (novo),
  `test/trip-documents.contract.test.ts` (registro)
- **Aceite:** `test/trip-documents/batch-transition.contract.ts` (7 testes; contagem de queries
  assertada por número de **chamadas ao port**, não de SQL bruto — é o nível certo de asserção
  para um teste de use case, e o probe live abaixo confere o SQL de verdade)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (2990 pass, 0 fail) ✅
- **Evidência:** cada nota do lote é resolvida pela T006 na íntegra (`applied`/`unchanged`/`blocked`
  por documento, mais `not_found`/`raced` que só existem no nível do lote), e um bloqueio no meio
  não trava as demais — teste com 4 ids em 4 desfechos diferentes na mesma chamada. Nada itera por
  documento no lado do banco: `findSnapshots` é uma leitura para todos os ids pedidos, `writeBatch`
  nunca é chamado quando não há nada para aplicar, e com 50 ids o teste confere exatamente 1
  chamada de leitura e 1 de escrita.

  A escrita real usa `(id, separation_status) in (VALUES (...), (...))` — um `UPDATE` só, guardado
  por par `(id, fromStatus)` linha a linha, porque `toStatus` é uniforme no lote mas `fromStatus`
  pode variar (a origem de `separate` não é fixa). É a peça de SQL bruto que um port falso não
  prova sozinha.

  **Provado contra o Postgres real** com um probe temporário (apagado, banco recriado do zero):
  semeei 3 notas, marquei uma delas como já `separated` por fora — simulando a corrida —, e chamei
  o lote pedindo `pending→separated` nas três. Resultado: as duas de verdade `pending` foram
  escritas; a terceira ficou fora do `UPDATE` e **seu `separated_at` anterior não foi tocado**
  (prova de que o guard por linha funciona, não só o guard do lote inteiro); exatamente 2 eventos
  gravados, não 3.

### T010 ✅ — Planejar e despachar

`plan-route` (exige ≥1 parada e nenhuma parada `SEM ENDEREÇO`), e `dispatch` com a regra de
`force` mais motivo obrigatório (P2), congelando o snapshot da T005 e desvinculando as pendentes.

- **Arquivos:** `src/trips/application/plan-trip-route.use-case.ts`,
  `src/trips/application/dispatch-trip.use-case.ts` (ambos novos, com os ports
  `PlanTripRoutePort`/`DispatchTripPort`), `src/trips/infrastructure/drizzle-trip-route.repository.ts`
  (novo, implementa os dois), `src/trips/domain/trip.error.ts` (2 erros novos),
  `test/trips.contract.test.ts` (novo, umbrella), `package.json`
- **Aceite:** `test/trips/plan-and-dispatch.contract.ts` (13 testes, port falso)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (3003 pass, 0 fail) ✅
- **Evidência:** `hasRoute` é `≥1 parada && nenhuma nota viva sem stop_id` — o balde `SEM ENDEREÇO`
  do RF-9 não precisou de coluna própria: é exatamente a nota sem `stop_id`, e quem o povoa é o
  fluxo de vínculo (T012), não esta task. `dispatch` só marca `forced` quando havia pendência de
  verdade — passar `force: true` numa viagem sem nota pendente é ignorado, não gravado como
  forçado; tem teste para isso especificamente, porque um forçado que não precisava é tão
  enganoso quanto um forçado que faltou.

  **Dois bugs reais achados pelo probe contra Postgres, nenhum pelo port falso — os dois em código
  já commitado:**

  1. `trip_documents_company_stop_fk` (T004) tinha `on delete set null`. Numa FK **composta**,
     `SET NULL` zera todas as colunas do par — inclusive `company_id`, que é `not null`. O probe
     travou tentando apagar de verdade uma parada esvaziada. Correção: `on delete restrict`
     (migration `20260824233118`, aditiva) — quem solta a nota da parada zera `stop_id`
     explicitamente antes de apagar a parada, nunca espera o banco fazer isso sozinho.
  2. Minha primeira correção do bug acima ainda estava errada: eu zerava `stop_id` **na mesma**
     `UPDATE` que também lia `stop_id` via `RETURNING` para decidir quais paradas esvaziaram —
     mas `RETURNING` devolve o estado **novo** da linha, sempre `null` depois do próprio `UPDATE`
     zerá-lo. A parada nunca era apagada. Correção: ler `stop_id` num `SELECT` **antes** do
     `UPDATE`, não do `RETURNING` dele.

  Reproduzido do zero após as duas correções: `draft → route_planned` → recusa sem `force` →
  despacha com `force` + motivo → a nota carregada mantém `released_at` nulo, a pendente ganha
  `released_at` e perde `stop_id`, **a parada que esvaziou é apagada** (a que ficou ocupada, não),
  o snapshot congelado lista só a parada e a nota que restaram, e um `UPDATE` direto na tabela de
  snapshot continua recusado pelo trigger da T005.

### T010b — O endereço sobrescrito, com solicitante e histórico (D9)

`delivery_address_overrides` e o use case da ação: exige motivo e solicitante, grava o par
executor/solicitante, reconcilia a parada (T007) e recusa a partir de `dispatched`. A chave de
agrupamento passa a preferir o override.

- **Arquivos:** `drizzle/<ts>_delivery_address_overrides/`, `src/database/trip.schema.ts`,
  `src/trips/application/override-delivery-address.use-case.ts` (novo),
  `src/trips/domain/stop-address-key.ts` (passa a receber o override)
- **Aceite:** `test/trip-stops/address-override.contract.ts` — preferência sobre o XML, exigência de
  motivo e solicitante, `409` em `dispatched`, histórico preservado após desvínculo
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T010c — A lista de retornadas com CT-e ativo (D8)

Consulta que cruza `separation_status = 'returned'` com CT-e autorizado, pelo mesmo caminho de índice
que a 059 vai usar. **Nenhum efeito fiscal automático** — a task inclui o teste negativo que prova
isso.

- **Arquivos:** `src/trips/application/list-returned-with-active-cte.use-case.ts` (novo),
  `src/trips/infrastructure/trip-document.repository.ts`
- **Aceite:** `test/trip-documents/returned-with-active-cte.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 3 — A fronteira

> 🤖 Modelo: `sonnet` (T011 é 🧠 — é permissão)

### T011 ✅ — A permissão `trip.manage` *(entregue pela spec 055, na árvore)*

**Não refazer.** A implementação da 055 já está na árvore de trabalho (não commitada, branch
`staging`) e entregou tudo o que esta task pedia:

- `trip.manage` em `TRANSPORTADA_PERMISSIONS` e nos papéis `operator`, `admin` e `separator`
  (`identity/domain/authorization.policy.ts`)
- papel `separator` novo, com `['invoices.read', 'fleet.read', 'trip.read', 'trip.manage']` — e
  deliberadamente **sem** `trip.report`, que é do campo
- `TRIP_MANAGE_POLICY` migrada de `fleet.manage` para `trip.manage`
  (`trips/presentation/trip.routes.ts:36-40`)
- `camera=(self)` no `Permissions-Policy` (`frontend-transportada/server.ts:28-30`)

**O que resta desta task:** conferir que o contrato negativo existe nos dois sentidos — quem tem só
`fleet.manage` **não** move estado de viagem, e quem tem só `trip.manage` **não** apaga veículo. A
055 tocou `test/authorization.contract.test.ts`; verificar se ele já cobre o segundo sentido antes de
escrever teste novo.

- **Arquivos:** `test/authorization.contract.test.ts` (só se faltar cobertura)
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T012 ✅ — As rotas de estado

As rotas do RF-6, incluindo as três da D8/D9, com `defineRoute`, schemas Zod em
`trip-request.schema.ts`, e `Idempotency-Key` honrado.

> **Reduzida pela 055:** o resolvedor de chave de acesso já existe. A 055 moveu `parseDocumentList`
> para `nfe-documents.schema.ts` e adicionou `accessKey` ao filtro de listagem, então
> `GET /nfe-documents?accessKey=…` já resolve chave → documento. **Não criar** a rota
> `by-access-key/:accessKey` que esta task previa; a de localização na viagem
> (`.../trip-location`) continua necessária, e deve reusar aquele filtro em vez de duplicar a
> consulta.

- **Arquivos:** `src/trips/presentation/trip.routes.ts`, `src/trips/presentation/trip-request.schema.ts`,
  `src/trips/presentation/trip.schema.ts`, `src/nfe-documents/presentation/nfe-documents.routes.ts`,
  três use cases novos (`cancel-trip.use-case.ts`, `list-trip-stops.use-case.ts`,
  `find-trip-location-by-access-key.use-case.ts` — RF-6 pedia as rotas, e três delas não tinham
  use case ainda), o controlador `trip-lifecycle.use-case.ts` (une T006–T010 ao formato
  `execute(input)` que o router espera), `drizzle-trip-stop-lookup.repository.ts` (novo),
  `drizzle-trip-route.repository.ts` (ganhou `CancelTripPort`), `src/main.ts` (composição — as
  rotas só ficam alcançáveis de verdade com isso), e três fixtures de teste atualizadas
  (`trip-http.fixture.ts`, `trip-http-payload.fixture.ts`, `nfe-http.fixture.ts`/`.types.ts`)
- **Aceite:** `test/trips/routes.contract.ts` (novo, 15 testes)
- **Verificação:** `typecheck` ✅, `lint` ✅, `test` (3017 pass, 0 fail) ✅
- **Evidência:**

  **`deliver` não ganhou rota individual.** RF-6 só lista separate/load/return/batch-status/
  plan-route/dispatch/cancel para o escritório — de propósito: `.../documents/:documentId/deliver`
  já existe, é o fluxo antigo da spec 027 (`deliveredAt` incondicional), e colidiria com a ação
  `deliver` do eixo novo. Entregar pelo escritório continua acessível via `batch-status`; a rota
  individual de entrega é da spec 057 (`/me/trips/*`, papel `trip.report`, motorista).

  **`Idempotency-Key` não ganhou ledger.** A convenção do repositório (`apis.md`) é aceitar o
  cabeçalho e persistir contra `idempotency_records` para deduplicar `POST` que cria recurso. As
  rotas de transição não criam recurso — elas mudam estado de um que já existe — e o T006/T008 já
  fazem a mesma chamada duas vezes convergir para o mesmo resultado sem reescrever nada. Construir
  um ledger por cima disso duplicaria a garantia sem acrescentar nenhuma; documentado aqui em vez
  de implementado.

  **Composição em `main.ts` foi necessária, não opcional.** As rotas anteriores (T006–T010)
  pararam em "porta pura + repositório", e é isso que as torna testáveis com port falso. Mas sem
  ligar ao servidor de verdade a feature não está no ar — `tripLifecycle` é o encanamento que une
  os quatro repositórios (`documentRepository`, `batchRepository`, `routeRepository`,
  `stopRepository`) num objeto com `execute(input)` por ação, e `main.ts` os instancia com o mesmo
  `database` que todo o resto do módulo já usa.

  **Duas fixtures compartilhadas precisaram de stub novo** — `trip-http.fixture.ts` (a interface
  `Dependencies` do router cresceu, e o fixture usa o tipo real, não um cast solto) e
  `nfe-http.fixture.ts`/`.types.ts` (a nova rota de localização por chave de acesso entra no mesmo
  módulo `nfe-documents` que os testes de import/distribuição já exercitam). Nenhum teste existente
  mudou de comportamento — só ganhou um dependency a mais para satisfazer o tipo.

  **`test/separator-role.contract.test.ts` precisou de atualização**, não conserto: a lista
  exaustiva de rotas alcançáveis pelo papel `separator` cresceu de propósito — as nove rotas novas
  (oito de `trip.manage`, uma de `fleet.read`/`invoices.read`) são exatamente as que o separador
  deveria alcançar, e o teste documenta isso, não só valida.

### T013 — Vínculo e desvínculo recusam viagem despachada

`POST /trips/:id/documents` e o `DELETE` respondem `409` a partir de `dispatched`. É a metade da D2
que protege o fiscal da 059.

- **Arquivos:** `src/trips/application/link-trip-document.use-case.ts` (e o de desvínculo)
- **Aceite:** `test/trips/dispatched-is-sealed.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T014 — `GET /trips/:id` por parada, sem N+1

A leitura passa a devolver paradas com as notas aninhadas e o progresso por fase. 200 notas em 40
paradas com contagem de queries assertada.

- **Arquivos:** `src/trips/application/get-trip.use-case.ts`,
  `src/trips/infrastructure/trip.repository.ts`
- **Aceite:** `test/trips/detail-query-count.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 4 — A tela

> 🤖 Modelo: `sonnet`

### T015 — A viagem lista por parada

`TripDetail` passa a agrupar por parada, com reordenação por arraste (só antes de `dispatched`),
maço de seleção e barra de progresso por fase. Mutações por `docs/frontend/mutations.md`.

- **Arquivos:** `src/modules/trip/components/TripDetail.component.tsx`,
  `TripStopList.component.tsx` (novo), `trip.locale.json`, `trip.module.css`
- **Aceite:** revisão humana + conferência em 375px, 768px, 1280px
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T015b — O menu de desvio de entrega (D9)

Ação em menu explícito, nunca edição em linha: diálogo com endereço novo, motivo e **quem
solicitou**, mais o histórico visível na nota. O campo de solicitante é texto livre porque essa
pessoa quase nunca é usuária do sistema.

- **Arquivos:** `src/modules/trip/components/DeliveryAddressOverrideDialog.component.tsx` (novo),
  `src/modules/trip/mutations/overrideDeliveryAddress.mutation.ts` (novo), `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T016 — As ações de estado

Botões de separar / carregar / devolver, em lote e por nota, com o diálogo de motivo no retorno e o
diálogo de `force` no despacho — este último **lista as notas pendentes** antes de pedir o motivo.

- **Arquivos:** `src/modules/trip/components/TripStateActions.component.tsx` (novo),
  `src/modules/trip/mutations/*.mutation.ts`, `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

### T017 — O passe de responsividade da tela de viagem

`trip.module.css` hoje tem duas consultas, ambas de grade, e nenhuma pensada para 375px. Alvo de
toque ≥44px na ação mais repetida do produto (marcar nota). `min-width` para adicionar, nunca
`max-`.

> A auditoria da spec 055 aponta sete `max-width` e nove breakpoints diferentes no frontend, e a
> falta de um `docs/frontend/responsiveness.md`. Esta task conserta **a tela de viagem**; o passe
> global é dívida registrada, não escopo daqui.

- **Arquivos:** `src/modules/trip/styles/trip.module.css`, `docs/frontend/responsiveness.md` (novo)
- **Aceite:** revisão humana nos três tamanhos
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

### T018 — E2E do ciclo inteiro

Criar viagem → vincular 3 notas em 2 endereços → planejar → separar → carregar → despachar →
conferir snapshot congelado e vínculo selado. Mais o teste negativo de tenant (viagem de outra
empresa → 404, não 403).

- **Arquivos:** `test/e2e/trip-lifecycle.e2e.ts` (novo)
- **Aceite:** verde em `env.test.e2e`
- **Verificação:** `make test-e2e`

### T019 — Documentação viva

`docs/spec/domain-model.md` (ER + tabela de estados), `CLAUDE.md` da raiz (§14 do
`code-standart.md`), e `evidence.md` desta spec.

- **Arquivos:** `docs/spec/domain-model.md`, `CLAUDE.md`, `specs/056-*/evidence.md`
- **Aceite:** revisão humana
- **Verificação:** `make validate`
