/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10-RF12: o PDF de canhotos reaproveita o filtro e o escopo do relatório. O teto recusa
 * antes de ler uma imagem, contando notas e depois blocos (a reentrega gera um por canhoto); as
 * consultas são uma por tabela, e as imagens só são lidas quando o gateway as desenha, uma de cada vez.
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import type { ArchiveObjectStreamGateway } from '../../shared/archive-stream.service.js'
import {
  TRIP_PROOF_REPORT_FILENAME_PREFIX,
  TRIP_PROOF_REPORT_TEXT,
} from '../domain/trip-proof-report.constant.js'
import type {
  ExportTripProofPdfParams,
  ExportTripProofPdfResult,
  TripProofBlock,
  TripProofImage,
} from '../domain/trip-proof-report.types.js'
import { TRIP_PROOF_REPORT_MAX_DOCUMENTS } from '../domain/trip-report.constant.js'
import type { TripReportRow } from '../domain/trip-report.types.js'
import { TripProofReportTooLargeError } from '../domain/trip.error.js'
import { toReportRow } from './list-trip-report.use-case.js'
import type {
  TripProofPdfRenderer,
  TripProofRecord,
  TripProofReportPort,
} from './trip-proof-report.port.js'
import type { TripReportPort, TripReportRecord } from './trip-report.port.js'

const ISO_DATE_LENGTH = 10

type ReportEntry = { readonly row: TripReportRow; readonly tripDocumentId: string }

export function createExportTripProofPdfUseCase(dependencies: {
  readonly clock: () => Date
  readonly proofRepository: TripProofReportPort
  readonly renderer: TripProofPdfRenderer
  readonly reportRepository: TripReportPort
  readonly storage: ArchiveObjectStreamGateway
}): (params: ExportTripProofPdfParams) => Promise<ExportTripProofPdfResult> {
  const { clock, proofRepository, renderer, reportRepository, storage } = dependencies

  async function readEntries(params: ExportTripProofPdfParams): Promise<readonly ReportEntry[]> {
    const { companyId, filters } = params
    const total = await reportRepository.countRows({ companyId, filters })
    if (total > TRIP_PROOF_REPORT_MAX_DOCUMENTS) throw new TripProofReportTooLargeError()

    const records = await reportRepository.listRows({
      companyId,
      query: { cursor: undefined, filters, limit: TRIP_PROOF_REPORT_MAX_DOCUMENTS },
    })
    const statusesByTrip = await reportRepository.listDocumentStatusesByTrip({
      companyId,
      tripIds: [...new Set(records.map((record) => record.tripId))],
    })
    return records.flatMap((record) =>
      toEntry({ canReadFinancials: params.canReadFinancials, record, statusesByTrip }),
    )
  }

  function toBlocks(
    entries: readonly ReportEntry[],
    proofs: readonly TripProofRecord[],
  ): readonly TripProofBlock[] {
    const proofsByDocument = Map.groupBy(proofs, (proof) => proof.tripDocumentId)
    return entries.flatMap((entry): readonly TripProofBlock[] => {
      const documentProofs = proofsByDocument.get(entry.tripDocumentId) ?? []
      if (documentProofs.length === 0) {
        return [{ image: undefined, proofIndex: 1, proofTotal: 1, row: entry.row }]
      }
      return documentProofs.map((proof, index) => ({
        image: toImage(proof),
        proofIndex: index + 1,
        proofTotal: documentProofs.length,
        row: entry.row,
      }))
    })
  }

  function toImage(proof: TripProofRecord): TripProofImage {
    return {
      mimeType: proof.mimeType,
      read: async () => {
        const stream = await storage.getObjectStream({
          bucket: proof.bucket,
          key: proof.objectKey,
        })
        return new Uint8Array(await new Response(stream).arrayBuffer())
      },
    }
  }

  return async (params) => {
    const entries = await readEntries(params)
    const [proofs, letterhead, exporterName] = await Promise.all([
      proofRepository.listPhotoProofs({
        companyId: params.companyId,
        tripDocumentIds: entries.map((entry) => entry.tripDocumentId),
      }),
      proofRepository.findLetterhead({ companyId: params.companyId }),
      proofRepository.findExporterName({ userId: params.exportedByUserId }).catch(() => undefined),
    ])
    const blocks = toBlocks(entries, proofs)
    if (blocks.length > TRIP_PROOF_REPORT_MAX_DOCUMENTS) throw new TripProofReportTooLargeError()
    const generatedAt = clock()
    const stream = await renderer.render({
      blocks,
      exportedBy: exporterName ?? TRIP_PROOF_REPORT_TEXT.unknownExporter,
      generatedAt,
      letterhead,
    })
    const datePart = generatedAt.toISOString().slice(0, ISO_DATE_LENGTH).replaceAll('-', '')
    return { filename: `${TRIP_PROOF_REPORT_FILENAME_PREFIX}-${datePart}.pdf`, stream }
  }
}

function toEntry(input: {
  readonly canReadFinancials: boolean
  readonly record: TripReportRecord
  readonly statusesByTrip: ReadonlyMap<string, readonly TripDocumentSeparationStatus[]>
}): readonly ReportEntry[] {
  const row = toReportRow({
    canReadFinancials: input.canReadFinancials,
    documentStatuses: input.statusesByTrip.get(input.record.tripId) ?? [],
    record: input.record,
  })
  return row === undefined ? [] : [{ row, tripDocumentId: input.record.tripDocumentId }]
}
