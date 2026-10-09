/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12): o que o aviso de feriado do motorista lê das paradas dele — a ETA, a chave do
 * endereço (cuja cidade é a da parada) e o endereço de destino físico da nota, de onde sai o nome da cidade.
 * UMA consulta para todas as paradas pedidas (a junção traz os dois papéis de destino e a escolha é a da
 * spec 073, em memória). Quem decide quais paradas são do motorista é o caso de uso: aqui só se recebe ids.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { nfeAddresses, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops } from '../../database/trip.schema.js'
import { destinationRolesFilter } from '../../nfe-documents/infrastructure/physical-destination.join.js'
import type {
  DriverStopHolidayAddress,
  DriverStopHolidayContext,
  DriverStopHolidayContextPort,
} from '../application/driver-stop-holiday-warning.port.js'
import {
  chooseNfeDestinationRow,
  type NfeDestinationRow,
} from '../domain/nfe-destination-choice.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

type StopAccumulator = {
  readonly addressKey: string
  readonly documents: Map<string, NfeDestinationRow[]>
  readonly estimatedArrivalAt: Date | null
}

type ContextRow = {
  readonly addressKey: string
  readonly city: string | null
  readonly cityCode: string | null
  readonly estimatedArrivalAt: Date | null
  readonly number: string | null
  readonly postalCode: string | null
  readonly role: string | null
  readonly state: string | null
  readonly stopId: string
  readonly street: string | null
  readonly tripDocumentId: string | null
}

/** A escolha da spec 073 sobre as linhas de cada nota; vale a primeira nota da parada que tem endereço. */
function chooseAddress(
  documents: ReadonlyMap<string, readonly NfeDestinationRow[]>,
): DriverStopHolidayAddress | undefined {
  for (const rows of documents.values()) {
    const chosen = chooseNfeDestinationRow(rows)
    if (chosen !== null) return { city: chosen.city, cityCode: chosen.components.cityCode }
  }
  return undefined
}

function groupByStop(rows: readonly ContextRow[]): ReadonlyMap<string, StopAccumulator> {
  const stops = new Map<string, StopAccumulator>()
  for (const row of rows) {
    const stop = stops.get(row.stopId) ?? {
      addressKey: row.addressKey,
      documents: new Map<string, NfeDestinationRow[]>(),
      estimatedArrivalAt: row.estimatedArrivalAt,
    }
    stops.set(row.stopId, stop)
    if (row.tripDocumentId === null || row.role === null) continue

    const candidates = stop.documents.get(row.tripDocumentId) ?? []
    candidates.push({ ...row, role: row.role })
    stop.documents.set(row.tripDocumentId, candidates)
  }
  return stops
}

export class DrizzleDriverStopHolidayContextRepository implements DriverStopHolidayContextPort {
  public constructor(private readonly database: TripQueryable) {}

  public async list(input: {
    readonly companyId: string
    readonly stopIds: readonly string[]
  }): Promise<readonly DriverStopHolidayContext[]> {
    if (input.stopIds.length === 0) return []

    const rows = await this.readRows(input)
    return [...groupByStop(rows)].map(([stopId, stop]) => ({
      address: chooseAddress(stop.documents),
      addressKey: stop.addressKey,
      estimatedArrivalAt: stop.estimatedArrivalAt,
      stopId,
    }))
  }

  /** Com ou sem ETA (a em andamento avisa sem ela); quem decide é o serviço. A ordem das notas é a do vínculo, estável como a do romaneio do motorista. */
  private readRows(input: {
    readonly companyId: string
    readonly stopIds: readonly string[]
  }): Promise<readonly ContextRow[]> {
    return this.database
      .select({
        addressKey: tripStops.addressKey,
        city: nfeAddresses.city,
        cityCode: nfeAddresses.cityCode,
        estimatedArrivalAt: tripStops.estimatedArrivalAt,
        number: nfeAddresses.number,
        postalCode: nfeAddresses.postalCode,
        role: nfeParticipants.role,
        state: nfeAddresses.state,
        stopId: tripStops.id,
        street: nfeAddresses.street,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripStops)
      .leftJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripStops.companyId),
          eq(tripDocuments.stopId, tripStops.id),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .leftJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          destinationRolesFilter(nfeParticipants.role),
        ),
      )
      .leftJoin(
        nfeAddresses,
        and(
          eq(nfeAddresses.companyId, nfeParticipants.companyId),
          eq(nfeAddresses.participantId, nfeParticipants.id),
        ),
      )
      .where(
        and(eq(tripStops.companyId, input.companyId), inArray(tripStops.id, [...input.stopIds])),
      )
      .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
  }
}
