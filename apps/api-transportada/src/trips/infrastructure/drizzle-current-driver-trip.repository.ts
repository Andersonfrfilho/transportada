/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { nfeDocuments, nfeParticipants, nfeVolumes } from '../../database/nfe.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import { tripStopSchedules } from '../../database/delivery-client.schema.js'
import { mdfeFiscalDocuments, mdfeManifests } from '../../database/mdfe.schema.js'
import type {
  CurrentDriverTripPort,
  DriverStopSchedule,
  DriverTrip,
  DriverTripManifest,
  DriverTripDocument,
  DriverTripStop,
} from '../application/find-current-driver-trip.use-case.js'
import {
  resolveProofSettingsForRecipient,
  type ProofSettingsLookup,
} from '../domain/delivery-proof-settings.policy.js'
import type { TripDatabase } from './trip-queryable.type.js'

/**
 * As fases em que a viagem aparece na tela do motorista. `route_planned` entrou com a ADR-0058: é
 * onde mora o "Iniciar trajeto" — sem vê-la, o motorista não teria o que despachar.
 */
const ACTIVE_TRIP_STATUSES = ['route_planned', 'dispatched', 'in_transit'] as const

/** A nota do destinatário é o que o motorista entrega; a do emitente não lhe diz nada. */
const RECIPIENT_ROLE = 'recipient'

/** Encerrado ainda se apresenta; cancelado, não. Mesma regra da consulta do documento. */
const PRINTABLE_DOCUMENT_STATUSES = ['authorized', 'closed'] as const

export class DrizzleCurrentDriverTripRepository implements CurrentDriverTripPort {
  public constructor(private readonly database: TripDatabase) {}

  public async findDriverIdByMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ id: fleetDrivers.id })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          eq(fleetDrivers.membershipId, input.membershipId),
        ),
      )
      .limit(1)

    return record?.id ?? null
  }

  /** ADR-0058: o recorte da rota de despacho do motorista é o vínculo, e ele se prova aqui. */
  public async isTripOfDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [record] = await this.database
      .select({ tripId: tripDrivers.tripId })
      .from(tripDrivers)
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          eq(tripDrivers.tripId, input.tripId),
        ),
      )
      .limit(1)

    return record !== undefined
  }

  public async listActiveTrips(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly DriverTrip[]> {
    const tripRows = await this.database
      .select({ id: trips.id, plate: fleetVehicles.plate, status: trips.status })
      .from(tripDrivers)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDrivers.companyId), eq(trips.id, tripDrivers.tripId)),
      )
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
        ),
      )
      .orderBy(asc(trips.createdAt))

    if (tripRows.length === 0) return []

    const tripIds = tripRows.map((row) => row.id)
    const [stopRows, documentRows, manifestsByTrip, schedulesByStop, proofSettings] =
      await Promise.all([
        this.listStops({ companyId: input.companyId, tripIds }),
        this.listDocuments({ companyId: input.companyId, tripIds }),
        this.listManifests({ companyId: input.companyId, tripIds }),
        this.listSchedules({ companyId: input.companyId, tripIds }),
        this.readProofSettings({ companyId: input.companyId }),
      ])

    /**
     * Volume é 1..N por nota: somar no banco, numa consulta só, evita trazer cem linhas para contar
     * três. Nota sem volume importado é caso normal — a NF-e é dado de terceiro, e nós não a
     * preenchemos.
     */
    const volumesByDocument = await this.sumVolumes({
      companyId: input.companyId,
      nfeDocumentIds: documentRows
        .map((row) => row.nfeDocumentId)
        .filter((documentId): documentId is string => documentId !== null),
    })
    const documentsByStop = groupBy(
      documentRows.map((row) => ({
        ...row,
        volumes: volumesByDocument.get(row.nfeDocumentId ?? '') ?? null,
      })),
      (row) => row.stopId,
    )
    const stopsByTrip = groupBy(stopRows, (row) => row.tripId)

    return tripRows.map((trip) => ({
      id: trip.id,
      manifest: manifestsByTrip.get(trip.id) ?? null,
      status: trip.status,
      stops: (stopsByTrip.get(trip.id) ?? []).map((stop) =>
        toDriverStop(stop, documentsByStop, schedulesByStop, proofSettings),
      ),
      vehiclePlate: trip.plate,
    }))
  }

  /**
   * Uma consulta para as viagens todas, não uma por viagem: o motorista costuma levar uma, mas o
   * agregado leva três, e um `await` por viagem seria N+1 no caminho que abre a tela dele.
   *
   * Manifesto **cancelado não conta**: o índice único deixa um vivo por viagem, e imprimir o
   * cancelado seria apresentar na barreira um documento que a SEFAZ já derrubou.
   */
  private async listManifests(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<Map<string, DriverTripManifest>> {
    const rows = await this.database
      .select({
        accessKey: mdfeFiscalDocuments.accessKey,
        authorizedAt: mdfeFiscalDocuments.authorizedAt,
        manifestId: mdfeManifests.id,
        protocol: mdfeFiscalDocuments.authorizationProtocol,
        tripId: mdfeManifests.tripId,
      })
      .from(mdfeManifests)
      .innerJoin(
        mdfeFiscalDocuments,
        and(
          eq(mdfeFiscalDocuments.companyId, mdfeManifests.companyId),
          eq(mdfeFiscalDocuments.manifestId, mdfeManifests.id),
          inArray(mdfeFiscalDocuments.status, [...PRINTABLE_DOCUMENT_STATUSES]),
          isNull(mdfeFiscalDocuments.cancellationRequestedAt),
        ),
      )
      .where(
        and(
          eq(mdfeManifests.companyId, input.companyId),
          inArray(mdfeManifests.tripId, [...input.tripIds]),
        ),
      )

    return new Map(
      rows.flatMap((row) =>
        row.tripId === null
          ? []
          : [
              [
                row.tripId,
                {
                  accessKey: row.accessKey,
                  authorizedAt: row.authorizedAt?.toISOString() ?? null,
                  id: row.manifestId,
                  protocol: row.protocol,
                },
              ] as const,
            ],
      ),
    )
  }

  /**
   * Spec 060 D3: a hora marcada e o protocolo da parada. Uma consulta para a viagem inteira, pelo
   * mesmo motivo do manifesto — o agregado leva três viagens, e uma consulta por parada seria N+1 no
   * caminho que abre a tela dele em 3G.
   */
  private async listSchedules(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<Map<string, DriverStopSchedule>> {
    const rows = await this.database
      .select({
        protocol: tripStopSchedules.protocol,
        scheduledAt: tripStopSchedules.scheduledAt,
        status: tripStopSchedules.status,
        stopId: tripStopSchedules.stopId,
      })
      .from(tripStopSchedules)
      .where(
        and(
          eq(tripStopSchedules.companyId, input.companyId),
          inArray(tripStopSchedules.tripId, [...input.tripIds]),
        ),
      )

    return new Map(
      rows.map((row) => [
        row.stopId,
        {
          protocol: row.protocol,
          scheduledAt: row.scheduledAt?.toISOString() ?? null,
          status: row.status,
        },
      ]),
    )
  }

  private async sumVolumes(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  }): Promise<Map<string, VolumeTotals>> {
    if (input.nfeDocumentIds.length === 0) return new Map()

    const rows = await this.database
      .select({
        documentId: nfeVolumes.documentId,
        grossWeight: sql<string>`coalesce(sum(${nfeVolumes.grossWeight}), 0)::text`,
        quantity: sql<string>`coalesce(sum(${nfeVolumes.quantity}), 0)::text`,
      })
      .from(nfeVolumes)
      .where(
        and(
          eq(nfeVolumes.companyId, input.companyId),
          inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
        ),
      )
      .groupBy(nfeVolumes.documentId)

    return new Map(
      rows.map((row) => [row.documentId, { grossWeight: row.grossWeight, quantity: row.quantity }]),
    )
  }

  /**
   * ADR-0057 §2: os campos do comprovante viajam **resolvidos** no snapshot. Uma consulta para a
   * geral e uma para as exceções da empresa inteira — o app não ganha rota de settings.
   */
  private async readProofSettings(input: {
    readonly companyId: string
  }): Promise<ProofSettingsLookup> {
    const [generalRows, overrideRows] = await Promise.all([
      this.database
        .select({
          photo: companyDeliveryProofSettings.photo,
          receiverDocument: companyDeliveryProofSettings.receiverDocument,
          receiverName: companyDeliveryProofSettings.receiverName,
          signature: companyDeliveryProofSettings.signature,
        })
        .from(companyDeliveryProofSettings)
        .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
        .limit(1),
      this.database
        .select({
          photo: deliveryProofSettingOverrides.photo,
          receiverDocument: deliveryProofSettingOverrides.receiverDocument,
          receiverName: deliveryProofSettingOverrides.receiverName,
          signature: deliveryProofSettingOverrides.signature,
          taxId: deliveryProofSettingOverrides.taxId,
        })
        .from(deliveryProofSettingOverrides)
        .where(eq(deliveryProofSettingOverrides.companyId, input.companyId)),
    ])

    return {
      general: generalRows[0] ?? null,
      overridesByTaxId: new Map(
        overrideRows.map((row) => [
          row.taxId,
          {
            photo: row.photo,
            receiverDocument: row.receiverDocument,
            receiverName: row.receiverName,
            signature: row.signature,
          },
        ]),
      ),
    }
  }

  private async listStops(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return this.database
      .select({
        arrivedAt: tripStops.arrivedAt,
        completedAt: tripStops.completedAt,
        deliveryWindowEnd: tripStops.deliveryWindowEnd,
        deliveryWindowStart: tripStops.deliveryWindowStart,
        id: tripStops.id,
        label: tripStops.label,
        latitude: tripStops.latitude,
        longitude: tripStops.longitude,
        sequence: tripStops.sequence,
        tripId: tripStops.tripId,
      })
      .from(tripStops)
      .where(
        and(eq(tripStops.companyId, input.companyId), inArray(tripStops.tripId, input.tripIds)),
      )
      .orderBy(asc(tripStops.sequence))
  }

  /**
   * Nota liberada do romaneio saiu da viagem — mostrá-la ao motorista seria pedir a entrega de algo
   * que o escritório já tirou dali. O nome do destinatário entra por `left join` porque nota sem
   * participante é importação incompleta, não motivo para a parada sumir da tela.
   */
  private async listDocuments(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return (
      this.database
        .select({
          accessKey: nfeDocuments.accessKey,
          deliveredAt: tripDocuments.deliveredAt,
          id: tripDocuments.id,
          nfeDocumentId: tripDocuments.nfeDocumentId,
          number: nfeDocuments.number,
          recipientName: nfeParticipants.legalName,
          recipientTaxId: nfeParticipants.taxId,
          returnReason: tripDocuments.returnReason,
          separationStatus: tripDocuments.separationStatus,
          series: nfeDocuments.series,
          stopId: tripDocuments.stopId,
          totalAmount: nfeDocuments.totalValue,
        })
        .from(tripDocuments)
        .leftJoin(
          nfeDocuments,
          and(
            eq(nfeDocuments.companyId, tripDocuments.companyId),
            eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
          ),
        )
        .leftJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.companyId, tripDocuments.companyId),
            eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
            eq(nfeParticipants.role, RECIPIENT_ROLE),
          ),
        )
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            inArray(tripDocuments.tripId, input.tripIds),
            isNull(tripDocuments.releasedAt),
          ),
        )
        /**
         * A ordem é a do vínculo, que é a ordem em que a carga foi separada — e ela precisa ser
         * estável: romaneio cuja lista embaralha entre uma abertura e outra é romaneio que o
         * conferente não consegue checar. Sem `order by` explícito, quem decide é o plano do banco.
         */
        .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
    )
  }
}

type StopRow = {
  readonly arrivedAt: Date | null
  readonly completedAt: Date | null
  readonly deliveryWindowEnd: Date | null
  readonly deliveryWindowStart: Date | null
  readonly id: string
  readonly label: string
  readonly latitude: string | null
  readonly longitude: string | null
  readonly sequence: bigint
  readonly tripId: string
}

type VolumeTotals = { readonly grossWeight: string; readonly quantity: string }

type DocumentRow = {
  readonly accessKey: string | null
  readonly deliveredAt: Date | null
  readonly id: string
  readonly number: string | null
  readonly recipientName: string | null
  readonly recipientTaxId: string | null
  readonly returnReason: string | null
  readonly separationStatus: string
  readonly series: string | null
  readonly stopId: string | null
  readonly totalAmount: string | null
  readonly volumes: VolumeTotals | null
}

function toDriverStop(
  stop: StopRow,
  documentsByStop: Map<string | null, DocumentRow[]>,
  schedulesByStop: Map<string, DriverStopSchedule>,
  proofSettings: ProofSettingsLookup,
): DriverTripStop {
  return {
    arrivedAt: stop.arrivedAt?.toISOString() ?? null,
    completedAt: stop.completedAt?.toISOString() ?? null,
    deliveryWindowEnd: stop.deliveryWindowEnd?.toISOString() ?? null,
    deliveryWindowStart: stop.deliveryWindowStart?.toISOString() ?? null,
    documents: (documentsByStop.get(stop.id) ?? []).map((row) =>
      toDriverDocument(row, proofSettings),
    ),
    id: stop.id,
    label: stop.label,
    latitude: stop.latitude,
    longitude: stop.longitude,
    schedule: schedulesByStop.get(stop.id) ?? null,
    sequence: Number(stop.sequence),
  }
}

/**
 * Toda ausência vira vazio, nunca `undefined`: a NF-e é dado de terceiro, e a tela do motorista não
 * pode quebrar porque o emitente não mandou o peso do volume.
 */
function toDriverDocument(
  row: DocumentRow,
  proofSettings: ProofSettingsLookup,
): DriverTripDocument {
  return {
    accessKey: row.accessKey ?? '',
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    // Spec 082 (revisão): resolvido pelo CNPJ do destinatário DESTE documento — a mesma regra da
    // escrita do comprovante, via `resolveProofSettingsForRecipient`.
    deliveryProof: resolveProofSettingsForRecipient({
      lookup: proofSettings,
      recipientTaxId: row.recipientTaxId ?? '',
    }),
    grossWeight: row.volumes?.grossWeight ?? '0',
    id: row.id,
    number: row.number ?? '',
    recipientName: row.recipientName ?? '',
    returnReason: row.returnReason,
    separationStatus: row.separationStatus,
    series: row.series ?? '',
    totalAmount: row.totalAmount ?? '0',
    volumeCount: row.volumes?.quantity ?? '0',
  }
}

function groupBy<TRow, TKey>(rows: readonly TRow[], key: (row: TRow) => TKey): Map<TKey, TRow[]> {
  const grouped = new Map<TKey, TRow[]>()
  for (const row of rows) {
    const bucket = grouped.get(key(row)) ?? []
    bucket.push(row)
    grouped.set(key(row), bucket)
  }

  return grouped
}
