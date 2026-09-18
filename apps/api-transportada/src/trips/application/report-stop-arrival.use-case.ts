/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveEtaShiftMilliseconds } from '../domain/eta-anchor.policy.js'
import {
  assertInformedTimeWithinWindow,
  FIELD_INFORMED_TIME,
} from '../domain/field-delivery-timing.policy.js'
import { TripStopNotReachableError } from '../domain/trip.error.js'
import type {
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  DriverStopReference,
  ReportedLocation,
} from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
} from './field-trip-target.types.js'
import { withFieldReport } from './trip-field-report.port.js'

const ARRIVE_OPERATION = 'stop.arrive'
const DISPATCHED_STATUS = 'dispatched'

export type ReportStopArrivalInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  /** Quando a chegada aconteceu. O motorista manda agora; o escritório, a hora informada (A1). */
  readonly now: Date
  /** ADR-0067 §3: quando o registro foi gravado. Ausente cai em `now` — é o caso do motorista. */
  readonly recordedAt?: Date
  readonly stopId: string
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type ReportStopArrivalResult = { readonly id: string }

/**
 * Spec 057, P1 "cheguei": um toque grava `arrived_at`, carimba a coordenada **se houver**, e leva a
 * viagem de `dispatched` a `in_transit`.
 *
 * `location` nulo é caso normal, não degradado (ADR-0045 §3.1): GPS desligado, sem sinal no galpão
 * ou permissão negada confirmam a chegada do mesmo jeito.
 */
export async function reportStopArrival(
  input: ReportStopArrivalInput,
): Promise<ReportStopArrivalResult> {
  const authorship = deriveFieldAuthorship(input)
  const isOffice = input.target !== undefined

  return input.unitOfWork.execute(async (transaction) =>
    withFieldReport(
      {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: ARRIVE_OPERATION,
        transaction,
      },
      async () => {
        const stop = await transaction.findStopForDriver({
          companyId: input.companyId,
          stopId: input.stopId,
          target: toFieldTripTarget(input),
        })
        if (stop === null) throw new TripStopNotReachableError()

        if (isOffice) await assertArrivalWithinWindow({ input, stop, transaction })

        // Chegar de novo na mesma parada não reescreve a hora: a primeira é a que aconteceu.
        if (stop.arrivedAt === null) {
          await transaction.markStopArrived({
            at: input.now,
            companyId: input.companyId,
            stopId: input.stopId,
          })
          /**
           * Spec 156 T15 A1: a baixa retroativa do escritório não é chegada ao vivo — deslocar as
           * paradas pendentes pela diferença entre o plano e a hora digitada dias depois inventaria
           * um atraso que ninguém viveu.
           */
          if (!isOffice) await shiftPendingStopsByDelay({ input, stop, transaction })
        }
        if (stop.tripStatus === DISPATCHED_STATUS) {
          await transaction.markTripInTransit({
            actorUserId: input.actorUserId,
            at: input.now,
            authorship,
            companyId: input.companyId,
            tripId: stop.tripId,
          })
        }

        return transaction.recordEvent({
          actorUserId: input.actorUserId,
          authorship,
          companyId: input.companyId,
          documentId: null,
          kind: 'arrived',
          location: input.location,
          ...(isOffice
            ? { occurredAt: input.now, recordedAt: input.recordedAt ?? new Date() }
            : {}),
          stopId: input.stopId,
        })
      },
      (eventId) => transaction.findEventById({ companyId: input.companyId, eventId }),
    ),
  )
}

type ArrivalStepParams = {
  readonly input: ReportStopArrivalInput
  readonly stop: DriverStopReference
  readonly transaction: DriverFieldReportTransactionPort
}

/** ADR-0067 §3, spec 156 T15 A1: a mesma janela de "Entregue em", com os códigos da chegada. */
async function assertArrivalWithinWindow(params: ArrivalStepParams): Promise<void> {
  assertInformedTimeWithinWindow({
    informedAt: params.input.now,
    kind: FIELD_INFORMED_TIME.arrived,
    now: params.input.recordedAt ?? new Date(),
    windowStart: await params.transaction.findInformedTimeWindowStart({
      companyId: params.input.companyId,
      tripId: params.stop.tripId,
    }),
  })
}

/**
 * Spec 109 D3: **a entrega que demorou empurra o resto do dia.** O atraso é medido contra o que o
 * plano dizia para esta parada, e as paradas que ainda não aconteceram andam junto.
 *
 * ⚠️ Chamada só dentro do `arrivedAt === null`, e é o que impede o deslocamento duplo: o segundo
 * "cheguei" da mesma parada não é chegada nova, é a rede do armazém tentando de novo.
 */
async function shiftPendingStopsByDelay(params: ArrivalStepParams): Promise<void> {
  const shiftMilliseconds = resolveEtaShiftMilliseconds({
    plannedAt: params.stop.estimatedArrivalAt,
    reportedAt: params.input.now,
  })
  if (shiftMilliseconds === 0) return

  await params.transaction.shiftPendingStops({
    at: params.input.now,
    companyId: params.input.companyId,
    shiftMilliseconds,
    tripId: params.stop.tripId,
  })
}
