# Tasks

> Decisões fechadas em 2026-09-12 (spec.md D1–D6, evidence.md § T0b). Onde o `plan.md` diverge, vale
> o adendo T0b dele. Uma task por vez, nesta ordem.

## Fase 0 — Medir e decidir ✅

> 🤖 Modelo: `opus`, com decisão humana.

- [x] **T0** — Medição em produção (evidence.md § T0).
- [x] **T0b** — Q1 a Q5 fechadas (evidence.md § T0b).

## Fase 1 — A chave passa pelo seam (D4)

> 🤖 Modelo: `sonnet`

### T1 — Contrato: `resolveVolumeReferenceKey` é o único construtor da chave

- `test/trip-infrastructure/occupancy-reference-key.contract.ts`, por texto de fonte: falha se
  `trip-occupancy.support.ts` comparar `vehicleVolumeReferences.vehicleType`/`bodyType` com campo do
  veículo sem passar pela função.
- Entra na lista do `package.json`. O teste vermelho vem antes da mudança.

### T2 — Ligar a ocupação à função

- `trip-occupancy.support.ts:119-124` passa a usar `resolveVolumeReferenceKey({traction: vehicle,
trailer: null})`. O comportamento não muda.
- Aceite: T1 verde, e os contratos de ocupação existentes continuam verdes.

## Fase 2 — O motivo da ausência (D2, RF4)

> 🤖 Modelo: `sonnet`

### T3 — `resolveCapacityUnknownReason` (domínio puro)

- `trips/domain/capacity-unknown-reason.policy.ts`, com contrato em tabela:
  - veículo que não é cavalo, com `00` → `bodyTypeMissing`;
  - cavalo sem carreta → `trailerMissing`;
  - tipo sem linha de catálogo → `referenceMissing`;
  - capacidade conhecida → `null`.

### T4 — Publicar `cargo.capacityUnknownReason`

- Na ocupação, no detalhe (`drizzle-trip.repository.ts`) e na prévia (`trip-cargo-preview.query.ts`).
- Integração contra Postgres: truck `00` sem ficha → `bodyTypeMissing`; depois de trocar para `02`
  → `capacitySource: 'reference'`.

### T5 — Painel nomeia o motivo (frontend)

- Guard de validação aceita o campo novo (a API sobe primeiro).
- `TripCargoPanel` mostra um texto por motivo, com link para a ficha do veículo certo. Chaves em
  `trip.locale.json`, com acento.
- Contrato por serviço puro em `test/trip/`.

## Fase 3 — Todo veículo que não é cavalo escolhe carroceria (D1, RF1, RF2)

> 🤖 Modelo: `sonnet`

### T6 — API recusa `00` em escrita nova

- `superRefine` em `fleet-request.schema.ts`: `bodyType === '00'` só vale com `tractor_unit`.
- Código `FLEET_VEHICLE_BODY_TYPE_REQUIRED` em `codes.ts`.
- Contrato de rota: `400` para moto, carro, toco, truck e carreta com `00`; `201` para cavalo.
- Candidatura do agregado: mantém `?? '00'`. O candidato já foi embora, então o veículo nasce e cai
  na página de pendências.
- Aceite adicional: nenhuma migration e nenhum `UPDATE` em `body_type`.

### T7 — Formulário da frota (frontend)

- `fleetForm.service.ts`: sem valor inicial fora do cavalo. No cavalo o campo é escondido e o valor
  é `00`.
- `vehicleBrandDefaults.service.ts`: sem `bodyType`.
- `VehicleOperationFields`: sem a opção `00` fora do cavalo.
- `*.validation.ts` bloqueia antes do 400.
- Contrato em `test/fleet/vehicle-body-type.contract.ts`.

## Fase 4 — A carreta: frota e viagem (D3, RF5, RF7, RF8)

> 🤖 Modelo: `sonnet` (T8 é 🧠 — validar o desenho da migration com `architect` model=`opus` antes)

### T8 — Migration `trip_trailer_vehicle` 🧠

- `trips.trailer_vehicle_id` e `fleet_vehicles.default_trailer_vehicle_id`: anuláveis, FK composta
  com `company_id`.
- CHECK de `default_trailer_vehicle_id` só em `tractor_unit`.
- Índice único parcial da carreta em viagem aberta.
- `rollback.sql` ao lado. Conferir `unique (company_id, id)` em `fleet_vehicles`.
- Aceite: `make migration-test` verde. **Parar e perguntar** se aparecer qualquer passo destrutivo.

### T9 — Carreta padrão na ficha do cavalo

- Zod aceita `defaultTrailerVehicleId` só em `tractor_unit`, e o apontado precisa ser carreta ativa
  da mesma empresa (senão `404`).
- Contrato de rota e de tenant.
- Frontend: select de carreta na ficha do cavalo (`@/components/ui/select`), com contrato em
  `test/fleet/`.

### T10 — Domínio e rota `PUT /trips/:id/trailer`

- `checkTripAcceptsTrailer`, com contrato em tabela (estado × tipo), mais `TRIP_TRAILER_IN_USE`.
- Rota sob `trip.manage`, idempotente, com os erros do plan.md.
- `test/separator-role.contract.test.ts` atualizado por decisão escrita.
- Tenant: carreta de outra empresa → `404`.
- Criar a viagem de um cavalo copia a carreta padrão.
- Trocar o veículo da viagem limpa a carreta na mesma transação.

### T11 — Despacho exige carreta

- `dispatch` de cavalo sem carreta → `409 TRIP_TRAILER_REQUIRED`, com contrato em
  `test/trip-domain/` e integração.
- O snapshot de despacho congela a placa da carreta.

### T12 — Ocupação lê a carreta

- `leftJoin` da carreta, chave por `resolveVolumeReferenceKey({traction, trailer})`, ficha da
  carreta antes da referência `('', body)`.
- Integração: cavalo + carreta `02` sem ficha → `reference`; sem carreta → `trailerMissing`.
- **Dependência da 145:** anotar no `tasks.md` da 145 (branch `work/cargo-missing-box`) que o
  gatilho lazy D7 precisa cobrir `trailer_vehicle_id`. **Perguntar antes** de editar qualquer
  arquivo da 145.

### T13 — Seletor de carreta na viagem (frontend)

- Detalhe da viagem e diálogo "Nova viagem" quando o veículo é cavalo, com a carreta padrão
  pré-escolhida. Mutação em `useTripWorkspace.hook.ts`.
- O diálogo de despacho mostra "o cavalo não sai sem carreta" antes de pedir.
- Contrato em `test/trip/`.

## Fase 5 — Página de pendências (D2, RF9)

> 🤖 Modelo: `sonnet`

### T14 — `GET /pending-items` (API)

- Módulo `pending-items`: porta por tipo com a permissão que exige, fonte `fleet-body-type`,
  paginação por cursor com teto de 100.
- Contratos: rota, tenant, e ausência do tipo sem `fleet.read`.
- Integração: o truck `00` aparece e some depois de salvo com `02`.

### T15 — Página `/pendencias` (frontend)

- Módulo `pending-items`, rota em `main.tsx`, entrada na navegação, esqueleto de carregamento,
  linha com link para a ficha. Locale com acento.
- Contrato por serviço puro.

## Fase 6 — Catálogo `01`/`03`/`04` (D5, RF10)

> 🤖 Modelo: `opus` na T-cat 🧠; `sonnet` na T16

### T-cat — Levantar fontes e propor valores 🧠

- Uma tabela `(vehicle_type, body_type) → C × L × A, max_payload_kg`, com fonte por linha, altura
  de carga convencionada para a aberta e a escolha entre contêiner de 20 e de 40 pés para o porta
  container.
- **Parar e pedir aprovação do usuário.** Registrar a aprovação em `evidence.md`.

### T16 — Migration de dados aditiva

- `insert … on conflict do nothing`, fonte no comentário, `rollback.sql` com `delete` das chaves
  inseridas.
- Aceite: `make migration-test` verde, e a sugestão de ficha (093) oferece as linhas novas.

## Fase 7 — Documentação viva (RF6)

> 🤖 Modelo: `haiku`

### T17 — Alinhar texto ao código

- `docs/ai-context/api-transportada.md` §075/088/093:
  - 088 D2 superada pelo `c02325b6`;
  - `car` e as linhas novas no catálogo;
  - motivos, carreta, pendências.
- Comentários em `trip-occupancy.support.ts:37-39, 59-63` e `cargo-layout.policy.ts:332`.
- `CLAUDE.md` da raiz: carreta, pendências e a regra da carroceria.
- Nova entrada em `specs/PERGUNTAS-ABERTAS.md`: `veicReboque` no MDF-e e spec de medição por câmera.

## Fechamento

> 🤖 Modelo: `opus` (`code-reviewer`)

### T18 — Revisão e gates

- `make check` completo e a auditoria do §15 do code-standart:
  - N+1 na ocupação e nas pendências;
  - logs sem placa;
  - `400` sem stack.
- Revisão por `code-reviewer` com `model=opus`. Tudo registrado em `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/147-carroceria-que-ninguem-escolheu/ (leia
spec.md, plan.md — o adendo T0b prevalece — e tasks.md antes de começar, e também
docs/ai-context/api-transportada.md §075/088/093). Trabalhe no worktree
../transportada-wt/spec-vehicle-body-00 (branch work/spec-vehicle-body-00). A Fase 0 já está feita.
Uma task por vez, na ordem do tasks.md, começando pela T1.
Modelos: Fases 1, 2, 3, 4 e 5 → executor model=sonnet (T8 🧠 validada por architect model=opus antes
de implementar) · Fase 6: T-cat 🧠 → opus, T16 → executor model=sonnet · Fase 7 → executor model=haiku ·
revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação; toda suíte nova entra na lista explícita do package.json da app.
Cada task fecha com bun run typecheck + testes da app (+ make migration-test na T8 e na T16) + commit
isolado, com evidência em specs/147-carroceria-que-ninguem-escolheu/evidence.md.
Pare e pergunte antes de: deploy, qualquer migration destrutiva ou UPDATE em fleet_vehicles.body_type,
acesso a banco de produção, editar arquivo da spec 145, gravar valores de catálogo sem a aprovação da
T-cat, e qualquer [NEEDS CLARIFICATION].
```
