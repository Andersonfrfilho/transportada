/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T1.4 (RF9): os dados do contratante que o `PATCH /contractors/:id` já aceita —
 * `displayName`, `closingPeriod`, `reportEmail`, `notes` e `status`. O CNPJ não é campo: é leitura.
 */
import { describe, expect, test } from 'bun:test'

import {
  createContractorDetailsDraft,
  toContractorWrite,
  validateContractorDetailsDraft,
  type ContractorDetailsDraft,
} from '../../src/modules/delivery-clients/shared/contractorDetails.validation'
import type { Contractor } from '../../src/modules/delivery-clients/shared/contractorDirectory.types'

const CONTRACTOR: Contractor = {
  closingPeriod: 'fortnightly',
  displayName: 'Contratante Sintético',
  id: '00000000-0000-4000-8000-000000237001',
  notes: 'Observação sintética',
  reportEmail: 'relatorio@contratante.example.test',
  status: 'active',
  taxId: '11222333000181',
}

function draftWith(overrides: Partial<ContractorDetailsDraft>): ContractorDetailsDraft {
  return { ...createContractorDetailsDraft(CONTRACTOR), ...overrides }
}

describe('a ficha de dados do contratante', () => {
  test('reabre com o que está gravado, e o CNPJ não é campo do rascunho', () => {
    const draft = createContractorDetailsDraft(CONTRACTOR)

    expect(draft).toEqual({
      closingPeriod: 'fortnightly',
      displayName: 'Contratante Sintético',
      notes: 'Observação sintética',
      reportEmail: 'relatorio@contratante.example.test',
      status: 'active',
    })
    expect('taxId' in draft).toBe(false)
  })

  test('o PATCH leva os cinco campos do cadastro, aparados, e só eles', () => {
    expect(
      toContractorWrite(
        draftWith({
          displayName: '  Novo nome  ',
          notes: ' nota ',
          reportEmail: ' a@b.example.test ',
        }),
      ),
    ).toEqual({
      closingPeriod: 'fortnightly',
      displayName: 'Novo nome',
      notes: 'nota',
      reportEmail: 'a@b.example.test',
      status: 'active',
    })
  })

  test('e-mail em branco segue em branco: lote que se exporta à mão não é erro', () => {
    expect(validateContractorDetailsDraft(draftWith({ reportEmail: '' }))).toEqual({})
    expect(toContractorWrite(draftWith({ reportEmail: '   ' })).reportEmail).toBe('')
  })

  test('as faixas do servidor: nome até 200, observação até 2000, e-mail com forma de e-mail', () => {
    const issues = validateContractorDetailsDraft(
      draftWith({
        displayName: 'n'.repeat(201),
        notes: 'o'.repeat(2001),
        reportEmail: 'sem-arroba',
      }),
    )

    expect(issues.displayName).toEqual({ code: 'tooLong', max: 200 })
    expect(issues.notes).toEqual({ code: 'tooLong', max: 2000 })
    expect(issues.reportEmail).toEqual({ code: 'invalidEmail' })
    expect(
      validateContractorDetailsDraft(
        draftWith({ displayName: 'n'.repeat(200), notes: 'o'.repeat(2000) }),
      ),
    ).toEqual({})
  })
})
