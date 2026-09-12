/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  explainEmissionProfile,
  findEmissionProfile,
} from '../../src/cte-profiles/domain/emission-profile-resolution.policy.js'

const SENDER_TAX_ID = '05868574001090'
const RECIPIENT_TAX_ID = '19354980000159'
const INVOICE = { recipientTaxId: RECIPIENT_TAX_ID, senderTaxId: SENDER_TAX_ID } as const

const buildProfile = (
  overrides: Partial<Parameters<typeof explainEmissionProfile>[0]['profiles'][number]> = {},
) =>
  ({
    id: 'profile-full',
    matchMode: 'sender_tax_id',
    matchers: [{ matchRole: 'sender', taxId: SENDER_TAX_ID }],
    name: 'Spani',
    priority: 10n,
    status: 'active',
    ...overrides,
  }) as const

/**
 * O `null` de `findEmissionProfile` junta situações que o operador precisa distinguir (spec 144 D3).
 * A variante devolve o motivo, e a função antiga continua sendo a mesma escolha reduzida a `null`.
 */
describe('explainEmissionProfile — o motivo de não haver perfil', () => {
  test('perfil que casa devolve a mesma resolução de findEmissionProfile', () => {
    const profiles = [buildProfile()]
    const explanation = explainEmissionProfile({ invoice: INVOICE, profiles })

    expect(explanation).toEqual({
      resolution: {
        matchedBy: 'sender_tax_id',
        matchedTaxId: SENDER_TAX_ID,
        precision: 'full',
        profileId: 'profile-full',
      },
    })
    expect(findEmissionProfile({ invoice: INVOICE, profiles })).toEqual(
      explanation.resolution ?? null,
    )
  })

  test('nenhum perfil casa é unmatched', () => {
    expect(explainEmissionProfile({ invoice: INVOICE, profiles: [] })).toEqual({
      reason: 'unmatched',
    })
    expect(
      explainEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile({ status: 'inactive' })],
      }),
    ).toEqual({ reason: 'unmatched' })
  })

  test('empate de precisão, papel e prioridade é ambiguous', () => {
    expect(
      explainEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile(), buildProfile({ id: 'profile-twin' })],
      }),
    ).toEqual({ reason: 'ambiguous' })
  })

  /** Pessoa física num dos lados: o casamento é por CNPJ, e CPF não é CNPJ. */
  test('emitente ou destinatário sem CNPJ é not_cnpj', () => {
    const profiles = [buildProfile()]
    for (const invoice of [
      { ...INVOICE, senderTaxId: '12345678901' },
      { ...INVOICE, recipientTaxId: '12345678901' },
    ]) {
      expect(explainEmissionProfile({ invoice, profiles })).toEqual({ reason: 'not_cnpj' })
      expect(findEmissionProfile({ invoice, profiles })).toBeNull()
    }
  })

  /** A tela alcança o perfil manual por escolha explícita; a classificação automática, nunca. */
  test('perfil manual nunca classifica', () => {
    expect(
      explainEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile({ matchMode: 'manual' })],
      }),
    ).toEqual({ reason: 'unmatched' })
  })
})
