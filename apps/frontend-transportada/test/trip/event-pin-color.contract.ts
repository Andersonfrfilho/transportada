/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { NOTE_COLORS } from '@/modules/trip/shared/noteColor.service'
import {
  EVENT_PIN_COLOR,
  hexToLab,
  labDistance,
  stopColorOf,
} from '@/modules/trip/shared/stopColor.service'

/** O mesmo limiar da trava dos tons de nota (spec 119): abaixo disso as duas cores são a mesma. */
const SAME_COLOUR_DISTANCE = 6.2
/** O piso de contraste que a janela de luminância das paradas promete contra os dois fundos. */
const MINIMUM_CONTRAST = 2.4
/** Os papéis dos dois temas e a superfície clara do mapa, contra os quais o pino tem de se ver. */
const BACKGROUNDS = ['#10222c', '#fbf9f5', '#f0f2ee'] as const

function readMapSurface(): readonly string[] {
  const source = readFileSync(
    new URL('../../src/modules/trip/shared/stopColor.service.ts', import.meta.url),
    'utf8',
  )
  const block = source.match(/const MAP_SURFACE = \[([\s\S]*?)\] as const/)?.[1] ?? ''

  return block.match(/#[0-9a-f]{6}/gu) ?? []
}

function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Spec 196 T6.2: o pino do **evento** — onde o motorista tocou — não é uma parada, e precisa de cor
 * própria. Ela está presa às mesmas duas regras da paleta de parada, e este arquivo existe porque a
 * primeira tentativa foi um `#f5f5f5` escolhido a olho: contraste **1,04** contra o papel do tema
 * claro, isto é, invisível em metade das telas. Afirmar "neutro" não mede nada; isto mede.
 */
describe('a cor do pino do evento (spec 196 T6.2)', () => {
  it('é um hexadecimal bem formado', () => {
    expect(EVENT_PIN_COLOR).toMatch(/^#[0-9a-f]{6}$/u)
  })

  /** A janela que serve aos dois temas — a mesma que exclui o pastel e o quase preto. */
  it('fica dentro da janela de luminância das paradas', () => {
    const luminance = relativeLuminance(EVENT_PIN_COLOR)
    expect(luminance).toBeGreaterThanOrEqual(0.11)
    expect(luminance).toBeLessThanOrEqual(0.33)
  })

  it('tem contraste suficiente nos dois temas e sobre a superfície clara do mapa', () => {
    for (const background of BACKGROUNDS) {
      expect(contrastRatio(EVENT_PIN_COLOR, background)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
    }
  })

  it('não cai sobre o que já se desenha no mapa', () => {
    const surface = readMapSurface()
    expect(surface.length).toBeGreaterThan(0)
    for (const drawn of surface) {
      expect(labDistance(hexToLab(EVENT_PIN_COLOR), hexToLab(drawn))).toBeGreaterThan(
        SAME_COLOUR_DISTANCE,
      )
    }
  })

  /** O pino da parada fica no mesmo mapa, a centímetros dele — ler como parada é o defeito. */
  it('não é a cor de nenhuma parada que uma viagem real desenha', () => {
    for (let sequence = 1; sequence <= 96; sequence += 1) {
      expect(
        labDistance(hexToLab(EVENT_PIN_COLOR), hexToLab(stopColorOf(sequence))),
      ).toBeGreaterThan(SAME_COLOUR_DISTANCE)
    }
  })

  /** `TripCargoPanel` divide a tela de detalhe com a linha do tempo: a caixa da nota também conta. */
  it('não é a cor de nenhuma nota', () => {
    for (const color of NOTE_COLORS) {
      expect(labDistance(hexToLab(EVENT_PIN_COLOR), hexToLab(color))).toBeGreaterThan(
        SAME_COLOUR_DISTANCE,
      )
    }
  })
})
