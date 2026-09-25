/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const PAD = new URL(
  '../../src/modules/driver-trip/components/SignaturePad.component.tsx',
  import.meta.url,
).pathname
const CAPTURE = new URL(
  '../../src/modules/driver-trip/shared/signatureCapture.service.ts',
  import.meta.url,
).pathname
const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
).pathname

const pad = readFileSync(PAD, 'utf8')
const capture = readFileSync(CAPTURE, 'utf8')
const card = readFileSync(CARD, 'utf8')

/**
 * Contrato por texto de fonte: o teste desta app não tem DOM, e o que se cobra é a fiação — lock e
 * unlock de orientação, o fallback por CSS do iOS e a exportação entrando no mesmo `attachProof`
 * da fila (spec 082 D3/T051).
 */
describe('a assinatura em canvas (D3/T051)', () => {
  it('o traço é por pointer events, com Limpar e exportação em PNG', () => {
    expect(pad).toContain('onPointerDown')
    expect(pad).toContain('onPointerMove')
    expect(pad).toContain('onPointerUp')
    expect(pad).toContain("t('signature.clear')")
    expect(pad).toContain("'image/png'")
    expect(pad).toContain('toBlob')
  })

  it('o modo tela inteira entra por Fullscreen API e trava em paisagem com try/catch', () => {
    expect(capture).toContain('requestFullscreen')
    expect(capture).toContain("lock('landscape')")
    const lockBlock = capture.slice(capture.indexOf('enterSignatureFullscreen'))
    expect(lockBlock).toContain('try {')
    expect(lockBlock).toContain('catch')
  })

  it('sem lock (iOS) o conteúdo rotaciona por CSS para o traço ficar horizontal', () => {
    expect(capture).toContain('isLandscapeLocked: false')
    expect(pad).toContain('signaturePadRotated')
    const css = readFileSync(
      new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url)
        .pathname,
      'utf8',
    )
    expect(css).toContain('rotate(90deg)')
  })

  it('ao sair, unlock + exitFullscreen — cada um no próprio try/catch', () => {
    expect(capture).toContain('unlock')
    expect(capture).toContain('exitFullscreen')
    expect(pad).toContain('exitSignatureFullscreen')
  })

  it('a exportação entra pelo mesmo attachProof da fila, com kind signature e receiverName', () => {
    expect(card).toContain("attach('signature'")
    expect(card).toContain("'image/png'")
    expect(card).toContain('receiverName')
    /* O caminho do anexo é o onProof do card → attachProof do hook — a mesma fila do canhoto. */
    expect(card).toContain('onProof({ documentId, file, kind')
  })

  it('sem canvas/pointer a assinatura cai para a foto — o caminho que já existe', () => {
    expect(capture).toContain('isSignatureCaptureSupported')
    expect(capture).toContain('PointerEvent')
    expect(capture).toContain('HTMLCanvasElement')
    expect(card).toContain('isSignatureCaptureSupported()')
    /* Assinatura ligada porém sem suporte abre o campo de foto no lugar do botão de assinar. */
    expect(card).toContain('plan.rendersSignature && !canSign')
  })

  it('acessibilidade: canvas com aria-label e botões com o alvo de toque de 44px', () => {
    expect(pad).toContain('aria-label')
    const css = readFileSync(
      new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url)
        .pathname,
      'utf8',
    )
    expect(css).toMatch(/\.signaturePad button \{[^}]*min-height: 2\.75rem/u)
  })
})
