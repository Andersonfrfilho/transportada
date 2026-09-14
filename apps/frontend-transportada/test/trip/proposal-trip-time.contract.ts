/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Decisão do usuário (2026-09-13): **uma conta só de tempo para a proposta de roteiro.** O cartão
 * (`TripProposalRow`), a faixa "Tempo" do detalhe (`TripProposalDetail`) e a frase do mapa
 * (`TripAssemblyMap`) mostram o mesmo número — o do servidor: estrada de ida + volta ao barracão
 * (quando a política manda voltar) + tempo parado de todas as entregas.
 *
 * ⚠️ Antes, o mapa refazia a estrada no OSRM e somava 20 min por **trecho** (paradas − 1): a
 * primeira entrega não parava, e o número do mapa discordava do cartão logo acima.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type {
  SuggestionDistanceParts,
  SuggestionDurationParts,
} from '@/modules/routing/shared/suggestionValuation.service'
import {
  describeProposalDistance,
  describeProposalTripDistance,
} from '@/modules/trip/shared/proposalTripDistance.service'
import { describeProposalTripTime } from '@/modules/trip/shared/proposalTripTime.service'
import trip from '@/modules/trip/locales/trip.locale.json'

const UNITS = { days: 'd', hours: 'h', minutes: 'min' }

/** O `t` do i18next, reduzido ao que a frase usa: caminho com ponto, `{{x}}` e plural por `count`. */
function translate(key: string, values: Record<string, number | string> = {}): string {
  const count = values.count
  const pluralKey = typeof count === 'number' ? `${key}_${count === 1 ? 'one' : 'other'}` : key
  const template = [pluralKey, key]
    .map((candidate) => readPath(trip, candidate))
    .find((entry): entry is string => typeof entry === 'string')
  if (template === undefined) throw new Error(`chave ausente no locale: ${key}`)

  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(values[name] ?? ''))
}

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, segment) => {
    if (typeof node !== 'object' || node === null) return undefined
    return (node as Record<string, unknown>)[segment]
  }, root)
}

/** A viagem de 24 entregas: 4 h 28 min de estrada, 24 × 20 min parados, 1 h 2 min de volta. */
function parts(overrides: Partial<SuggestionDurationParts> = {}): SuggestionDurationParts {
  return {
    drivingSeconds: 16_080,
    returnSeconds: 3_720,
    returnStatus: 'included',
    serviceSeconds: 28_800,
    ...overrides,
  }
}

function describeTime(input: {
  readonly durationParts: null | SuggestionDurationParts
  readonly durationSeconds: null | number
  readonly isReordered?: boolean
  readonly stopCount?: number
}): string {
  return describeProposalTripTime({
    durationParts: input.durationParts,
    durationSeconds: input.durationSeconds,
    isReordered: input.isReordered ?? false,
    stopCount: input.stopCount ?? 24,
    translate,
    units: UNITS,
  })
}

describe('a frase do tempo da proposta (decisão 2026-09-13)', () => {
  it('diz a composição: estrada + volta + paradas (24 entregas × 20 min)', () => {
    expect(describeTime({ durationParts: parts(), durationSeconds: 48_600 })).toBe(
      'Tempo do roteiro: 13 h 30 min — estrada 4 h 28 min + volta 1 h 2 min + 8 h paradas (24 entregas × 20 min).',
    )
  })

  /** Sugestão antiga: a política mandava voltar e ninguém gravou a perna — a tela diz isso. */
  it('com volta desconhecida, diz que o número vem sem a volta ao barracão', () => {
    expect(
      describeTime({
        durationParts: parts({ returnSeconds: null, returnStatus: 'unknown' }),
        durationSeconds: 44_880,
      }),
    ).toBe(
      'Tempo do roteiro: 12 h 28 min — estrada 4 h 28 min + 8 h paradas (24 entregas × 20 min), sem a volta ao barracão.',
    )
  })

  it('sem retorno pela política não fala de volta', () => {
    expect(
      describeTime({
        durationParts: parts({ returnSeconds: null, returnStatus: 'not_planned' }),
        durationSeconds: 44_880,
      }),
    ).toBe(
      'Tempo do roteiro: 12 h 28 min — estrada 4 h 28 min + 8 h paradas (24 entregas × 20 min).',
    )
  })

  /** Tempo parado que não divide igual pelas entregas não vira "× média" inventada. */
  it('tempo parado desigual entre entregas só conta as entregas', () => {
    expect(
      describeTime({
        durationParts: parts({
          returnSeconds: null,
          returnStatus: 'not_planned',
          serviceSeconds: 1_000,
        }),
        durationSeconds: 17_080,
        stopCount: 3,
      }),
    ).toBe('Tempo do roteiro: 4 h 45 min — estrada 4 h 28 min + 17 min paradas (3 entregas).')
  })

  /** Spec 145 D17: com a API velha a composição não vem, e o total do servidor sai sozinho. */
  it('sem a composição (API velha), imprime só o total do servidor', () => {
    expect(describeTime({ durationParts: null, durationSeconds: 16_080 })).toBe(
      'Tempo do roteiro: 4 h 28 min.',
    )
  })

  it('sem o total do servidor, diz que não mediu — nunca calcula por conta própria', () => {
    expect(describeTime({ durationParts: null, durationSeconds: null })).toBe(
      trip.assemblyMap.proposalTime.unmeasured,
    )
  })

  /** Ordem trocada à mão: o total do servidor descreve a ordem do roteirizador, e não é impresso. */
  it('com a ordem trocada à mão, não imprime o total da ordem do roteirizador', () => {
    expect(
      describeTime({ durationParts: parts(), durationSeconds: 48_600, isReordered: true }),
    ).toBe(trip.assemblyMap.proposalTime.reordered)
  })
})

/**
 * Decisão do usuário (2026-09-13, segunda parte): a volta ao barracão entra também na **distância**
 * da proposta. O servidor já serve o total (ida + volta); a tela só o descreve, e sem a volta
 * gravada diz "sem a volta ao barracão" — o mesmo aviso do tempo.
 */
describe('a distância da proposta (decisão 2026-09-13)', () => {
  const distanceParts = (
    overrides: Partial<SuggestionDistanceParts> = {},
  ): SuggestionDistanceParts => ({
    outboundMeters: 244_000,
    returnMeters: 70_000,
    returnStatus: 'included',
    ...overrides,
  })

  it('o cartão e o detalhe imprimem o total do servidor (ida + volta)', () => {
    expect(
      describeProposalDistance({
        distanceMeters: 314_000,
        distanceParts: distanceParts(),
        translate,
      }),
    ).toBe('314.0 km')
  })

  it('sem a volta gravada, o total é só a ida e diz isso', () => {
    expect(
      describeProposalDistance({
        distanceMeters: 244_000,
        distanceParts: distanceParts({ returnMeters: null, returnStatus: 'unknown' }),
        translate,
      }),
    ).toBe('244.0 km · sem a volta ao barracão')
  })

  it('sem distância do servidor é ausência — nunca zero', () => {
    expect(describeProposalDistance({ distanceMeters: null, distanceParts: null, translate })).toBe(
      null,
    )
  })

  it('o mapa diz a composição: ida + volta', () => {
    expect(
      describeProposalTripDistance({
        distanceMeters: 314_000,
        distanceParts: distanceParts(),
        isReordered: false,
        translate,
      }),
    ).toBe('Rodagem do roteiro: 314.0 km — ida 244.0 km + volta 70.0 km.')
  })

  it('o mapa, sem a volta gravada, diz que a rodagem vem sem ela', () => {
    expect(
      describeProposalTripDistance({
        distanceMeters: 244_000,
        distanceParts: distanceParts({ returnMeters: null, returnStatus: 'unknown' }),
        isReordered: false,
        translate,
      }),
    ).toBe('Rodagem do roteiro: 244.0 km — só a ida, sem a volta ao barracão.')
  })

  it('o mapa, sem retorno pela política ou com a API velha, imprime só o total', () => {
    const plain = 'Rodagem do roteiro: 244.0 km.'
    expect(
      describeProposalTripDistance({
        distanceMeters: 244_000,
        distanceParts: distanceParts({ returnMeters: null, returnStatus: 'not_planned' }),
        isReordered: false,
        translate,
      }),
    ).toBe(plain)
    expect(
      describeProposalTripDistance({
        distanceMeters: 244_000,
        distanceParts: null,
        isReordered: false,
        translate,
      }),
    ).toBe(plain)
  })

  /** Ordem trocada à mão: o total do servidor é da ordem do roteirizador — o mapa não o imprime. */
  it('com a ordem trocada à mão, o mapa não imprime a rodagem do roteirizador', () => {
    expect(
      describeProposalTripDistance({
        distanceMeters: 314_000,
        distanceParts: distanceParts(),
        isReordered: true,
        translate,
      }),
    ).toBe(null)
  })
})

describe('os três pontos leem o total do servidor', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const row = read('../../src/modules/trip/components/TripProposalRow.component.tsx')
  const detail = read('../../src/modules/trip/components/TripProposalDetail.component.tsx')
  const map = read('../../src/modules/trip/components/TripAssemblyMap.component.tsx')
  const view = read('../../src/modules/trip/shared/proposalView.service.ts')
  const phrase = read('../../src/modules/trip/shared/proposalTripTime.service.ts')

  it('a linha da proposta vem da conta do servidor, com a composição ao lado', () => {
    expect(view).toInclude('durationSeconds: entry?.durationSeconds ?? null')
    expect(view).toInclude('durationParts: entry?.durationParts ?? null')
  })

  it('o cartão e a faixa do detalhe imprimem o mesmo durationSeconds', () => {
    expect(row).toInclude('formatDuration(view.durationSeconds, durationUnits)')
    expect(detail).toInclude('formatDuration(view.durationSeconds, durationUnits)')
  })

  it('o detalhe entrega ao mapa a frase do servidor, e o mapa a imprime em vez da conta própria', () => {
    expect(detail).toInclude('describeProposalTripTime(')
    expect(detail).toInclude('durationSeconds: view.durationSeconds')
    expect(detail).toInclude('proposalTimeText={proposalTimeText}')
    expect(map).toInclude('proposalTimeText === undefined')
  })

  it('cartão, detalhe e mapa descrevem a distância do servidor, com a composição ao lado', () => {
    expect(view).toInclude('distanceParts: entry?.distanceParts ?? null')
    expect(row).toInclude('describeProposalDistance({')
    expect(detail).toInclude('describeProposalDistance({')
    expect(detail).toInclude('describeProposalTripDistance({')
    expect(row).not.toInclude('formatDistance(view.distanceMeters)')
  })

  /** ⚠️ A frase da proposta não soma nada: nem 20 min por trecho, nem estrada do OSRM. */
  it('a frase da proposta não tem constante de tempo parado nem trecho do mapa', () => {
    expect(phrase).not.toInclude('STOP_SERVICE')
    expect(phrase).not.toInclude('AssemblyLeg')
    expect(phrase).not.toInclude('totalAssemblyMinutes')
  })
})
