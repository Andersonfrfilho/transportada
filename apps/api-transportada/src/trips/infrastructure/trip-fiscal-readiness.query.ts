/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { aliasedTable, and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuanceAttempts } from '../../database/cte-issuance.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeAddresses, nfeParticipants } from '../../database/nfe.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import type {
  TripDocumentReadiness,
  TripDocumentReadinessReason,
  TripFiscalReadinessPort,
} from '../application/read-trip-fiscal-readiness.use-case.js'
import {
  resolveFiscalDocumentKind,
  type FiscalDocumentKind,
} from '../domain/fiscal-document-kind.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Manifesto que ainda vale. Depois de cancelado ou rejeitado a viagem pode manifestar de novo. */
const LIVE_MANIFEST_STATUSES = ['draft', 'issuing', 'authorized', 'closed'] as const

/** Os dois papéis que decidem o trajeto: de onde a mercadoria saiu e para onde ela vai. */
const SENDER_ROLE = 'sender'
const RECIPIENT_ROLE = 'recipient'

/** Tentativa que ainda pode virar autorização — nenhuma delas é bloqueio, todas são espera. */
const IN_PROGRESS_ATTEMPT_STATUSES = [
  'pending',
  'in_flight',
  'retry_scheduled',
  'reconciliation_required',
] as const

/** Aliases: a mesma tabela entra duas vezes, uma por papel do participante. */
const recipientParticipant = aliasedTable(nfeParticipants, 'readiness_recipient_participant')
const recipientAddress = aliasedTable(nfeAddresses, 'readiness_recipient_address')
const senderParticipant = aliasedTable(nfeParticipants, 'readiness_sender_participant')
const senderAddress = aliasedTable(nfeAddresses, 'readiness_sender_address')

export class DrizzleTripFiscalReadinessQuery implements TripFiscalReadinessPort {
  public constructor(private readonly database: Database) {}

  /**
   * **Uma consulta para as N notas.** Com 200 notas numa viagem, o `left join` é a diferença entre
   * uma ida ao banco e duzentas — e é por isso que `cte_batch_items (company_id, nfe_document_id)`
   * nasceu nesta spec.
   *
   * A nota é alcançada pelos **dois** caminhos que `trip_documents` permite: o vínculo direto com a
   * NF-e e o vínculo por cálculo de frete, cujo `nfe_document_id` é `not null`. É o mesmo par que
   * `cteAuthorizedExpression()` já usa — construir um segundo caminho seria construí-lo diferente.
   */
  public async readDocumentReadiness(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripDocumentReadiness[] | null> {
    const [trip] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (trip === undefined) return null

    /**
     * Sem o município da empresa não há regra: toda nota ficaria indecisa. Ler uma vez, fora do
     * laço, é o que mantém a promessa de "uma consulta para as N notas".
     */
    const [profile] = await this.database
      .select({ cityIbgeCode: companyFiscalProfiles.cityIbgeCode })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    const companyCityCode = profile?.cityIbgeCode ?? null

    const rows = await this.database
      .select({
        attemptStatus: cteIssuanceAttempts.status,
        cteAccessKey: cteFiscalDocuments.accessKey,
        cteFiscalDocumentId: cteFiscalDocuments.id,
        cteStatus: cteFiscalDocuments.status,
        rejectionCode: cteIssuanceAttempts.lastErrorCode,
        destinationCityCode: recipientAddress.cityCode,
        originCityCode: senderAddress.cityCode,
        rejectionMessage: cteIssuanceAttempts.lastErrorCause,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripDocuments)
      /**
       * O município vem do endereço do participante da **própria nota** — é o trajeto real, não o
       * cadastro do cliente. Os dois `left join` são por papel: quem mandou e quem recebe.
       */
      .leftJoin(
        recipientParticipant,
        and(
          eq(recipientParticipant.companyId, tripDocuments.companyId),
          eq(recipientParticipant.documentId, tripDocuments.nfeDocumentId),
          eq(recipientParticipant.role, RECIPIENT_ROLE),
        ),
      )
      .leftJoin(
        recipientAddress,
        and(
          eq(recipientAddress.companyId, recipientParticipant.companyId),
          eq(recipientAddress.participantId, recipientParticipant.id),
        ),
      )
      .leftJoin(
        senderParticipant,
        and(
          eq(senderParticipant.companyId, tripDocuments.companyId),
          eq(senderParticipant.documentId, tripDocuments.nfeDocumentId),
          eq(senderParticipant.role, SENDER_ROLE),
        ),
      )
      .leftJoin(
        senderAddress,
        and(
          eq(senderAddress.companyId, senderParticipant.companyId),
          eq(senderAddress.participantId, senderParticipant.id),
        ),
      )
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .leftJoin(
        cteBatchItems,
        and(
          eq(cteBatchItems.companyId, tripDocuments.companyId),
          sql`${cteBatchItems.nfeDocumentId} in (${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`,
        ),
      )
      .leftJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
        ),
      )
      .leftJoin(
        cteIssuanceAttempts,
        and(
          eq(cteIssuanceAttempts.companyId, cteBatchItems.companyId),
          eq(cteIssuanceAttempts.batchItemId, cteBatchItems.id),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.tripId, input.tripId),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .orderBy(desc(cteFiscalDocuments.authorizedAt))

    return collapseByDocument({ companyCityCode, rows })
  }

  /**
   * A chave da parada é `${cityCode}|${postalCode}|${number}` (spec 056), então o município é o que
   * vem antes da primeira barra. Contar aqui, no banco, evita trazer 200 paradas para contar três.
   */
  public async countDischargeCities(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<number> {
    const [row] = await this.database
      .select({
        cityCount: sql<number>`count(distinct split_part(${tripStops.addressKey}, '|', 1))::int`,
      })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

    return row?.cityCount ?? 0
  }

  public async hasLiveManifest(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [manifest] = await this.database
      .select({ id: mdfeManifests.id })
      .from(mdfeManifests)
      .where(
        and(
          eq(mdfeManifests.companyId, input.companyId),
          eq(mdfeManifests.tripId, input.tripId),
          inArray(mdfeManifests.status, [...LIVE_MANIFEST_STATUSES]),
        ),
      )
      .limit(1)

    return manifest !== undefined
  }
}

type ReadinessRow = {
  readonly attemptStatus: string | null
  readonly cteAccessKey: string | null
  readonly cteFiscalDocumentId: string | null
  readonly destinationCityCode: string | null
  readonly originCityCode: string | null
  readonly cteStatus: string | null
  readonly rejectionCode: string | null
  readonly rejectionMessage: string | null
  readonly tripDocumentId: string
}

/**
 * Uma nota pode ter várias tentativas e até um CT-e cancelado seguido de outro autorizado. A regra é
 * a do desfecho mais avançado: **autorizado vence tudo**, porque é o único estado que permite
 * manifestar; depois vem cancelado, depois em andamento, e a rejeição só sobra quando não houve
 * nenhum dos outros.
 */
function collapseByDocument(input: {
  readonly companyCityCode: string | null
  readonly rows: readonly ReadinessRow[]
}): readonly TripDocumentReadiness[] {
  const byDocument = new Map<string, TripDocumentReadiness>()

  for (const row of input.rows) {
    const current = byDocument.get(row.tripDocumentId)
    const candidate = toReadiness({ companyCityCode: input.companyCityCode, row })
    if (current === undefined || rankReason(candidate.reason) > rankReason(current.reason)) {
      byDocument.set(row.tripDocumentId, candidate)
    }
  }

  return [...byDocument.values()]
}

/**
 * O desfecho mais avançado vence quando uma nota tem várias tentativas. `nfse_expected` e
 * `city_unknown` ficam no topo porque não são desfecho de tentativa: eles são a classificação, e ela
 * manda sobre qualquer CT-e que por acaso exista — nota urbana com CT-e é divergência, não prontidão.
 */
const REASON_RANK: Readonly<Record<TripDocumentReadinessReason, number>> = {
  no_cte: 0,
  cte_rejected: 1,
  cte_in_progress: 2,
  cte_cancelled: 3,
  ok: 4,
  nfse_expected: 5,
  city_unknown: 6,
}

function rankReason(reason: TripDocumentReadinessReason): number {
  return REASON_RANK[reason]
}

function toReadiness(input: {
  readonly companyCityCode: string | null
  readonly row: ReadinessRow
}): TripDocumentReadiness {
  const { companyCityCode, row } = input
  const expectedDocument = resolveFiscalDocumentKind({
    companyCityCode,
    destinationCityCode: row.destinationCityCode,
    originCityCode: row.originCityCode,
  })
  const reason = toReason({ expectedDocument, row })
  /**
   * O erro da tentativa só é informação quando ele **é** o motivo. Uma nota autorizada depois de um
   * retry carrega o `lastErrorCode` da tentativa que falhou, e mostrá-lo ao lado de "ok" faria o
   * operador procurar problema numa nota resolvida.
   */
  const isRejection = reason === 'cte_rejected'

  return {
    cteAccessKey: reason === 'ok' ? row.cteAccessKey : null,
    cteFiscalDocumentId: reason === 'ok' ? row.cteFiscalDocumentId : null,
    expectedDocument,
    reason,
    rejectionCode: isRejection ? row.rejectionCode : null,
    rejectionMessage: isRejection ? row.rejectionMessage : null,
    tripDocumentId: row.tripDocumentId,
  }
}

function toReason(input: {
  readonly expectedDocument: FiscalDocumentKind | null
  readonly row: ReadinessRow
}): TripDocumentReadinessReason {
  const { expectedDocument, row } = input
  /**
   * A classificação vem **antes** do estado do CT-e, e é decisão: sem município não se decide nada, e
   * entrega urbana não espera CT-e por mais que uma tentativa exista para ela.
   */
  if (expectedDocument === null) return 'city_unknown'
  if (expectedDocument === 'nfse') return 'nfse_expected'

  if (row.cteStatus === 'authorized') return 'ok'
  if (row.cteStatus === 'cancelled') return 'cte_cancelled'
  if (row.attemptStatus === 'rejected' || row.attemptStatus === 'failed') return 'cte_rejected'
  if (
    row.attemptStatus !== null &&
    (IN_PROGRESS_ATTEMPT_STATUSES as readonly string[]).includes(row.attemptStatus)
  ) {
    return 'cte_in_progress'
  }

  return 'no_cte'
}
