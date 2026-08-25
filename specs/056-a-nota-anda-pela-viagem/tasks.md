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

### T010b ✅ — O endereço sobrescrito, com solicitante e histórico (D9)

`delivery_address_overrides` e o use case da ação: exige motivo e solicitante, grava o par
executor/solicitante, reconcilia a parada (T007) e recusa a partir de `dispatched`. A chave de
agrupamento passa a preferir o override.

- **Arquivos:** `drizzle/<ts>_delivery_address_overrides/`, `src/database/trip.schema.ts`,
  `src/trips/application/override-delivery-address.use-case.ts` (novo),
  `src/trips/domain/stop-address-key.ts` (passa a receber o override)
- **Aceite:** `test/trip-stops/address-override.contract.ts` — preferência sobre o XML, exigência de
  motivo e solicitante, `409` em `dispatched`, histórico preservado após desvínculo
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- Achado ao começar o T015b (o menu de desvio de entrega no frontend): esta task nunca tinha sido
  implementada, apesar de FR6/§Contratos do spec.md já listarem as duas rotas
  (`POST .../delivery-address`, `GET .../delivery-address-history`) desde o início.
- `delivery_address_overrides` (migration `20260825014901_delivery_address_overrides`, com
  `rollback.sql` testado) segue o mesmo padrão append-only de `trip_document_events`/
  `trip_dispatch_snapshots` (trigger `BEFORE UPDATE OR DELETE`, testado ao vivo — inclusive a FK
  `on delete cascade` de `trip_documents` esbarra no trigger e falha alto em vez de cascatear, o
  mesmo comportamento já aceito para `trip_document_events`). Duas identidades distintas por
  desenho, não uma: `requestedBy` (texto livre — quem pediu o desvio, quase nunca é usuário do
  sistema) e `actorUserId` (membership — quem executou, mesmo padrão de `trip_document_events`).
- `overrideDeliveryAddress` (use case) reaproveita `checkTripAcceptsLinkage` (T013) para o gate —
  mesma regra de vincular/desvincular/reordenar, não uma quarta cópia.
- `DrizzleDeliveryAddressOverrideRepository.applyOverride` resolve o "endereço anterior" em duas
  fontes, na ordem certa: o desvio mais recente já registrado para a nota, ou — no primeiro desvio
  — o destinatário original via `nfe_participants`/`nfe_addresses` (a nota vinculada por
  `freightCalculationId` resolve a NF-e um passo adiante, via `freight_calculations.nfe_document_id`).
  A reconciliação de parada reaproveita `reconcileStopOnLink`/`reconcileStopOnUnlink` (T007) através
  de um adapter fino sobre a transação — zero lógica de agrupamento duplicada. Corrigido durante a
  implementação: `reconcileStopOnUnlink` só pode rodar depois de a nota já ter perdido a referência
  à parada antiga (o mesmo aviso que a T010 já tinha documentado), então o `stopId` é zerado antes
  da chamada, não depois.
- Verificado ao vivo contra Postgres local: nota vinculada sem parada → primeiro desvio cria a
  parada nova e grava o endereço original da NF-e como "anterior" → segundo desvio move a nota,
  apaga a parada que esvaziou, e grava o primeiro desvio como "anterior" do segundo → histórico
  lista os dois, mais recente primeiro → desvio recusado (`409 STATE_TRANSITION_NOT_ALLOWED`) numa
  viagem `dispatched`. Banco resetado (`drop database`/`create database`/remigrado) depois — o
  histórico é append-only e não pôde ser limpo por `DELETE`, então o reset total foi o caminho.
- `tsc --noEmit`, `eslint src test --max-warnings=0` limpos; suíte completa (`bun test`):
  3043 pass / 15 skip / 0 fail.

### T010c ✅ — A lista de retornadas com CT-e ativo (D8)

Consulta que cruza `separation_status = 'returned'` com CT-e autorizado, pelo mesmo caminho de índice
que a 059 vai usar. **Nenhum efeito fiscal automático** — a task inclui o teste negativo que prova
isso.

- **Arquivos:** `src/trips/application/list-returned-with-active-cte.use-case.ts` (novo),
  `src/trips/infrastructure/trip-document.repository.ts`
- **Aceite:** `test/trip-documents/returned-with-active-cte.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- `GET /trip-documents/returned-with-active-cte` (fora da árvore `/trips/:id`, de propósito — é
  varredura da empresa inteira) reaproveita o mesmo join de `cteAuthorizedExpression()` (T009b,
  `trip.query.ts`), mas com `cte_fiscal_documents.access_key` selecionado de verdade (a expressão
  original só devolvia booleano via `exists`) — nota vinculada direto ou via cálculo de frete
  resolvem ao mesmo CT-e, mesmo padrão.
- `DrizzleTripDocumentRepository` ganhou o segundo port (`ListReturnedWithActiveCtePort`) ao lado
  do de transição — mesma classe, já era o dono natural da leitura de `trip_documents`.
- **Teste negativo (D8):** em vez de rodar a transição inteira contra um banco e provar que nenhuma
  linha de `cte_*` mudou (caro e indireto), o teste prova a coisa mais forte — o
  `TripDocumentTransitionPort` que `transitionTripDocument` consome **não tem, na sua própria
  forma, nenhum método que toque CT-e**. Se algum dia alguém tentar acrescentar uma chamada fiscal
  ali, o port muda de forma antes do código compilar; o teste lista as duas chamadas que de fato
  acontecem (`findSnapshot`, `applyTransition`) e para aí.
- Verificado ao vivo contra Postgres local: nota devolvida sem CT-e → lista vazia; mesma nota após
  autorizar um CT-e (cadeia completa `cte_batches`→`cte_batch_items`→`cte_issuance_attempts`→
  `cte_fiscal_documents`) → aparece com a chave de acesso certa. Banco resetado
  (`drop database`/`create database`/remigrado) depois — a cadeia de CT-e toca
  `fiscal_sequence_reservations`, também append-only, e não dava para limpar por `DELETE`.
- `tsc --noEmit`, `eslint src test --max-warnings=0` limpos; suíte completa (`bun test`):
  3046 pass / 15 skip / 0 fail.

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

### T012b ✅ — Ligar o reconciliador de parada ao vínculo/desvínculo real

Achado ao começar o T018 (E2E do ciclo inteiro): `reconcileStopOnLink`/`reconcileStopOnUnlink`
(T007) nunca tinham sido ligados ao `linkDocument`/`releaseDocument` reais — a evidência do T007 já
previa isso para o T012, mas T012 não fez essa parte (flagrado como `task_e99ad4c8` durante o T014,
e adiado até esbarrar num bloqueio de verdade). Sem isso, nenhuma nota vinculada por uma viagem real
ganhava `stop_id`, e `plan-route` — que exige `hasRoute = ≥1 parada && nenhuma nota sem parada` —
nunca conseguia sair de `false` para uma viagem que só passou pelo fluxo normal de vínculo. O
cenário do próprio T018 ("vincular 3 notas em 2 endereços → planejar") era, literalmente,
impossível de reproduzir antes deste fix.

- **Arquivos:** `src/trips/infrastructure/drizzle-trip.repository.ts` (`linkDocument`,
  `releaseDocument`), `src/trips/infrastructure/nfe-destination-address.support.ts` (novo),
  `src/trips/infrastructure/drizzle-trip-stop-reconciliation.support.ts` (novo — extrai o adapter
  de `TripStopReconciliationPort` que já existia duplicado dentro do T010b)
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- `linkDocument`: depois do `insert`, resolve o `nfeDocumentId` (direto ou via
  `freightCalculationId` → `freight_calculations.nfe_document_id`), busca o destinatário em
  `nfe_participants`/`nfe_addresses` (role `recipient`), e chama `reconcileStopOnLink` — mesma
  função pura do T007, sem duplicar a lógica de agrupamento. Nota sem destinatário cadastrado ou
  sem CEP normalizável fica `stop_id: null` (`SEM ENDEREÇO`), sem quebrar o vínculo.
- `releaseDocument`: agora lê o `stop_id` antigo **antes** do `UPDATE` que o zera (mesma lição do
  T010 — `RETURNING` reflete o estado novo, não o antigo), e chama `reconcileStopOnUnlink` depois —
  antes deste fix, a nota liberada continuava presa à parada para sempre.
- `nfe-destination-address.support.ts` e `drizzle-trip-stop-reconciliation.support.ts` extraem duas
  peças que o T010b já tinha implementado como código local (resolver o `nfeDocumentId` do
  vínculo, e o adapter da porta de reconciliação) — agora compartilhadas entre os dois caminhos que
  precisam delas, sem duplicação.
- Verificado ao vivo contra Postgres local: três notas vinculadas, duas com o mesmo CEP/número/
  código de município → mesma parada; a terceira, endereço diferente → parada distinta (2 paradas
  no total); liberar a única nota da parada C → `stop_id` volta a `null` e a parada C é apagada.
  `test/integration/trip-repository.integration.ts` (que já vincula/libera notas sem endereço
  cadastrado) continua passando sem alteração — cai graciosamente no balde `SEM ENDEREÇO`. Banco
  resetado depois.
- `tsc --noEmit`, `eslint src --max-warnings=0` limpos; suíte completa (`bun test`):
  3046 pass / 15 skip / 0 fail.

### T013 — Vínculo e desvínculo recusam viagem despachada ✅

`POST /trips/:id/documents` e o `DELETE` respondem `409` a partir de `dispatched`. É a metade da D2
que protege o fiscal da 059.

- **Arquivos:** `src/trips/application/link-trip-document.use-case.ts` (e o de desvínculo)
- **Aceite:** `test/trips/dispatched-is-sealed.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- `checkTripAcceptsLinkage` (novo, `src/trips/domain/trip-state.policy.ts`) unifica a porta de
  não-retorno de vincular/desvincular nota com a de `separate`/`load` (T006): recusa
  `cancelled`, `completed` e todo estado despachado (`dispatched`, `in_transit`, `completed`
  via `isTripDispatched`), devolvendo `null` (liberado) ou um `TripTransitionBlock` — sem
  duplicar a lista de estados terminais em dois lugares.
- `assertTripOpen` (`src/trips/application/trip.use-case.ts`) trocou o antigo `TripClosedError`
  (422, `TRIP_CLOSED`) por `TripStateTransitionNotAllowedError` (409,
  `STATE_TRANSITION_NOT_ALLOWED`) construído a partir do motivo devolvido por
  `checkTripAcceptsLinkage` — unifica o vocabulário de erro com as demais transições de estado
  da spec (T007–T010). `TripClosedError` continua definido em `trip.error.ts`, sem uso de
  produção; só é referenciado como erro injetável num teste de `close`.
- `tripStillOpen` (guarda SQL em `drizzle-trip.repository.ts`, usada por `deliverDocument` e
  `releaseDocument`) passou a excluir também `dispatched`/`in_transit`, não só
  `completed`/`cancelled`.
- `linkDocument` (mesmo arquivo) fechou a janela de corrida entre o `assertTripOpen` do caso de
  uso e o `insert`: agora roda dentro de `this.database.transaction()`, com
  `SELECT status FROM trips ... FOR UPDATE` travando a linha da viagem por toda a transação — um
  despacho concorrente ou espera esse lock (e o vínculo é aceito antes) ou o vínculo espera o
  despacho (e é recusado contra o estado já sealed). Verificado ao vivo contra Postgres local via
  probe descartável: `linkDocument` numa viagem `dispatched` foi recusado com
  `TripStateTransitionNotAllowedError`/`STATE_TRANSITION_NOT_ALLOWED`, e nenhuma linha ficou em
  `trip_documents`; o probe e as linhas de teste foram removidos depois.
- Teste novo `test/trips/dispatched-is-sealed.contract.ts` (registrado em `trips.contract.test.ts`):
  cobre vínculo recusado com `dispatched`, desvínculo recusado com `dispatched`, e desvínculo
  recusado com `completed`/`cancelled` — todos na fronteira HTTP, via
  `linkTripDocumentError`/`releaseTripDocumentError` da fixture.
- `test/trip-application/trip-use-case.contract.ts`: o teste antigo que esperava `TRIP_CLOSED` foi
  reescrito para `STATE_TRANSITION_NOT_ALLOWED`/409, e ganhou um `test.each` cobrindo
  `dispatched`/`in_transit`/`cancelled` para `linkDocument`.
- `test/trip-infrastructure/document-link.contract.ts`: o fake de banco precisou simular
  `database.transaction()` + `select().from().where().for('update').limit()` devolvendo uma
  viagem `draft` antes de acionar o erro do `insert` — o teste testava só a tradução do erro do
  Postgres, e passou a exercer o novo caminho de lock.
- `tsc --noEmit` e `eslint src test --max-warnings=0` limpos; suíte completa
  (`bun test`): 3023 pass / 15 skip / 0 fail.

### T014 ✅ — `GET /trips/:id` por parada, sem N+1

A leitura passa a devolver paradas com as notas aninhadas e o progresso por fase. 200 notas em 40
paradas com contagem de queries assertada.

- **Arquivos:** `src/trips/application/get-trip.use-case.ts`,
  `src/trips/infrastructure/trip.repository.ts`
- **Aceite:** `test/trips/detail-query-count.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- `TripDocument` (`trip.port.ts`) ganhou os campos que `trip_documents` já tinha desde T004 mas que
  a leitura nunca expunha: `separationStatus`, `stopId`, `separatedAt`, `loadedAt`, `returnedAt`,
  `returnReason`. Novo tipo `TripStopDetail` (parada + `documents: TripDocumentDetail[]`);
  `TripDetail` ganhou `stops: readonly TripStopDetail[]` ao lado do `documents` plano existente —
  mantido por compatibilidade, nunca uma cópia divergente (a mesma referência de objeto aparece
  nos dois). Nota sem parada (CEP que não normaliza, ou ainda sem vínculo derivado) não aparece em
  nenhum `TripStopDetail.documents`, mas continua em `TripDetail.documents`.
- `readTripDetail` (`drizzle-trip.repository.ts`) ganhou uma única query extra para `trip_stops`
  (ordenada por `sequence`), e o agrupamento nota→parada acontece em memória com um `Map`
  populado num único loop sobre os documentos já buscados — nenhuma query por parada, nenhuma por
  documento. Continua sendo exatamente 4 `select`s no total (viagem, motoristas, documentos com
  join de status fiscal, paradas), independente de quantas paradas ou notas a viagem tenha.
- Serializadores HTTP (`trip.routes.ts`) espelham a mudança: `serializeTripDetail` ganhou `stops`,
  `serializeTripDocument` ganhou os seis campos novos.
- Prova de "sem N+1" (§15 do `code-standart.md`): novo teste de integração
  `test/integration/trip-detail-query-count.integration.ts`, seguindo o padrão
  `withDisposableDatabase` de `trip-repository.integration.ts` (banco Postgres descartável real,
  não fake port) — semeia uma viagem com 1 parada/1 nota e outra com 40 paradas/200 notas na mesma
  empresa, envolve `database.db` num `Proxy` que conta chamadas a `.select(...)` (cada chamada é
  exatamente uma query), e afirma que as duas viagens disparam **o mesmo número** de `select`s.
  Rodado contra Postgres local (`DATABASE_URL=postgresql://transportada:transportada@localhost:55432/transportada
  bun run test:integration`): passou, e as 40 paradas vieram com 5 notas cada, agrupadas
  corretamente. Registrado no script `test:integration` do `package.json`, ao lado do teste irmão
  de `trip-repository`.
- **Achado, não corrigido aqui:** o reconciliador `reconcileStopOnLink`/`reconcileStopOnUnlink`
  (T007, `reconcile-trip-stops.use-case.ts`) nunca foi ligado ao `linkDocument`/`releaseDocument`
  reais — a evidência do T007 já previa isso para o T012, mas T012 não fez essa parte. Hoje
  `trip_documents.stop_id` nunca é escrito por um vínculo real; o teste deste T014 precisou semear
  `trip_stops`/`stop_id` manualmente para exercitar a leitura. Sinalizado como tarefa separada
  (`task_e99ad4c8`) em vez de expandir o escopo deste T014, que é só a leitura.
- Fixtures/testes ajustados para o novo shape: `test/fixtures/trip-http-payload.fixture.ts`
  (`TRIP_DOCUMENT`/`TRIP_DETAIL`), `test/trip-application/trip-use-case.contract.ts`,
  `test/trip-documents/batch-transition.contract.ts`, `test/trip-documents/transition.contract.ts`.
- `tsc --noEmit` e `eslint src test --max-warnings=0` limpos; suíte completa (`bun test`):
  3023 pass / 15 skip / 0 fail; `test:integration` local: 131 pass / 1 fail (falha pré-existente e
  não relacionada em `server.integration.ts`, confirmada idêntica com `git stash` antes desta
  mudança) / 6 skip.

### T014b ✅ — `PATCH /trips/:id/stops/order`

RF-6 do spec.md lista esta rota desde o início, mas nenhuma task da Fase 3 chegou a implementá-la
— achado ao começar o T015 (o frontend não tem como reordenar parada por arraste sem ela existir).
Mesma porta de não-retorno de vincular/desvincular nota (D2/D3): só funciona antes de `dispatched`.

- **Arquivos:** `src/trips/domain/trip.error.ts` (`TripStopSetMismatchError`),
  `src/trips/application/reorder-trip-stops.use-case.ts` (novo),
  `src/trips/infrastructure/drizzle-trip-route.repository.ts`,
  `src/trips/presentation/trip.routes.ts`, `trip.schema.ts`, `trip-request.schema.ts`,
  `src/trips/application/trip-lifecycle.use-case.ts`, `src/main.ts`
- **Aceite:** `test/trip-stops/reorder.contract.ts` (use case, port falso), rota em
  `test/trips/routes.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

**Evidência:**

- `reorderTripStops` reaproveita `checkTripAcceptsLinkage` (T013) para o gate de elegibilidade —
  a mesma regra "editável até `dispatched`", sem duplicar a lista de estados terminais numa
  terceira função.
- Exige que a lista recebida seja **exatamente** o conjunto de paradas da viagem (nem uma a mais,
  de outra viagem ou inventada; nem uma a menos, nem duplicada) — `TripStopSetMismatchError`
  (422, `TRIP_STOP_SET_MISMATCH`) quando não bate.
- `DrizzleTripRouteRepository.reorderStops`: a unique `(company_id, trip_id, sequence)` não é
  adiável, então trocar 1↔2 direto colidiria com a própria linha ainda não movida. Resolvido com
  duas fases numa transação — primeiro empurra toda `sequence` da viagem para um intervalo alto
  sem uso (`+1_000_000`), depois grava os valores finais 1..N na ordem recebida. Verificado ao
  vivo contra Postgres local com uma viagem de 5 paradas invertida de ponta a ponta: a ordem final
  bate exatamente com a entrada, sem violação de unique.
- `tsc --noEmit`, `eslint src test --max-warnings=0` limpos; suíte completa (`bun test`):
  3033 pass / 15 skip / 0 fail.

## Fase 4 — A tela

> 🤖 Modelo: `sonnet`

### T015 ⏳ — A viagem lista por parada

`TripDetail` passa a agrupar por parada, com reordenação por arraste (só antes de `dispatched`),
maço de seleção e barra de progresso por fase. Mutações por `docs/frontend/mutations.md`.

- **Arquivos:** `src/modules/trip/components/TripDetail.component.tsx`,
  `TripStopList.component.tsx` (novo), `trip.locale.json`, `trip.module.css`
- **Aceite:** revisão humana + conferência em 375px, 768px, 1280px
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

**Evidência (implementação; revisão humana pendente):**

- O frontend inteiro do módulo `trip` ainda falava o contrato pré-ADR-0043 (`status: 'open'|'closed'`,
  documento sem `separationStatus`/`stopId`) — migrado nesta task: `trip.types.ts` (9 estados da
  viagem, `TripDocumentSeparationStatus`, `TripStopDetail`), `trip.constant.ts` (chaves exatas de
  validação, novos códigos de erro), `tripResponse.validation.ts`, `tripClient.service.ts`,
  `useTripWorkspace.hook.ts`.
- Descoberta durante a migração: `PATCH /trips/:id/stops/order` (RF-6) nunca tinha sido
  implementada no backend — resolvida à parte como **T014b** antes de construir o arraste, já que
  T015 não tem como funcionar sem a rota existir.
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` adicionados (escolha confirmada com
  o usuário: acessível por teclado nativamente, evita HTML5 `draggable` — que falha o alvo de toque
  de 375px e não tem suporte a teclado, reprovando `web.md` §10).
- `TripStopList.component.tsx` (novo): um cartão por parada com alça de arraste
  (`useSortable`/`DndContext`), maço de seleção por checkbox (`Checkbox` existente,
  indeterminado quando parte da parada está selecionada), e as ações de entregar/desvincular por
  nota preservadas do fluxo antigo. `useTripStopOrder.hook.ts` mantém a ordem otimista durante o
  arraste e resincroniza com o servidor quando a lista de paradas muda por baixo.
  `useTripDocumentSelection.hook.ts` isola o estado de seleção, reaproveitável pelo T016.
- Nota sem parada (a maioria hoje, dado o achado do T014 — o reconciliador ainda não está ligado ao
  vínculo real, `task_e99ad4c8`) aparece num bloco "Sem parada" reaproveitando o mesmo componente
  de linha — nada desaparece da tela por causa da lacuna do reconciliador.
- `TripProgressBar.component.tsx` (novo) + `tripStopProgress.service.ts`: barra de progresso por
  fase (RF-9), computada em uma função pura testável, sem duplicar a máquina de estados.
- `tripStatus.service.ts` (novo): `isTripEditable`/`isTripDispatched` espelham
  `checkTripAcceptsLinkage` do backend (T013) — vincular, desvincular e reordenar param de
  funcionar a partir de `dispatched`, a mesma regra dos dois lados.
- Ícone `grip` (alça de arraste) adicionado a `icon.tsx`, seguindo o mesmo formato de traçado
  24×24 dos demais.
- Ajuste ao guard de design system (`control-height.contract.ts`, que proíbe medida de controle
  quadrada hardcoded): `.stopSequence` e o marcador da legenda de progresso trocaram
  `width`/`height` literais iguais por `aspect-ratio: 1` sobre um único literal.
- `tsc --noEmit`, `eslint src test --max-warnings=0` e `bun run test` (1909 pass/0 fail) limpos;
  `bun run build` (`vite build`) concluído com sucesso.
- **Não verificado nesta sessão:** a conferência visual humana em 375px/768px/1280px que a task
  exige como aceite — precisaria da stack local completa (Keycloak, API, viagem com paradas
  semeada) para navegar até a tela real. Recomendado antes de considerar o T015 fechado.

### T015b ⏳ — O menu de desvio de entrega (D9)

Ação em menu explícito, nunca edição em linha: diálogo com endereço novo, motivo e **quem
solicitou**, mais o histórico visível na nota. O campo de solicitante é texto livre porque essa
pessoa quase nunca é usuária do sistema.

- **Arquivos:** `src/modules/trip/components/DeliveryAddressOverrideDialog.component.tsx` (novo),
  `src/modules/trip/mutations/overrideDeliveryAddress.mutation.ts` (novo), `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

**Evidência (implementação; revisão humana pendente):**

- Dependia do T010b (backend), que não existia — implementado nesta sessão antes deste T015b.
- **Desvio do arquivo sugerido:** nenhum outro caminho do frontend usa uma pasta `mutations/` — toda
  mutação de viagem vive em `useTripWorkspace.hook.ts`, ao lado de `closeMutation`,
  `reorderStopsMutation` etc. Segui o padrão real do módulo em vez do nome de arquivo listado
  (que não corresponde a nenhuma convenção existente), para não introduzir uma estrutura só para
  esta mutação.
- Tipos/validação/cliente migrados: `trip.types.ts` (`DeliveryAddressOverride`,
  `StopAddressComponents`), `trip.constant.ts`, `tripResponse.validation.ts`,
  `tripClient.service.ts` (`overrideDeliveryAddress`, `listDeliveryAddressHistory`).
- `DeliveryAddressOverrideDialog.component.tsx` (novo): mesmo padrão de diálogo de
  `TripMdfePendingDialog` (`createPortal` + `useModalDialog`) — formulário com CEP/número/código do
  município/rótulo do endereço novo, campo de solicitante (com dica de que quase nunca é usuário do
  sistema) e motivo, mais o histórico de desvios já registrados, carregado ao abrir.
  `useDeliveryAddressOverrideDialog.hook.ts` isola o estado do formulário e a chamada da mutação,
  seguindo `useTripDocumentLinkForm.hook.ts`; `refreshHistory`/`reset` usam `useCallback` para o
  `useEffect` de carregar o histórico na abertura satisfazer `exhaustive-deps` de verdade, sem
  `eslint-disable` (proibido por `react.md`).
- Botão "Desviar entrega" acrescentado à linha de cada nota em `TripStopList.component.tsx`
  (`TripStopDocumentActions.onOverrideAddress`), ao lado de entregar/desvincular — só quando a
  viagem está editável (`isTripEditable`, mesmo gate do T015).
- `tsc --noEmit`, `eslint src test --max-warnings=0` limpos; suíte completa (`bun run test`):
  1910 pass / 0 fail; `bun run build` (`vite build`) concluído com sucesso.
- **Não verificado nesta sessão:** a conferência visual humana, mesma pendência já registrada no
  T015 — precisa da stack local completa (Keycloak, API, viagem com nota real) para abrir o diálogo
  de verdade.

### T016 ⏳ — As ações de estado

Botões de separar / carregar / devolver, em lote e por nota, com o diálogo de motivo no retorno e o
diálogo de `force` no despacho — este último **lista as notas pendentes** antes de pedir o motivo.

- **Arquivos:** `src/modules/trip/components/TripStateActions.component.tsx` (novo),
  `src/modules/trip/mutations/*.mutation.ts`, `trip.locale.json`
- **Aceite:** revisão humana
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

**Evidência (implementação; revisão humana pendente):**

- O frontend nunca tinha cliente/tipos para separate/load/return/batch-status/dispatch/cancel/
  plan-route (T012 backend) — todos ficaram sem consumidor até agora. Adicionados a
  `trip.types.ts`, `trip.constant.ts`, `tripResponse.validation.ts`, `tripClient.service.ts`,
  `useTripWorkspace.hook.ts` (seis mutações novas: `transitionDocumentMutation`,
  `batchStatusMutation`, `dispatchMutation`, `cancelMutation`, `planRouteMutation`, além das já
  existentes).
- **Lista de pendentes antes do motivo, sem round-trip:** em vez de despachar e reagir ao `409
  TRIP_HAS_UNLOADED_DOCUMENTS` (que exigiria decodificar `error.details`), `TripStateActions`
  calcula as notas ainda não carregadas direto de `trip.documents` (mesmo filtro
  `pending`/`separated` que o backend usa) — se não há nenhuma, despacha direto; se há, abre
  `TripReasonDialog` já com a lista, e só then pede o motivo.
- `TripReasonDialog.component.tsx` (novo): diálogo genérico de motivo, reaproveitado para devolver
  uma nota, devolver o maço selecionado, e despachar com força — mesmo padrão de
  `DeliveryAddressOverrideDialog`/`TripMdfePendingDialog`.
- Botões por nota (separar/carregar/devolver) entram em `TripStopList.component.tsx`, condicionados
  ao `separationStatus` atual (só mostra "separar" se `pending`, só "carregar" se `separated`,
  etc.) — o backend já valida a transição; o frontend só evita oferecer um botão que sempre
  falharia.
- Ações em lote reaproveitam `useTripDocumentSelection` (T015): os três botões de lote operam sobre
  `selection.selectedIds`, e a seleção limpa sozinha ao concluir.
- **Desvio do arquivo sugerido:** mesma decisão do T015b — sem pasta `mutations/` no módulo; as seis
  mutações entram em `useTripWorkspace.hook.ts`, ao lado das demais.
- `tsc --noEmit`, `eslint src test --max-warnings=0` limpos; suíte completa (`bun run test`):
  1911 pass / 0 fail; `bun run build` (`vite build`) concluído com sucesso.
- **Não verificado nesta sessão:** a conferência visual humana, mesma pendência do T015/T015b.

### T017 ⏳ — O passe de responsividade da tela de viagem

`trip.module.css` hoje tem duas consultas, ambas de grade, e nenhuma pensada para 375px. Alvo de
toque ≥44px na ação mais repetida do produto (marcar nota). `min-width` para adicionar, nunca
`max-`.

> A auditoria da spec 055 aponta sete `max-width` e nove breakpoints diferentes no frontend, e a
> falta de um `docs/frontend/responsiveness.md`. Esta task conserta **a tela de viagem**; o passe
> global é dívida registrada, não escopo daqui.

- **Arquivos:** `src/modules/trip/styles/trip.module.css`, `docs/frontend/responsiveness.md` (novo)
- **Aceite:** revisão humana nos três tamanhos
- **Verificação:** `bun run --cwd apps/frontend-transportada build`

**Evidência (auditoria; revisão humana pendente):**

- A dívida global que a nota acima descreve **já foi paga** entre a spec 055 e agora: existe
  `docs/frontend/responsive.md` (não `responsiveness.md` — o nome mudou depois que esta task foi
  escrita), com um contrato global (`test/design-system/responsive.contract.ts`) que varre **toda**
  folha de estilo do frontend — `trip.module.css` incluído — recusando `max-width`,
  `width <= `/`width >= ` fora da grafia canônica, e qualquer ponto de quebra fora dos quatro
  (`40rem`/`64rem`/`80rem`, base sem consulta). Criar um segundo documento com um nome quase igual
  teria fragmentado a mesma regra em dois lugares — não fiz isso.
- Reaudita `trip.module.css` linha a linha nesta task: nenhum `max-width`, nenhum breakpoint fora
  dos quatro nomeados, nenhuma largura fixa em `px` além de bordas de 1px, `.intro`'s `max-width:
  46rem` é limite de legibilidade de parágrafo (não layout) — o contrato global já cobre isso e
  passou durante todo o T015/T016 (CSS novo desta sessão nasceu compatível, não corrigido depois).
- Alvo de toque de 44px na ação mais repetida (marcar nota, via `Checkbox`): já garantido pelo
  design system (`checkbox.module.css`, `@media (pointer: coarse)` → `--space-10 + --space-1` =
  2.75rem), documentado em `docs/frontend/checkboxes.md`. A alça de arraste nova do T015
  (`.stopDragHandle`) usa `--control-height-compact`, que `.tripShell` já eleva a `--touch-target`
  (2.75rem) abaixo de `40rem` — mesmo padrão dos demais botões `size="sm"` da tela.
- Todo container novo (`.stopCard`, `.stopCardHead`, `.rowActions`, `.selectionBar`,
  `.progressLegend`) usa `flex-wrap: wrap` e nenhuma largura fixa — quebra naturalmente em 375px
  sem precisar de consulta dedicada, e `.tableScroll { overflow-x: auto }` já isola a única tabela
  restante (histórico de desvio de endereço não usa tabela).
- `bun run test` (1911 pass, incluindo o contrato de responsividade) e `bun run build` limpos.
- **Não verificado nesta sessão:** a conferência visual humana nos três tamanhos, mesma pendência
  do T015/T015b/T016 — a auditoria estática não substitui olhar a tela renderizada.

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
