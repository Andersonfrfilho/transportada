/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a leitura da ocorrência de recebimento — tipo, itens com a descrição da nota, fotos
 * por URL assinada (o mesmo ponto único da spec 161), a tratativa e a marcação de cada nota. Os itens
 * saem numa consulta em lote; as fotos, uma leitura por ocorrência, como a lista da nota na viagem.
 */
import { CARGO_ARRIVAL_RETURN_STATE } from '../../shared/cargo-arrival.constant.js'
import {
  readOccurrenceAttachments,
  type OccurrenceAttachmentDownloadPort,
  type ReadOccurrenceAttachmentsPort,
} from '../../trips/application/occurrence-attachment.service.js'
import { resolveOccurrenceItems } from '../../trips/infrastructure/occurrence-items.support.js'
import type {
  ArrivalScope,
  CargoArrivalOccurrenceReadPort,
} from '../application/cargo-arrival-occurrence.port.js'
import type {
  CargoArrivalOccurrenceView,
  CargoArrivalOccurrencesView,
  ReceivingOccurrenceTypeView,
} from '../application/cargo-arrival-occurrence.types.js'
import {
  arrivalExists,
  selectArrivalOccurrences,
  selectArrivalReturns,
  selectReceivingOccurrenceTypes,
  type ArrivalOccurrenceFilter,
} from './cargo-arrival-occurrence-read.query.js'
import { findStoredOccurrenceReplay } from './cargo-arrival-occurrence-replay.support.js'
import type { Database } from './cargo-arrival-persistence.support.js'

type OccurrenceRow = Awaited<ReturnType<typeof selectArrivalOccurrences>>[number]

export class DrizzleCargoArrivalOccurrenceReadRepository implements CargoArrivalOccurrenceReadPort {
  public constructor(
    private readonly dependencies: {
      readonly attachments: ReadOccurrenceAttachmentsPort
      readonly database: Database
      readonly downloads: OccurrenceAttachmentDownloadPort
    },
  ) {}

  public async findOccurrence(
    scope: ArrivalScope & { readonly occurrenceId: string },
  ): Promise<CargoArrivalOccurrenceView | null> {
    const [occurrence] = await this.readOccurrences({ ...scope, nfeDocumentId: null })
    return occurrence ?? null
  }

  public findReplay(input: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<{ readonly fingerprint: string; readonly occurrenceId: string } | null> {
    return findStoredOccurrenceReplay(this.dependencies.database, input)
  }

  public async listOccurrences(
    scope: ArrivalScope & { readonly nfeDocumentId: string | null },
  ): Promise<CargoArrivalOccurrencesView | null> {
    const { database } = this.dependencies
    if (!(await arrivalExists(database, scope))) return null
    const [documents, occurrences] = await Promise.all([
      selectArrivalReturns(database, scope),
      this.readOccurrences({ ...scope, occurrenceId: null }),
    ])
    const count = (state: string) =>
      documents.filter((document) => document.returnToContractor === state).length
    return {
      documents,
      occurrences,
      returnCounts: {
        marked: count(CARGO_ARRIVAL_RETURN_STATE.marked),
        returned: count(CARGO_ARRIVAL_RETURN_STATE.returned),
      },
    }
  }

  public listReceivingTypes(companyId: string): Promise<readonly ReceivingOccurrenceTypeView[]> {
    return selectReceivingOccurrenceTypes(this.dependencies.database, companyId)
  }

  private async readOccurrences(
    filter: ArrivalOccurrenceFilter,
  ): Promise<readonly CargoArrivalOccurrenceView[]> {
    const { database } = this.dependencies
    const rows = await selectArrivalOccurrences(database, filter)
    const items = await resolveOccurrenceItems(database, {
      companyId: filter.companyId,
      rows: rows.map((row) => ({ ...row, occurrenceId: row.id })),
    })
    return Promise.all(
      rows.map(async (row) => this.toView({ companyId: filter.companyId, items, row })),
    )
  }

  private async toView(input: {
    readonly companyId: string
    readonly items: Awaited<ReturnType<typeof resolveOccurrenceItems>>
    readonly row: OccurrenceRow
  }): Promise<CargoArrivalOccurrenceView> {
    const { row } = input
    return {
      actorName: row.actorName ?? null,
      attachments: await readOccurrenceAttachments({
        companyId: input.companyId,
        downloads: this.dependencies.downloads,
        occurrenceId: row.id,
        repository: this.dependencies.attachments,
      }),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      case:
        row.caseId === null || row.caseStatus === null
          ? null
          : { id: row.caseId, status: row.caseStatus },
      channel: row.channel,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      items: input.items.get(row.id) ?? [],
      nfeDocumentId: row.nfeDocumentId,
      note: row.note,
      occurrenceTypeId: row.occurrenceTypeId,
      typeName: row.typeName,
    }
  }
}
