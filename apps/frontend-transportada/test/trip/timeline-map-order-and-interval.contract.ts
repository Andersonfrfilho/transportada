/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 — o mapa contando a viagem sozinho: o **selo de ordem** no pino (o ícone do tipo
 * continua onde está; o número é marca adicional, menor, no canto superior esquerdo) e o **tempo
 * entre um evento e o seguinte** no traço que os liga.
 *
 * ⚠️ O desenho não é provado aqui — MapLibre não roda em happy-dom. O que esta suíte fixa é o
 * dado que vai ao desenho: a ordem, o texto do selo, o intervalo medido e o rótulo acessível.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import type { TripTimelineItem, TripTimelineKind } from '../../src/modules/trip/shared/trip.types'
import {
  measureOrderBadgeGlyphCoverage,
  resolveLegLabelPlacement,
  resolveLegLabelVisibility,
  TIMELINE_MAP_BADGED_PIN_SIZE_REM,
  TIMELINE_MAP_LEG_LABEL_GAP_PIXELS,
  TIMELINE_MAP_LEG_LABEL_MIN_MINUTES,
  TIMELINE_MAP_LEG_LABEL_PIN_OFFSET_PIXELS,
  TIMELINE_MAP_ORDER_BADGE_CORNER,
  TIMELINE_MAP_ORDER_BADGE_MAX_GLYPH_COVERAGE,
  TIMELINE_MAP_ORDER_BADGE_STYLE,
} from '../../src/modules/trip/shared/tripTimelineMap.constant'
import {
  buildTimelineMapPin,
  resolveTimelineLegLabels,
  resolveTimelineLegLabelText,
  resolveTimelineMapView,
} from '../../src/modules/trip/shared/tripTimelineMap.service'

/** Mostra a interpolação no próprio texto: é onde a ordem e o tipo precisam aparecer juntos. */
function translate(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key
  const parts = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',')
  return parts === '' ? key : `${key}(${parts})`
}

const BASE_ITEM: TripTimelineItem = {
  actorName: 'Marina Alves',
  channel: 'office',
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'item-1',
  kind: 'trip.status_changed',
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: 'in_transit',
}

function located(
  id: string,
  occurredAt: string,
  kind: TripTimelineKind,
  latitude: number,
  longitude: number,
): TripTimelineItem {
  return {
    ...BASE_ITEM,
    id,
    kind,
    location: {
      accuracyMeters: 5,
      capturedAt: occurredAt,
      distanceMeters: null,
      latitude,
      longitude,
    },
    locationState: 'captured',
    occurredAt,
  }
}

describe('selo de ordem no pino do minimapa (spec 196 — tarefa A)', () => {
  it('o selo traz o número da ordem do pino, e o ícone do tipo continua sendo o do evento', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T08:00:00.000Z', 'trip.dispatched', -23.7, -46.8),
        located('b', '2026-09-18T09:00:00.000Z', 'stop.arrived', -23.6, -46.7),
      ],
      translate,
    )
    const pins = view.points.map((point) => buildTimelineMapPin(point, translate))
    expect(pins.map((pin) => pin.orderBadge)).toEqual(['1', '2'])
    expect(pins.map((pin) => pin.glyph)).toEqual(['send', 'map-pin'])
  })

  /**
   * ⚠️ A numeração é dos **pinos** na cronologia, não das paradas planejadas nem da ordem do array
   * cru: o array chega do mais novo ao mais antigo e o selo tem de sair 1, 2, 3 assim mesmo.
   */
  it('a numeração segue a cronologia, mesmo recebendo do mais novo ao mais antigo', () => {
    const view = resolveTimelineMapView(
      [
        located('c', '2026-09-18T15:00:00.000Z', 'document.delivered', -23.5, -46.6),
        located('a', '2026-09-18T11:00:00.000Z', 'trip.dispatched', -23.7, -46.8),
        located('b', '2026-09-18T13:00:00.000Z', 'stop.arrived', -23.6, -46.7),
      ],
      translate,
    )
    const pins = view.points.map((point) => buildTimelineMapPin(point, translate))
    expect(pins.map((pin) => pin.orderBadge)).toEqual(['1', '2', '3'])
  })

  /**
   * ⚠️ **O selo não pode mentir sobre quantos eventos estão ali embaixo.** A decisão é: um número
   * só — a ordem **do pino** —, porque a numeração conta pinos, e uma faixa (`1–3`) falaria de uma
   * numeração de eventos que não existe em lugar nenhum da tela. Quem diz quantos eventos o pino
   * agrupa continua sendo o selo de contagem, do outro canto, que já existia.
   */
  it('pino agrupado: um selo de ordem com um número só, e a contagem segue no selo que já existia', () => {
    const items = Array.from({ length: 3 }, (_, index) =>
      located(
        `i${String(index)}`,
        `2026-09-18T12:0${String(index)}:00.000Z`,
        'stop.arrived',
        -23.55,
        -46.63,
      ),
    )
    const view = resolveTimelineMapView(
      [...items, located('z', '2026-09-18T14:00:00.000Z', 'document.delivered', -22.9, -45.1)],
      translate,
    )
    const pins = view.points.map((point) => buildTimelineMapPin(point, translate))
    expect(pins[0]?.orderBadge).toBe('1')
    expect(pins[0]?.orderBadge).not.toContain('–')
    expect(pins[0]?.count).toBe(3)
    expect(pins[1]?.orderBadge).toBe('2')
  })

  it('ordem de dois dígitos sai inteira no selo', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      located(
        `i${String(index)}`,
        `2026-09-18T12:${String(index).padStart(2, '0')}:00.000Z`,
        'stop.arrived',
        -23.5 - index / 100,
        -46.6 - index / 100,
      ),
    )
    const view = resolveTimelineMapView(items, translate)
    const pins = view.points.map((point) => buildTimelineMapPin(point, translate))
    expect(pins).toHaveLength(12)
    expect(pins[11]?.orderBadge).toBe('12')
  })

  /** O selo tem medida própria, declarada uma vez — nada de número solto na folha nem no TSX. */
  it('a métrica do selo é constante nomeada, entregue ao pino como propriedade custom', () => {
    expect(Object.keys(TIMELINE_MAP_ORDER_BADGE_STYLE).length).toBeGreaterThan(0)
    for (const [name, value] of Object.entries(TIMELINE_MAP_ORDER_BADGE_STYLE)) {
      expect(name.startsWith('--')).toBe(true)
      expect(value).not.toBe('')
    }
  })

  it('o rótulo acessível carrega ordem e tipo juntos — e a contagem quando o pino agrupa', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T08:00:00.000Z', 'trip.dispatched', -23.7, -46.8),
        located('b', '2026-09-18T09:00:00.000Z', 'stop.occurrence', -23.6, -46.7),
        located('c', '2026-09-18T09:30:00.000Z', 'stop.occurrence', -23.6, -46.7),
      ],
      translate,
    )
    const pins = view.points.map((point) => buildTimelineMapPin(point, translate))
    const first = pins[0]?.ariaLabel ?? ''
    expect(first).toContain('order=1')
    expect(first).toContain('eventTimeline.map.category.dispatched')
    const grouped = pins[1]?.ariaLabel ?? ''
    expect(grouped).toContain('order=2')
    expect(grouped).toContain('eventTimeline.map.category.occurrence')
    expect(grouped).toContain('count=2')
  })
})

describe('tempo entre um evento e o seguinte, no traço (spec 196 — tarefa B)', () => {
  it('o primeiro pino não tem intervalo: não há evento anterior de onde medir', () => {
    const view = resolveTimelineMapView(
      [located('a', '2026-09-18T08:00:00.000Z', 'trip.dispatched', -23.7, -46.8)],
      translate,
    )
    expect(view.points[0]?.minutesFromPrevious).toBeNull()
    expect(view.points[0]?.intervalLabel).toBeNull()
  })

  it('mede entre pinos consecutivos e escreve o tempo com o formatador que já existe', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T08:00:00.000Z', 'trip.dispatched', -23.7, -46.8),
        located('b', '2026-09-18T10:15:00.000Z', 'stop.arrived', -23.6, -46.7),
        located('c', '2026-09-18T10:40:00.000Z', 'document.delivered', -23.5, -46.6),
      ],
      translate,
    )
    expect(view.points[1]?.minutesFromPrevious).toBe(135)
    expect(view.points[1]?.intervalLabel).toBe(
      'eventTimeline.duration.hoursMinutes(hours=2,minutes=15)',
    )
    expect(view.points[2]?.minutesFromPrevious).toBe(25)
    expect(view.points[2]?.intervalLabel).toBe('eventTimeline.duration.minutes(count=25)')
  })

  /**
   * ⚠️ **A medida sai do ÚLTIMO evento do grupo anterior até o PRIMEIRO do grupo seguinte.** Medir
   * do primeiro ao primeiro somaria o tempo parado dentro do grupo ao tempo de deslocamento, e o
   * rótulo sobre o traço passaria a dizer um número que o traço não percorreu.
   */
  it('pino agrupado: mede do último evento do grupo anterior ao primeiro do seguinte', () => {
    const view = resolveTimelineMapView(
      [
        located('a1', '2026-09-18T08:00:00.000Z', 'stop.arrived', -23.7, -46.8),
        located('a2', '2026-09-18T09:00:00.000Z', 'stop.arrived', -23.7, -46.8),
        located('a3', '2026-09-18T10:00:00.000Z', 'stop.arrived', -23.7, -46.8),
        located('b', '2026-09-18T10:30:00.000Z', 'document.delivered', -23.5, -46.6),
      ],
      translate,
    )
    expect(view.points[0]?.count).toBe(3)
    expect(view.points[0]?.occurredAt).toBe('2026-09-18T08:00:00.000Z')
    expect(view.points[0]?.lastOccurredAt).toBe('2026-09-18T10:00:00.000Z')
    expect(view.points[1]?.minutesFromPrevious).toBe(30)
    expect(view.points[1]?.intervalLabel).toBe('eventTimeline.duration.minutes(count=30)')
  })

  it('dois eventos no mesmo instante: o intervalo é zero, não some nem vira negativo', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T08:00:00.000Z', 'stop.arrived', -23.7, -46.8),
        located('b', '2026-09-18T08:00:00.000Z', 'document.delivered', -23.5, -46.6),
      ],
      translate,
    )
    expect(view.points[1]?.minutesFromPrevious).toBe(0)
    expect(view.points[1]?.intervalLabel).toBe('eventTimeline.duration.minutes(count=0)')
  })

  /**
   * ⚠️ **Emendado.** Este caso cobrava um limiar fixo — `TIMELINE_MAP_LEG_LABEL_MIN_PIXELS`, 72px —
   * que, medido na tela, escondia **todos** os rótulos no enquadramento de abertura. O limiar em si
   * não era o defeito; cobrar só que ele existisse, sim: um número solto, sem relação com a largura
   * do texto que ele julga, passava no contrato e apagava a funcionalidade. O que o traço precisa
   * comportar é o texto **medido**, mais um respiro declarado.
   */
  it('as medidas do rótulo são constantes nomeadas e em pixel', () => {
    for (const pixels of [
      TIMELINE_MAP_LEG_LABEL_GAP_PIXELS,
      TIMELINE_MAP_LEG_LABEL_PIN_OFFSET_PIXELS,
    ]) {
      expect(pixels).toBeGreaterThan(0)
      expect(Number.isInteger(pixels)).toBe(true)
    }
    expect(TIMELINE_MAP_LEG_LABEL_MIN_MINUTES).toBeGreaterThanOrEqual(1)
  })

  it('o intervalo entra na linha da lista acessível, nos dois idiomas', () => {
    for (const dictionary of [trip, tripEn]) {
      const map = dictionary.eventTimeline.map as Record<string, unknown>
      expect(map.pinLabel_one).toContain('{{order}}')
      expect(map.pinLabel_other).toContain('{{order}}')
      expect(map.listItemInterval).toContain('{{duration}}')
      expect(map.legInterval).toContain('{{duration}}')
      /**
       * ⚠️ **Emendado.** A legenda prometia que em trecho curto "o tempo sai do mapa" — era a
       * descrição fiel de uma regra que, no enquadramento de abertura, apagava 100% dos rótulos.
       * Agora o trecho curto **muda o rótulo de lugar**, e a legenda não pode voltar a prometer
       * ausência: ela fala do pino, que é para onde o tempo desce.
       */
      const caption = String(map.captionInterval)
      expect(caption).toContain('pin')
      expect(caption).not.toMatch(/sai do mapa|leaves the map/u)
    }
  })
})

/**
 * ⚠️ **O defeito que esta suíte existe para não deixar voltar.** A primeira versão do selo saiu com
 * 23 × 18 px sobre um pino de 24 px e cobriu **74 % do glifo** — medido na tela, não estimado. O
 * ícone é quem diz o TIPO do evento: coberto, o pino perde a informação principal e fica só com a
 * vez. Aqui a geometria é conferida pela conta que o produto usa, não pelo olho de quem revisa.
 */
describe('o selo de ordem morde a quina do pino, não o miolo (spec 196 — tarefa A)', () => {
  const stylesheet = readFileSync(
    new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
    'utf8',
  )

  /** Sem os comentários: senão a palavra citada na explicação passa por declaração em vigor. */
  function rule(name: string): string {
    const start = stylesheet.indexOf(`.${name} {`)
    expect(start).toBeGreaterThan(-1)
    return stylesheet.slice(start, stylesheet.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('o glifo continua quase inteiro: o selo encosta na quina e para por aí', () => {
    for (const digits of [1, 2]) {
      const coverage = measureOrderBadgeGlyphCoverage(digits)
      expect(coverage).toBeLessThanOrEqual(TIMELINE_MAP_ORDER_BADGE_MAX_GLYPH_COVERAGE)
      /** Zero seria selo solto no mapa: ele precisa encostar para se ler como parte do pino. */
      expect(coverage).toBeGreaterThan(0)
    }
  })

  /** Dois dígitos crescem a pílula para o lado — e é para o lado de FORA que ela cresce, não para dentro. */
  it('o número de dois dígitos não é o que empurra o selo sobre o desenho', () => {
    expect(measureOrderBadgeGlyphCoverage(2)).toBeLessThanOrEqual(
      TIMELINE_MAP_ORDER_BADGE_MAX_GLYPH_COVERAGE,
    )
    expect(measureOrderBadgeGlyphCoverage(2)).toBeGreaterThan(measureOrderBadgeGlyphCoverage(1))
  })

  /**
   * ⚠️ O pino com selo é maior que o pino sem — e tem teto: acima de 27,7 px os três pinos que o
   * leque de `resolveMarkerOffsets` abre num mesmo ponto passam a encavalar.
   */
  it('o pino cresceu o bastante para hospedar os dois, e não além do que o leque comporta', () => {
    const PLAIN_PIN_REM = 1.5
    const FAN_RADIUS_PIXELS = 16
    const closestFanGap = 2 * FAN_RADIUS_PIXELS * Math.sin(Math.PI / 3)

    expect(TIMELINE_MAP_BADGED_PIN_SIZE_REM).toBeGreaterThan(PLAIN_PIN_REM)
    expect(TIMELINE_MAP_BADGED_PIN_SIZE_REM * 16).toBeLessThanOrEqual(closestFanGap)
  })

  it('o selo é medido pela caixa inteira: `content-box` foi o que o inflou da primeira vez', () => {
    const order = rule('tilePinOrder')
    expect(order).toContain('box-sizing: border-box')
    expect(order).not.toContain('content-box')
  })

  /** Ancorado na quina, nunca centrado: selo centrado cobre o glifo por definição, em qualquer tamanho. */
  it('a âncora é a quina superior esquerda, e o canto oposto continua sendo da contagem', () => {
    const order = rule('tilePinOrder')
    expect(order).toContain('top: var(--timeline-order-badge-offset)')
    expect(order).toContain('left: var(--timeline-order-badge-offset)')
    expect(order).not.toContain('right:')
    expect(TIMELINE_MAP_ORDER_BADGE_CORNER).toBe('top-left')

    const count = rule('tilePinCount')
    expect(count).toContain('right:')
    expect(count).not.toContain('left:')
  })

  it('o deslocamento tira o selo para fora da caixa do pino, e não para dentro dela', () => {
    expect(TIMELINE_MAP_ORDER_BADGE_STYLE['--timeline-order-badge-offset']).toMatch(/^-/)
  })

  /**
   * ⚠️ `--color-asphalt` e `--color-fog` trocam de significado entre os temas: `asphalt` é a
   * superfície, `fog` é a tinta. Pintar o selo na ordem natural o deixa da cor do papel — e o papel
   * do basemap é essa mesma cor, então a metade que cai sobre o mapa some. O par vai invertido, nos
   * dois elementos que vivem sobre o mapa.
   */
  it('o selo e o rótulo são pintados no par invertido, para sobreviverem ao papel do mapa', () => {
    for (const name of ['tilePinOrder', 'tileLegLabel']) {
      const declarations = rule(name)
      expect(declarations).toContain('background: var(--color-fog)')
      expect(declarations).toContain('color: var(--color-asphalt)')
    }
  })
})

/**
 * ⚠️ **O defeito medido na tela: quatro pinos, três trechos, zero tempo visível.** Os spans reais no
 * enquadramento de abertura eram 32,0 / 14,2 / 1,4px — os quatro eventos aconteceram no mesmo lugar,
 * e os pinos só se separam porque o leque os afasta. Dois defeitos distintos moravam aí: o limiar de
 * 72px escondia os rótulos que existiam, e um terceiro **nunca chegou a ser criado**, porque o par
 * 2→3 caiu no mesmo índice da polilinha e `resolveRouteLegs` descartou o trecho degenerado.
 *
 * O conserto separa as duas coisas: **quem tem rótulo é o par consecutivo da cronologia**, não o
 * traço desenhado — o traço só escolhe onde ancorar. E não existe mais estado "sem lugar": o rótulo
 * que não cabe sobre o traço encosta no pino de destino.
 */
describe('o tempo entre eventos aparece no enquadramento de abertura (spec 196 — tarefa B)', () => {
  const PIN = { x: -46.6, y: -23.5 } as const

  function point(sequence: number, longitude: number) {
    return { latitude: PIN.y, longitude, sequence }
  }

  const CONTENT = { aria: 'uma hora depois', text: '1 h' } as const

  it('o rótulo nunca fica sem lugar: traço curto o encosta no pino, não o apaga', () => {
    expect(resolveLegLabelPlacement({ spanPixels: 0, textPixels: 42 })).toBe('pin')
    expect(resolveLegLabelPlacement({ spanPixels: 1.4, textPixels: 42 })).toBe('pin')
    expect(resolveLegLabelPlacement({ spanPixels: 400, textPixels: 42 })).toBe('trace')
  })

  /** O limiar sai da largura **medida** do texto, não de um número solto: "2 h 15 min" pede mais que "1 h". */
  it('o que o traço precisa comportar é o texto que ele vai carregar', () => {
    const narrow = 30
    const wide = 90
    expect(
      resolveLegLabelPlacement({
        spanPixels: narrow + TIMELINE_MAP_LEG_LABEL_GAP_PIXELS,
        textPixels: narrow,
      }),
    ).toBe('trace')
    expect(
      resolveLegLabelPlacement({
        spanPixels: narrow + TIMELINE_MAP_LEG_LABEL_GAP_PIXELS,
        textPixels: wide,
      }),
    ).toBe('pin')
  })

  /** Três pares consecutivos dão três rótulos — mesmo que o desenho só tenha conseguido cortar dois trechos. */
  it('o trecho sem geometria não apaga o rótulo: ele ancora no meio entre os dois pontos', () => {
    const points = [point(1, -46.6), point(2, -46.5), point(3, -46.4), point(4, -46.3)]
    const labels = resolveTimelineLegLabels({
      content: () => CONTENT,
      legPoints: new Map([
        [
          2,
          [
            { x: -46.6, y: -23.5 },
            { x: -46.55, y: -23.52 },
            { x: -46.5, y: -23.5 },
          ],
        ],
        [
          4,
          [
            { x: -46.4, y: -23.5 },
            { x: -46.3, y: -23.5 },
          ],
        ],
      ]),
      points,
    })

    expect(labels.map((label) => label.toSequence)).toEqual([2, 3, 4])
    /** O trecho 2→3 não foi cortado pelo roteirizador; a âncora cai no meio da reta entre os pinos. */
    expect(labels[1]?.anchor).toEqual({ x: -46.45, y: -23.5 })
    /** O que foi cortado usa o meio do traço desenhado, que não é o meio da reta. */
    expect(labels[0]?.anchor).toEqual({ x: -46.55, y: -23.52 })
  })

  it('as pontas de cada rótulo são os dois pinos que ele separa, e não as pontas do traço', () => {
    const labels = resolveTimelineLegLabels({
      content: () => CONTENT,
      legPoints: new Map(),
      points: [point(1, -46.6), point(2, -46.5)],
    })

    expect(labels).toHaveLength(1)
    expect(labels[0]?.from).toEqual({ x: -46.6, y: -23.5 })
    expect(labels[0]?.to).toEqual({ x: -46.5, y: -23.5 })
  })

  /**
   * ⚠️ **"0 min" sobre um traço não informa nada** e ocupa o espaço que o próprio rótulo diz não ter
   * — eram dois dos três desta viagem. Menos de um minuto não é espaçamento: é a ausência dele. A
   * lista ao lado continua dizendo "0 min depois do ponto anterior", onde a frase não disputa pixel
   * com o desenho.
   */
  it('o mapa não escreve intervalo abaixo de um minuto; a lista continua escrevendo', () => {
    const view = resolveTimelineMapView(
      [
        located('a', '2026-09-18T08:00:00.000Z', 'stop.arrived', -23.7, -46.8),
        located('b', '2026-09-18T08:00:20.000Z', 'document.delivered', -23.5, -46.6),
        located('c', '2026-09-18T08:30:00.000Z', 'stop.departed', -23.4, -46.5),
      ],
      translate,
    )

    expect(view.points[1]?.intervalLabel).toBe('eventTimeline.duration.minutes(count=0)')
    expect(resolveTimelineLegLabelText(view.points[1], translate)).toBeUndefined()
    expect(resolveTimelineLegLabelText(view.points[2], translate)?.text).toBe(
      'eventTimeline.duration.minutes(count=30)',
    )
  })

  /** O primeiro ponto não tem anterior: ele nunca carrega rótulo, e isso não é um rótulo perdido. */
  it('o primeiro ponto não ganha rótulo, porque não há trecho antes dele', () => {
    const view = resolveTimelineMapView(
      [located('a', '2026-09-18T08:00:00.000Z', 'stop.arrived', -23.7, -46.8)],
      translate,
    )

    expect(resolveTimelineLegLabelText(view.points[0], translate)).toBeUndefined()
  })
})

/**
 * ⚠️ **Uma regra que esconde sempre não é degradação graciosa — é a funcionalidade não entregue.** O
 * primeiro rótulo nunca some: o que a sobreposição recolhe é o segundo que cairia por cima de um já
 * colocado, e nessa ordem, a cronológica. Sem este piso, a correção do limiar reabriria o mesmo
 * defeito por outro caminho.
 */
describe('a sobreposição recolhe o rótulo de cima, nunca a informação inteira', () => {
  const BOX = { height: 16, width: 42, x: 0, y: 0 } as const

  it('o primeiro rótulo é sempre visível, aconteça o que acontecer com os seguintes', () => {
    const stacked = [BOX, BOX, BOX]

    expect(resolveLegLabelVisibility(stacked)).toEqual([true, false, false])
  })

  it('rótulos que não se tocam ficam todos', () => {
    const spread = [BOX, { ...BOX, x: 60 }, { ...BOX, x: 120 }]

    expect(resolveLegLabelVisibility(spread)).toEqual([true, true, true])
  })

  /** Encostar não é cobrir: a caixa seguinte começa onde a anterior termina e as duas continuam legíveis. */
  it('quem só encosta na quina continua visível', () => {
    expect(resolveLegLabelVisibility([BOX, { ...BOX, x: BOX.width }])).toEqual([true, true])
  })
})
