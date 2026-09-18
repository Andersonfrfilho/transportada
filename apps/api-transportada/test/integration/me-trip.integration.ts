/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057, T017 — **a prova da D2**. A viagem inteira é executada pelos casos de uso e pelos
 * repositórios que as rotas expõem, contra Postgres de verdade, e **sem browser nenhum**. Se um dia
 * esta suíte precisar de um para passar, a regra de viagem vazou para a tela e a decisão está
 * quebrada.
 *
 * É também a única verificação que exercita o SQL: contrato com dublê passa com `where` errado, e
 * `where` errado num filtro de tenant é o defeito que ninguém vê até alguém ver a viagem de outra
 * empresa.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  tripDeliveryProofs,
  tripDispatchSnapshots,
  tripDocuments,
  tripDrivers,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { dispatchDriverTrip } from '../../src/trips/application/dispatch-driver-trip.use-case.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { PROOF_PUNCTUALITY } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-08-26T13:00:00.000Z')
const LOCATION = {
  accuracyMeters: '12.50',
  capturedAt: '2026-08-26T12:59:58.000Z',
  latitude: '-23.5505199',
  longitude: '-46.6333094',
} as const

type World = {
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly driverId: string
  readonly membershipId: string
  readonly stopIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

describe('a viagem no bolso do motorista (spec 057 T017)', () => {
  testWithPostgres('executa a viagem inteira pelas rotas de domínio, sem browser', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
      const context = {
        actorUserId: world.userId,
        companyId: world.companyId,
        driverId: world.driverId,
      }

      // 1. O motorista abre o app e o servidor diz qual é a viagem dele
      const opened = await findCurrentDriverTrip({
        companyId: world.companyId,
        membershipId: world.membershipId,
        now: NOW,
        repository: reads,
        scores: new DrizzleDriverScoreRepository(database.db),
      })
      expect(opened.isRegisteredDriver).toBe(true)
      expect(opened.trips).toHaveLength(1)
      expect(opened.trips[0]?.vehiclePlate).toBe('GCQ8E47')
      expect(opened.trips[0]?.stops.map((stop) => stop.sequence)).toEqual([1, 2])
      expect(opened.trips[0]?.stops[0]?.documents).toHaveLength(2)
      /**
       * Spec 065 D1b: a entrega urbana não tem CT-e nem MDF-e, então a NF-e é o único documento
       * daquela carga — e é com a chave que a portaria confere e o fiscal consulta.
       */
      // A ordem é a do vínculo — estável, porque o conferente lê o romaneio de cima para baixo
      expect(opened.trips[0]?.stops[0]?.documents.map((entry) => entry.number)).toEqual(['1', '2'])
      expect(opened.trips[0]?.stops[0]?.documents[0]).toMatchObject({
        accessKey: `1${'1'.repeat(43)}`,
        number: '1',
        recipientName: 'Destinatario 1',
        series: '1',
        volumeCount: '0',
      })

      /**
       * Spec 109 D3: o plano dizia que a primeira parada seria às 12h20 e o motorista chega às 13h.
       * A segunda parada tem de andar os mesmos 40 minutos — a conta acontece em SQL
       * (`make_interval`), e é contra o banco que ela se prova.
       */
      const plannedFirstArrival = new Date(NOW.getTime() - 40 * 60 * 1_000)
      await database.db
        .update(tripStops)
        .set({ estimatedArrivalAt: plannedFirstArrival })
        .where(eq(tripStops.id, world.stopIds[0] ?? ''))
      const plannedSecondArrival = new Date(NOW.getTime() + 60 * 60 * 1_000)
      await database.db
        .update(tripStops)
        .set({ estimatedArrivalAt: plannedSecondArrival })
        .where(eq(tripStops.id, world.stopIds[1] ?? ''))

      // 2. Cheguei na primeira parada — e a viagem sai de `dispatched` sozinha
      await reportStopArrival({
        ...context,
        idempotencyKey: 'chegada-1',
        location: LOCATION,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      })
      expect(await readTripStatus(database, world.tripId)).toBe('in_transit')

      /**
       * Spec 158 T4 (lacuna da T3): a chegada na primeira parada leva `dispatched → in_transit`
       * por `markTripInTransit` (report-stop-arrival.use-case.ts) — canal/autoria de
       * `deriveFieldAuthorship` (motorista: `driver_app`, sem `onBehalfOfDriverId`) e
       * `occurred_at` igual ao `now` do caso de uso (ADR-0068 §"Consequências").
       */
      const [arrivalStatusEvent] = await database.db
        .select()
        .from(tripStatusEvents)
        .where(eq(tripStatusEvents.tripId, world.tripId))
      expect(arrivalStatusEvent).toMatchObject({
        actorUserId: world.userId,
        channel: 'driver_app',
        fromStatus: 'dispatched',
        onBehalfOfDriverId: null,
        toStatus: 'in_transit',
      })
      expect(arrivalStatusEvent?.occurredAt.toISOString()).toBe(NOW.toISOString())

      const [shiftedSecond] = await database.db
        .select({ estimatedArrivalAt: tripStops.estimatedArrivalAt })
        .from(tripStops)
        .where(eq(tripStops.id, world.stopIds[1] ?? ''))
      expect(
        ((shiftedSecond?.estimatedArrivalAt?.getTime() ?? 0) - plannedSecondArrival.getTime()) /
          60_000,
      ).toBe(40)
      /** ⚠️ A parada que acabou de ser marcada **não** se move: o real dela é a hora da chegada. */
      const [visitedFirst] = await database.db
        .select({ estimatedArrivalAt: tripStops.estimatedArrivalAt })
        .from(tripStops)
        .where(eq(tripStops.id, world.stopIds[0] ?? ''))
      expect(visitedFirst?.estimatedArrivalAt?.toISOString()).toBe(
        plannedFirstArrival.toISOString(),
      )

      // 3. Entreguei as duas notas: a última fecha a parada, e só ela
      const firstDelivery = await reportDocumentDelivery({
        ...context,
        documentId: world.documentIds[0] ?? '',
        idempotencyKey: 'entrega-1',
        location: LOCATION,
        now: NOW,
        unitOfWork,
      })
      expect(firstDelivery).toMatchObject({ stopCompleted: false, tripCompleted: false })

      const secondDelivery = await reportDocumentDelivery({
        ...context,
        documentId: world.documentIds[1] ?? '',
        idempotencyKey: 'entrega-2',
        location: null,
        now: NOW,
        unitOfWork,
      })
      expect(secondDelivery).toMatchObject({ stopCompleted: true, tripCompleted: false })

      // 4. Deu problema na segunda parada, e a ocorrência não impede nada
      await reportStopArrival({
        ...context,
        idempotencyKey: 'chegada-2',
        location: null,
        now: NOW,
        stopId: world.stopIds[1] ?? '',
        unitOfWork,
      })
      await reportStopOccurrence({
        ...context,
        attachmentObjectId: null,
        description: 'Duas horas na fila da doca',
        distanceMeters: null,
        documentId: world.documentIds[2] ?? '',
        idempotencyKey: 'ocorrencia-1',
        kind: 'long_wait',
        stopId: world.stopIds[1] ?? '',
        unitOfWork,
      })

      // 5. Não entreguei a última: a parada fecha do mesmo jeito, e a viagem fecha atrás dela
      const returned = await reportDocumentReturn({
        ...context,
        documentId: world.documentIds[2] ?? '',
        idempotencyKey: 'retorno-1',
        location: null,
        now: NOW,
        reason: 'establishment_closed',
        unitOfWork,
      })
      expect(returned).toMatchObject({ stopCompleted: true, tripCompleted: true })
      expect(await readTripStatus(database, world.tripId)).toBe('completed')

      /**
       * Spec 158 T4 (lacuna da T3): a devolução que fecha a última parada conclui a viagem por
       * `completeTripIfSettled` (report-document-delivery.use-case.ts), com o `from` real
       * (`in_transit` — este motorista nunca passa por `on_delivery_route`) e `occurred_at` igual
       * ao `now` do caso de uso.
       */
      const [completionStatusEvent] = await database.db
        .select()
        .from(tripStatusEvents)
        .where(eq(tripStatusEvents.toStatus, 'completed'))
      expect(completionStatusEvent).toMatchObject({
        actorUserId: world.userId,
        channel: 'driver_app',
        fromStatus: 'in_transit',
        onBehalfOfDriverId: null,
        toStatus: 'completed',
      })
      expect(completionStatusEvent?.occurredAt.toISOString()).toBe(NOW.toISOString())

      // 6. O que ficou gravado: a coordenada onde havia, e nada onde não havia
      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.companyId, world.companyId))
      // Duas chegadas, duas entregas e um retorno — um evento por confirmação, nem um a mais
      expect(events).toHaveLength(5)
      expect(events.filter((event) => event.latitude !== null)).toHaveLength(2)
      expect(events.filter((event) => event.kind === 'returned')).toHaveLength(1)
      // Spec 159 T11: o motorista que reportou fica no evento, não só no vínculo da conta
      expect(
        events.filter((event) => event.kind !== 'arrived').map((event) => event.reportedByDriverId),
      ).toEqual([world.driverId, world.driverId, world.driverId])

      const occurrences = await database.db
        .select()
        .from(tripStopOccurrences)
        .where(eq(tripStopOccurrences.companyId, world.companyId))
      expect(occurrences).toHaveLength(1)
      expect(occurrences[0]?.kind).toBe('long_wait')

      // A nota da ocorrência foi **devolvida**, e a ocorrência continua lá: os dois fatos convivem
      const [returnedDocument] = await database.db
        .select()
        .from(tripDocuments)
        .where(eq(tripDocuments.id, world.documentIds[2] ?? ''))
      expect(returnedDocument?.separationStatus).toBe('returned')
      expect(returnedDocument?.returnReason).toBe('establishment_closed')
    })
  })

  /** A garantia inteira do modo offline, contra o banco: o reenvio não vira uma segunda chegada. */
  testWithPostgres('o reenvio da fila offline não duplica o que já foi reportado', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
      const input = {
        actorUserId: world.userId,
        companyId: world.companyId,
        driverId: world.driverId,
        idempotencyKey: 'a-mesma-chave-do-aparelho',
        location: LOCATION,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      }

      const first = await reportStopArrival(input)
      const second = await reportStopArrival(input)
      const third = await reportStopArrival(input)

      expect(second.id).toBe(first.id)
      expect(third.id).toBe(first.id)
      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.companyId, world.companyId))
      expect(events).toHaveLength(1)

      /** Spec 158 T4: repetir a chegada não grava um segundo `trip_status_events`. */
      const statusEvents = await database.db
        .select()
        .from(tripStatusEvents)
        .where(eq(tripStatusEvents.tripId, world.tripId))
      expect(statusEvents).toHaveLength(1)
      expect(statusEvents[0]).toMatchObject({ fromStatus: 'dispatched', toStatus: 'in_transit' })
    })
  })

  /**
   * Spec 159 T5 (ADR-0069 §2-6): `/proof` classifica a pontualidade da foto contra o Postgres de
   * verdade — a query de `findDeliveryContext` (join `trip_stop_events`+`trip_stops`) e a de
   * `resolveProofPunctualitySettings` são o que um contrato com dublê não prova.
   */
  testWithPostgres(
    'a foto classifica pontualidade contra a posição da entrega (spec 159)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDispatchedTrip(database)
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: world.companyId, photo: 'required' })
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
        const deliveryProofRepository = new DrizzleDeliveryProofRepository(database.db)
        let objectCounter = 0
        const storage = {
          store: async () => ({ sha256: `${(objectCounter += 1)}`.padStart(64, '0') }),
        }
        const context = {
          actorUserId: world.userId,
          companyId: world.companyId,
          driverId: world.driverId,
        }

        await reportStopArrival({
          ...context,
          idempotencyKey: 'chegada-para-a-foto',
          location: LOCATION,
          now: NOW,
          stopId: world.stopIds[0] ?? '',
          unitOfWork,
        })

        // A parada não tem coordenada própria (não geocodificada) — a referência é a da entrega.
        await reportDocumentDelivery({
          ...context,
          documentId: world.documentIds[0] ?? '',
          idempotencyKey: 'entrega-para-a-foto',
          location: LOCATION,
          now: NOW,
          unitOfWork,
        })

        const onTime = await attachDeliveryProof({
          actorUserId: world.userId,
          companyId: world.companyId,
          documentId: world.documentIds[0] ?? '',
          driverId: world.driverId,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: new Date(NOW.getTime() + 5 * 60 * 1000),
          repository: deliveryProofRepository,
          sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
          storage,
          upload: {
            attachmentKey: '',
            bytes: new Uint8Array([1, 2, 3]),
            capturedAt: new Date(NOW.getTime() + 5 * 60 * 1000),
            kind: 'photo',
            mimeType: 'image/jpeg',
            position: { latitude: LOCATION.latitude, longitude: LOCATION.longitude },
            receiverDocument: '',
            receiverName: '',
          },
        })
        expect(onTime.punctuality).toBe(PROOF_PUNCTUALITY.onTime)

        const [savedOnTime] = await database.db
          .select({
            latitude: tripDeliveryProofs.latitude,
            punctuality: tripDeliveryProofs.punctuality,
          })
          .from(tripDeliveryProofs)
          .where(eq(tripDeliveryProofs.id, onTime.id))
        expect(savedOnTime?.punctuality).toBe(PROOF_PUNCTUALITY.onTime)
        expect(savedOnTime?.latitude).toBe(LOCATION.latitude)

        // A segunda nota: entrega sem foto ainda, depois foto tardia e longe.
        await reportDocumentDelivery({
          ...context,
          documentId: world.documentIds[1] ?? '',
          idempotencyKey: 'entrega-2-para-a-foto',
          location: LOCATION,
          now: NOW,
          unitOfWork,
        })

        const lateAndAway = await attachDeliveryProof({
          actorUserId: world.userId,
          companyId: world.companyId,
          documentId: world.documentIds[1] ?? '',
          driverId: world.driverId,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: new Date(NOW.getTime() + 3 * 60 * 60 * 1000),
          repository: deliveryProofRepository,
          sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
          storage,
          upload: {
            attachmentKey: '',
            bytes: new Uint8Array([1, 2, 3]),
            capturedAt: new Date(NOW.getTime() + 3 * 60 * 60 * 1000),
            kind: 'photo',
            mimeType: 'image/jpeg',
            position: { latitude: '-22.0000000', longitude: '-43.0000000' },
            receiverDocument: '',
            receiverName: '',
          },
        })
        expect(lateAndAway.punctuality).toBe(PROOF_PUNCTUALITY.lateAndAway)
      })
    },
  )

  /**
   * Spec 159 T6, ADR-0069 §1: `/deliver` responde `proofPending`, e o snapshot mostra o mesmo aviso
   * por documento até a foto chegar — nunca recusando a entrega. Contra Postgres de verdade porque
   * a leitura do snapshot é SQL próprio (`listDeliveryPhotoPresence`).
   */
  testWithPostgres(
    'proofPending avisa sem bloquear, no /deliver e no snapshot (spec 159)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDispatchedTrip(database)
        await database.db
          .insert(companyDeliveryProofSettings)
          // Spec 159 T11 (D1): a nota vale desde antes do NOW fixo desta suíte.
          .values({
            companyId: world.companyId,
            photo: 'required',
            scoreEffectiveSince: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
          })
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
        const deliveryProofRepository = new DrizzleDeliveryProofRepository(database.db)
        const reads = new DrizzleCurrentDriverTripRepository(database.db)
        const context = {
          actorUserId: world.userId,
          companyId: world.companyId,
          driverId: world.driverId,
        }
        const resolveProofSettings = (settings: { companyId: string; documentId: string }) =>
          deliveryProofRepository.resolveProofFieldSettings(settings)

        await reportStopArrival({
          ...context,
          idempotencyKey: 'chegada-proof-pending',
          location: LOCATION,
          now: NOW,
          stopId: world.stopIds[0] ?? '',
          unitOfWork,
        })

        // 1. Entrega sem foto: aceita de qualquer jeito, e avisa que a foto ainda não chegou.
        const delivery = await reportDocumentDelivery({
          ...context,
          documentId: world.documentIds[0] ?? '',
          idempotencyKey: 'entrega-proof-pending',
          location: LOCATION,
          now: NOW,
          resolveProofSettings,
          unitOfWork,
        })
        expect(delivery.proofPending).toBe(true)

        const beforePhoto = await findCurrentDriverTrip({
          companyId: world.companyId,
          membershipId: world.membershipId,
          now: NOW,
          repository: reads,
          scores: new DrizzleDriverScoreRepository(database.db),
        })
        const documentBeforePhoto = beforePhoto.trips[0]?.stops[0]?.documents.find(
          (entry) => entry.id === world.documentIds[0],
        )
        expect(documentBeforePhoto?.proofPending).toBe(true)
        /**
         * Spec 159 RF2/RF8 (T7): a entrega com foto obrigatória acabou de acontecer — conta para a
         * nota (sai de `null`), mas ainda está dentro das `missingAfterHours`: nenhuma penalidade.
         */
        expect(beforePhoto.score).toBe(100)

        // 2. A foto chega em lote, depois — e o aviso some, sem ninguém ter recusado nada.
        let objectCounter = 0
        await attachDeliveryProof({
          actorUserId: world.userId,
          companyId: world.companyId,
          documentId: world.documentIds[0] ?? '',
          driverId: world.driverId,
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: NOW,
          repository: deliveryProofRepository,
          sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
          storage: { store: async () => ({ sha256: `${(objectCounter += 1)}`.padStart(64, '0') }) },
          upload: {
            attachmentKey: '',
            bytes: new Uint8Array([1, 2, 3]),
            capturedAt: NOW,
            kind: 'photo',
            mimeType: 'image/jpeg',
            position: { latitude: LOCATION.latitude, longitude: LOCATION.longitude },
            receiverDocument: '',
            receiverName: '',
          },
        })

        const afterPhoto = await findCurrentDriverTrip({
          companyId: world.companyId,
          membershipId: world.membershipId,
          now: NOW,
          repository: reads,
          scores: new DrizzleDriverScoreRepository(database.db),
        })
        const documentAfterPhoto = afterPhoto.trips[0]?.stops[0]?.documents.find(
          (entry) => entry.id === world.documentIds[0],
        )
        expect(documentAfterPhoto?.proofPending).toBe(false)

        // 3. A segunda nota da mesma parada, ainda não entregue: nunca pendente antes da entrega.
        const pendingBeforeDelivery = afterPhoto.trips[0]?.stops[0]?.documents.find(
          (entry) => entry.id === world.documentIds[1],
        )
        expect(pendingBeforeDelivery?.proofPending).toBe(false)
      })
    },
  )

  /**
   * Spec 159 T11 (ALTO 1): a última entrega conclui a viagem, que sai de `trips` — e as fotos
   * obrigatórias que faltam continuam listadas em `pendingProofs`, e o `/proof` ainda as aceita.
   */
  testWithPostgres(
    'a última entrega conclui a viagem e a pendente continua listada (spec 159 T11)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDispatchedTrip(database)
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: world.companyId, photo: 'required' })
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)
        const reads = new DrizzleCurrentDriverTripRepository(database.db)
        const context = {
          actorUserId: world.userId,
          companyId: world.companyId,
          driverId: world.driverId,
        }
        const readSnapshot = () =>
          findCurrentDriverTrip({
            companyId: world.companyId,
            membershipId: world.membershipId,
            now: new Date(),
            repository: reads,
            scores: new DrizzleDriverScoreRepository(database.db),
          })

        for (const [index, stopId] of world.stopIds.entries()) {
          await reportStopArrival({
            ...context,
            idempotencyKey: `chegada-pendente-${String(index)}`,
            location: null,
            now: NOW,
            stopId,
            unitOfWork,
          })
        }
        const [firstDocumentId = '', secondDocumentId = '', lastDocumentId = ''] = world.documentIds
        await reportDocumentDelivery({
          ...context,
          documentId: firstDocumentId ?? '',
          idempotencyKey: 'entrega-pendente-1',
          location: null,
          now: NOW,
          unitOfWork,
        })
        await reportDocumentReturn({
          ...context,
          documentId: secondDocumentId ?? '',
          idempotencyKey: 'retorno-pendente-2',
          location: null,
          now: NOW,
          reason: 'establishment_closed',
          unitOfWork,
        })
        const last = await reportDocumentDelivery({
          ...context,
          documentId: lastDocumentId ?? '',
          idempotencyKey: 'entrega-pendente-3',
          location: null,
          now: NOW,
          unitOfWork,
        })
        expect(last.tripCompleted).toBe(true)

        const afterCompletion = await readSnapshot()
        expect(afterCompletion.trips).toEqual([])
        expect(afterCompletion.pendingProofs.map((proof) => proof.documentId).sort()).toEqual(
          [firstDocumentId, lastDocumentId].sort(),
        )
        expect(
          afterCompletion.pendingProofs.find((proof) => proof.documentId === lastDocumentId),
        ).toMatchObject({
          deliveryProof: { photo: 'required' },
          documentNumber: '3',
          documentSeries: '1',
          recipientName: 'Destinatario 3',
          tripId: world.tripId,
          tripStatus: 'completed',
        })

        // O `/proof` alcança a viagem concluída, e a nota sai da lista.
        await attachDeliveryProof({
          ...context,
          documentId: lastDocumentId ?? '',
          newObjectId: () => crypto.randomUUID(),
          newProofId: () => crypto.randomUUID(),
          now: new Date(),
          repository: new DrizzleDeliveryProofRepository(database.db),
          sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
          storage: { store: async () => ({ sha256: 'f'.repeat(64) }) },
          upload: {
            attachmentKey: 'foto-depois-de-concluir',
            bytes: new Uint8Array([1, 2, 3]),
            capturedAt: undefined,
            kind: 'photo',
            mimeType: 'image/jpeg',
            position: undefined,
            receiverDocument: '',
            receiverName: '',
          },
        })
        const afterPhoto = await readSnapshot()
        expect(afterPhoto.pendingProofs.map((proof) => proof.documentId)).toEqual([firstDocumentId])

        // O motorista de outra empresa não vê a pendência deste (tenant).
        const other = await seedDriverOnly(database)
        const otherSnapshot = await findCurrentDriverTrip({
          companyId: other.companyId,
          membershipId: other.membershipId,
          now: new Date(),
          repository: reads,
          scores: new DrizzleDriverScoreRepository(database.db),
        })
        expect(otherSnapshot.pendingProofs).toEqual([])
      })
    },
  )

  /**
   * O filtro de tenant, exercitado: o motorista da outra empresa **não** enxerga esta viagem, e a
   * parada dela não é alcançável por ele. Contrato com dublê passaria com o `where` errado.
   */
  testWithPostgres('a viagem de uma empresa não alcança o motorista de outra', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDispatchedTrip(database)
      const stranger = await seedDriverOnly(database)
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db)

      const opened = await findCurrentDriverTrip({
        companyId: stranger.companyId,
        membershipId: stranger.membershipId,
        now: NOW,
        repository: reads,
        scores: new DrizzleDriverScoreRepository(database.db),
      })
      expect(opened).toEqual({
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [],
      })

      const attempt = reportStopArrival({
        actorUserId: stranger.userId,
        companyId: stranger.companyId,
        driverId: stranger.driverId,
        idempotencyKey: 'tentativa',
        location: null,
        now: NOW,
        stopId: world.stopIds[0] ?? '',
        unitOfWork,
      })

      await expect(attempt).rejects.toThrow()
    })
  })

  /**
   * Spec 082 D9 / ADR-0058: o motorista vinculado abre a porta do despacho. O congelamento do
   * roteiro e a idempotência são os mesmos do escritório — muda só quem chama.
   */
  testWithPostgres('o motorista despacha a própria viagem, e só a própria', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedPlannedTrip(database)
      const stranger = await seedDriverOnly(database)
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const routeRepository = new DrizzleTripRouteRepository(database.db)
      const dispatch = (input: { readonly actorUserId: string; readonly tripId: string }) =>
        dispatchTrip({
          actorUserId: input.actorUserId,
          channel: TRIP_FIELD_CHANNELS.driverApp,
          companyId: world.companyId,
          repository: routeRepository,
          tripId: input.tripId,
        })

      // A viagem em `route_planned` aparece na tela do motorista — é onde mora "Iniciar trajeto"
      const opened = await findCurrentDriverTrip({
        companyId: world.companyId,
        membershipId: world.membershipId,
        now: NOW,
        repository: reads,
        scores: new DrizzleDriverScoreRepository(database.db),
      })
      expect(opened.trips.map((trip) => trip.status)).toEqual(['route_planned'])

      // Outro vínculo (mesmo com cadastro de motorista) → 403, sem transição tentada
      const foreign = dispatchDriverTrip({
        actorUserId: stranger.userId,
        companyId: stranger.companyId,
        dispatch,
        driverId: stranger.driverId,
        linkage: reads,
        tripId: world.tripId,
      })
      await expect(foreign).rejects.toMatchObject({ code: 'TRIP_NOT_OF_DRIVER', status: 403 })
      expect(await readTripStatus(database, world.tripId)).toBe('route_planned')

      // O próprio vínculo despacha, e o roteiro congela em snapshot
      const first = await dispatchDriverTrip({
        actorUserId: world.userId,
        companyId: world.companyId,
        dispatch,
        driverId: world.driverId,
        linkage: reads,
        tripId: world.tripId,
      })
      expect(first).toEqual({ tripStatus: 'dispatched' })
      expect(await countDispatchSnapshots(database, world.companyId)).toBe(1)

      // Repetido → unchanged: mesmo status, e nenhum segundo congelamento
      const second = await dispatchDriverTrip({
        actorUserId: world.userId,
        companyId: world.companyId,
        dispatch,
        driverId: world.driverId,
        linkage: reads,
        tripId: world.tripId,
      })
      expect(second).toEqual({ tripStatus: 'dispatched' })
      expect(await countDispatchSnapshots(database, world.companyId)).toBe(1)
    })
  })

  testWithPostgres('fora de route_planned o despacho do motorista é 409', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedPlannedTrip(database, { status: 'draft' })
      const reads = new DrizzleCurrentDriverTripRepository(database.db)
      const routeRepository = new DrizzleTripRouteRepository(database.db)

      const attempt = dispatchDriverTrip({
        actorUserId: world.userId,
        companyId: world.companyId,
        dispatch: (input) =>
          dispatchTrip({
            actorUserId: input.actorUserId,
            channel: TRIP_FIELD_CHANNELS.driverApp,
            companyId: world.companyId,
            repository: routeRepository,
            tripId: input.tripId,
          }),
        driverId: world.driverId,
        linkage: reads,
        tripId: world.tripId,
      })

      await expect(attempt).rejects.toMatchObject({
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        status: 409,
      })
    })
  })

  /** Conta com papel de motorista e sem cadastro na frota: problema de configuração, não de viagem. */
  testWithPostgres('conta sem cadastro de motorista se anuncia como tal', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const userId = crypto.randomUUID()
      const membershipId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
      await database.db
        .insert(userCompanyMemberships)
        .values({ companyId, id: membershipId, status: 'active', userId })

      const opened = await findCurrentDriverTrip({
        companyId,
        membershipId,
        now: NOW,
        repository: new DrizzleCurrentDriverTripRepository(database.db),
        scores: new DrizzleDriverScoreRepository(database.db),
      })

      expect(opened).toEqual({
        isRegisteredDriver: false,
        pendingProofs: [],
        score: null,
        trips: [],
      })
    })
  })
})

async function readTripStatus(database: TestDatabase, tripId: string): Promise<string> {
  const [trip] = await database.db.select().from(trips).where(eq(trips.id, tripId))

  return trip?.status ?? 'unknown'
}

async function seedDriverOnly(database: TestDatabase): Promise<{
  readonly companyId: string
  readonly driverId: string
  readonly membershipId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Outra Empresa',
    taxId: '22222222222',
  })

  return { companyId, driverId, membershipId, userId }
}

async function countDispatchSnapshots(database: TestDatabase, companyId: string): Promise<number> {
  const rows = await database.db
    .select({ id: tripDispatchSnapshots.id })
    .from(tripDispatchSnapshots)
    .where(eq(tripDispatchSnapshots.companyId, companyId))

  return rows.length
}

/** A viagem antes da porta: roteiro planejado (ou o status pedido), notas já carregadas. */
async function seedPlannedTrip(
  database: TestDatabase,
  options: { readonly status?: 'draft' | 'route_planned' } = {},
): Promise<World> {
  return seedDispatchedTrip(database, { status: options.status ?? 'route_planned' })
}

/** Viagem já despachada, com duas paradas e três notas carregadas — o estado em que a rua começa. */
async function seedDispatchedTrip(
  database: TestDatabase,
  options: { readonly status?: 'draft' | 'dispatched' | 'route_planned' } = {},
): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopIds = [crypto.randomUUID(), crypto.randomUUID()]

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Campo',
    taxId: '11111111111',
  })
  await database.db
    .insert(trips)
    .values({ companyId, id: tripId, status: options.status ?? 'dispatched', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista de Campo',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values([
    {
      addressKey: '3550308|01001000|100',
      companyId,
      id: stopIds[0] ?? '',
      label: 'Centro, 100',
      sequence: 1n,
      tripId,
    },
    {
      addressKey: '3550308|04538133|200',
      companyId,
      id: stopIds[1] ?? '',
      label: 'Faria Lima, 200',
      sequence: 2n,
      tripId,
    },
  ])

  const documentIds: string[] = []
  for (const [index, stopId] of [stopIds[0], stopIds[0], stopIds[1]].entries()) {
    const nfeDocumentId = await seedNfeDocument(database, {
      companyId,
      suffix: String(index + 1),
      userId,
    })
    const tripDocumentId = crypto.randomUUID()
    await database.db.insert(tripDocuments).values({
      companyId,
      id: tripDocumentId,
      loadedAt: new Date('2026-08-26T08:00:00.000Z'),
      nfeDocumentId,
      separatedAt: new Date('2026-08-26T07:00:00.000Z'),
      separationStatus: 'loaded',
      stopId: stopId ?? '',
      tripId,
    })
    documentIds.push(tripDocumentId)
  }

  return { companyId, documentIds, driverId, membershipId, stopIds, tripId, userId }
}

async function seedNfeDocument(
  database: TestDatabase,
  input: { readonly companyId: string; readonly suffix: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/me-trip-${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-me-trip-${input.suffix}`,
    id: importId,
    idempotencyKey: `me-trip-${input.suffix}`,
    requestFingerprint: `fingerprint-me-trip-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-me-trip-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-08-26T06:00:00.000Z'),
    model: '55',
    number: input.suffix,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })

  const participantId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    id: participantId,
    legalName: `Destinatario ${input.suffix}`,
    role: 'recipient',
  })
  await database.db.insert(nfeAddresses).values({
    city: 'Sao Paulo',
    cityCode: '3550308',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '01001000',
    state: 'SP',
    street: 'Rua da Rua',
  })

  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_057_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
