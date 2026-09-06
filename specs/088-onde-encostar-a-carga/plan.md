# Plano técnico

## Contexto e premissas

Esta feature **não cria domínio novo**: ela dá metro ao que a 085 já divide. `resolveCargoLayout`
(`api/src/trips/domain/cargo-layout.policy.ts`) já produz fileiras com `sequence`, `loadOrder` e
`sideReachable`, e já sabe o que não sabe (`occupancyKnown`). O que falta é a dimensão física do baú
chegando junto, e a fileira virando profundidade.

`resolveVehicleCapacity` (`api/src/fleet/domain/vehicle-capacity.policy.ts`) já devolve a origem
(`measured` | `declared` | `reference`), e `loadTripOccupancy` já publica `capacityDimensions` — que
hoje é `null` em toda a base porque ninguém preencheu a ficha. **O caminho de leitura existe inteiro;
falta o caminho de escrita.**

## Arquitetura e arquivos afetados

**Escrita da medida (R1)**
- `api/src/fleet/presentation/fleet-request.schema.ts` — três campos opcionais com piso e teto.
- `api/src/database/fleet.schema.ts` + migration — CHECK por dimensão (ver abaixo).
- `frontend/src/modules/fleet/components/VehicleOperationFields.component.tsx` — os três campos ao
  lado da capacidade, e o m³ derivado mostrado quando os três existem.
- `frontend/src/modules/fleet/shared/{fleet.types,fleetForm.service,fleet.constant}.ts`.

**A planta (R2–R6)**
- `api/src/trips/domain/cargo-layout.policy.ts` — a fileira ganha `depthM` e `distanceFromDoorM`,
  derivados de `capacityDimensions.lengthM`. **Sem dimensões, os dois saem `null`** e nada mais muda.
- `api/src/trips/domain/cargo-plan.policy.ts` (novo) — caixas por camada, a partir da pegada da caixa
  medida e da altura do baú. Puro, sem I/O.
- `api/src/trips/infrastructure/trip-occupancy.support.ts` — já carrega caixa medida por documento
  (`loadMeasuredItems`, spec 085 G006); passa a agrupar por parada para R4.
- `frontend/src/modules/trip/components/TripCargoPlan.component.tsx` (novo) — a planta em SVG, ao
  lado do `TripCargoPanel`. SVG é primitivo do design system (`vector-map` já é desenho nosso).

## Contratos/API/eventos

Nenhuma rota nova. `POST /trips/cargo-preview` e o detalhe da viagem passam a devolver, dentro de
`cargoLayout`:

```
rows[].depthM: string | null
rows[].distanceFromDoorM: string | null
bedDimensions: { lengthM, widthM, heightM } | null
stopLayers: { sequence, boxesPerLayer, layers }[]   // só paradas com todas as caixas medidas
overflowDepthM: string | null
```

⚠️ Tudo **anulável**, e a ausência é o caso normal hoje: nenhum veículo tem ficha preenchida. Campo
obrigatório aqui obrigaria a inventar medida.

## Dados, migration e rollback

Uma migration, aditiva: o CHECK das três dimensões de `fleet_vehicles`, que hoje não existe.

- `cargo_length_m` entre 0,5 e 30,0; `cargo_width_m` entre 0,5 e 3,5; `cargo_height_m` entre 0,5 e 4,5.
- Zero continua aceito como **ausência** (é o valor de toda a base hoje), e é isso que o CHECK precisa
  admitir: `= 0 or (entre piso e teto)`.

Rollback derruba os CHECKs. Nenhuma coluna nova, nenhum dado convertido.

## Segurança e tenant

Nada novo. As medidas do baú são cadastro de frota, sob `fleet.manage`; a leitura entra no mesmo
`cargo-preview` que já é `trip.manage` e que o separador alcança (decisão escrita em
`test/separator-role.contract.test.ts`). Nenhuma consulta nova sem `companyId`.

## Idempotência e concorrência

Sem escrita nova além do `PUT` de veículo, que já é idempotente por `expectedVersion`.

## Observabilidade

Nada novo. A planta é derivada em leitura.

## Estratégia de testes

- **Domínio, antes da implementação:** profundidade que soma o comprimento; ordem inversa da entrega;
  ausência de dimensão zerando `depthM` sem quebrar as fileiras; excesso saindo como sobra; camadas
  só com todas as caixas medidas.
- **Schema:** o CHECK aceita zero e recusa 40 m e 4 cm.
- **Frontend:** contrato de que a planta não é desenhada sem `bedDimensions`, e que o aviso nomeia o
  campo.
- **Paridade:** a paleta da parada é a mesma do mapa de montagem — contrato por texto de fonte.

## Riscos

- **A ficha continuar vazia.** É o risco central: sem alguém medir oito caminhões, a planta nunca
  aparece. Mitigação é a própria tela — o aviso nomeia o campo e leva à ficha.
- **Divergência entre m³ digitado e dimensões.** Resolvida por precedência já existente
  (`resolveVehicleCapacity`), e a tela passa a dizer de onde o número veio.
- **A planta parecer plano de estiva.** Mitigação é textual e é obrigação: a tela diz que a faixa é
  espaço reservado por volume, não posição de caixa.
