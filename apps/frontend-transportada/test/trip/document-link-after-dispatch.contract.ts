/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 T2.2: acrescentar notas a uma viagem que já saiu. A API publica `linkDocumentsAfterDispatch`
 * em `allowed-actions` e responde `POST /trips/:id/documents/after-dispatch` com o resumo e a viagem.
 */
import { describe, expect, it } from 'bun:test'

import enLocale from '@/modules/trip/locales/trip.en.locale.json'
import ptLocale from '@/modules/trip/locales/trip.locale.json'
import { parseTripAllowedActions } from '@/modules/trip/shared/tripAllowedActions.validation'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import {
  buildLinkDocumentsAfterDispatchInput,
  DOCUMENT_LINK_MAX_DOCUMENTS,
  resolveDocumentLinkBlocker,
  resolveDocumentLinkErrorKey,
  resolveDocumentLinkOutcome,
} from '@/modules/trip/shared/tripDocumentLink.service'
import { parseDocumentLinkAfterDispatch } from '@/modules/trip/shared/tripDocumentLink.validation'
import type { DocumentLinkAfterDispatch } from '@/modules/trip/shared/tripDocumentLink.types'
import {
  canOfferTripFieldAction,
  resolveFieldActionCapabilities,
} from '@/modules/trip/shared/tripFieldActions.service'

import { SYNTHETIC_ACCESS_TOKEN, TRIP_DETAIL, TRIP_ID } from './trip.fixture'

const API_URL = 'https://api.example.test'

const LINK: DocumentLinkAfterDispatch = {
  createdStopIds: [],
  documentsWithoutCte: 1,
  eventId: '00000000-0000-4000-8000-000000000e01',
  linked: [{ nfeDocumentId: 'nfe-1', stopId: 'stop-1', tripDocumentId: 'link-1' }],
  mdfeDocumentDivergence: true,
  skipped: [{ nfeDocumentId: 'nfe-2', reason: 'already_linked' }],
}

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    collectKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

function readBlock(locale: unknown): unknown {
  return (locale as Record<string, unknown>).linkDocumentsDialog
}

describe('linkDocumentsAfterDispatch vem de allowed-actions (spec 257)', () => {
  it('a ação é conhecida e a desconhecida é filtrada', () => {
    const parsed = parseTripAllowedActions({
      trip: { documentIds: [], stopIds: [] },
      value: { documents: {}, stops: {}, trip: ['linkDocumentsAfterDispatch', 'inventada'] },
    })

    expect(parsed.trip).toEqual(['linkDocumentsAfterDispatch'])
  })

  it('o botão exige a permissão do escritório E a ação servida', () => {
    const served = resolveFieldActionCapabilities({
      documents: {},
      stops: {},
      trip: ['linkDocumentsAfterDispatch'],
    })
    const notServed = resolveFieldActionCapabilities({ documents: {}, stops: {}, trip: [] })
    const offer = (canReportOnBehalf: boolean, capabilities: typeof served) =>
      canOfferTripFieldAction({
        action: 'linkDocumentsAfterDispatch',
        canReportOnBehalf,
        capabilities,
      })

    expect(offer(true, served)).toBe(true)
    expect(offer(false, served)).toBe(false)
    expect(offer(true, notServed)).toBe(false)
  })
})

describe('resposta de POST /trips/:id/documents/after-dispatch', () => {
  it('aceita o resumo exato', () => {
    expect(parseDocumentLinkAfterDispatch(LINK)).toEqual(LINK)
  })

  it('aceita o payload real da API quando tudo foi pulado (sem tripStatus, sem evento)', () => {
    const allSkipped: DocumentLinkAfterDispatch = {
      createdStopIds: [],
      documentsWithoutCte: 0,
      eventId: null,
      linked: [],
      mdfeDocumentDivergence: false,
      skipped: [{ nfeDocumentId: 'nfe-1', reason: 'already_linked' }],
    }

    expect(parseDocumentLinkAfterDispatch(allSkipped)).toEqual(allSkipped)
  })

  it('recusa chave desconhecida, campo faltando, tipo trocado e motivo de pulo desconhecido', () => {
    const incomplete = Object.fromEntries(Object.entries(LINK).filter(([key]) => key !== 'eventId'))

    expect(() => parseDocumentLinkAfterDispatch({ ...LINK, extra: 1 })).toThrow()
    expect(() => parseDocumentLinkAfterDispatch(incomplete)).toThrow()
    expect(() => parseDocumentLinkAfterDispatch({ ...LINK, documentsWithoutCte: '1' })).toThrow()
    expect(() =>
      parseDocumentLinkAfterDispatch({
        ...LINK,
        skipped: [{ nfeDocumentId: 'nfe-2', reason: 'other' }],
      }),
    ).toThrow()
    expect(() => parseDocumentLinkAfterDispatch(null)).toThrow()
  })

  it('o cliente envia nfeDocumentIds e reason, e devolve o resumo com a viagem', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({ data: { link: LINK, trip: TRIP_DETAIL } }, { status: 201 }),
        )
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const result = await client.linkDocumentsAfterDispatch({
      nfeDocumentIds: ['nfe-1', 'nfe-2'],
      reason: 'Van quebrou',
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ link: LINK, trip: TRIP_DETAIL })
    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${API_URL}/trips/${TRIP_ID}/documents/after-dispatch`)
    expect(await request?.json()).toEqual({
      nfeDocumentIds: ['nfe-1', 'nfe-2'],
      reason: 'Van quebrou',
    })
  })
})

describe('regras do diálogo Acrescentar notas', () => {
  it('sem nota, com nota demais, sem motivo ou com motivo longo demais bloqueia', () => {
    const ids = ['nfe-1']

    expect(resolveDocumentLinkBlocker({ nfeDocumentIds: [], reason: 'x' })).toBe('noDocuments')
    expect(
      resolveDocumentLinkBlocker({
        nfeDocumentIds: Array.from({ length: DOCUMENT_LINK_MAX_DOCUMENTS + 1 }, (_, i) => `n${i}`),
        reason: 'x',
      }),
    ).toBe('tooManyDocuments')
    expect(resolveDocumentLinkBlocker({ nfeDocumentIds: ids, reason: '   ' })).toBe(
      'reasonRequired',
    )
    expect(resolveDocumentLinkBlocker({ nfeDocumentIds: ids, reason: 'x'.repeat(501) })).toBe(
      'reasonTooLong',
    )
    expect(resolveDocumentLinkBlocker({ nfeDocumentIds: ids, reason: 'Van quebrou' })).toBe(
      undefined,
    )
  })

  it('o motivo é aparado antes de ir à API', () => {
    expect(
      buildLinkDocumentsAfterDispatchInput({
        nfeDocumentIds: ['nfe-1'],
        reason: '  Van quebrou  ',
        tripId: TRIP_ID,
      }).reason,
    ).toBe('Van quebrou')
  })

  it('o código da API escolhe a mensagem; o resto é genérico', () => {
    expect(resolveDocumentLinkErrorKey(new Error('STATE_TRANSITION_NOT_ALLOWED'))).toBe(
      'notAllowed',
    )
    expect(resolveDocumentLinkErrorKey(new Error('OUTRO'))).toBe('generic')
    expect(resolveDocumentLinkErrorKey('texto')).toBe('generic')
  })

  it('o resultado conta entradas, puladas e os dois avisos fiscais', () => {
    expect(resolveDocumentLinkOutcome(LINK)).toEqual({
      hasMdfeDivergence: true,
      hasNothingLinked: false,
      linkedCount: 1,
      skippedCount: 1,
      withoutCteCount: 1,
    })
    expect(
      resolveDocumentLinkOutcome({ ...LINK, linked: [], mdfeDocumentDivergence: false })
        .hasNothingLinked,
    ).toBe(true)
  })
})

describe('locales do diálogo Acrescentar notas', () => {
  it('pt-BR e en têm exatamente as mesmas chaves', () => {
    const ptKeys = collectKeys(readBlock(ptLocale)).sort()
    const enKeys = collectKeys(readBlock(enLocale)).sort()

    expect(ptKeys.length).toBeGreaterThan(10)
    expect(enKeys).toEqual(ptKeys)
  })

  it('o botão do cabeçalho existe nos dois idiomas', () => {
    const label = (locale: unknown) =>
      (locale as { stateActions: Record<string, string> }).stateActions.linkDocuments

    expect(label(ptLocale)).toBeTruthy()
    expect(label(enLocale)).toBeTruthy()
  })
})
