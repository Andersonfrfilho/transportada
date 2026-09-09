import { describe, expect, test } from 'bun:test'

import {
  buildRouteTimeline,
  type RouteTimelineBooth,
  type RouteTimelineStop,
} from '@/modules/trip/shared/routeTimeline.service'

/**
 * Spec 110 D4: **o dia em ordem.** O roteiro deixou de ser lista de paradas: ele começa na base,
 * passa pelas entregas, e a praça de pedágio aparece **no trecho em que ela acontece** — não numa
 * lista solta ao lado, onde o operador precisa casar praça com trecho de cabeça.
 */
const STOPS: readonly RouteTimelineStop[] = [
  {
    distanceFromPreviousMeters: 18_400,
    documentCount: 5,
    durationFromPreviousSeconds: 1_920,
    estimatedArrivalAt: '2026-09-10T11:40:00.000Z',
    excludedFromOptimization: false,
    label: 'Ribeirão Preto',
    nfeDocumentIds: ['doc-1'],
  },
  {
    distanceFromPreviousMeters: 24_100,
    documentCount: 3,
    durationFromPreviousSeconds: 2_460,
    estimatedArrivalAt: '2026-09-10T13:05:00.000Z',
    excludedFromOptimization: false,
    label: 'Sertãozinho',
    nfeDocumentIds: ['doc-2'],
  },
]

const BOOTHS: readonly RouteTimelineBooth[] = [
  { amount: '98.40', leg: 1, name: 'Pedágio Sertãozinho (sentido Norte)', operator: 'Entrevias' },
  { amount: '83.20', leg: 2, name: 'Pedágio Taquaritinga (sentido Sul)', operator: 'Eixo SP' },
]

function kinds(events: readonly { readonly of: string }[]): readonly string[] {
  return events.map((event) => event.of)
}

describe('route timeline contract', () => {
  test('o dia começa na base, passa pelas entregas e volta', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: 'Base · Ribeirão Preto',
      endPolicy: 'depot',
      removedDocumentIds: new Set(),
      originLabel: 'Base · Ribeirão Preto',
      returnLeg: { distanceMeters: 42_800, durationSeconds: 3_060 },
      stops: STOPS,
    })

    expect(kinds(timeline)).toEqual(['origin', 'leg', 'stop', 'leg', 'stop', 'leg', 'end'])
  })

  /**
   * ⚠️ A praça pertence à **perna**, não à viagem. Pendurá-la na parada diria que ela é da entrega,
   * e a mesma praça serve duas entregas quando a perna é a mesma.
   */
  test('a praça aparece no trecho dela, entre a perna e a parada', () => {
    const timeline = buildRouteTimeline({
      booths: BOOTHS,
      driverPayment: null,
      endLabel: 'Base · Ribeirão Preto',
      endPolicy: 'depot',
      removedDocumentIds: new Set(),
      originLabel: 'Base · Ribeirão Preto',
      returnLeg: { distanceMeters: 42_800, durationSeconds: 3_060 },
      stops: STOPS,
    })

    expect(kinds(timeline)).toEqual([
      'origin',
      'leg',
      'stop',
      'leg',
      'booth',
      'stop',
      'leg',
      'booth',
      'end',
    ])
  })

  /** ⚠️ `last_stop` **não tem perna de volta**, e a linha diz isso em vez de morrer calada. */
  test('a política que não traz o caminhão de volta é dita', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: null,
      endPolicy: 'last_stop',
      removedDocumentIds: new Set(),
      originLabel: 'Base · Ribeirão Preto',
      returnLeg: null,
      stops: STOPS,
    })

    expect(kinds(timeline)).toEqual(['origin', 'leg', 'stop', 'leg', 'stop', 'openEnd'])
  })

  test('o endereço próprio é o fim, e não a base', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: 'Casa do motorista · Americana',
      endPolicy: 'address',
      removedDocumentIds: new Set(),
      originLabel: 'Base · Ribeirão Preto',
      returnLeg: { distanceMeters: 19_600, durationSeconds: 1_560 },
      stops: STOPS,
    })
    const end = timeline.at(-1)

    expect(end).toEqual({ arrivalAt: null, label: 'Casa do motorista · Americana', of: 'end' })
  })

  /**
   * ⚠️ Spec 086 D1: o agregado recebe **uma vez pela viagem**, pela zona do destino mais distante.
   * Pendurá-lo numa perna sugeriria que outra perna tem outro pagamento.
   */
  test('o pagamento do agregado fecha a linha, fora das pernas', () => {
    const timeline = buildRouteTimeline({
      booths: BOOTHS,
      driverPayment: {
        amount: '1480.00',
        paymentModel: 'route_table',
        regionCity: 'JABOTICABAL',
        regionCode: '1.002',
        vehicleClass: 'toco',
      },
      endLabel: 'Base · Ribeirão Preto',
      endPolicy: 'depot',
      removedDocumentIds: new Set(),
      originLabel: 'Base · Ribeirão Preto',
      returnLeg: { distanceMeters: 42_800, durationSeconds: 3_060 },
      stops: STOPS,
    })

    expect(timeline.at(-1)).toEqual({
      amount: '1480.00',
      of: 'driverPayment',
      paymentModel: 'route_table',
      regionCity: 'JABOTICABAL',
      regionCode: '1.002',
      vehicleClass: 'toco',
    })
    /** E ele não está entre as pernas: o penúltimo evento continua sendo a chegada. */
    expect(timeline.at(-2)?.of).toBe('end')
  })

  /** A parada em precisão de município vai marcada (ADR-0044 §5) — ela é palpite de quilômetros. */
  test('a parada excluída da otimização carrega a marca', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: null,
      endPolicy: 'last_stop',
      removedDocumentIds: new Set(),
      originLabel: null,
      returnLeg: null,
      stops: [{ ...STOPS[0]!, excludedFromOptimization: true }],
    })

    expect(timeline.find((event) => event.of === 'stop')).toEqual({
      approximate: true,
      arrivalAt: '2026-09-10T11:40:00.000Z',
      documentCount: 5,
      label: 'Ribeirão Preto',
      nfeDocumentIds: ['doc-1'],
      of: 'stop',
      removed: false,
      sequence: 1,
    })
  })

  /** Sem base cadastrada a linha começa na primeira entrega — nunca numa origem inventada. */
  test('sem base, o dia começa na primeira entrega', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: null,
      endPolicy: 'last_stop',
      removedDocumentIds: new Set(),
      originLabel: null,
      returnLeg: null,
      stops: STOPS,
    })

    expect(kinds(timeline)).toEqual(['stop', 'leg', 'stop', 'openEnd'])
  })

  /**
   * ⚠️ Spec 110 D6: a parada tirada sai **riscada**, não sumida — nada é destruído antes do
   * recálculo, e o desfazer precisa dela na tela. E só sai riscada quando **todas** as notas dela
   * estão marcadas: meia parada não sai do roteiro.
   */
  test('a parada tirada fica riscada; meia parada não sai', () => {
    const timeline = buildRouteTimeline({
      booths: [],
      driverPayment: null,
      endLabel: null,
      endPolicy: 'last_stop',
      originLabel: null,
      removedDocumentIds: new Set(['doc-1']),
      returnLeg: null,
      stops: [
        { ...STOPS[0]!, nfeDocumentIds: ['doc-1'] },
        { ...STOPS[1]!, nfeDocumentIds: ['doc-1', 'doc-9'] },
      ],
    })
    const stops = timeline.filter((event) => event.of === 'stop')

    expect(stops[0]).toMatchObject({ removed: true })
    expect(stops[1]).toMatchObject({ removed: false })
  })

  test('sem parada não há dia nenhum', () => {
    expect(
      buildRouteTimeline({
        booths: [],
        driverPayment: null,
        endLabel: 'Base',
        endPolicy: 'depot',
        removedDocumentIds: new Set(),
        originLabel: 'Base',
        returnLeg: null,
        stops: [],
      }),
    ).toEqual([])
  })
})
