/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuanceAttempts } from '../../database/cte-issuance.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import type {
  TripDocumentReadiness,
  TripDocumentReadinessReason,
  TripFiscalReadinessPort,
} from '../application/read-trip-fiscal-readiness.use-case.js'
import type { DocumentOutputClassification } from '../../cte-profiles/domain/document-output.policy.js'
import type { NfeDocumentOutputClassifierPort } from '../../nfe-documents/application/nfe-document.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Manifesto que ainda vale. Depois de cancelado ou rejeitado a viagem pode manifestar de novo. */
const LIVE_MANIFEST_STATUSES = ['draft', 'issuing', 'authorized', 'closed'] as const

/** Tentativa que ainda pode virar autorização — nenhuma delas é bloqueio, todas são espera. */
const IN_PROGRESS_ATTEMPT_STATUSES = [
  'pending',
  'in_flight',
  'retry_scheduled',
  'reconciliation_required',
] as const

export class DrizzleTripFiscalReadinessQuery implements TripFiscalReadinessPort {
  public constructor(
    private readonly database: Database,
    private readonly classifier: NfeDocumentOutputClassifierPort,
  ) {}

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

    const rows = await this.database
      .select({
        attemptStatus: cteIssuanceAttempts.status,
        cteAccessKey: cteFiscalDocuments.accessKey,
        cteFiscalDocumentId: cteFiscalDocuments.id,
        cteStatus: cteFiscalDocuments.status,
        rejectionCode: cteIssuanceAttempts.lastErrorCode,
        nfeDocumentId: tripDocuments.nfeDocumentId,
        /** Os dois caminhos de vínculo colapsados: é esta nota que o perfil de emissão classifica. */
        classifiedNfeDocumentId: sql<
          string | null
        >`coalesce(${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`,
        rejectionMessage: cteIssuanceAttempts.lastErrorCause,
        tripDocumentId: tripDocuments.id,
      })
      .from(tripDocuments)
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

    /**
     * Uma chamada para as N notas, pela mesma razão que a consulta acima é uma só. A classificação
     * é a da tela de notas: uma segunda conta aqui faria as duas telas discordarem da mesma nota.
     */
    const classified = await this.classifier.classifyDocumentOutputs({
      companyId: input.companyId,
      documentIds: [
        ...new Set(
          rows.map((row) => row.classifiedNfeDocumentId).filter((id): id is string => id !== null),
        ),
      ],
    })

    return collapseByDocument({ classified, rows })
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

  /**
   * O `UPDATE` filtra o tenant por construção. Voltar a `null` limpa a trilha junto — sobrescrita
   * revogada não deixa autor pendurado, e o CHECK da tabela recusaria o par incoerente de qualquer
   * jeito.
   */
  public async saveRequirement(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly reason: null | string
    readonly requiresMdfe: boolean | null
    readonly tripId: string
  }): Promise<void> {
    const isOverridden = input.requiresMdfe !== null
    await this.database
      .update(trips)
      .set({
        requiresMdfe: input.requiresMdfe,
        requiresMdfeActorUserId: isOverridden ? input.actorUserId : null,
        requiresMdfeReason: input.reason,
        requiresMdfeSetAt: isOverridden ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  }
}

type ReadinessRow = {
  readonly attemptStatus: string | null
  readonly classifiedNfeDocumentId: string | null
  readonly cteAccessKey: string | null
  readonly cteFiscalDocumentId: string | null
  readonly nfeDocumentId: string | null
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
  readonly classified: ReadonlyMap<string, DocumentOutputClassification>
  readonly rows: readonly ReadinessRow[]
}): readonly TripDocumentReadiness[] {
  const byDocument = new Map<string, TripDocumentReadiness>()

  for (const row of input.rows) {
    const current = byDocument.get(row.tripDocumentId)
    const candidate = toReadiness({ classified: input.classified, row })
    if (current === undefined || rankReason(candidate.reason) > rankReason(current.reason)) {
      byDocument.set(row.tripDocumentId, candidate)
    }
  }

  return [...byDocument.values()]
}

/**
 * O desfecho mais avançado vence quando uma nota tem várias tentativas. Os motivos de classificação
 * ficam no topo porque não são desfecho de tentativa: eles **são** a classificação, e ela manda
 * sobre qualquer CT-e que por acaso exista — nota de NFS-e com CT-e é divergência, não prontidão.
 */
const REASON_RANK: Readonly<Record<TripDocumentReadinessReason, number>> = {
  no_cte: 0,
  cte_rejected: 1,
  cte_in_progress: 2,
  cte_cancelled: 3,
  ok: 4,
  nfse_expected: 5,
  blocked: 6,
  no_profile: 7,
  city_unknown: 8,
}

function rankReason(reason: TripDocumentReadinessReason): number {
  return REASON_RANK[reason]
}

export type DocumentClassificationRead = {
  readonly expectedDocument: TripDocumentReadiness['expectedDocument']
  readonly nfseProfileId: string | null
}

/**
 * O veredito do perfil de emissão chega inteiro à viagem. Achatar `blocked` e `no_profile` em
 * "sem CT-e" ofereceria ao operador uma emissão que terminaria em erro.
 */
export function readDocumentClassification(
  classification: DocumentOutputClassification | undefined,
): DocumentClassificationRead {
  if (classification === undefined) return { expectedDocument: 'no_profile', nfseProfileId: null }
  if (classification.output === 'nfse') {
    return { expectedDocument: 'nfse', nfseProfileId: classification.nfseProfileId }
  }

  return { expectedDocument: classification.output, nfseProfileId: null }
}

function toReadiness(input: {
  readonly classified: ReadonlyMap<string, DocumentOutputClassification>
  readonly row: ReadinessRow
}): TripDocumentReadiness {
  const { classified, row } = input
  const { expectedDocument, nfseProfileId } = readDocumentClassification(
    row.classifiedNfeDocumentId === null ? undefined : classified.get(row.classifiedNfeDocumentId),
  )
  const reason = readDocumentReason({ expectedDocument, row })
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
    /**
     * O mesmo id que a classificação usou, e não só o vínculo direto: a nota que chega pelo cálculo
     * de frete era classificada como NFS-e e viajava com `nfeDocumentId` nulo, e a tela tinha de
     * inventar um id para oferecer a emissão.
     */
    nfeDocumentId: row.classifiedNfeDocumentId,
    nfseProfileId,
    reason,
    rejectionCode: isRejection ? row.rejectionCode : null,
    rejectionMessage: isRejection ? row.rejectionMessage : null,
    tripDocumentId: row.tripDocumentId,
  }
}

export function readDocumentReason(input: {
  readonly expectedDocument: TripDocumentReadiness['expectedDocument']
  readonly row: Pick<ReadinessRow, 'attemptStatus' | 'cteStatus'>
}): TripDocumentReadinessReason {
  const { expectedDocument, row } = input
  /**
   * A classificação vem **antes** do estado do CT-e, e é decisão: sem perfil não se decide nada, e a
   * nota que vai para NFS-e não espera CT-e por mais que uma tentativa exista para ela.
   */
  if (expectedDocument === 'no_profile') return 'no_profile'
  if (expectedDocument === 'blocked') return 'blocked'
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
