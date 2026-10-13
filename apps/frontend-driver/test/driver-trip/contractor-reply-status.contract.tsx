/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { DriverContractorReplyStatus } from '@/modules/driver-trip/components/DriverContractorReplyStatus.component'
import { listContractorReplyStages } from '@/modules/driver-trip/shared/driverContractorReply.service'
import {
  CONTRACTOR_REPLY_STATUSES,
  type DriverRegisteredOccurrence,
} from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'

/**
 * Spec 248 T5.4 (RF13): "Pedido enviado à contratante" e o estado simples na nota do motorista. A guarda é de
 * chaves exatas e tolerante (API anterior = sem campo = nada na tela, ADR-0081 §9); a tela é só texto e ícone.
 */
const DOCUMENT_BASE = {
  accessKey: '35260112345678000199550010000012341000012340',
  deliveredAt: null,
  grossWeight: '10',
  id: 'document-1',
  number: '1234',
  proofPending: false,
  recipientName: 'Cliente',
  returnReason: null,
  separationStatus: 'loaded',
  series: '1',
  totalAmount: '100.00',
  volumeCount: '1',
}

function parseDocument(extra: Record<string, unknown>) {
  const snapshot = toDriverTripSnapshot({
    data: {
      isRegisteredDriver: true,
      pendingProofs: [],
      score: null,
      trips: [
        {
          createdAt: '2026-10-12T00:00:00.000Z',
          crewRole: 'driver',
          id: 'trip-1',
          manifest: null,
          status: 'in_transit',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              deliveryWindowEnd: null,
              deliveryWindowStart: null,
              documents: [{ ...DOCUMENT_BASE, ...extra }],
              enRouteSince: null,
              enRouteTappedAt: null,
              id: 'stop-1',
              label: 'Centro, 100',
              latitude: null,
              longitude: null,
              schedule: null,
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    },
  })
  const document = snapshot.trips[0]?.stops[0]?.documents[0]
  if (document === undefined) throw new Error('EXPECTED_DOCUMENT')
  return document
}

function occurrence(
  status: (typeof CONTRACTOR_REPLY_STATUSES)[number],
): DriverRegisteredOccurrence {
  return { contractorReply: { status }, id: `occurrence-${status}` }
}

function textOf(html: string): string {
  return html
    .replaceAll(/<svg[\s\S]*?<\/svg>/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

afterAll(async () => {
  await i18n.changeLanguage('pt-BR')
})

describe('a guarda do retorno da contratante na nota (spec 248 T5.4)', () => {
  test('API anterior: sem o campo a nota sai sem a chave', () => {
    expect('registeredOccurrences' in parseDocument({})).toBe(false)
  })

  test('a ocorrência com retorno chega com id e estado; o retorno nulo também', () => {
    const document = parseDocument({
      registeredOccurrences: [
        { contractorReply: { status: 'awaiting_contractor' }, id: 'occurrence-1' },
        { contractorReply: null, id: 'occurrence-2' },
      ],
    })

    expect(document.registeredOccurrences).toEqual([
      { contractorReply: { status: 'awaiting_contractor' }, id: 'occurrence-1' },
      { contractorReply: null, id: 'occurrence-2' },
    ])
  })

  test('chave a mais, estado fora do vocabulário ou forma errada tira a ocorrência, nunca a nota', () => {
    const document = parseDocument({
      registeredOccurrences: [
        { contractorReply: { status: 'delivered' }, id: 'valid' },
        { contractorReply: { status: 'delivered' }, id: 'extra-key', phone: '11999990000' },
        { contractorReply: { deadlineAt: 'x', status: 'delivered' }, id: 'extra-reply-key' },
        { contractorReply: { status: 'maybe' }, id: 'unknown-status' },
        { contractorReply: 'delivered', id: 'string-reply' },
        { contractorReply: { status: 'delivered' } },
        { contractorReply: { status: 'delivered' }, id: '' },
        'not-an-object',
        null,
      ],
    })

    expect(document.number).toBe('1234')
    expect(document.registeredOccurrences).toEqual([
      { contractorReply: { status: 'delivered' }, id: 'valid' },
    ])
  })

  test('campo que não é lista, ou lista sem item válido, deixa a nota sem a chave', () => {
    expect('registeredOccurrences' in parseDocument({ registeredOccurrences: 'x' })).toBe(false)
    expect('registeredOccurrences' in parseDocument({ registeredOccurrences: {} })).toBe(false)
    expect('registeredOccurrences' in parseDocument({ registeredOccurrences: [] })).toBe(false)
    expect(
      'registeredOccurrences' in
        parseDocument({ registeredOccurrences: [{ contractorReply: { status: 'x' }, id: 'a' }] }),
    ).toBe(false)
  })

  test('o vocabulário é o da API, na mesma ordem', () => {
    const apiSource = readFileSync(
      new URL(
        '../../../api-transportada/src/shared/occurrence-contractor-reply.constant.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const block = /CONTRACTOR_REPLY_STATUSES = \[([\s\S]*?)\] as const/u.exec(apiSource)?.[1] ?? ''
    const apiStatuses = [...block.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1] ?? '')

    expect([...CONTRACTOR_REPLY_STATUSES] as string[]).toEqual(apiStatuses)
  })
})

describe('os três estados simples (spec 248 T5.4)', () => {
  test('cada estado do vocabulário vira um dos três, ou nada', () => {
    const stageOf = (status: (typeof CONTRACTOR_REPLY_STATUSES)[number]) =>
      listContractorReplyStages([occurrence(status)])

    expect(stageOf('awaiting_contractor')).toEqual(['waiting'])
    expect(stageOf('overdue')).toEqual(['waiting'])
    expect(stageOf('reply_received')).toEqual(['received'])
    expect(stageOf('awaiting_operator')).toEqual(['received'])
    expect(stageOf('needs_operator')).toEqual(['received'])
    expect(stageOf('delivered')).toEqual(['delivered'])
    expect(stageOf('handled')).toEqual([])
    expect(stageOf('cancelled')).toEqual([])
  })

  test('várias ocorrências: uma linha por estado, do mais cedo ao mais adiantado; sem dado, nada', () => {
    expect(
      listContractorReplyStages([
        occurrence('delivered'),
        occurrence('overdue'),
        occurrence('awaiting_contractor'),
        { contractorReply: null, id: 'without-reply' },
      ]),
    ).toEqual(['waiting', 'delivered'])
    expect(listContractorReplyStages(undefined)).toEqual([])
    expect(listContractorReplyStages([])).toEqual([])
  })
})

describe('a tela do retorno da contratante (spec 248 T5.4)', () => {
  test('pt-BR: "Pedido enviado à contratante" e o estado', async () => {
    await i18n.changeLanguage('pt-BR')

    expect(
      textOf(
        renderToStaticMarkup(<DriverContractorReplyStatus occurrences={[occurrence('overdue')]} />),
      ),
    ).toBe('Pedido enviado à contratante Aguardando a contratante')
    expect(
      textOf(
        renderToStaticMarkup(
          <DriverContractorReplyStatus occurrences={[occurrence('needs_operator')]} />,
        ),
      ),
    ).toBe('Pedido enviado à contratante Boleto recebido')
    expect(
      textOf(
        renderToStaticMarkup(
          <DriverContractorReplyStatus occurrences={[occurrence('delivered')]} />,
        ),
      ),
    ).toBe('Pedido enviado à contratante Entregue a você na conversa')
  })

  test('en: o mesmo, no idioma do aparelho', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(
        textOf(
          renderToStaticMarkup(
            <DriverContractorReplyStatus occurrences={[occurrence('awaiting_contractor')]} />,
          ),
        ),
      ).toBe('Request sent to the contractor Waiting for the contractor')
    } finally {
      await i18n.changeLanguage('pt-BR')
    }
  })

  test('sem dado da API, sem retorno ou só tratado/cancelado: não renderiza nada', () => {
    expect(renderToStaticMarkup(<DriverContractorReplyStatus occurrences={undefined} />)).toBe('')
    expect(
      renderToStaticMarkup(
        <DriverContractorReplyStatus
          occurrences={[
            occurrence('handled'),
            occurrence('cancelled'),
            { contractorReply: null, id: 'x' },
          ]}
        />,
      ),
    ).toBe('')
  })

  test('ícone do design system do app, decorativo; sem estilo inline; linha com altura mínima de 44 px', () => {
    const html = renderToStaticMarkup(
      <DriverContractorReplyStatus occurrences={[occurrence('delivered')]} />,
    )
    const css = readFileSync(
      new URL(
        '../../src/modules/driver-trip/styles/contractorReplyStatus.module.css',
        import.meta.url,
      ),
      'utf8',
    )

    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('style=')
    expect(css).toContain('min-height: 2.75rem')
  })

  test('a nota monta o componente com o campo da nota, no corpo dos detalhes', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain(
      '<DriverContractorReplyStatus occurrences={document.registeredOccurrences} />',
    )
  })
})
