/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import { PROOF_FRAME_SIZE } from '../../src/modules/driver-trip/shared/proofUpload.constant'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const STYLES = readSource('src/modules/driver-trip/styles/driverTrip.module.css')

function slice(input: { readonly from: string; readonly to: string }): string {
  const start = CARD.indexOf(input.from)
  expect(start).toBeGreaterThan(-1)
  const end = CARD.indexOf(input.to, start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

/** Vazio não é carregando: não há nada a caminho, o app espera o motorista. */
describe('a moldura sem foto é um marcador estático', () => {
  const empty = (): string =>
    slice({ from: 'function renderEmptyFrame()', to: 'function renderLoadingFrame(' })

  it('sem Skeleton, sem role="status", sem aria-busy', () => {
    expect(empty()).not.toInclude('Skeleton')
    expect(empty()).not.toInclude('role="status"')
    expect(empty()).not.toInclude('aria-busy')
  })

  it('mostra o ícone de câmera e o rótulo do locale', () => {
    expect(empty()).toInclude('<Icon name="camera"')
    expect(empty()).toInclude("t('proofCapture.upload.empty')")
  })

  it('o Skeleton fica só no carregamento de verdade', () => {
    const loading = slice({
      from: 'function renderLoadingFrame(',
      to: 'function renderAttachedThumbnail(',
    })
    expect(loading).toInclude('<SkeletonGroup')
    expect(loading).toInclude('<Skeleton ')
  })

  it('contorno tracejado na largura inteira do card, sem animação', () => {
    const rule = STYLES.slice(STYLES.indexOf('.proofEmptyFrame {'))
    const block = rule.slice(0, rule.indexOf('}'))
    expect(block).toInclude('dashed')
    expect(block).toInclude('width: 100%')
    expect(block).toInclude(`min-height: ${PROOF_FRAME_SIZE}`)
    expect(block).not.toInclude(`width: ${PROOF_FRAME_SIZE}`)
    expect(block).not.toInclude('animation')
  })

  it('o texto existe em pt-BR e en', () => {
    expect(driverTrip.proofCapture.upload.empty).toBeString()
    expect(driverTripEn.proofCapture.upload.empty).toBeString()
  })
})
