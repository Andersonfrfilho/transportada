# Plano técnico

## Contexto e premissas

**A casa da média já existe.** `vehicle_volume_references` (spec 075) é catálogo de mercado sem
`company_id`, chaveado por `(vehicle_type, body_type)`, e já guarda `cargo_length_m`,
`cargo_width_m` e `cargo_height_m`. Hoje **ninguém no produto a lê fora de
`trip-occupancy.support.ts`**, onde ela é o último degrau da capacidade. Esta spec não cria tabela de
referência: ela acrescenta duas linhas de tipo, uma coluna de carga e **uma rota de leitura**.

Medido na base local em 2026-09-07:

| tipo                                                             | referência | ficha medida     |
| ---------------------------------------------------------------- | ---------- | ---------------- |
| `toco` · `truck` · `utility` · `van` · `vuc` · implemento (`''`) | ✅         | 3 de 12 veículos |
| `three_quarter` · `motorcycle` · `car` · `tractor_unit`          | ❌         | —                |

`RTD-5J78` é `three_quarter`: sem referência **e** sem ficha. Ele escapa de a ocupação inteira sumir
só porque alguém digitou `capacity_m3 = 20`.

## Arquitetura e arquivos afetados

**Catálogo (RF1, RF3)**

- `api/src/database/vehicle-volume-reference.schema.ts` + migration — `max_payload_kg`
  `numeric(10,3)` nulo permitido, com CHECK `> 0` quando presente. Nulo aqui é "o mercado não
  publica", não zero.
- `api/drizzle/NNNNN_vehicle_reference_payload.sql` — a coluna, mais `insert … on conflict do
nothing` das linhas de `three_quarter` e `motorcycle` e o `update` das cargas. Semente de catálogo
  em migration é o padrão de `fuel_price_references`: dado público, sem tenant, sem seed de empresa.
- `api/src/fleet/presentation/vehicle-reference.routes.ts` (novo) — `GET /vehicle-references` sob
  `fleet.read`, resposta em envelope `{data: [...]}`. Leitura pura, sem paginação: são nove linhas.

**Ficha (RF2) — nada a fazer**

⚠️ Medido antes de escrever a migration: `fleet_vehicles.capacity_kg` **já é** a carga máxima. Ela é
o `capKG` do MDF-e (`mdfe-payload.builder.ts:157`), atravessa `fleet.mapper.ts` como
`capacityKilograms`, tem rótulo `Capacidade (kg)` no formulário e está preenchida em 11 dos 12
veículos — de 3.000 kg no VUC a 12.000 kg no truck. A coluna nova que este plano previa teria criado
**dois campos de massa na mesma ficha**, e quem preenchesse o novo veria a rejeição no MDF-e, que lê
o antigo.

**Sugestão (RF4, RF5)**

- `frontend/src/modules/fleet/shared/vehicleSuggestion.service.ts` (novo, puro) —
  `resolveVehicleSuggestion({brand, model, referencesByType, vehicles, vehicleType})` devolvendo
  `{heightM, lengthM, maxPayloadKg, origin, widthM} | null`, com `origin` sendo
  `{kind: 'vehicle', plate}` ou `{kind: 'reference'}`.
- `frontend/src/modules/fleet/queries/useVehicleReferences.query.ts` (novo) — uma consulta por
  sessão, `staleTime` longo: catálogo não muda em uso.
- `frontend/src/modules/fleet/components/VehicleOperationFields.component.tsx` — aplica a sugestão em
  campo vazio e imprime origem e faixa. **O rastro de campo tocado mora no hook do formulário**, não
  num `useEffect` que compara valor com sugestão: valor igual à sugestão por digitação é
  indistinguível de valor não tocado.

**Peso na montagem (RF6)**

- `api/src/trips/infrastructure/trip-occupancy.support.ts` — `maxPayloadKg` junto de
  `capacityDimensions`, lido de `fleet_vehicles.capacity_kg` na mesma consulta de veículo.
- `api/src/trips/application/trip.port.ts` — `TripCargoWeightView` ganha `maxPayloadKg` e
  `payloadRatio`, ambos nulos sem teto.
- `frontend/src/modules/trip/components/TripCargoPanel.component.tsx` —
  `TripCargoWeightLines` imprime o percentual quando ele existe. A ausência continua sendo ausência,
  como o comentário do componente já promete.

## Contratos/API/eventos

Rota nova: `GET /vehicle-references` → `{data: [{bodyType, cargoHeightM, cargoLengthM, cargoWidthM,
maxPayloadKg, vehicleType}]}`, `fleet.read`, escopo `company` (a rota não lê dado de empresa, mas o
escopo é o do roteador e não abre exceção por uma leitura).

`POST`/`PUT` de veículo **não mudam**. `POST /trips/cargo-preview` e o
detalhe da viagem passam a devolver `maxPayloadKg` e `payloadRatio` dentro de `cargoWeight` — campos
novos, nulos onde não há teto.

⚠️ `VEHICLE_DETAIL_KEYS` do frontend valida com `hasEveryKey`: **a API sobe antes do frontend**,
senão a tabela de frota renderiza vazia com 200 na rede (o caso já registrado no `CLAUDE.md`).

## Riscos

- **A sugestão vira medida sem ninguém conferir.** É o comportamento aceito e declarado na spec — o
  ganho é que ela é _melhor que vazio_ e a planta passa a existir. O que a mantém honesta é a faixa
  impressa ao lado e a origem: quem salvar sabe o que está salvando.
- **`three_quarter` herdando número de VUC.** As fontes trocam as siglas. Mitigação: a linha de
  `three_quarter` sai da única fonte com medida interna literal (5,320 × 2,080 × 2,200), não de uma
  média entre as duas siglas.
- **Semente em migration.** Rodar duas vezes não duplica (`on conflict do nothing`), e o `rollback.sql`
  ao lado devolve as colunas sem os valores, como o da 088.

## Modelo recomendado

`sonnet` para T2–T6; **T1 é 🧠** (migration com semente de catálogo).
