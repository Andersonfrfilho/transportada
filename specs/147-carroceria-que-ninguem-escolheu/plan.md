# Plano técnico

## Contexto e premissas

- A ocupação é calculada em `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts`.
  - O veículo é lido por `trips.vehicle_id` com filtro de tenant (`:82-96`).
  - A referência é buscada por `(vehicle.vehicleType, vehicle.bodyType)` (`:119-124`).
  - A capacidade sai de `resolveVehicleCapacity` (`:127-139`).
  - A escala do baú sai de `toBedDimensions` (`:255-263`), da ficha ou da referência.
- Chamadores: `drizzle-trip.repository.ts:729-733` (detalhe) e `trip-cargo-preview.query.ts:33`
  (prévia).
- `resolveVolumeReferenceKey` (`fleet/domain/vehicle-capacity.policy.ts:113-119`) não tem chamador
  de produção. Só `test/fleet-domain/vehicle-capacity.contract.ts:109-138` a usa.
- `body_type`:
  - domínio `MDFE_BODY_TYPES = ['00'..'05']` (`fleet.schema.ts:62-64`);
  - default `'00'` na coluna;
  - o CHECK só confere a lista;
  - Zod `z.enum(MDFE_BODY_TYPES)` em `fleet/presentation/fleet-request.schema.ts:132`;
  - candidatura do agregado com `?? '00'` em `aggregate-application-driver-mapping.policy.ts:295`.
- Frontend:
  - `fleetForm.service.ts:56` e `vehicleBrandDefaults.service.ts:38` nascem com `'00'`;
  - o select incondicional está em `VehicleOperationFields.component.tsx:59-66`;
  - o painel está em `TripCargoPanel.component.tsx:261-272`.
- Não há vínculo entre veículos em lugar nenhum: `trips`, `mdfe_manifests` e
  `route_suggestion_vehicles` têm um `vehicle_id` só.
- Spec 145 (branch `work/cargo-missing-box`, T9b pendente): D15 não enfileira sem `capacityM3`, e o
  hash de D6 inclui `capacityM3` e `bed`.

## Arquitetura e arquivos afetados

**API: frota (D1)**

- `fleet/presentation/fleet-request.schema.ts`: `superRefine` com `bodyType !== '00'` quando o tipo
  carrega ou o role é carreta. O conjunto fica numa constante:
  - `BODY_TYPE_REQUIRED_VEHICLE_TYPES` em `api-transportada/src/shared/vehicle-type.constant.ts`,
    ao lado de `resolveMdfeWheelType`.
- `shared/errors/codes.ts`: `FLEET_VEHICLE_BODY_TYPE_REQUIRED`.
- `fleet/domain/aggregate-application-driver-mapping.policy.ts:295`: o `?? '00'` só vale para
  `tractor_unit`. Nos outros casos, a candidatura cria o veículo e **não** recusa, porque o
  candidato já foi embora. A linha fica `00` e cai em `bodyTypeMissing` na revisão.
  - Confirmar com o usuário junto de Q2.

**API: viagem (D2, D3, D4)**

- `trip-occupancy.support.ts`:
  - lê o veículo **e** a carreta (quando houver) num `select` com `leftJoin` em
    `fleet_vehicles as trailer`;
  - monta a chave por `resolveVolumeReferenceKey`;
  - resolve a capacidade pela ficha de quem carrega (a carreta, se houver);
  - publica `capacityUnknownReason`.
- `trips/domain/`: `capacity-unknown-reason.policy.ts`, função pura
  `resolveCapacityUnknownReason({carrier, traction, trailer, reference})` que devolve
  `'bodyTypeMissing' | 'trailerMissing' | 'referenceMissing' | null`.
- (Q3 = a) `database/trip.schema.ts`: `trailerVehicleId`.
  - Escrita por rota própria `PUT /trips/:id/trailer` com `{trailerVehicleId: uuid | null}`, sob
    `trip.manage`.
  - Nova regra de domínio `checkTripAcceptsTrailer`: `tractor_unit` + carreta ativa + estado anterior
    a `dispatched`.
  - O `trip_dispatch_snapshots` do despacho congela a placa da carreta junto.
- A mudança de veículo da viagem (onde existir) limpa `trailer_vehicle_id` na mesma transação.

**Frontend**

- `fleet/shared/fleetForm.service.ts`: `bodyType` inicial depende de role e tipo.
  - A validação `*.validation.ts` bloqueia antes do 400.
  - `vehicleBrandDefaults.service.ts` deixa de carregar `bodyType`.
- `fleet/components/VehicleOperationFields.component.tsx`: `00` só é oferecido para `tractor_unit`.
- `trip/components/TripCargoPanel.component.tsx`: um texto por motivo, com link para a ficha do
  veículo certo. As chaves ficam em `trip.locale.json`, com acento.
- (Q3 = a) Seletor de carreta no detalhe da viagem (`useTripWorkspace.hook.ts`, onde moram todas as
  mutações de viagem) e no diálogo "Nova viagem" quando o veículo é cavalo.
  - Fonte: `fleet.read`, filtrando `role = trailer`, `status = active`.

**Documentação**

- `docs/ai-context/api-transportada.md` §075/088/093 e `CLAUDE.md` (frontend e api), mais os
  comentários `trip-occupancy.support.ts:59-63` e `cargo-layout.policy.ts:332`. Todos alinhados à
  resposta de Q5.

## Contratos/API/eventos

- `POST/PUT /fleet/vehicles`: novo `400 FLEET_VEHICLE_BODY_TYPE_REQUIRED`.
- `GET /trips/:id` e a prévia de carga: `cargo.capacityUnknownReason: 'bodyTypeMissing' |
'trailerMissing' | 'referenceMissing' | null`. Com Q3 = a, também `trailer: {id, plate,
bodyType} | null`.
  - O guard do frontend (`hasOnlyKeys` + `hasEveryKey`) precisa aprender os campos **no mesmo
    deploy**, com a API subindo primeiro. É a mesma armadilha de `VEHICLE_DETAIL_KEYS`.
- (Q3 = a) `PUT /trips/:id/trailer` → `200 {trip}`. Respostas de erro:
  - `404` para carreta de outra empresa ou inexistente;
  - `409 STATE_TRANSITION_NOT_ALLOWED` depois do despacho;
  - `400 TRIP_TRAILER_REQUIRES_TRACTOR` para veículo que não é cavalo;
  - `400 TRIP_TRAILER_NOT_A_TRAILER` para veículo apontado que não é carreta.
- Separador: ganha a rota por `trip.manage`. `test/separator-role.contract.test.ts` lista as rotas
  por extenso, e **a rota nova entra lá por decisão escrita**.

## Dados, migration e rollback

- Q3 = a: migration `YYYYMMDDHHMMSS_trip_trailer_vehicle`.
  - `alter table trips add column trailer_vehicle_id uuid null`.
  - FK composta `(company_id, trailer_vehicle_id) references fleet_vehicles(company_id, id)`.
    Confirmar que existe `unique (company_id, id)` em `fleet_vehicles`; se não houver, acrescentar.
  - `rollback.sql` com `drop column`. É aditiva, então o rollback só perde vínculos novos.
- Q4: migration de dados só se houver linha nova com fonte. Aditiva (`insert … on conflict do
nothing`), com rollback por `delete` das chaves inseridas.
- **Nenhum `UPDATE` em `fleet_vehicles.body_type`** (critério 7).
- Cópias do schema no worker: `worker-transportada/src/database/routing.schema.ts:152-169` copia
  `trips` e `fleet_vehicles` **parcialmente**, só com as colunas que o solver lê. As colunas novas
  **não** entram lá: o worker não lê carreta. O cron não copia nenhuma das duas.

## Segurança e tenant

- `companyId` sempre do contexto. A carreta é buscada com `company_id` no `where` **e** protegida
  pela FK composta.
- Carreta de outra empresa responde igual a carreta inexistente (`404`).
- `test/trip-schema/tenant-safety.contract.ts` ganha a consulta nova da ocupação e a escrita da
  carreta.
- Nenhum dado pessoal novo: placa não é PII do motorista.

## Idempotência e concorrência

- `PUT /trips/:id/trailer` é idempotente: repetir o mesmo valor converge em `unchanged`, como as
  transições da viagem.
- Escrita sob o mesmo controle de versão da viagem, se houver. Senão, `update … where status not in
(dispatched…)`, para a checagem de estado e a escrita não correrem uma contra a outra.
- **Dependência da 145:** o hash de planta (145 D6) inclui `capacityM3` e `bed`, que passam a
  depender da carreta. Trocar a carreta precisa invalidar a planta, pelo gatilho lazy da 145 D7.
  - Se a 147 entrar antes da T9b da 145, anotar na 145 que o gatilho D7 cobre `trailer_vehicle_id`.
  - Se entrar depois, esta spec acrescenta o gatilho.

## Observabilidade

Log `info` `trip_occupancy_capacity_unknown`, com `tripId`, `reason` e `vehicleType`, em nível
`debug` para não virar ruído por leitura de tela. Sem placa no log.

## Estratégia de testes

- **Contrato de domínio:**
  - `resolveCapacityUnknownReason` (tabela de casos);
  - `checkTripAcceptsTrailer` (tabela estado × tipo);
  - `BODY_TYPE_REQUIRED_VEHICLE_TYPES` (ordem e conteúdo).
- **Contrato por texto de fonte:** `trip-occupancy.support.ts` não compara
  `vehicleVolumeReferences.vehicleType` com campo do veículo fora de `resolveVolumeReferenceKey`.
- **Contrato de rota:** 400 do `bodyType`, e os quatro erros da carreta.
- **Integração contra Postgres:**
  - viagem de cavalo + carreta `02` sem ficha → `reference`;
  - truck `00` → `bodyTypeMissing`.
- **Frontend:**
  - `fleetForm.service` (valor inicial por tipo);
  - validação;
  - painel com um texto por motivo (contrato por serviço puro, porque a app não tem DOM nos testes).
- ⚠️ Toda suíte nova entra na lista **explícita** do `package.json` da app.
- `make migration-test` para a migration.

## Riscos

- **Não há dado real.** Os 8 veículos locais parecem de teste e a frota local não tem carreta. Sem
  T0 (produção), a spec pode resolver um problema que o cliente não tem, e a P3 pode ficar sem uso
  até alguém cadastrar carreta.
- **Tensão com o fiscal:** a carreta passa a existir na viagem e não no MDF-e (`veicReboque` fora do
  escopo). Registrar em `docs/SECURITY.md`? Não é segurança. Vai para `specs/PERGUNTAS-ABERTAS.md`.
- **Guard de chaves no frontend:** campo novo na resposta com o frontend antigo faz o detalhe da
  viagem ser recusado. A API sobe primeiro.
- **Planta à escala do catálogo:** com a Q5 decidida pelo `c02325b6`, destravar a referência passa
  a desenhar planta nos veículos que antes não tinham nenhuma. É o que a 088 D2 temia, e a
  proteção que resta é a marca `bedFromReference`, que não pode sumir.

## Adendo T0b (2026-09-12), que prevalece sobre o texto acima quando divergir

- **Q3 = frota e viagem.** Tudo que está marcado "(Q3 = a)" vale, e ganha mais isto:
  - `fleet_vehicles.default_trailer_vehicle_id`: uuid anulável, FK composta
    `(company_id, default_trailer_vehicle_id)` → `fleet_vehicles(company_id, id)`. Um CHECK
    permite o campo só em `vehicle_type = 'tractor_unit'`. Que o apontado seja carreta é checado
    no Zod, porque um CHECK não enxerga outra linha.
  - Os dois campos novos (`trips.trailer_vehicle_id` e este) vão numa migration só, aditiva.
  - Criar a viagem de um cavalo copia a carreta padrão para `trips.trailer_vehicle_id`, na mesma
    transação.
- **Despacho** (`checkTripTransition` para `dispatch`, em `trips/domain/trip-state.policy.ts`):
  cavalo sem carreta dá `409 TRIP_TRAILER_REQUIRED`. O diálogo de despacho do frontend mostra o
  motivo antes de pedir.
- **Uma carreta por vez:** ao gravar `trailer_vehicle_id`, verificar se ela está em outra viagem
  com `status not in ('completed','cancelled')` e, se estiver, `409 TRIP_TRAILER_IN_USE`.
  - A corrida entre duas escritas é fechada por um índice único parcial
    `trips (company_id, trailer_vehicle_id) where trailer_vehicle_id is not null and status not in
('completed','cancelled')`.
  - O índice é criado vazio. Não há linha antiga, porque a coluna nasce agora.
- **Pendências:**
  - API: módulo `pending-items`, com `GET /pending-items` (`presentation/pending-items.routes.ts`)
    e o use case `list-pending-items`.
  - Cada tipo de pendência é uma porta (`PendingItemSourcePort`) com a permissão que exige. Hoje há
    uma só, `fleet-body-type`, que consulta `fleet_vehicles` com `vehicle_type <> 'tractor_unit'`
    e `body_type = '00'`, filtrando por `company_id`.
  - Paginação por cursor (padrão do repositório) e `limit` com teto de 100.
  - Frontend: módulo `pending-items`, página `/pendencias` registrada na navegação manual de
    `main.tsx`, com esqueleto de carregamento, uma linha por pendência e link para a ficha.
    Os textos ficam em `pending-items.locale.json`.
- **Catálogo (D5):** a T-cat (🧠 `opus`) produz uma tabela proposta com fonte por linha. A migration
  `vehicle_reference_open_bulk_container` só é escrita **depois que o usuário aprovar** a tabela, e
  a aprovação fica registrada em `evidence.md`.
- **Câmera:** fora da 147, vira spec própria.
- **Produção (T0):** 6 veículos `02` com referência, nenhum `00`, nenhuma carreta, zero viagens em
  60 dias. Não há dado de produção para migrar nem a proteger no índice novo.

## Validação da T8 pelo architect (opus, 2026-09-13): aprovada com ajustes

Estes ajustes são obrigatórios na T8 a T12:

1. **A FK composta usa `fleet_vehicles_company_id_id_unique`** (`fleet.schema.ts:239`), que já
   existe. O padrão é o de `trip.schema.ts:145-151`: `onDelete('restrict')` e `onUpdate('cascade')`.
   **Nunca `SET NULL`**: numa FK composta ele anularia também o `company_id`, que é NOT NULL.
2. **Gerar a migration por `bun run db:generate --name trip_trailer_vehicle`**, porque o `db:check`
   confere o `snapshot.json`. Os nomes dos constraints são explícitos. O índice parcial segue
   `mdfe.schema.ts:222-226`.
3. **O filtro de viagem aberta** é `status not in ('completed','cancelled')`. São nove estados
   (inclui `on_delivery_route`), e os terminais não regridem (`trip-state.policy.ts:353`).
4. **CHECKs a mais:**
   - `fleet_vehicles_default_trailer_tractor_only`: `default_trailer_vehicle_id is null or
vehicle_type = 'tractor_unit'`;
   - `fleet_vehicles_default_trailer_not_self`: a carreta padrão não pode ser o próprio veículo;
   - `trips_trailer_not_vehicle`: a carreta da viagem não pode ser o veículo da viagem.
5. **`rollback.sql`** usa `if exists` em tudo, porque o teste roda os rollbacks em cadeia. Uma
   asserção de constraints cobre a FK que cruza empresa e o índice.
6. **O PUT de veículo regrava a ficha inteira** (`drizzle-fleet-vehicle.repository.ts:131`):
   - `default_trailer_vehicle_id` entra em `toVehicleColumns`;
   - o Zod recusa a carreta padrão fora do cavalo, em vez de deixar o CHECK estourar como 500;
   - o Zod também recusa trocar para `traction` o `role` de uma carreta que está como padrão de
     algum cavalo ou numa viagem aberta.
7. **A carreta padrão já pode estar ocupada quando a viagem é criada.** Nesse caso a viagem nasce
   **sem carreta**, porque a padrão é só sugestão (D3), e o despacho barra depois com
   `TRIP_TRAILER_REQUIRED`.
8. **Erros do banco viram resposta de domínio**, e é isso que fecha a corrida:
   - `23505` no índice da carreta → `409 TRIP_TRAILER_IN_USE`;
   - `23514` nos CHECKs novos → `400`.
9. **Trocar o veículo da viagem:** não existe caminho de escrita hoje (`drizzle-trip.repository.ts:99-101`
   só insere). Na T10 isso fica registrado como N/A, com um contrato que obriga quem criar essa rota a
   limpar a carreta.
10. **Snapshot do despacho** (`drizzle-trip-route.repository.ts:429-467`): ganha `trailer: {vehicleId,
plate} | null`, lido na mesma transação. Os snapshots antigos ficam como estão, e todo leitor do
    jsonb trata `trailer` ausente como `null`.
11. **Spec 145:** trocar a carreta tem de invalidar a planta. O leitor `trip-cargo-layout-input.support.ts`
    daquela branch lê só `trips.vehicleId`. A nota vai para a 145 depois de perguntar ao usuário,
    como manda a T12.
