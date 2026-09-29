/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const WORKSPACE = readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')
const PENDING_PROOFS = readSource('src/modules/driver-trip/pages/DriverPendingProofs.page.tsx')

/** A mesma fatia de `proof-attach-queue-first.contract.ts`: o corpo de `attach` até o `}` dela. */
function attachFunctionBody(): string {
  const start = CARD.indexOf("function attach(kind: 'photo' | 'signature', file: File): void {")
  expect(start).toBeGreaterThan(-1)
  const end = CARD.indexOf('\n  }', start)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

function captureSource(): string {
  const start = CARD.indexOf('function ProofCaptureFields(')
  expect(start).toBeGreaterThan(-1)
  return CARD.slice(start)
}

function handleProofSource(): string {
  const start = WORKSPACE.indexOf('function handleProof(')
  expect(start).toBeGreaterThan(-1)
  const end = WORKSPACE.indexOf('\n  }', start)
  return WORKSPACE.slice(start, end)
}

/**
 * Spec 218 (casos extremos, fila cheia com o gate): o teto da fila (30 itens / 50 MB, spec 203)
 * recusa o anexo — e o formulário precisa saber disso. Antes, `onProof` devolvia `void` e a captura
 * marcava "anexada" mesmo com a foto recusada: o gate habilitava "Confirmar entrega" sem canhoto
 * nenhum na fila. O motorista nunca pode achar que guardou uma foto que a fila recusou.
 */
describe('a fila cheia não deixa a foto parecer anexada (spec 218)', () => {
  it('onProof devolve se o anexo entrou na fila — no cartão, na nota e na seção', () => {
    expect(
      CARD.match(/onProof: \(input: DriverProofAttachment\) => Promise<boolean>/gu),
    ).toHaveLength(3)
    expect(CARD).not.toInclude('onProof: (input: DriverProofAttachment) => void')
    expect(PENDING_PROOFS).toInclude('onProof: (input: DriverProofAttachment) => Promise<boolean>')
  })

  it('attach() só marca anexada, com miniatura, depois do aceite da fila', () => {
    const body = attachFunctionBody()
    const call = body.indexOf('onProof({')
    expect(call).toBeGreaterThan(-1)
    expect(body).toInclude('isAccepted')
    expect(body.indexOf('setAttached(')).toBeGreaterThan(call)
    expect(body.indexOf('previewByKind[kind].showPhoto(file)')).toBeGreaterThan(call)
    expect(body.indexOf('setAttachedKey(')).toBeGreaterThan(call)
  })

  it('recusado, o formulário diz o que aconteceu, em aviso não-intrusivo com texto do locale', () => {
    expect(attachFunctionBody()).toInclude('setRefusedKind(kind)')
    const capture = captureSource()
    const notice = capture.slice(capture.indexOf('refusedKind === undefined ? null'))
    expect(notice).toInclude('role="status"')
    expect(notice).toInclude('t(`proofCapture.refused.${refusedKind}`)')
  })

  it('a página devolve ao formulário o que a fila respondeu — recusa e falha contam como não', () => {
    const body = handleProofSource()
    expect(body).toInclude('Promise<boolean>')
    expect(body).toInclude("outcome === 'queued'")
    expect(body).toInclude('return false')
  })

  it('os textos da recusa existem em pt-BR e en, por kind', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.proofCapture.refused.photo).toBeString()
      expect(locale.proofCapture.refused.signature).toBeString()
    }
    expect(driverTrip.proofCapture.refused.photo.toLowerCase()).toInclude('fila cheia')
  })
})
