/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7b (revisão HIGH-1): a API devolve `source: 'email'` nas prévias que o worker cria pela
 * caixa de entrada. O painel só conhecia `upload`, e a primeira prévia por e-mail derrubaria a lista
 * inteira e o detalhe (`RESPONSE_INVALID`). A prévia por e-mail não tem autor: o resumo da API nunca
 * carrega quem enviou, então o formato é o mesmo nas duas origens. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import english from '@/modules/cargo-receiving/locales/cargoReceiving.en.locale.json'
import portuguese from '@/modules/cargo-receiving/locales/cargoReceiving.locale.json'
import { CARGO_PREVIEW_SOURCES } from '@/modules/cargo-receiving/shared/cargoPreview.constant'
import { createCargoPreviewClient } from '@/modules/cargo-receiving/shared/cargoPreviewClient.service'
import {
  toPreviewDetail,
  toPreviewPage,
} from '@/modules/cargo-receiving/shared/cargoPreviewResponse.validation'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  buildPreviewDetail,
  buildPreviewSummary,
  PREVIEW_ID,
  PREVIEW_SECOND_ID,
} from '../fixtures/cargoPreview.fixture'

const API_CONSTANT = '../../../api-transportada/src/shared/cargo-preview.constant.ts'

/** As origens que a API grava: lidas da constante dela, não repetidas aqui. */
function apiSources(): readonly string[] {
  const source = readFileSync(new URL(API_CONSTANT, import.meta.url), 'utf8')
  const declaration = source.slice(source.indexOf('CARGO_PREVIEW_SOURCE = {'))
  const body = declaration.slice(declaration.indexOf('{'), declaration.indexOf('}'))
  return [...body.matchAll(/\w+:\s*'(\w+)'/g)].map((match) => match[1] ?? '')
}

function isInvalid(call: () => unknown): boolean {
  try {
    call()
    return false
  } catch (error) {
    return error instanceof CargoReceivingRequestError && error.message === 'RESPONSE_INVALID'
  }
}

const EMAIL = buildPreviewSummary({ id: PREVIEW_SECOND_ID, source: 'email' })
const UPLOAD = buildPreviewSummary({ id: PREVIEW_ID, source: 'upload' })

describe('a lista de origens da prévia (spec 237 T4.7b)', () => {
  test('o painel conhece exatamente as origens que a API grava', () => {
    expect([...CARGO_PREVIEW_SOURCES].sort()).toEqual([...apiSources()].sort())
  })

  test('as duas origens estão na lista, e nenhuma outra', () => {
    expect([...CARGO_PREVIEW_SOURCES].sort()).toEqual(['email', 'upload'])
  })
})

describe('a resposta com origem por e-mail (spec 237 T4.7b)', () => {
  test('uma prévia por e-mail e uma por envio na mesma lista: nenhuma derruba a página', () => {
    const page = toPreviewPage({ data: [UPLOAD, EMAIL], nextCursor: null })

    expect(page.items.map((item) => item.source)).toEqual(['upload', 'email'])
  })

  test('o detalhe de uma prévia por e-mail é aceito', () => {
    const detail = toPreviewDetail({ data: buildPreviewDetail({ source: 'email' }) })

    expect(detail.source).toBe('email')
  })

  test('o resumo por e-mail não carrega autor: chave de autor continua recusada', () => {
    expect(isInvalid(() => toPreviewPage({ data: [EMAIL], nextCursor: null }))).toBe(false)
    expect(
      isInvalid(() =>
        toPreviewPage({ data: [{ ...EMAIL, uploadedByUserId: null }], nextCursor: null }),
      ),
    ).toBe(true)
  })

  test('origem desconhecida continua recusada, nas duas respostas', () => {
    expect(
      isInvalid(() => toPreviewPage({ data: [{ ...UPLOAD, source: 'webhook' }], nextCursor: null })),
    ).toBe(true)
    expect(
      isInvalid(() => toPreviewDetail({ data: { ...buildPreviewDetail(), source: 'webhook' } })),
    ).toBe(true)
  })

  test('a origem por envio segue como antes', () => {
    expect(toPreviewPage({ data: [UPLOAD], nextCursor: null }).items[0]?.source).toBe('upload')
  })
})

describe('o cliente HTTP lê a origem por e-mail (spec 237 T4.7b)', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })

  function clientAnswering(body: unknown) {
    return createCargoPreviewClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.resolve(json(body)),
      getAccessToken: () => Promise.resolve('token-sintetico'),
    })
  }

  test('a lista com as duas origens chega inteira', async () => {
    const client = clientAnswering({ data: [UPLOAD, EMAIL], nextCursor: null })

    const page = await client.listPreviews({ cursor: null, filters: {} })

    expect(page.items.map((item) => item.id)).toEqual([PREVIEW_ID, PREVIEW_SECOND_ID])
  })

  test('o detalhe da prévia por e-mail chega', async () => {
    const client = clientAnswering({ data: buildPreviewDetail({ source: 'email' }) })

    const detail = await client.getPreview({ filters: { afterRow: null }, previewId: PREVIEW_SECOND_ID })

    expect(detail.source).toBe('email')
  })
})

describe('o rótulo de cada origem, nos dois idiomas (spec 237 T4.7b)', () => {
  test('toda origem tem texto curto, sem endereço de e-mail nem nome de pessoa', () => {
    for (const locale of [portuguese, english]) {
      for (const source of CARGO_PREVIEW_SOURCES) {
        const label = locale.preview.source[source]

        expect(label.length).toBeGreaterThan(0)
        expect(label.length).toBeLessThanOrEqual(24)
        expect(label).not.toContain('@')
      }
    }
  })

  test('as duas origens têm rótulos diferentes entre si', () => {
    expect(portuguese.preview.source.email).not.toBe(portuguese.preview.source.upload)
    expect(english.preview.source.email).not.toBe(english.preview.source.upload)
  })
})
