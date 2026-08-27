/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DAMDFE_HOMOLOGATION_LEGEND } from '../../src/mdfe-manifests/domain/damdfe-layout.policy.js'
import { DamdfeXmlInvalidError } from '../../src/mdfe-manifests/domain/damdfe.error.js'
import { createDamdfePdfGateway } from '../../src/mdfe-manifests/infrastructure/damdfe-pdf.gateway.js'
import { parseMdfeXmlForDamdfe } from '../../src/mdfe-manifests/infrastructure/mdfe-xml.mapper.js'
import { buildSyntheticMdfeXml, SYNTHETIC_MDFE_ACCESS_KEY } from '../fixtures/mdfe-xml.fixture.js'

const PDF_HEADER = '%PDF-'
const PDF_TRAILER = '%%EOF'

/** O pdfkit grava o texto em hex dentro de arrays TJ: remontar é o único jeito de conferir o papel. */
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

function countImageObjects(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Subtype\s*\/Image/gu) ?? []).length
}

describe('parseMdfeXmlForDamdfe', () => {
  test('reads the access key out of the Id, prefix and all', () => {
    const document = parseMdfeXmlForDamdfe(buildSyntheticMdfeXml())

    expect(document.accessKey).toBe(SYNTHETIC_MDFE_ACCESS_KEY)
    expect(document.protocol).toBe('135260000000099')
    expect(document.drivers).toEqual([{ name: 'Joao da Silva', taxId: '12345678901' }])
    expect(document.trailerPlates).toEqual(['ABC1D23'])
  })

  /**
   * Com uma cidade de descarga só, um parser sem `isArray` devolveria objeto em vez de lista — e o
   * papel sairia sem a cidade, que é justamente o que a barreira confere.
   */
  test('keeps a single discharge city as a list', () => {
    const document = parseMdfeXmlForDamdfe(buildSyntheticMdfeXml())

    expect(document.dischargeCities).toHaveLength(1)
    expect(document.dischargeCities[0]?.cteKeys).toHaveLength(1)
    expect(document.dischargeCities[0]?.nfeKeys).toHaveLength(1)
  })

  test('refuses what is not a well formed MDF-e', () => {
    expect(() => parseMdfeXmlForDamdfe('<mdfeProc>')).toThrow(DamdfeXmlInvalidError)
    expect(() => parseMdfeXmlForDamdfe('<outroDocumento/>')).toThrow(DamdfeXmlInvalidError)
  })
})

describe('createDamdfePdfGateway', () => {
  test('renders a PDF out of the authorized XML', async () => {
    const gateway = createDamdfePdfGateway({ compress: false })

    const document = await gateway.render({ xml: buildSyntheticMdfeXml() })
    const content = document.bytes.toString('latin1')

    expect(content.startsWith(PDF_HEADER)).toBe(true)
    expect(content.trimEnd().endsWith(PDF_TRAILER)).toBe(true)
    expect(document.pageCount).toBeGreaterThanOrEqual(1)
  })

  test('prints what the inspector reads on the paper', async () => {
    const gateway = createDamdfePdfGateway({ compress: false })

    const drawn = extractDrawnText((await gateway.render({ xml: buildSyntheticMdfeXml() })).bytes)

    expect(drawn).toContain('DAMDFE')
    expect(drawn).toContain('Transportadora Sintetica Ltda')
    expect(drawn).toContain('GCQ8E47')
    expect(drawn).toContain('12345678')
    expect(drawn).toContain('SERTAOZINHO')
    expect(drawn).toContain('135260000000099')
  })

  /** O leitor do fiscal lê o código de barras, não o número: sem o desenho o papel não serve. */
  test('draws the access key barcode, and no QR Code the layout does not publish', async () => {
    const gateway = createDamdfePdfGateway({ compress: false })

    const document = await gateway.render({ xml: buildSyntheticMdfeXml() })

    // PNG com canal alfa entra como imagem mais máscara — o que o contrato guarda é o desenho.
    expect(countImageObjects(document.bytes)).toBeGreaterThanOrEqual(1)
    expect(document.bytes.toString('latin1')).not.toContain('/qrcode')
  })

  test('says out loud when the environment is homologation', async () => {
    const gateway = createDamdfePdfGateway({ compress: false })

    const drawn = extractDrawnText(
      (await gateway.render({ xml: buildSyntheticMdfeXml({ environment: '2' }) })).bytes,
    )

    expect(drawn).toContain(DAMDFE_HOMOLOGATION_LEGEND)
  })
})
