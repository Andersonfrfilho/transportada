/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29/RF30). A política pura do demonstrativo, o teto de tamanho — exercitado **nos
 * dois lados**, abaixo e acima — e o contrato negativo da superfície: nem o portal do contratante
 * nem o token público do lote alcançam o documento com evidência.
 */
import { describe, expect, test } from 'bun:test'

import { createContractorExtraChargeRoutes } from '../../src/contractor-portal/presentation/contractor-extra-charge.routes.js'
import type { ExtraChargeBatchReport } from '../../src/delivery-clients/application/extra-charge-batch.port.js'
import {
  buildOccurrenceStatementLayout,
  OCCURRENCE_STATEMENT_DISCLAIMER,
  type OccurrenceStatementBatch,
  type OccurrenceStatementSourceRow,
} from '../../src/delivery-clients/domain/occurrence-statement-layout.policy.js'
import { OCCURRENCE_STATEMENT_MAX_BYTES } from '../../src/delivery-clients/domain/occurrence-statement-limits.constant.js'
import { ExtraChargeBatchStatementTooLargeError } from '../../src/delivery-clients/domain/occurrence-statement.error.js'
import { createOccurrenceStatementPdfGateway } from '../../src/delivery-clients/infrastructure/occurrence-statement-pdf.gateway.js'
import { createOccurrenceStatementRoutes } from '../../src/delivery-clients/presentation/occurrence-statement.routes.js'
import { createPublicExtraChargeBatchRoutes } from '../../src/delivery-clients/presentation/public-extra-charge-batch.routes.js'

const BATCH_ID = '00000000-0000-4000-8000-0000000000a1'
const PRINTED_AT = new Date('2026-09-22T12:00:00.000Z')

const BATCH: OccurrenceStatementBatch = {
  closedAt: new Date('2026-09-22T10:00:00.000Z'),
  contractorName: 'Spani Atacadista',
  id: BATCH_ID,
  periodEnd: '2026-09-30',
  periodStart: '2026-09-01',
  totalAmount: '1350.0000',
}

const CARRIER = { legalName: 'Transportadora Exemplo LTDA', taxLine: 'CNPJ 11222333000181' }

function buildRow(
  overrides: Partial<OccurrenceStatementSourceRow> = {},
): OccurrenceStatementSourceRow {
  return {
    accessKey: null,
    amount: '135.0000',
    chargeType: 'returned_goods',
    chargedOn: '2026-09-10',
    clientName: 'Mercado do Zé',
    evidence: { kind: 'none' },
    id: '00000000-0000-4000-8000-0000000000b1',
    noteNumber: '12345',
    noteSeries: '1',
    notes: 'Caixa violada na descarga.',
    photoCount: 0,
    productCodes: ['SKU-1', 'SKU-2'],
    ...overrides,
  }
}

describe('demonstrativo de ressarcimento — política de layout', () => {
  test('carrega a frase de que não é documento fiscal e o id do lote como identificador', () => {
    const layout = buildOccurrenceStatementLayout({
      batch: BATCH,
      carrier: CARRIER,
      rows: [buildRow()],
    })

    expect(layout.disclaimer).toBe(OCCURRENCE_STATEMENT_DISCLAIMER)
    expect(layout.disclaimer).toContain('NÃO é documento fiscal')
    expect(layout.batch[0]).toEqual({ label: 'Lote', value: BATCH_ID })
    expect(layout.totalText).toBe('R$ 1.350,0000')
  })

  test('anexo vencido vira selo textual, nunca imagem', () => {
    const layout = buildOccurrenceStatementLayout({
      batch: BATCH,
      carrier: CARRIER,
      rows: [buildRow({ evidence: { kind: 'expired' }, photoCount: 3 })],
    })

    const row = layout.pages[0]?.rows[0]
    expect(row?.evidence.kind).toBe('expired')
    expect(row?.evidenceSeal).toContain('expurgada')
    expect(layout.embeddedImageBytes).toBe(0)
  })

  test('uma foto no corpo e as demais por contagem', () => {
    const layout = buildOccurrenceStatementLayout({
      batch: BATCH,
      carrier: CARRIER,
      rows: [
        buildRow({
          evidence: { bytes: new Uint8Array(64), kind: 'image', mimeType: 'image/jpeg' },
          photoCount: 5,
        }),
      ],
    })

    const row = layout.pages[0]?.rows[0]
    expect(row?.evidence.kind).toBe('image')
    expect(row?.extraPhotosText).toBe('Mais 4 fotos arquivadas nesta ocorrência.')
    expect(layout.embeddedImageBytes).toBe(64)
  })

  test('um lote de cinquenta linhas fica abaixo do teto e pagina', () => {
    const rows = Array.from({ length: 50 }, (_unused, index) =>
      buildRow({
        evidence: { bytes: new Uint8Array(40_000), kind: 'image', mimeType: 'image/jpeg' },
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        photoCount: 5,
      }),
    )

    const layout = buildOccurrenceStatementLayout({ batch: BATCH, carrier: CARRIER, rows })

    expect(layout.embeddedImageBytes).toBeLessThan(OCCURRENCE_STATEMENT_MAX_BYTES)
    expect(layout.pageCount).toBe(10)
  })

  /** ⚠️ O caso que **passa** não prova teto nenhum — o que prova é este. */
  test('recusa de forma controlada quando as imagens sozinhas já estouram o teto', () => {
    const rows = Array.from({ length: 12 }, (_unused, index) =>
      buildRow({
        evidence: { bytes: new Uint8Array(1_000_000), kind: 'image', mimeType: 'image/jpeg' },
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        photoCount: 1,
      }),
    )

    expect(() => buildOccurrenceStatementLayout({ batch: BATCH, carrier: CARRIER, rows })).toThrow(
      ExtraChargeBatchStatementTooLargeError,
    )
  })
})

describe('demonstrativo de ressarcimento — gateway pdfkit', () => {
  test('monta o PDF do lote abaixo do teto', async () => {
    const gateway = createOccurrenceStatementPdfGateway()
    const rendered = await gateway.render({
      batch: BATCH,
      carrier: CARRIER,
      printedAt: PRINTED_AT,
      rows: [buildRow({ evidence: { kind: 'expired' }, photoCount: 2 })],
    })

    expect(rendered.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(rendered.pageCount).toBe(1)
    expect(rendered.bytes.byteLength).toBeLessThan(OCCURRENCE_STATEMENT_MAX_BYTES)
  })

  /** O teto vale para o **arquivo montado**: aqui o texto sozinho já passa do limite injetado. */
  test('recusa o PDF montado acima do teto', async () => {
    const gateway = createOccurrenceStatementPdfGateway({ maxBytes: 1024 })
    const rows = Array.from({ length: 40 }, (_unused, index) =>
      buildRow({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    )

    await expect(
      gateway.render({ batch: BATCH, carrier: CARRIER, printedAt: PRINTED_AT, rows }),
    ).rejects.toThrow(ExtraChargeBatchStatementTooLargeError)
  })
})

describe('demonstrativo de ressarcimento — superfície', () => {
  const statementRoutes = createOccurrenceStatementRoutes({
    readStatement: {
      async execute() {
        return { bytes: new Uint8Array(), contentType: 'application/pdf', fileName: 'x.pdf' }
      },
    },
  })

  test('é autenticada por `trip.financials` e serve `application/pdf`', () => {
    expect(statementRoutes).toHaveLength(1)
    expect(statementRoutes[0]?.pathname).toBe('/extra-charge-batches/:id/statement')
    expect(statementRoutes[0]?.method).toBe('GET')
    expect(statementRoutes[0]?.policy).toEqual({ permission: 'trip.financials', scope: 'company' })
  })

  test('não é pendurada sob `/client/me` — o portal do contratante não a alcança (ADR-0050)', () => {
    expect(statementRoutes.some((route) => route.pathname.startsWith('/client/me'))).toBe(false)

    const report = {} as ExtraChargeBatchReport
    const portalRoutes = createContractorExtraChargeRoutes({
      decideBatch: { execute: async () => report },
      listBatches: { execute: async () => [] },
    })

    expect(portalRoutes.some((route) => route.pathname.endsWith('/statement'))).toBe(false)
  })

  test('o token público do lote abre a decisão, não o demonstrativo com evidência', () => {
    const report = {} as ExtraChargeBatchReport
    const publicRoutes = createPublicExtraChargeBatchRoutes({
      decideByToken: { execute: async () => report },
      readReportByToken: { execute: async () => report },
    })

    expect(publicRoutes.some((route) => route.pathname.includes('statement'))).toBe(false)
  })
})
