/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const STYLES = readSource('src/modules/driver-trip/styles/driverTrip.module.css').replaceAll(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function cssBlock(selector: string): string {
  const start = STYLES.indexOf(`${selector} {`)
  expect(start).toBeGreaterThan(-1)
  return STYLES.slice(start, STYLES.indexOf('}', start))
}

function renderer(input: { readonly from: string; readonly to: string }): string {
  const start = CARD.indexOf(input.from)
  expect(start).toBeGreaterThan(-1)
  const end = CARD.indexOf(input.to, start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

const EMPTY = (): string =>
  renderer({ from: 'function renderEmptyFrame()', to: 'function renderConfirmedFrame()' })
const CONFIRMED = (): string =>
  renderer({ from: 'function renderConfirmedFrame()', to: 'function renderLoadingFrame(' })
const LOADING = (): string =>
  renderer({ from: 'function renderLoadingFrame(', to: 'function renderAttachedThumbnail(' })
const ATTACHED = (): string =>
  renderer({
    from: 'function renderAttachedThumbnail(',
    to: 'return (\n    <div className={styles.proofSection}>',
  })

/** Pedido do usuário (14/10): o card do comprovante não muda de altura na troca de estado. */
describe('a moldura única do anexo: mesma caixa em todo estado', () => {
  it('a caixa é a largura inteira do card com proporção por tipo — nunca altura em px', () => {
    const frame = cssBlock('.proofFrame')
    expect(frame).toInclude('width: 100%')
    expect(frame).toInclude('aspect-ratio: var(--proof-frame-ratio, 16 / 9)')
    expect(frame).not.toMatch(/(?<![\w-])(min-height|height)\s*:/)
  })

  it('cada tipo declara só a proporção: a assinatura é mais larga que a foto', () => {
    expect(cssBlock('.proofFrameSignature')).toInclude('--proof-frame-ratio: 2 / 1')
    expect(cssBlock('.proofFrame')).not.toInclude('--proof-frame-ratio:')
    expect(CARD).toInclude("kind === 'signature' ? (styles.proofFrameSignature ?? '') : ''")
  })

  it('as variantes de estado não impõem altura nem largura própria', () => {
    for (const selector of ['.proofEmptyFrame', '.proofConfirmedFrame']) {
      const block = cssBlock(selector)
      expect(block).not.toMatch(/(?<![\w-])(min-height|height|width)\s*:/)
    }
  })

  it('vazia, enviada, carregando e em fila montam a mesma moldura', () => {
    expect(EMPTY()).toInclude('styles.proofFrame')
    expect(CONFIRMED()).toInclude('styles.proofFrame')
    expect(LOADING()).toInclude('styles.proofFrame')
    expect(ATTACHED()).toInclude('styles.proofFrame')
  })

  it('o carregando preenche a caixa e herda a proporção do tipo (foto e assinatura)', () => {
    expect(LOADING()).toInclude('frameVariantClass(kind)')
    expect(LOADING()).toInclude('<Skeleton height="100%" width="100%" />')
    expect(LOADING()).not.toInclude('PROOF_FRAME_SIZE')
  })

  it('o anexo em fila é a miniatura clicável dentro da caixa, contida e sem corte', () => {
    expect(ATTACHED()).toInclude('frameVariantClass(kind)')
    expect(ATTACHED()).toInclude('styles.proofFrameImage')
    expect(ATTACHED()).toInclude('onClick={() => setOpenImageKind(kind)}')
    const image = cssBlock('.proofFrameImage')
    expect(image).toInclude('height: 100%')
    expect(image).toInclude('width: 100%')
    expect(image).toInclude('object-fit: contain')
  })

  it('o enviado mostra a miniatura guardada, clicável, dentro da caixa e sem corte', () => {
    expect(CONFIRMED()).toInclude("onClick={() => setOpenImageKind('photo')}")
    expect(CONFIRMED()).toInclude('storedThumbnailUrl === undefined ? null')
    const thumbnail = cssBlock('.proofConfirmedThumbnail')
    expect(thumbnail).toInclude('height: 100%')
    expect(thumbnail).toInclude('object-fit: contain')
    expect(cssBlock('.proofConfirmedThumbnailButton')).toInclude('height: 100%')
    expect(cssBlock('.proofConfirmedFrame')).toInclude('overflow: hidden')
  })

  it('sem miniatura guardada o enviado mantém o texto de confirmação na mesma caixa', () => {
    expect(CONFIRMED()).toInclude("t('proofCapture.upload.confirmed')")
    expect(CONFIRMED()).toInclude('styles.proofConfirmedText')
  })

  it('a troca de estado não anima altura: nenhuma transição nas molduras', () => {
    for (const selector of [
      '.proofFrame',
      '.proofFrameButton',
      '.proofFrameImage',
      '.proofEmptyFrame',
      '.proofConfirmedFrame',
      '.proofConfirmedThumbnail',
    ]) {
      const block = cssBlock(selector)
      expect(block).not.toInclude('transition')
      expect(block).not.toInclude('animation')
    }
  })

  it('a moldura quadrada fixa de antes não volta', () => {
    expect(CARD).not.toInclude('PROOF_FRAME_SIZE')
    expect(STYLES).not.toInclude('height: var(--space-16)')
    expect(STYLES).not.toInclude('min-height: var(--space-16)')
  })
})

const OCCURRENCE_PHOTO = readSource(
  'src/modules/driver-trip/components/OccurrencePhotoField.component.tsx',
)
const OCCURRENCE_SIGNATURE = readSource(
  'src/modules/driver-trip/components/OccurrenceSignatureField.component.tsx',
)
const NOT_DELIVERED = readSource(
  'src/modules/driver-trip/components/DriverNotDeliveredForm.component.tsx',
)

/** Pedido do usuário (14/10): os comprovantes das ocorrências seguem a mesma moldura do canhoto. */
describe('a moldura única também vale nas ocorrências', () => {
  it('a foto da ocorrência (nota e parada, 1 a 5 fotos) mostra a prévia na moldura 16:9', () => {
    expect(OCCURRENCE_PHOTO).toInclude('<div className={styles.proofFrame}>')
    expect(OCCURRENCE_PHOTO).toInclude('className={styles.proofFrameImage}')
    expect(OCCURRENCE_PHOTO).not.toInclude('proofCaptureThumbnail')
  })

  it('a assinatura da ocorrência usa a variante 2:1', () => {
    expect(OCCURRENCE_SIGNATURE).toInclude('`${styles.proofFrame} ${styles.proofFrameSignature}`')
    expect(OCCURRENCE_SIGNATURE).toInclude('className={styles.proofFrameImage}')
    expect(OCCURRENCE_SIGNATURE).not.toInclude('proofCaptureThumbnail')
  })

  it('a foto do "Não entreguei" mostra a prévia na moldura 16:9', () => {
    expect(NOT_DELIVERED).toInclude('<div className={styles.proofFrame}>')
    expect(NOT_DELIVERED).toInclude('className={styles.proofFrameImage}')
    expect(NOT_DELIVERED).not.toInclude('proofCaptureThumbnail')
  })

  it('nenhuma miniatura de altura automática sobrou no CSS', () => {
    expect(STYLES).not.toInclude('.proofCaptureThumbnail')
  })

  it('a miniatura clicável da moldura mantém o anel de foco do teclado', () => {
    expect(cssBlock('.proofFrameButton:focus-visible')).toInclude('outline: 2px solid')
  })
})
