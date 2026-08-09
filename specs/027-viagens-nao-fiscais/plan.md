# Plano técnico

## Contexto e premissas

Depende do ADR-0023 (emenda ao ADR-0016 §5): `trips` nasce como entidade própria, e
`mdfe_manifests` passa a referenciar uma viagem (`trip_id`) em vez de ser a viagem. Este plano
assume a Opção A já aprovada e o gate de CT-e-antes-do-MDF-e só no frontend (ADR-0023 §3).

Este plano tem lacunas deliberadas — marcadas `[NEEDS CLARIFICATION]` no `spec.md` — que bloqueiam
o início da implementação (`AGENTS.md`: "Não implementar enquanto a spec ativa contiver
`[NEEDS CLARIFICATION]`"). As seções abaixo assumem a resposta mais conservadora onde aplicável e
sinalizam onde a decisão muda o desenho.

## Arquitetura e arquivos afetados

Novo módulo `apps/api-transportada/src/trips/` com as 4 camadas do padrão do repositório:

- `presentation/trip.routes.ts`, `trip.schema.ts`
- `application/trip.use-case.ts` (criar, vincular/desvincular nota, encerrar, emitir MDF-e a
  partir da viagem)
- `domain/trip.error.ts`, `trip.policy.ts` (regras de disponibilidade de veículo/condutor,
  reaproveitando o desenho de `mdfe-manifest-crew.service.ts`)
- `infrastructure/drizzle-trip.repository.ts`, `trip.mapper.ts`

`apps/api-transportada/src/mdfe-manifests/`:

- `mdfe-issuance-payload.service.ts` e o use-case de criação de manifesto passam a aceitar
  `tripId`, resolvendo veículo/condutores a partir da viagem em vez de receber tudo no payload.
- `mdfe-manifest-crew.service.ts` (`resolveManifestCrew`/`resolveManifestVehicle`) é reaproveitado
  por `trip.policy.ts` — mover a validação comum de disponibilidade para `shared/` do módulo, se
  a duplicação incomodar (avaliar ao implementar, não antecipar agora).

`apps/frontend-transportada/src/modules/`:

- Novo módulo `trip` (`TripListPage`, `TripDetailPage`, `useTripTable.hook.ts`,
  `tripClient.service.ts`) seguindo o padrão de `cte-batch`/`nfe-workspace`.
- Modal de "CT-e pendente" na ação "emitir MDF-e" da viagem — consome a lista de notas sem CT-e da
  própria viagem, oferece emitir cada uma antes de liberar o botão de emissão do manifesto.

## Contratos/API/eventos

- `GET /trips` — lista viagens da empresa, filtrável por `status`/`vehicleId`/`driverId`/período,
  paginada e ordenável (`sortBy`, `sortDirection`, `filters[]` em query params, mesmo contrato de
  `docs/frontend/data-tables.md` usado por `nfe-workspace`/`cte-batch`) — decisão tomada com o
  usuário ao fechar T009: faltava no contrato original, mas o próprio "Requisitos funcionais" do
  `spec.md` já exigia essa listagem.
- `GET /trips/:id` — detalhe da viagem: veículo, condutores, status e as notas vinculadas
  (`nfe_documents`/`freight_calculations`), cada uma com o status atual do documento fiscal
  correspondente derivado em tempo de leitura (sem persistir em `trip_documents`) para alimentar o
  aviso não bloqueante de nota cancelada/rejeitada (ver `spec.md` § Dúvidas).
- `POST /trips` — cria viagem (`vehicleId`, `driverIds[]`).
- `POST /trips/:id/documents` — vincula nota (`nfeDocumentId` **xor** `freightCalculationId`);
  falha com conflito se a nota já está vinculada (viva) em outra viagem.
- `POST /trips/:id/documents/:documentId/deliver` — marca a nota como entregue nessa viagem
  (`delivered_at`); a partir daqui o vínculo é permanente.
- `DELETE /trips/:id/documents/:documentId` — desvincula (`released_at`); recusa se já entregue
  (`TripDocumentAlreadyDeliveredError`) — é assim que a nota "muda de viagem" quando a entrega não
  acontece no dia: desvincula da viagem travada e vincula de novo em uma viagem nova.
- `POST /trips/:id/close` — encerra viagem sem MDF-e.
- `POST /trips/:id/mdfe-manifests` — substitui a criação direta de manifesto quando originada de
  uma viagem; internamente delega ao use-case existente de criação de manifesto, injetando
  `tripId`, `vehicleId` e `driverIds` já resolvidos da viagem.
- Sem evento novo no RabbitMQ: o worker continua só processando manifesto (`mdfe.*`); viagem é
  puramente síncrona/API por enquanto.

## Dados, migration e rollback

```
trips
  id uuid pk
  company_id uuid not null fk companies
  vehicle_id uuid not null fk (company_id, fleet_vehicles.id)
  status text not null  -- valores conforme NEEDS CLARIFICATION de status
  created_at, updated_at

trip_drivers  -- mesmo desenho de mdfe_manifest_drivers
  id uuid pk
  company_id, trip_id, driver_id, driver_name, driver_tax_id, position
  unique (company_id, trip_id, driver_id)
  unique (company_id, trip_id, position)

trip_documents
  id uuid pk
  company_id, trip_id
  nfe_document_id uuid null fk (company_id, nfe_documents.id)
  freight_calculation_id uuid null fk (company_id, freight_calculations.id)
  -- exatamente um dos dois preenchido (check constraint) — a viagem vincula nota crua ou frete
  -- já calculado sobre ela, nunca os dois ao mesmo tempo pro mesmo vínculo
  delivered_at timestamp null   -- marca a nota como entregue NESSA viagem; trava a nota aqui
  released_at timestamp null    -- desvínculo (só permitido enquanto delivered_at is null)
  created_at, updated_at

  -- unique "viva": (company_id, nfe_document_id) e (company_id, freight_calculation_id),
  -- cada um restrito a released_at is null — mesmo padrão de
  -- mdfe_manifest_items_live_document_unique. Uma vez delivered_at preenchido, released_at
  -- nunca mais pode ser setado (check: delivered_at is null or released_at is null).

mdfe_manifests
  + trip_id uuid not null fk (company_id, trips.id)
```

`trips.status` é `open`/`closed` — decisão confirmada com o usuário, sem espelhar o ciclo do
manifesto porque a viagem não fala com a SEFAZ.

Migration em duas etapas (expansão-contração,
`~/.claude/rules/rules/backend/database.md`):

1. Expansão: cria `trips`/`trip_drivers`/`trip_documents`, adiciona `mdfe_manifests.trip_id`
   **nullable**. Backfill: uma linha em `trips` por `mdfe_manifests` existente (mesmo
   `vehicle_id`, condutores copiados de `mdfe_manifest_drivers`), com `mdfe_manifests.trip_id`
   apontando pra ela.
2. Contração: `mdfe_manifests.trip_id` vira `not null` depois do backfill confirmado.

Rollback documentado ao lado de cada migration, como já é convenção do repositório
(`db:migrate`/rollback manual).

## Segurança e tenant

- `company_id` de `trips` e `trip_drivers`/`trip_documents` sempre do contexto autenticado.
- Teste de isolamento (`test/trip-schema/tenant-safety.contract.ts`) cobrindo as 3 tabelas novas,
  igual ao padrão já usado por `fleet`/`mdfe`.
- Permissão: `[NEEDS CLARIFICATION]` no spec — assumir `fleet.manage` como default conservador até
  decisão, dado que viagem reaproveita veículo/condutor da frota.

## Idempotência e concorrência

- Vincular a mesma nota duas vezes à mesma viagem é idempotente (unique
  `(company_id, trip_id, <entidade>_id)` com `released_at is null`, mesmo padrão de
  `mdfe_manifest_items_live_document_unique`).
- Emitir MDF-e a partir de uma viagem reaproveita o idempotency key já existente do use-case de
  criação de manifesto — sem novo mecanismo.

## Observabilidade

- Logs estruturados no módulo `trips`, mesmo padrão dos demais módulos (`correlationId`,
  `companyId`, sem PII).
- Nenhuma métrica nova além do que os módulos existentes já expõem via `/metrics`.

## Estratégia de testes

- Contract tests: `trip-schema`, `trip-domain` (policy de disponibilidade), `trip-application`,
  `trip-infrastructure`, `trip-http` — mesmo padrão de sufixos dos demais módulos.
- Teste de migração/backfill (`database-migration.contract.test.ts` estendido ou novo arquivo):
  confere que todo `mdfe_manifests` pré-existente ganha `trip_id` válido.
- E2E de frontend: viagem sem CT-e não deixa emitir MDF-e (modal abre); viagem com CT-e completo
  emite igual ao fluxo atual.

## Riscos

- Chamada direta à API de criação de manifesto pulando o modal do frontend não é bloqueada pelo
  domínio — risco aceito explicitamente (ADR-0023 §3, spec `Dúvidas`).
- `mdfe_manifests.trip_id not null` é mudança estrutural em tabela já sinalizada como de "custo
  maior que o normal" (ADR-0016) — qualquer erro no backfill trava a contração da migration.
- Sem resposta às `[NEEDS CLARIFICATION]` de N:1 vs. N:N de nota↔viagem e do schema de
  `trip_documents`, a tabela acima pode mudar de forma — não iniciar T0xx de schema antes disso.
