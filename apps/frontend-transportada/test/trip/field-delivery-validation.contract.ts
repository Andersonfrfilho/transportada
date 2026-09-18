import { describe, expect, it } from 'bun:test'

import { validateFieldDeliveryDeliveredAt } from '../../src/modules/trip/shared/fieldDeliveryValidation.service'

/**
 * Spec 156 T11 (D4, aceite 8): a mesma régua da API (`DELIVERED_AT_IN_FUTURE`,
 * `DELIVERED_AT_BEFORE_DISPATCH`), espelhada no cliente para o erro aparecer antes do envio — o
 * 400 da API continua sendo a fonte da verdade, esta função só evita a viagem de rede óbvia.
 */
describe('validação de "Entregue em" (spec 156 D4)', () => {
  const now = new Date('2026-09-18T12:00:00.000Z')
  const dispatchedAt = '2026-09-18T08:00:00.000Z'

  it('agora, depois do despacho, é aceito', () => {
    expect(
      validateFieldDeliveryDeliveredAt({ deliveredAt: now.toISOString(), dispatchedAt, now }),
    ).toBeUndefined()
  })

  it('hora futura é recusada', () => {
    const future = new Date(now.getTime() + 60_000).toISOString()
    expect(validateFieldDeliveryDeliveredAt({ deliveredAt: future, dispatchedAt, now })).toBe(
      'DELIVERED_AT_IN_FUTURE',
    )
  })

  it('antes do despacho é recusado', () => {
    const before = new Date(new Date(dispatchedAt).getTime() - 60_000).toISOString()
    expect(validateFieldDeliveryDeliveredAt({ deliveredAt: before, dispatchedAt, now })).toBe(
      'DELIVERED_AT_BEFORE_DISPATCH',
    )
  })

  it('exatamente o instante do despacho é aceito (fronteira inclusiva)', () => {
    expect(
      validateFieldDeliveryDeliveredAt({ deliveredAt: dispatchedAt, dispatchedAt, now }),
    ).toBeUndefined()
  })

  it('sem despacho conhecido, só a régua do futuro vale', () => {
    expect(
      validateFieldDeliveryDeliveredAt({ deliveredAt: now.toISOString(), dispatchedAt: null, now }),
    ).toBeUndefined()
    const future = new Date(now.getTime() + 60_000).toISOString()
    expect(validateFieldDeliveryDeliveredAt({ deliveredAt: future, dispatchedAt: null, now })).toBe(
      'DELIVERED_AT_IN_FUTURE',
    )
  })

  it('data inválida é recusada como futuro — nunca aceita silenciosamente', () => {
    expect(validateFieldDeliveryDeliveredAt({ deliveredAt: 'not-a-date', dispatchedAt, now })).toBe(
      'DELIVERED_AT_IN_FUTURE',
    )
  })
})
