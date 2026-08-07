/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DacteXmlInvalidError } from '../../src/cte-issuance/domain/dacte.error.js'
import { DACTE_HOMOLOGATION_LEGEND } from '../../src/cte-issuance/domain/dacte-layout.policy.js'
import { createDactePdfGateway } from '../../src/cte-issuance/infrastructure/dacte-pdf.gateway.js'
import { buildSyntheticCteXml } from '../fixtures/cte-xml.fixture.js'

const PDF_HEADER = '%PDF-'
const PDF_TRAILER = '%%EOF'

function countPageObjects(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/gu) ?? []).length
}

function countImageObjects(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Subtype\s*\/Image/gu) ?? []).length
}

/** O pdfkit grava o texto em hex dentro de arrays TJ, quebrados por kerning — remontar é o único jeito de conferir o que foi desenhado. */
function extractDrawnText(bytes: Buffer): string {
  const runs = bytes.toString('latin1').match(/\[[^\]]*\]\s*TJ/gu) ?? []
  return runs
    .map((run) =>
      (run.match(/<[0-9a-fA-F]*>/gu) ?? [])
        .map((chunk) => Buffer.from(chunk.slice(1, -1), 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n')
}

describe('createDactePdfGateway', () => {
  test('renders a PDF out of the authorized XML', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    const document = await gateway.render({ xml: buildSyntheticCteXml() })
    const content = document.bytes.toString('latin1')

    expect(content.startsWith(PDF_HEADER)).toBe(true)
    expect(content.trimEnd().endsWith(PDF_TRAILER)).toBe(true)
    expect(countPageObjects(document.bytes)).toBe(document.pageCount)
    expect(document.pageCount).toBeGreaterThanOrEqual(1)
  })

  test('prints what the inspector reads on the paper', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    const drawn = extractDrawnText((await gateway.render({ xml: buildSyntheticCteXml() })).bytes)

    expect(drawn).toContain('DACTE')
    expect(drawn).toContain('Transportadora Sintetica Ltda')
    expect(drawn).toContain('3526 0700')
    expect(drawn).toContain('135260000000001')
    expect(drawn).toContain('1.250,75')
    expect(drawn).toContain('PRODUTO SINTETICO')
  })

  test('draws the barcode and the QR Code the fiscal reader scans', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    const document = await gateway.render({ xml: buildSyntheticCteXml() })

    expect(countImageObjects(document.bytes)).toBeGreaterThanOrEqual(2)
  })

  test('warns on the paper that a homologation document has no fiscal value', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    const drawn = extractDrawnText((await gateway.render({ xml: buildSyntheticCteXml() })).bytes)

    expect(drawn).toContain(DACTE_HOMOLOGATION_LEGEND)
  })

  test('omits the warning once the document is authorized in production', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    const drawn = extractDrawnText(
      (
        await gateway.render({
          xml: buildSyntheticCteXml().replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'),
        })
      ).bytes,
    )

    expect(drawn).not.toContain(DACTE_HOMOLOGATION_LEGEND)
  })

  test('keeps rendering the fiscal document when the logo cannot be decoded', async () => {
    const gateway = createDactePdfGateway({
      compress: false,
      logo: { bytes: Buffer.from('not an image') },
    })

    const document = await gateway.render({ xml: buildSyntheticCteXml() })

    expect(document.bytes.toString('latin1').startsWith(PDF_HEADER)).toBe(true)
  })

  test('refuses a document that is not an authorized CT-e', async () => {
    const gateway = createDactePdfGateway({ compress: false })

    await expect(gateway.render({ xml: '<nfeProc></nfeProc>' })).rejects.toBeInstanceOf(
      DacteXmlInvalidError,
    )
  })
})
