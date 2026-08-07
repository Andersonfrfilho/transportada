/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DacteLogo,
  DacteLogoQuery,
  DacteSourceLookup,
  DacteSourceQuery,
  DacteXmlLocation,
} from '../../src/cte-issuance/application/render-dacte.port'
import { createRenderDacteUseCase } from '../../src/cte-issuance/application/render-dacte.use-case'
import {
  DacteDocumentNotAuthorizedError,
  DacteDocumentNotFoundError,
} from '../../src/cte-issuance/domain/dacte.error'
import { buildSyntheticCteXml } from '../fixtures/cte-xml.fixture'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000a2'
const BATCH_ID = '00000000-0000-4000-8000-0000000000a3'
const BATCH_ITEM_ID = '00000000-0000-4000-8000-0000000000a4'
const ACCESS_KEY = '35260761156864000191570010000000011000000010'
const BUCKET = 'transportada-local-fiscal'
const OBJECT_KEY = `tenants/${COMPANY_ID}/cte-documents/authorized.xml`

const AUTHORIZED_LOOKUP: DacteSourceLookup = {
  document: { accessKey: ACCESS_KEY, bucket: BUCKET, objectKey: OBJECT_KEY },
  kind: 'authorized',
}
const LOGO: DacteLogo = { bytes: Buffer.from('synthetic-logo') }

function createUseCase(
  lookup: DacteSourceLookup,
  xml: string = buildSyntheticCteXml(),
  logo: DacteLogo | null = LOGO,
): {
  readonly logoCalls: DacteLogoQuery[]
  readonly readCalls: DacteXmlLocation[]
  readonly renderCalls: (DacteLogo | null | undefined)[]
  readonly renderDacte: ReturnType<typeof createRenderDacteUseCase>['renderDacte']
  readonly sourceCalls: DacteSourceQuery[]
} {
  const logoCalls: DacteLogoQuery[] = []
  const readCalls: DacteXmlLocation[] = []
  const renderCalls: (DacteLogo | null | undefined)[] = []
  const sourceCalls: DacteSourceQuery[] = []
  const useCase = createRenderDacteUseCase({
    logos: {
      async findLogo(query) {
        logoCalls.push(query)
        return logo
      },
    },
    renderer: {
      async render(input) {
        renderCalls.push(input.logo)
        return { bytes: Buffer.from('%PDF-1.3 synthetic'), pageCount: 1 }
      },
    },
    source: {
      async findAuthorizedDocument(query) {
        sourceCalls.push(query)
        return lookup
      },
    },
    xmlReader: {
      async readXml(location) {
        readCalls.push(location)
        return xml
      },
    },
  })

  return { logoCalls, readCalls, renderCalls, renderDacte: useCase.renderDacte, sourceCalls }
}

describe('renderDacte use case', () => {
  test('devolve o PDF nomeado pela chave de acesso do documento autorizado', async () => {
    const useCase = createUseCase(AUTHORIZED_LOOKUP)

    const result = await useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    expect(result.fileName).toBe(`dacte-${ACCESS_KEY}.pdf`)
    expect(Buffer.from(result.bytes).toString('latin1')).toStartWith('%PDF-')
  })

  test('deriva a empresa do contexto autenticado ao procurar o documento', async () => {
    const useCase = createUseCase(AUTHORIZED_LOOKUP)

    await useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    expect(useCase.sourceCalls).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID },
    ])
    expect(useCase.sourceCalls[0]?.companyId).not.toBe(OTHER_COMPANY_ID)
  })

  test('lê o XML exatamente de onde a seleção apontou', async () => {
    const useCase = createUseCase(AUTHORIZED_LOOKUP)

    await useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    expect(useCase.readCalls).toEqual([{ bucket: BUCKET, objectKey: OBJECT_KEY }])
  })

  test('leva a marca da empresa autenticada para o cabeçalho do papel', async () => {
    const useCase = createUseCase(AUTHORIZED_LOOKUP)

    await useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    expect(useCase.logoCalls).toEqual([{ companyId: COMPANY_ID }])
    expect(useCase.renderCalls).toEqual([LOGO])
  })

  test('desenha o DACTE sem marca quando a empresa nunca subiu uma', async () => {
    const useCase = createUseCase(AUTHORIZED_LOOKUP, buildSyntheticCteXml(), null)

    const result = await useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    expect(useCase.renderCalls).toEqual([null])
    expect(result.fileName).toBe(`dacte-${ACCESS_KEY}.pdf`)
  })

  test('recusa item que não pertence ao lote da empresa', async () => {
    const useCase = createUseCase({ kind: 'missing' })

    const rendering = useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    await expect(rendering).rejects.toBeInstanceOf(DacteDocumentNotFoundError)
    expect(useCase.readCalls).toHaveLength(0)
  })

  test('recusa item sem CT-e autorizado, sem tocar no storage', async () => {
    const useCase = createUseCase({ kind: 'not-authorized' })

    const rendering = useCase.renderDacte({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: { companyId: COMPANY_ID },
    })

    await expect(rendering).rejects.toBeInstanceOf(DacteDocumentNotAuthorizedError)
    expect(useCase.readCalls).toHaveLength(0)
  })
})
