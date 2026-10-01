/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const CARD = readFileSync(
  new URL('../../src/modules/driver-trip/components/DriverStopCard.component.tsx', import.meta.url),
  'utf8',
)

function documentRowSource(): string {
  const start = CARD.indexOf('function DocumentRow(')
  const end = CARD.indexOf('type PreDeliveryProofGateProps', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return CARD.slice(start, end)
}

/**
 * Spec 218 (P1/P2): um botão primário por nota. Sem obrigatório, "Entreguei" confirma num toque;
 * com obrigatório, a captura já está na tela e o único primário é o "Confirmar entrega" desabilitado
 * dizendo o que falta — nunca um "Entreguei" que só abre uma gaveta para outro botão confirmar.
 */
describe('a entrega tem um botão primário só (spec 218)', () => {
  it('sem obrigatório, "Entreguei" confirma direto; com obrigatório ele não existe', () => {
    const row = documentRowSource()
    expect(row).toInclude('!requiresProof ? (')
    expect(row).toInclude('onClick={confirmDelivery}')
    expect(row).not.toInclude('aria-expanded={requiresProof')
  })

  it('com obrigatório, a captura monta sem gaveta para abrir', () => {
    const row = documentRowSource()
    expect(row).not.toInclude('openDeliveryGate')
    expect(row).not.toInclude('setOpenDeliveryGate')
    expect(row).toInclude('{requiresProof ? (')
    expect(row).toInclude('<PreDeliveryProofGate')
  })

  it('"Entregue" é estado da nota, nunca o rótulo "Entreguei" dela', () => {
    const row = documentRowSource()
    const settled = row.slice(
      row.indexOf('if (isDocumentSettled(document)) {'),
      row.indexOf('<DriverNotDeliveredStatus'),
    )
    expect(settled).not.toInclude("t('deliver')")
    expect(settled).toInclude("t('activity.delivered'")
  })
})
