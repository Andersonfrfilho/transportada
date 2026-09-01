/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildQueueDraft,
  changeChargeAmount,
  findMissingAmount,
  selectedConfirmations,
  toggleCharge,
} from '@/modules/extra-charges/shared/chargeSelection.service'
import { toBatchReport } from '@/modules/extra-charges/shared/extraChargesResponse.validation'
import type { DeliveryCharge } from '@/modules/extra-charges/shared/extraCharges.types'

function charge(overrides: Partial<DeliveryCharge> = {}): DeliveryCharge {
  return {
    amount: '45.0000',
    batchId: null,
    chargeType: 'unloading',
    chargedOn: '2026-08-26',
    contractorId: null,
    deliveryClientId: 'client',
    id: 'charge-1',
    notes: '',
    origin: 'recurring',
    rejectionReason: '',
    status: 'suggested',
    ...overrides,
  }
}

describe('a fila de conferência (spec 060 T015)', () => {
  it('nasce com tudo desmarcado, no valor que a máquina propôs', () => {
    const draft = buildQueueDraft([charge()])

    expect(draft['charge-1']).toEqual({ amount: '45.0000', isSelected: false })
  })

  /** Só vai o que foi marcado: confirmar é dinheiro cobrado de outra empresa. */
  it('confirma só o selecionado', () => {
    const charges = [charge(), charge({ id: 'charge-2' })]
    const draft = toggleCharge(buildQueueDraft(charges), 'charge-2')

    expect(selectedConfirmations(charges, draft)).toEqual([{ id: 'charge-2' }])
  })

  /** O valor só viaja quando mudou — mandar o mesmo de volta registraria edição que ninguém fez. */
  it('manda o valor apenas quando ele foi corrigido', () => {
    const charges = [charge()]
    const selected = toggleCharge(buildQueueDraft(charges), 'charge-1')

    expect(selectedConfirmations(charges, selected)).toEqual([{ id: 'charge-1' }])
    expect(
      selectedConfirmations(
        charges,
        changeChargeAmount(selected, { amount: '52.0000', id: 'charge-1' }),
      ),
    ).toEqual([{ amount: '52.0000', id: 'charge-1' }])
  })

  /**
   * Spec 060 D4c: a sugestão nascida da ocorrência do motorista chega **sem valor**, e confirmar
   * assim cobraria zero real do contratante. A tela segura antes de o servidor recusar.
   */
  it('não deixa confirmar sugestão sem valor', () => {
    const charges = [charge({ amount: '0' })]
    const selected = toggleCharge(buildQueueDraft(charges), 'charge-1')

    expect(findMissingAmount(charges, selected)?.id).toBe('charge-1')
    expect(
      findMissingAmount(charges, changeChargeAmount(selected, { amount: '38.50', id: 'charge-1' })),
    ).toBeUndefined()
  })

  /** Sugestão não marcada sem valor não trava a confirmação das outras. */
  it('a sugestão sem valor só atrapalha se estiver marcada', () => {
    const charges = [charge({ amount: '0' }), charge({ id: 'charge-2' })]
    const draft = toggleCharge(buildQueueDraft(charges), 'charge-2')

    expect(findMissingAmount(charges, draft)).toBeUndefined()
  })
})

describe('o relatório do lote', () => {
  /** Dinheiro é texto do começo ao fim: virar `number` aqui perderia centavo na hora de somar. */
  it('mantém o valor como veio, e traz o total conferido pela API', () => {
    const report = toBatchReport({
      data: {
        batch: {
          closedAt: '2026-09-01T12:00:00.000Z',
          contractorId: 'contractor',
          id: 'batch',
          periodEnd: '2026-08-31',
          periodStart: '2026-08-01',
          status: 'submitted',
          totalAmount: '135.0500',
        },
        contractorName: 'Spani Atacadista',
        items: [
          {
            amount: '45.3000',
            chargeType: 'unloading',
            chargedOn: '2026-08-10',
            clientName: 'Loja Central',
            id: 'charge-1',
            notes: '',
            rejectionReason: '',
            status: 'submitted',
          },
        ],
        itemsTotal: '135.0500',
      },
    })

    expect(report.items[0]?.amount).toBe('45.3000')
    expect(report.itemsTotal).toBe('135.0500')
  })

  it('recusa relatório sem as linhas', () => {
    expect(() => toBatchReport({ data: { batch: {}, contractorName: 'x' } })).toThrow()
  })
})
