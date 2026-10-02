/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  isProofConfirmedByServer,
  resolveProofUploadStatus,
} from '../../src/modules/driver-trip/shared/proofUploadStatus.service'

const CARD = readFileSync(
  new URL('../../src/modules/driver-trip/components/DriverStopCard.component.tsx', import.meta.url),
  'utf8',
)

const STYLES = readFileSync(
  new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
  'utf8',
)

const SETTLED_REQUIRED_PHOTO = {
  hasLocalAttachment: false,
  isDelivered: true,
  isRequired: true,
  kind: 'photo',
  proofPending: false,
} as const

/** Só a foto obrigatória deixa rastro no snapshot (`proofPending`); o resto o servidor não diz. */
describe('o comprovante que o servidor já tem, sem cópia neste aparelho', () => {
  it('entregue + obrigatória + proofPending false + sem anexo local: enviado pelo servidor', () => {
    expect(isProofConfirmedByServer(SETTLED_REQUIRED_PHOTO)).toBe(true)
  })

  it('proofPending true continua pendente: não finge que chegou', () => {
    expect(isProofConfirmedByServer({ ...SETTLED_REQUIRED_PHOTO, proofPending: true })).toBe(false)
  })

  it('foto opcional não infere nada', () => {
    expect(isProofConfirmedByServer({ ...SETTLED_REQUIRED_PHOTO, isRequired: false })).toBe(false)
  })

  it('assinatura não infere nada', () => {
    expect(isProofConfirmedByServer({ ...SETTLED_REQUIRED_PHOTO, kind: 'signature' })).toBe(false)
  })

  it('nota ainda não entregue não infere nada', () => {
    expect(isProofConfirmedByServer({ ...SETTLED_REQUIRED_PHOTO, isDelivered: false })).toBe(false)
  })

  it('com anexo local, a fila manda: segue "enviando"', () => {
    expect(isProofConfirmedByServer({ ...SETTLED_REQUIRED_PHOTO, hasLocalAttachment: true })).toBe(
      false,
    )
    expect(
      resolveProofUploadStatus({
        observation: { isAttached: true, isQueued: true, isRejected: false },
        tracker: { hasBeenQueued: true, sentAt: undefined },
      }),
    ).toBe('uploading')
  })

  it('a moldura confirmada vem antes da vazia e o botão vira troca, nunca primeira captura', () => {
    const start = CARD.indexOf('function renderAttachedThumbnail(')
    const body = CARD.slice(start, CARD.indexOf('const preview', start) + 400)
    expect(body.indexOf('isPhotoConfirmedByServer')).toBeGreaterThan(-1)
    expect(body.indexOf('isPhotoConfirmedByServer')).toBeLessThan(
      body.indexOf('renderEmptyFrame()'),
    )
    expect(CARD).toInclude('attached.photo || isPhotoConfirmedByServer ? retakeLabel')
  })

  /** Pedido do usuário (01/10): a foto já enviada aparece em miniatura, não só como frase. */
  it('com a miniatura guardada, a tela mostra a foto; sem ela, continua a moldura com a frase', () => {
    const start = CARD.indexOf('function renderConfirmedFrame()')
    const body = CARD.slice(start, CARD.indexOf('function renderLoadingFrame(', start))
    expect(body).toInclude('storedThumbnailUrl === undefined')
    expect(body).toInclude('styles.proofConfirmedFrame')
    expect(body).toInclude('styles.proofConfirmedThumbnail')
    expect(body).toInclude("setOpenImageKind('photo')")
    expect(CARD).toInclude('useStoredProofThumbnail({')
    expect(CARD).toInclude('enabled: isPhotoConfirmedByServer')
  })

  /** Pedido do usuário (01/10): a frase cabia num quadrado de 4rem e vazava por cima da borda. */
  it('a moldura confirmada ocupa a largura inteira do card, com a foto em miniatura', () => {
    const rule = STYLES.slice(STYLES.indexOf('.proofConfirmedFrame {'))
    const block = rule.slice(0, rule.indexOf('}'))
    expect(block).toInclude('width: 100%')
    expect(block).toInclude('min-height: var(--space-16)')
    expect(block).not.toInclude('width: var(--space-16)')

    const thumbnailRule = STYLES.slice(STYLES.indexOf('.proofConfirmedThumbnail {'))
    const thumbnail = thumbnailRule.slice(0, thumbnailRule.indexOf('}'))
    expect(thumbnail).toInclude('width: var(--space-16)')
    expect(thumbnail).toInclude('height: var(--space-16)')
  })

  it('o texto existe em pt-BR e en, sem hora', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.proofCapture.upload.confirmed).toBeString()
      expect(locale.proofCapture.upload.confirmed).not.toInclude('{{')
    }
  })
})
