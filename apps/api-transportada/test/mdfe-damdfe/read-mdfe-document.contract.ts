/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createReadMdfeDocumentUseCase } from '../../src/mdfe-manifests/application/read-mdfe-document.use-case.js'
import type { MdfeDocumentLookup } from '../../src/mdfe-manifests/application/read-mdfe-document.port.js'
import {
  DamdfeDocumentNotAuthorizedError,
  DamdfeDocumentNotFoundError,
} from '../../src/mdfe-manifests/domain/damdfe.error.js'
import { buildSyntheticMdfeXml, SYNTHETIC_MDFE_ACCESS_KEY } from '../fixtures/mdfe-xml.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const MANIFEST_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'

const AUTHORIZED: MdfeDocumentLookup = {
  document: {
    accessKey: SYNTHETIC_MDFE_ACCESS_KEY,
    authorizedAt: '2026-08-26T12:16:10.000Z',
    bucket: 'transportada-fiscal',
    objectKey: `fiscal/${SYNTHETIC_MDFE_ACCESS_KEY}/authorized.xml`,
    protocol: '135260000000099',
  },
  kind: 'authorized',
}

function buildUseCase(lookup: MdfeDocumentLookup) {
  const asked: unknown[] = []
  const signed: unknown[] = []

  return {
    asked,
    signed,
    useCase: createReadMdfeDocumentUseCase({
      downloads: {
        async createDownloadUrl(input) {
          signed.push(input)
          return { expiresAt: '2026-08-26T12:21:10.000Z', url: 'https://bucket.test/assinada' }
        },
      },
      renderer: {
        async render() {
          return { bytes: Buffer.from('%PDF-1.3'), pageCount: 1 }
        },
      },
      source: {
        async findAuthorizedDocument(query) {
          asked.push(query)
          return lookup
        },
      },
      xmlReader: {
        async readXml() {
          return buildSyntheticMdfeXml()
        },
      },
    }),
  }
}

describe('read mdfe document contract', () => {
  /** O motorista entra pela própria escala: a consulta recebe o vínculo, não confia na rota. */
  test('carries the driver into the lookup and signs a short lived url', async () => {
    const { asked, signed, useCase } = buildUseCase(AUTHORIZED)

    const download = await useCase.readXmlDownload({
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      manifestId: MANIFEST_ID,
    })

    expect(asked).toEqual([{ companyId: COMPANY_ID, driverId: DRIVER_ID, manifestId: MANIFEST_ID }])
    expect(download.downloadUrl).toBe('https://bucket.test/assinada')
    expect(download.accessKey).toBe(SYNTHETIC_MDFE_ACCESS_KEY)
    expect(signed).toEqual([
      {
        bucket: 'transportada-fiscal',
        fileName: `mdfe-${SYNTHETIC_MDFE_ACCESS_KEY}.xml`,
        objectKey: AUTHORIZED.kind === 'authorized' ? AUTHORIZED.document.objectKey : '',
      },
    ])
  })

  test('names the DAMDFE by the access key', async () => {
    const { useCase } = buildUseCase(AUTHORIZED)

    const damdfe = await useCase.renderDamdfe({ companyId: COMPANY_ID, manifestId: MANIFEST_ID })

    expect(damdfe.fileName).toBe(`damdfe-${SYNTHETIC_MDFE_ACCESS_KEY}.pdf`)
  })

  /**
   * "Não é seu" e "não existe" respondem igual de propósito — separar já entregaria que o manifesto
   * existe. O que se distingue é a viagem que **tem** manifesto sem autorização: aí há o que dizer.
   */
  test('tells the two refusals apart, and both by kind', async () => {
    for (const [lookup, error] of [
      [{ kind: 'missing' } as const, DamdfeDocumentNotFoundError],
      [{ kind: 'not-authorized' } as const, DamdfeDocumentNotAuthorizedError],
    ] as const) {
      const { useCase } = buildUseCase(lookup)

      await expect(
        useCase.readXmlDownload({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
      ).rejects.toBeInstanceOf(error)
      await expect(
        useCase.renderDamdfe({ companyId: COMPANY_ID, manifestId: MANIFEST_ID }),
      ).rejects.toBeInstanceOf(error)
    }
  })
})
