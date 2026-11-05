# Evidência — 294

## T0.1 — ADR 0113 (2026-11-05)

- `git fetch && git ls-tree origin/staging docs/adr/` → maior número em `origin/staging` é 0112 (0109 não existe);
  **0113 livre**.
- Tabela de eventos confirmada em `apps/api-transportada/src/database/trip.schema.ts`: **`trip_stop_events`**
  (`tripStopEvents`, `kind ∈ {arrived, delivered, returned, occurrence, departed, departure_cancelled}`). Saída
  (`report-stop-departure.use-case.ts:123`), chegada (`report-stop-arrival.use-case.ts:119`) e baixa
  (`document-outcome-steps.service.ts:127`) gravam por `recordEvent` →
  `drizzle-driver-field-report.repository.ts:800` (`insert(tripStopEvents)`). A saída também marca
  `trip_stops.en_route_since` (`markStopEnRoute`). A baixa de campo não escreve em `trip_document_events`.
  `plan.md` atualizado.
- `grep -rn "trip_stop_location_suggestions\|address_correction_suggestions" src drizzle` → nada: a tabela da
  ADR-0080/195 nunca foi criada.
- `docs/adr/` não tem índice (`README`); a convenção é marcar a ADR antiga no cabeçalho. ADR-0080 ganhou
  "Substituída em parte por: ADR-0113".
- `npx prettier@3 --check` nos arquivos alterados → todos formatados.
- `grep -n "0113" docs/adr -r` → `0113-…md:1` e `0080-…md:6`.

## Desvio do plano — contratos vermelhos (T0.2, T0.3, T0.4)

Contrato vermelho registrado no `package.json` quebraria o gate por task. Cada task de contrato escreve o contrato
primeiro, roda vermelho (módulo ausente), e escreve na mesma task a política **pura** que o deixa verde, sem ligar
em use case (isso fica em T2.3/T3.1). T0.4 (contratos do bot) foi movida para o começo de T4.3.

## T0.2 — contrato e política da ordem da parada

- Contrato `apps/api-transportada/test/trips/stop-event-sequence.contract.ts`, importado por
  `test/trips.contract.test.ts` (já listado no `package.json`).
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/stop-event-sequence.policy.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/stop-event-sequence.policy.ts` (reusa `TripFieldChannel`).
- Verde: mesmo comando → 147 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13139 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T0.3 — contrato e política da correção do endereço pela chegada

- Contrato `apps/api-transportada/test/trips/address-arrival-correction.contract.ts`, importado por
  `test/trips.contract.test.ts`.
- Vermelho: `bun --env-file=../../.env.test test ./test/trips.contract.test.ts` → `Cannot find module
'../../src/trips/domain/address-arrival-correction.constant.js'` (0 pass, 1 fail, 1 error).
- Política `src/trips/domain/address-arrival-correction.policy.ts` + `.constant.ts` (2000 / 15000 / 300 m);
  distância por `distanceInMetres` de `src/addresses/domain/coordinate-distance.ts` (haversine existente).
- Fronteira: a grade de 7 casas decimais não cai em exatamente N m, então o contrato acha o último ponto com
  distância <= limite (apply/ignore) e o seguinte, > limite (suggest).
- Verde: mesmo comando → 166 pass, 0 fail.
- Gates em `apps/api-transportada`: `bun run typecheck` limpo; `bun run lint` limpo; `bun run test` → 13158 pass,
  35 skip, 0 fail; prettier nos arquivos alterados.

## T1.1 — painel tolerante a `recordedTogether` e à origem da correção do endereço

- Contrato `apps/frontend-transportada/test/trip/timeline-recorded-together-tolerance.contract.ts`, importado por
  `test/trip.contract.test.ts` (já na lista do `package.json`): campo ausente, `true`, `false`, não booleano
  (recusa), origem `driver`, origem desconhecida (rótulo neutro), kind desconhecido (descartado).
- Vermelho: antes da implementação o chip `together` e a origem livre não existiam (falha de tipo/asserção).
- `recordedTogether?: boolean` opcional no item (`TRIP_TIMELINE_ITEM_OPTIONAL_KEYS`); chip "Marcada junto" com
  dica; `addressChange.origin` passou a texto livre na leitura, origem fora do vocabulário cai em
  `origin.unknown`; `origin.driver` = "Endereço corrigido pela chegada do motorista".
- Ajuste: `timeline.contract.ts` deixou de exigir recusa de origem `invented` (decisão da 294: tolerar).
- Gates em `apps/frontend-transportada`: `bun run typecheck` limpo; `bun run lint` 0 errors (16 warnings
  antigos); `bun run test` → 8632 pass, 0 fail + 1438 pass, 0 fail; `bun run build` ok; prettier nos alterados.

## T2.1 — migration A aditiva (`recorded_together`, `address_correction_suggestions`, fonte `driver`)

- Migration `20261105023931_stop_event_recorded_together_and_address_suggestions` (com `rollback.sql`): coluna
  `trip_stop_events.recorded_together boolean not null default false`; tabela `address_correction_suggestions`
  (`company_id`, FK de membership, índice `(company_id, status, created_at)`, único parcial
  `(company_id, trip_stop_event_id)`); `'driver'` entra em `GEOCODING_SOURCES` e os quatro CHECKs de fonte
  (`geocoded_addresses`, `geocoded_address_corrections` previous/new, `client_delivery_addresses`) são alargados
  aditivamente. `origin = 'driver'` já existia em `CORRECTION_ORIGINS`.
- `db:generate` seguinte: `no_changes`. Sem rebase: `origin/staging` já era ancestral da branch.
- Ajustes de contrato: lista de migrations (`static-migration.contract.ts`), política do staging-refresh
  (`deploy/staging-refresh/prune-source.sql`: `keep`), e o teste "origem não é fonte" admite a sobreposição `driver`.
- Gates: `make migration-test` → 231 pass, 0 fail (migration + rollback); `bun run typecheck` e `bun run lint` limpos;
  prettier ok; contrato da API → só falham os 9 testes de `toll booth catalog repository`, que falham igual sem a
  mudança (preexistente, `disposable-database` "drop" no ambiente local).

## T4.1 — cliente nas listas de escolha do bot (RF17)

- `describeStopReference` (grupo e individual) e `GROUP_DELIVERY_TEXT.askDocument` passam a citar a nota e o
  cliente ("NF 17234 · Padaria Sol", "e mais N" para as outras notas da parada); sem nome, só a nota como antes.
  O candidato de parada e o documento do grupo carregam `recipientName` (vem de `recipientDisplayName` da viagem).
  Saíram das docstrings as sentenças "nada de nome de cliente"; a regra de não logar PII segue intacta.
- Contratos: `driver-events.contract.ts` (política), `group-stop-flow.contract.ts` (lista do saí/cheguei),
  `group-delivery-flow.contract.ts` (lista do entreguei).
- Gates: typecheck e lint limpos; contrato da API → 13168 pass, 26 skip, 0 fail; prettier ok.

## T4.5 (grupo) — quem mandou decide a regra; atendente baixa pelo escritório (RF18–RF20)

- `createWhatsAppSenderRoleResolver` (tripulação × atendente × desconhecido): tripulação = telefone de motorista/ajudante
  da frota (`isCrewPhone`, extraído do adaptador da ocorrência); atendente = `resolveWhatsAppActor` (spec 144) com a
  permissão `trip.report-on-behalf`, a mesma da rota `field-delivery` (nenhuma permissão nova). Tripulação vence quando o
  número é das duas coisas. Desconhecido: "Só a tripulação ou um atendente cadastrado registra a entrega." e nada é gravado.
- RF20: a entrega em preparo do grupo deixou de gravar sempre no motorista dono do grupo: o ator vem do remetente.
  Atendente = `{ actorUserId: usuário, driverId: motorista da viagem, attendant: true }`; a foto/localização dele também é
  admitida (`isGroupDriver` aceita atendente) e a baixa/anexo vão pelas MESMAS funções do escritório
  (`reportDocumentDelivery` com alvo `trip` resolvido, `reportFieldProof`), autoria `office`, auditoria
  `trip_field_office.document_*` com origem `whatsapp`. Janela de horário informado: a da própria função (hora = agora).
- RF19: comprovantes opcionais para o atendente: `required` vira `optional` em foto, mercadoria, quem recebeu e nome;
  assinatura é ignorada (não existe no escritório). Sem canhoto, a baixa segue "conclui sem canhoto e cobra depois" (223).
  Anexo recusado pela configuração do escritório cai no aviso "não consegui anexar" já existente.
- Contratos: `test/whatsapp/group-sender-role.contract.ts` (papéis, permissão, fluxo do grupo por remetente, função do
  escritório), `delivery-preparation.contract.ts` (tripulação não pula obrigatório; atendente pula tudo e a baixa leva
  `attendant: true`).
- Pendente: conversa individual (menu do operador, spec 144 — grafo publicado) para "dar baixa" do atendente.

## T4.6 (grupo) — várias notas e encerrar a rota pelo atendente (RF21)

- "entreguei 17234 17235": só o atendente (até 8 notas); baixa pelo escritório sem prova, resumo por situação (registrada,
  canhoto pendente, já baixada, não encontrada, falhou). Tripulação segue "uma nota por vez".
- "encerrar a rota/viagem": só o atendente; confirmação "1 - Sim / 2 - Não" com quantas notas seguem abertas; chama
  `trips.close` (a função de `POST /trips/:id/close`) pela ponte `whatsappTripCloseBridge`, com o contexto do atendente,
  motivo fixo e auditoria `whatsapp`. Quem confirma também precisa ser atendente. Mais de uma viagem ativa: manda ao painel.
- Contrato: `test/whatsapp/group-attendant-close.contract.ts`.
- Pendente: conversa individual (viagem pelo número da nota ou pela lista de viagens na rua).
- Gates: typecheck e lint limpos; contrato da API sem falhas; prettier ok. Integração não rodada (outro worktree usava o
  Postgres de teste).
