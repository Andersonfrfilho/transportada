/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T2.3 (RF4): a transferência de tripulação na linha do tempo da viagem — o vocabulário, a
 * chave `crewTransfer` com chave exata e o texto "quem saiu → quem entrou". Dados sintéticos.
 */
import { describe, expect, it } from 'bun:test'

import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import tripPt from '../../src/modules/trip/locales/trip.locale.json'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import {
  TRIP_TIMELINE_KINDS,
  type TripTimelineCrewMember,
  type TripTimelineItem,
} from '../../src/modules/trip/shared/trip.types'
import { resolveTripTimelineIcon } from '../../src/modules/trip/shared/tripTimelineRow.service'
import { resolveTripTimelineTitle } from '../../src/modules/trip/shared/tripTimeline.service'
import { resolveTripTimelineCrewTransfer } from '../../src/modules/trip/shared/tripTimelineCrewTransfer.service'
import { TIMELINE_MAP_CATEGORY_BY_KIND } from '../../src/modules/trip/shared/tripTimelineMap.constant'

const adapters = createTripResponseAdapters()

const translate = (key: string, options?: Record<string, unknown>): string =>
  options === undefined
    ? key
    : `${key}(${Object.entries(options)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`

function member(
  role: 'driver' | 'helper',
  name: string,
  position: number,
  driverId = `id-${name}`,
): TripTimelineCrewMember {
  return { driverId, name, position, role }
}

const BASE_ITEM = {
  actorName: 'Marina Alves',
  channel: 'backoffice' as const,
  closeReason: null,
  document: null,
  fromStatus: null,
  id: 'crew-1',
  kind: 'crew_transfer' as const,
  location: null,
  locationState: null,
  occurrence: null,
  occurredAt: '2026-10-07T12:00:00.000Z',
  onBehalfOfDriverName: null,
  recordedAt: null,
  returnReason: null,
  stop: null,
  toStatus: null,
}

const CREW_TRANSFER = {
  costDifference: '500.00',
  mdfeDriverDivergence: false,
  nextCrew: [member('driver', 'João', 1)],
  previousCrew: [member('driver', 'Maria', 1)],
  reason: 'Maria passou mal na estrada',
}

const CREW_ITEM = { ...BASE_ITEM, crewTransfer: CREW_TRANSFER }

function itemWith(crewTransfer: unknown): Record<string, unknown> {
  return { ...BASE_ITEM, crewTransfer }
}

function parse(item: unknown): readonly TripTimelineItem[] {
  return adapters.tripTimelineFromApi({ items: [item], nextCursor: null }).items
}

function without(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...source }
  delete copy[key]
  return copy
}

function lookup(dictionary: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      dictionary,
    )
}

describe('vocabulário da linha do tempo com a transferência de tripulação (spec 249)', () => {
  it('crew_transfer entra no fim da lista de kinds, depois do endereço corrigido', () => {
    expect([...TRIP_TIMELINE_KINDS].slice(-2)).toEqual(['stop.address_corrected', 'crew_transfer'])
  })

  it('o evento tem ícone de equipe, tom neutro e fica fora do mapa da viagem', () => {
    expect(resolveTripTimelineIcon({ ...CREW_ITEM } as TripTimelineItem)).toEqual({
      icon: 'workspace-users',
      tone: 'neutral',
    })
    expect(TIMELINE_MAP_CATEGORY_BY_KIND.crew_transfer).toBeNull()
  })

  it('o título é "Tripulação transferida"', () => {
    expect(resolveTripTimelineTitle(CREW_ITEM as TripTimelineItem, translate)).toBe(
      'eventTimeline.itemTitle.crewTransfer',
    )
    expect(lookup(tripPt, 'eventTimeline.itemTitle.crewTransfer')).toBe('Tripulação transferida')
  })
})

describe('validação do crewTransfer, com chave exata (spec 249 RF4)', () => {
  it('aceita o evento completo, com diferença de custo', () => {
    expect(parse(CREW_ITEM)[0]?.crewTransfer).toEqual(CREW_TRANSFER)
  })

  it('aceita o evento sem costDifference: a chave sai para quem não tem trip.financials', () => {
    const redacted = without(CREW_TRANSFER, 'costDifference')

    expect(parse(itemWith(redacted))[0]?.crewTransfer).toEqual(redacted as never)
    expect('costDifference' in (parse(itemWith(redacted))[0]?.crewTransfer ?? {})).toBe(false)
  })

  it('aceita diferença negativa e tripulação com vários integrantes por papel', () => {
    const page = parse(
      itemWith({
        ...CREW_TRANSFER,
        costDifference: '-540.00',
        nextCrew: [member('driver', 'João', 1), member('helper', 'Ana', 2)],
        previousCrew: [member('driver', 'Maria', 1), member('helper', 'Pedro', 2)],
      }),
    )

    expect(page[0]?.crewTransfer?.costDifference).toBe('-540.00')
  })

  it('o item crew_transfer sem crewTransfer é inválido', () => {
    expect(() => parse(BASE_ITEM)).toThrow()
  })

  it('crewTransfer em qualquer outro kind reprova a página', () => {
    for (const kind of TRIP_TIMELINE_KINDS.filter((candidate) => candidate !== 'crew_transfer')) {
      expect(() => parse({ ...BASE_ITEM, crewTransfer: CREW_TRANSFER, kind })).toThrow()
    }
  })

  it('recusa chave a mais e chave obrigatória faltando no crewTransfer', () => {
    expect(() => parse(itemWith({ ...CREW_TRANSFER, costBefore: '10.00' }))).toThrow()
    for (const key of ['mdfeDriverDivergence', 'nextCrew', 'previousCrew', 'reason']) {
      expect(() => parse(itemWith(without(CREW_TRANSFER, key)))).toThrow()
    }
  })

  it('recusa dinheiro que não é string decimal, inclusive null', () => {
    for (const costDifference of [500, null, '500,00', '', 'abc', undefined]) {
      expect(() => parse(itemWith({ ...CREW_TRANSFER, costDifference }))).toThrow()
    }
  })

  it('recusa mdfeDriverDivergence que não é booleano e motivo que não é texto', () => {
    expect(() => parse(itemWith({ ...CREW_TRANSFER, mdfeDriverDivergence: 'true' }))).toThrow()
    expect(() => parse(itemWith({ ...CREW_TRANSFER, reason: null }))).toThrow()
  })

  it('recusa tripulação que não é lista', () => {
    expect(() => parse(itemWith({ ...CREW_TRANSFER, nextCrew: null }))).toThrow()
    expect(() => parse(itemWith({ ...CREW_TRANSFER, previousCrew: 'Maria' }))).toThrow()
  })

  it('integrante com as quatro chaves exatas: chave a mais, faltando ou fora do tipo reprova', () => {
    const valid = member('driver', 'João', 1)
    const invalidMembers: readonly unknown[] = [
      { ...valid, cpf: '12345678901' },
      without(valid, 'position'),
      without(valid, 'driverId'),
      { ...valid, role: 'owner' },
      { ...valid, position: '1' },
      { ...valid, position: -1 },
      { ...valid, name: null },
      { ...valid, driverId: 7 },
    ]

    for (const invalid of invalidMembers) {
      expect(() => parse(itemWith({ ...CREW_TRANSFER, nextCrew: [invalid] }))).toThrow()
      expect(() => parse(itemWith({ ...CREW_TRANSFER, previousCrew: [invalid] }))).toThrow()
    }
  })

  it('um item de kind desconhecido com crewTransfer continua sendo descartado, não recusa a página', () => {
    const page = adapters.tripTimelineFromApi({
      items: [{ ...CREW_ITEM, id: 'item-1', kind: 'stop.invented_by_a_newer_api' }],
      nextCursor: null,
    })

    expect(page.items).toEqual([])
  })
})

describe('quem saiu → quem entrou, por papel (spec 249 RF4)', () => {
  function resolve(overrides: Partial<typeof CREW_TRANSFER>) {
    const item = { ...BASE_ITEM, crewTransfer: { ...CREW_TRANSFER, ...overrides } }
    return resolveTripTimelineCrewTransfer(item as TripTimelineItem, translate)
  }

  it('só o evento de transferência tem o resumo', () => {
    expect(
      resolveTripTimelineCrewTransfer(
        { ...BASE_ITEM, kind: 'trip.created' } as TripTimelineItem,
        translate,
      ),
    ).toBeNull()
    expect(
      resolveTripTimelineCrewTransfer({ ...BASE_ITEM } as TripTimelineItem, translate),
    ).toBeNull()
  })

  it('troca de motorista: "Maria → João", motivo e diferença de custo com sinal', () => {
    expect(resolve({})).toEqual({
      changes: ['eventTimeline.crewTransfer.change.driver(from=Maria,to=João)'],
      costDifference: 'eventTimeline.crewTransfer.costDifference(amount=+R$\u00a0500,00)',
      hasMdfeDivergence: false,
      reason: 'eventTimeline.crewTransfer.reason(reason=Maria passou mal na estrada)',
    })
  })

  it('diferença negativa mantém o sinal e zero não ganha sinal', () => {
    expect(resolve({ costDifference: '-540.00' })?.costDifference).toBe(
      'eventTimeline.crewTransfer.costDifference(amount=-R$ 540,00)',
    )
    expect(resolve({ costDifference: '0.00' })?.costDifference).toBe(
      'eventTimeline.crewTransfer.costDifference(amount=R$ 0,00)',
    )
  })

  it('sem a chave costDifference a linha de custo some', () => {
    expect(resolve(without(CREW_TRANSFER, 'costDifference') as never)?.costDifference).toBeNull()
  })

  it('o aviso de MDF-e vem do mdfeDriverDivergence', () => {
    expect(resolve({ mdfeDriverDivergence: true })?.hasMdfeDivergence).toBe(true)
    expect(resolve({ mdfeDriverDivergence: false })?.hasMdfeDivergence).toBe(false)
  })

  it('motoristas e ajudantes ganham uma frase cada, motorista primeiro', () => {
    const view = resolve({
      nextCrew: [member('helper', 'Ana', 2), member('driver', 'João', 1)],
      previousCrew: [member('driver', 'Maria', 1), member('helper', 'Pedro', 2)],
    })

    expect(view?.changes).toEqual([
      'eventTimeline.crewTransfer.change.driver(from=Maria,to=João)',
      'eventTimeline.crewTransfer.change.helper(from=Pedro,to=Ana)',
    ])
  })

  it('quem continua não aparece: só os que saíram e os que entraram, pela posição', () => {
    const view = resolve({
      nextCrew: [
        member('driver', 'Maria', 1),
        member('driver', 'Carlos', 3),
        member('driver', 'João', 2),
      ],
      previousCrew: [member('driver', 'Maria', 1), member('driver', 'José', 2)],
    })

    expect(view?.changes).toEqual([
      'eventTimeline.crewTransfer.change.driver(from=José,to=João, Carlos)',
    ])
  })

  it('ajudante que entra sem ninguém que saísse escreve "ninguém" do lado vazio', () => {
    const view = resolve({
      nextCrew: [member('driver', 'Maria', 1), member('helper', 'Ana', 2)],
      previousCrew: [member('driver', 'Maria', 1)],
    })

    expect(view?.changes).toEqual([
      'eventTimeline.crewTransfer.change.helper(from=eventTimeline.crewTransfer.nobody,to=Ana)',
    ])
  })

  it('o ajudante que assume o volante sai de um papel e entra no outro', () => {
    const view = resolve({
      nextCrew: [member('driver', 'Ana', 1, 'id-ana')],
      previousCrew: [member('driver', 'Maria', 1), member('helper', 'Ana', 2, 'id-ana')],
    })

    expect(view?.changes).toEqual([
      'eventTimeline.crewTransfer.change.driver(from=Maria,to=Ana)',
      'eventTimeline.crewTransfer.change.helper(from=Ana,to=eventTimeline.crewTransfer.nobody)',
    ])
  })
})

describe('textos da transferência de tripulação nos dois idiomas (spec 249 RF4)', () => {
  const KEYS = [
    'eventTimeline.itemTitle.crewTransfer',
    'eventTimeline.crewTransfer.change.driver',
    'eventTimeline.crewTransfer.change.helper',
    'eventTimeline.crewTransfer.nobody',
    'eventTimeline.crewTransfer.reason',
    'eventTimeline.crewTransfer.costDifference',
    'eventTimeline.crewTransfer.mdfeDivergence',
  ]

  it('pt-BR e en têm todas as chaves, com os marcadores iguais', () => {
    for (const key of KEYS) {
      const portuguese = lookup(tripPt, key)
      const english = lookup(tripEn, key)
      expect([key, typeof portuguese]).toEqual([key, 'string'])
      expect([key, typeof english]).toEqual([key, 'string'])
      const placeholders = (text: unknown) =>
        String(text)
          .match(/\{\{\w+\}\}/gu)
          ?.sort() ?? []
      expect(placeholders(english)).toEqual(placeholders(portuguese))
    }
  })

  it('o aviso diz que o MDF-e autorizado segue com o condutor anterior', () => {
    expect(lookup(tripPt, 'eventTimeline.crewTransfer.mdfeDivergence')).toContain('MDF-e')
    expect(lookup(tripPt, 'eventTimeline.crewTransfer.mdfeDivergence')).toContain(
      'condutor anterior',
    )
  })
})
