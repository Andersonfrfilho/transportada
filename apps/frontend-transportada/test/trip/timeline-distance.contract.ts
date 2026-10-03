/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: a distância do toque até o ponto da parada saía em metro cru — `a 208255 m do ponto`,
 * que ninguém lê como 208 km. A escolha de unidade é regra, e regra se testa sozinha.
 */
import { describe, expect, it } from 'bun:test'

import {
  TRIP_TIMELINE_DISTANCE_COARSE_FRACTION_DIGITS,
  TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS,
  TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS,
  TRIP_TIMELINE_DISTANCE_PRECISE_FRACTION_DIGITS,
  TRIP_TIMELINE_METERS_PER_KILOMETER,
} from '../../src/modules/trip/shared/trip.constant'
import { formatTripTimelineDistance } from '../../src/modules/trip/shared/tripTimelineDetail.service'

type DistancePhrases = {
  readonly kilometers: string
  readonly meters: string
}

/** O arquivo de tradução é entrada externa aqui: ele é lido como texto, não importado tipado. */
async function readDistancePhrases(fileName: string): Promise<DistancePhrases> {
  const url = new URL(`../../src/modules/trip/locales/${fileName}`, import.meta.url)
  const parsed: unknown = JSON.parse(await Bun.file(url).text())
  const distance = (parsed as Record<string, Record<string, Record<string, unknown>>>).eventTimeline
    ?.location?.distance

  if (typeof distance !== 'object' || distance === null) {
    throw new Error(`frase de distância ausente em ${fileName}`)
  }
  return distance as DistancePhrases
}

const PORTUGUESE_LOCALE = await readDistancePhrases('trip.locale.json')
const ENGLISH_LOCALE = await readDistancePhrases('trip.en.locale.json')

describe('formatTripTimelineDistance (spec 196)', () => {
  it('abaixo do limiar fica em metro inteiro', () => {
    expect(formatTripTimelineDistance(0)).toEqual({ unit: 'meters', value: '0' })
    expect(formatTripTimelineDistance(12.4)).toEqual({ unit: 'meters', value: '12' })
    expect(formatTripTimelineDistance(999)).toEqual({ unit: 'meters', value: '999' })
  })

  it('no limiar já vira quilômetro', () => {
    expect(formatTripTimelineDistance(TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS)).toEqual({
      unit: 'kilometers',
      value: '1,0',
    })
  })

  it('até a faixa grossa mantém uma casa — 1,2 km é informação, 1 km perde a quadra', () => {
    expect(formatTripTimelineDistance(1240)).toEqual({ unit: 'kilometers', value: '1,2' })
    expect(formatTripTimelineDistance(9949)).toEqual({ unit: 'kilometers', value: '9,9' })
  })

  it('acima da faixa grossa a casa decimal vira ruído', () => {
    expect(
      formatTripTimelineDistance(TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS),
    ).toEqual({ unit: 'kilometers', value: '10' })
    expect(formatTripTimelineDistance(208255)).toEqual({ unit: 'kilometers', value: '208' })
    expect(formatTripTimelineDistance(189314)).toEqual({ unit: 'kilometers', value: '189' })
  })

  it('os números de corte e de casas são constantes, não literais soltos', () => {
    expect(TRIP_TIMELINE_METERS_PER_KILOMETER).toBe(1000)
    expect(TRIP_TIMELINE_DISTANCE_KILOMETER_THRESHOLD_METERS).toBe(1000)
    expect(TRIP_TIMELINE_DISTANCE_COARSE_KILOMETER_THRESHOLD_METERS).toBe(10000)
    expect(TRIP_TIMELINE_DISTANCE_PRECISE_FRACTION_DIGITS).toBe(1)
    expect(TRIP_TIMELINE_DISTANCE_COARSE_FRACTION_DIGITS).toBe(0)
  })
})

/**
 * A unidade muda a frase inteira, não só o número: "a 208 km do ponto" e "a 850 m do ponto" são
 * duas frases. Um locale só, com o número trocado, devolveria "a 208 m do ponto".
 */
describe('frase da distância nos dois idiomas (spec 196)', () => {
  for (const [name, locale] of [
    ['pt-BR', PORTUGUESE_LOCALE],
    ['en', ENGLISH_LOCALE],
  ] as const) {
    it(`${name} tem forma própria para metro e para quilômetro`, () => {
      const distance = locale

      expect(typeof distance.meters).toBe('string')
      expect(typeof distance.kilometers).toBe('string')
      expect(distance.meters).toContain('{{distance}}')
      expect(distance.kilometers).toContain('{{distance}}')
      expect(distance.meters).not.toBe(distance.kilometers)
      expect(distance.meters).toMatch(/\bm\b/)
      expect(distance.kilometers).toMatch(/\bkm\b/)
    })
  }
})
