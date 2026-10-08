/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { createExportTripProofPdfUseCase } from '../../src/trips/application/export-trip-proof-pdf.use-case.js'
import type {
  TripProofPdfRenderer,
  TripProofRecord,
  TripProofReportPort,
} from '../../src/trips/application/trip-proof-report.port.js'
import type {
  TripReportPort,
  TripReportRecord,
} from '../../src/trips/application/trip-report.port.js'
import { buildTripProofInfoLines } from '../../src/trips/domain/trip-proof-block-info.policy.js'
import { TRIP_PROOF_REPORT_TEXT } from '../../src/trips/domain/trip-proof-report.constant.js'
import { TRIP_PROOF_REPORT_MAX_DOCUMENTS } from '../../src/trips/domain/trip-report.constant.js'
import type { TripProofBlock } from '../../src/trips/domain/trip-proof-report.types.js'
import { TripProofReportTooLargeError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000aa'
const TRIP_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-07T15:00:00.000Z')

function buildRecord(
  documentNumber: string,
  overrides?: Partial<TripReportRecord>,
): TripReportRecord {
  return {
    accessKey: `3526${documentNumber.padStart(40, '0')}`,
    amount: '1234.5600',
    contractorName: 'Contratante Alfa',
    deliveredAt: new Date('2026-10-06T13:30:00.000Z'),
    documentNumber,
    documentSeries: '1',
    documentStatus: 'delivered',
    recipientCity: 'Campinas',
    recipientName: 'Loja Beta',
    recipientState: 'SP',
    returnReason: null,
    returnedAt: null,
    tripCreatedAt: '2026-10-01T10:00:00.000000Z',
    tripDocumentId: `doc-${documentNumber}`,
    tripId: TRIP_ID,
    tripStatus: 'completed',
    ...overrides,
  }
}

function buildReportRepository(input: {
  readonly records: readonly TripReportRecord[]
  readonly total?: number
}): TripReportPort & { readonly listCalls: number[] } {
  const listCalls: number[] = []
  return {
    countDocumentsWithoutTrip: async () => 0,
    countRows: async () => input.total ?? input.records.length,
    listCalls,
    listFacetEmitters: async () => [],
    listFacetPlaces: async () => [],
    listDocumentStatusesByTrip: async () => new Map([[TRIP_ID, ['delivered' as const]]]),
    listRows: async () => {
      listCalls.push(1)
      return input.records
    },
  }
}

function buildProof(documentNumber: string, key: string): TripProofRecord {
  return {
    bucket: 'private-bucket',
    mimeType: 'image/jpeg',
    objectKey: key,
    tripDocumentId: `doc-${documentNumber}`,
  }
}

function setup(input: {
  readonly exporterNameFails?: boolean
  readonly proofs?: readonly TripProofRecord[]
  readonly records: readonly TripReportRecord[]
  readonly total?: number
}) {
  const captured: { blocks: readonly TripProofBlock[]; exportedBy: string }[] = []
  const reads: string[] = []
  const proofCalls: (readonly string[])[] = []
  const reportRepository = buildReportRepository(input)
  const proofRepository: TripProofReportPort = {
    findExporterName: async () => {
      if (input.exporterNameFails === true) throw new Error('user lookup down')
      return 'Ana Operadora'
    },
    findLetterhead: async () => ({
      legalName: 'Transportadora Ada',
      logoBytes: undefined,
      taxLine: 'CNPJ 1',
    }),
    listPhotoProofs: async (params) => {
      proofCalls.push(params.tripDocumentIds)
      return input.proofs ?? []
    },
  }
  const renderer: TripProofPdfRenderer = {
    render: async (params) => {
      captured.push({ blocks: params.blocks, exportedBy: params.exportedBy })
      return new Response('%PDF').body as ReadableStream<Uint8Array>
    },
  }
  const useCase = createExportTripProofPdfUseCase({
    clock: () => NOW,
    proofRepository,
    renderer,
    reportRepository,
    storage: {
      getObjectStream: async ({ key }) => {
        reads.push(key)
        return new Response('image-bytes').body as ReadableStream<Uint8Array>
      },
    },
  })
  return { captured, proofCalls, reads, reportRepository, useCase }
}

const PARAMS = {
  canReadFinancials: true,
  companyId: COMPANY_ID,
  exportedByUserId: USER_ID,
  filters: {},
}

describe('export-trip-proof-pdf use case (spec 253 T2.4)', () => {
  it('builds one block with the image for a note with a proof, and reads nothing eagerly', async () => {
    const { captured, reads, useCase } = setup({
      proofs: [buildProof('10', 'k/10')],
      records: [buildRecord('10')],
    })
    const result = await useCase(PARAMS)

    expect(result.filename).toBe('canhotos-20261007.pdf')
    expect(captured[0]?.exportedBy).toBe('Ana Operadora')
    expect(captured[0]?.blocks).toHaveLength(1)
    expect(captured[0]?.blocks[0]?.image?.mimeType).toBe('image/jpeg')
    expect(reads).toEqual([])
    await captured[0]?.blocks[0]?.image?.read()
    expect(reads).toEqual(['k/10'])
  })

  it('builds a "without proof" block when the note has no photo', async () => {
    const { captured, useCase } = setup({ records: [buildRecord('11')] })
    await useCase(PARAMS)
    expect(captured[0]?.blocks).toHaveLength(1)
    expect(captured[0]?.blocks[0]?.image).toBeUndefined()
  })

  it('builds one block per proof on a redelivery, numbered 1 of 2 and 2 of 2', async () => {
    const { captured, useCase } = setup({
      proofs: [buildProof('12', 'k/a'), buildProof('12', 'k/b')],
      records: [buildRecord('12')],
    })
    await useCase(PARAMS)
    const blocks = captured[0]?.blocks ?? []
    expect(blocks.map((block) => [block.proofIndex, block.proofTotal])).toEqual([
      [1, 2],
      [2, 2],
    ])
    expect(buildTripProofInfoLines(blocks[1] as TripProofBlock)[0]).toContain('Canhoto 2 de 2')
    expect(buildTripProofInfoLines(blocks[0] as TripProofBlock)[0]).toContain('Canhoto 1 de 2')
  })

  it('leaves a failing image to the renderer: read rejects, the use case still succeeds', async () => {
    const { captured, useCase } = setup({
      proofs: [buildProof('13', 'k/bad')],
      records: [buildRecord('13')],
    })
    await useCase(PARAMS)
    expect(typeof captured[0]?.blocks[0]?.image?.read).toBe('function')
  })

  it('still renders when the exporter name lookup fails, falling back to the unknown label', async () => {
    const { captured, useCase } = setup({ exporterNameFails: true, records: [buildRecord('14')] })
    await useCase(PARAMS)
    expect(captured[0]?.exportedBy).toBe(TRIP_PROOF_REPORT_TEXT.unknownExporter)
  })

  it('refuses above the ceiling before reading anything else', async () => {
    const { proofCalls, reportRepository, useCase } = setup({
      records: [],
      total: TRIP_PROOF_REPORT_MAX_DOCUMENTS + 1,
    })
    await expect(useCase(PARAMS)).rejects.toBeInstanceOf(TripProofReportTooLargeError)
    expect(reportRepository.listCalls).toHaveLength(0)
    expect(proofCalls).toHaveLength(0)
  })

  it('counts blocks, not notes: 150 notes with 2 proofs each is refused', async () => {
    const numbers = Array.from({ length: 150 }, (_, index) => String(index + 1))
    const { useCase } = setup({
      proofs: numbers.flatMap((number) => [
        buildProof(number, `k/${number}/a`),
        buildProof(number, `k/${number}/b`),
      ]),
      records: numbers.map((number) => buildRecord(number)),
    })
    await expect(useCase(PARAMS)).rejects.toBeInstanceOf(TripProofReportTooLargeError)
  })

  it('accepts exactly 200 blocks across notes with and without proofs', async () => {
    const numbers = Array.from({ length: 150 }, (_, index) => String(index + 1))
    const { captured, useCase } = setup({
      proofs: numbers
        .slice(0, 50)
        .flatMap((number) => [
          buildProof(number, `k/${number}/a`),
          buildProof(number, `k/${number}/b`),
        ]),
      records: numbers.map((number) => buildRecord(number)),
    })
    await useCase(PARAMS)
    expect(captured[0]?.blocks).toHaveLength(TRIP_PROOF_REPORT_MAX_DOCUMENTS)
  })

  it('accepts exactly the ceiling', async () => {
    const { useCase } = setup({
      records: [buildRecord('14')],
      total: TRIP_PROOF_REPORT_MAX_DOCUMENTS,
    })
    await expect(useCase(PARAMS)).resolves.toBeDefined()
  })

  it('fetches proofs once for all notes (no N+1)', async () => {
    const { proofCalls, useCase } = setup({ records: [buildRecord('15'), buildRecord('16')] })
    await useCase(PARAMS)
    expect(proofCalls).toEqual([['doc-15', 'doc-16']])
  })

  it('shows the value only with financials and never leaks bucket or key into the info', async () => {
    const withMoney = setup({
      proofs: [buildProof('17', 'secret/key')],
      records: [buildRecord('17')],
    })
    await withMoney.useCase(PARAMS)
    const withoutMoney = setup({
      proofs: [buildProof('17', 'secret/key')],
      records: [buildRecord('17')],
    })
    await withoutMoney.useCase({ ...PARAMS, canReadFinancials: false })

    const moneyText = buildTripProofInfoLines(
      withMoney.captured[0]?.blocks[0] as TripProofBlock,
    ).join('\n')
    const plainText = buildTripProofInfoLines(
      withoutMoney.captured[0]?.blocks[0] as TripProofBlock,
    ).join('\n')
    expect(moneyText).toContain('R$ 1.234,56')
    expect(plainText).not.toContain('R$')
    expect(`${moneyText}${plainText}`).not.toContain('secret')
    expect(`${moneyText}${plainText}`).not.toContain('private-bucket')
  })

  it('writes delivery date, return date and reason into the situation line', async () => {
    const { captured, useCase } = setup({
      records: [
        buildRecord('18', {
          deliveredAt: null,
          documentStatus: 'returned',
          returnReason: 'Loja fechada',
          returnedAt: new Date('2026-10-06T18:00:00.000Z'),
        }),
      ],
    })
    await useCase(PARAMS)
    const lines = buildTripProofInfoLines(captured[0]?.blocks[0] as TripProofBlock)
    expect(lines[2]).toContain('Devolvida em 06/10/2026 15:00')
    expect(lines[2]).toContain('Motivo: Loja fechada')
  })
})
