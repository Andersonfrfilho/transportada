/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { ICON_PATHS } from '../../src/components/ui/icon'
import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

const CARD = readFileSync(
  new URL('../../src/modules/driver-trip/components/DriverStopCard.component.tsx', import.meta.url),
  'utf8',
)
const PICKER = readFileSync(
  new URL('../../src/components/ui/file-picker-button.tsx', import.meta.url),
  'utf8',
)

function proofSection(): string {
  const start = CARD.indexOf('export function DeliveryProofSection(')
  const end = CARD.indexOf('type OccurrenceFormProps')
  expect(start).toBeGreaterThan(-1)
  return CARD.slice(start, end)
}

/**
 * Pedido do usuário (25/09): "Anexar canhoto" em cima e "Tirar foto" dentro pareciam duas opções.
 * O canhoto virou três botões do mesmo design system — as duas portas da foto e a assinatura.
 */
describe('o canhoto são três botões iguais', () => {
  it('Tirar foto abre a câmera; Anexar não pede câmera; nada de campo de arquivo solto', () => {
    const section = proofSection()

    expect(section.match(/<FilePickerButton/gu)).toHaveLength(2)
    expect(section.match(/capture="environment"/gu)).toHaveLength(1)
    expect(section).not.toInclude('<FileField')
    expect(section).not.toInclude("t('proof')")
  })

  it('a assinatura tem ícone próprio, de caneta', () => {
    expect(proofSection()).toInclude('<Icon name="pen" />')
    expect(ICON_PATHS.pen.length).toBeGreaterThan(0)
  })

  /** O input continua existindo: é ele que o celular transforma em câmera ou galeria. */
  it('o botão abre um input de arquivo que fica fora da tabulação e do leitor de tela', () => {
    expect(PICKER).toInclude('type="file"')
    expect(PICKER).toInclude('tabIndex={-1}')
    expect(PICKER).toInclude('aria-hidden="true"')
    expect(PICKER).toInclude('localInputRef.current?.click()')
  })

  it('os textos existem em pt-BR e en', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      for (const key of ['title', 'attach', 'retake', 'attached', 'thumbnail'] as const) {
        expect(locale.proofCapture[key]).toBeString()
      }
    }
    expect(driverTrip.proofCapture.attach).toBe('Anexar')
    expect(driverTrip.choosePhoto).toBe('Tirar foto')
  })
})
