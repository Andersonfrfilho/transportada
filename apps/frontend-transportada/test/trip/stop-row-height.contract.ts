/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TRIP_STYLESHEET_PATH = 'src/modules/trip/styles/trip.module.css'

/**
 * A fileira da parada põe etiqueta, chip e botão lado a lado. O botão e o pegador de arraste não
 * encolhem — são alvo de toque —, então quem alinha é o resto: sem isso a linha tinha quatro
 * alturas (20, 23, 25,6 e 38,4px) e nenhuma delas parecia escolhida.
 */
const ROW_ALIGNED_CLASSES = [
  'stopSequence',
  'separationStatusBadge',
  'destinationOriginBadge',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function ruleBodyOf(stylesheet: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(stylesheet)
  return match?.[1] ?? ''
}

describe('altura da fileira da parada', () => {
  test('etiqueta e chip saem do mesmo token do controle ao lado', async () => {
    const stylesheet = await readApplicationFile(TRIP_STYLESHEET_PATH)

    for (const className of ROW_ALIGNED_CLASSES) {
      const body = ruleBodyOf(stylesheet, className)
      expect(body).toContain('height: var(--control-height-compact)')
      expect(body).toContain('align-items: center')
    }
  })

  /** `aspect-ratio` derivava a altura da largura do texto: dois dígitos davam um chip mais alto. */
  test('o chip de sequência não deriva a altura da própria largura', async () => {
    const stylesheet = await readApplicationFile(TRIP_STYLESHEET_PATH)

    expect(ruleBodyOf(stylesheet, 'stopSequence')).not.toContain('aspect-ratio')
  })
})
