# Tasks

Cardinalidade, entidade da nota, status da viagem, permissão e o comportamento de nota
cancelada/rejeitada depois do vínculo já foram resolvidos com o usuário (ver `spec.md` § Dúvidas).
Nenhum `NEEDS CLARIFICATION` bloqueia mais T006 em diante.

- [x] T001 Migration de expansão: `trips`, `trip_drivers`, `trip_documents`,
      `mdfe_manifests.trip_id` nullable — `apps/api-transportada/drizzle/`,
      `src/database/trip.schema.ts` — `db:generate` + `db:check` limpos.
- [x] T002 Backfill de `trips` a partir de `mdfe_manifests`/`mdfe_manifest_drivers` existentes —
      script de migration dedicado — teste confere `trip_id` preenchido em todo manifesto
      pré-existente.
- [ ] T003 Migration de contração: `mdfe_manifests.trip_id not null` — depende de T002 confirmado
      em ambiente com dado real (staging) antes de rodar em produção.
- [x] T004 [P] Contract test de isolamento de tenant para `trips`/`trip_drivers`/`trip_documents`
      — `test/trip-schema/tenant-safety.contract.ts`.
- [x] T005 `trip.policy.ts` (disponibilidade de veículo/condutor) — reaproveitar ou extrair de
      `mdfe-manifest-crew.service.ts` — `src/trips/domain/` — contract test cobrindo duplicidade e
      inatividade de condutor, igual ao equivalente do manifesto.
- [x] T006 Use-cases de viagem: criar, vincular/marcar entregue/desvincular nota, encerrar —
      `src/trips/application/trip.use-case.ts` — nota cancelada/rejeitada depois do vínculo não tem
      regra de domínio própria (não bloqueia, não desvincula automaticamente — ver `spec.md` §
      Dúvidas) — contract test cobrindo: desvincular nota não entregue (permitido), desvincular
      nota já entregue (`TripDocumentAlreadyDeliveredError`), vincular nota já viva em outra viagem
      (conflito).
- [x] T007 `DrizzleTripRepository` — `src/trips/infrastructure/` — contract test de infraestrutura.
- [x] T008 Rotas HTTP (`POST /trips`, vincular/desvincular documento, encerrar) —
      `src/trips/presentation/trip.routes.ts` — contract test HTTP.
- [x] T009 `POST /trips/:id/mdfe-manifests` — delega ao use-case existente de criação de manifesto
      injetando `tripId`/`vehicleId`/`driverIds` da viagem — `src/mdfe-manifests/application/` —
      contract test cobrindo caminho feliz e nota sem CT-e (deve recusar, igual hoje).
- [x] T009b `GET /trips` (lista, filtrável por status/veículo/condutor/período, paginada e
      ordenável) e `GET /trips/:id` (detalhe: veículo, condutores, notas vinculadas com status
      fiscal atual derivado em tempo de leitura) — `src/trips/application/`,
      `src/trips/infrastructure/` (métodos de leitura no `DrizzleTripRepository`),
      `src/trips/presentation/trip.routes.ts` — gap encontrado ao fechar T009 e decidido com o
      usuário: contrato adicionado em `plan.md` § Contratos/API/eventos — contract test HTTP e de
      infraestrutura. Bloqueia T010.
- [x] T010 [P] Frontend: módulo `trip` (listagem, detalhe, vínculo de nota) —
      `apps/frontend-transportada/src/modules/trip/` — segue `docs/frontend/data-tables.md` —
      depende de T009b.
- [x] T011 Frontend: modal de CT-e pendente na ação "emitir MDF-e" da viagem — depende de T009 e
      T010 — E2E cobrindo bloqueio com nota pendente e emissão normal com CT-e completo.
- [x] T012 Atualizar `specs/013-fleet-and-mdfe/spec.md` ("Fora do escopo") e `docs/adr/0016-*.md`
      com nota de emenda apontando para o ADR-0023 (feito no ADR-0016; conferir se falta algo no
      spec 013).
- [x] T013 `evidence.md` da feature 027 — evidência de cada task acima.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.
