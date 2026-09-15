/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão final, item de segurança B3: `findAddressCorrectionRecipients` resolve a contratante
 * pelo CNPJ (nunca pela URL) e devolve só os contatos ativos — o inativo nunca alcança a tela.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { createFindAddressCorrectionRecipientsUseCase } from '../../src/address-correction/application/find-address-correction-recipients.use-case.js'
import { AddressCorrectionContractorNotFoundError } from '../../src/address-correction/domain/address-correction.error.js'
import type { AddressCorrectionRecipientContact } from '../../src/address-correction/application/find-address-correction-recipients.use-case.js'

const COMPANY_ID = crypto.randomUUID()
const CONTRACTOR_ID = crypto.randomUUID()

const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: crypto.randomUUID(),
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: crypto.randomUUID(),
}

const ACTIVE_CONTACT: AddressCorrectionRecipientContact = {
  canDecide: false,
  email: 'ativo@contratante.example',
  id: crypto.randomUUID(),
  receivesOccurrences: true,
  status: 'active',
}

const INACTIVE_CONTACT: AddressCorrectionRecipientContact = {
  canDecide: false,
  email: 'inativo@contratante.example',
  id: crypto.randomUUID(),
  receivesOccurrences: true,
  status: 'inactive',
}

describe('findAddressCorrectionRecipients (revisão final, item de segurança B3)', () => {
  test('resolves the contractor by tax id and returns only its active contacts', async () => {
    const useCase = createFindAddressCorrectionRecipientsUseCase({
      contractorLookup: {
        findContractorByTaxId: async (input) => {
          expect(input).toEqual({ companyId: COMPANY_ID, taxId: '30290856000160' })
          return { displayName: 'Contratante Exemplo', id: CONTRACTOR_ID }
        },
      },
      listContacts: {
        execute: async (input) => {
          expect(input).toEqual({ context: CONTEXT, contractorId: CONTRACTOR_ID })
          return [ACTIVE_CONTACT, INACTIVE_CONTACT]
        },
      },
    })

    const result = await useCase.find({ context: CONTEXT, contractorTaxId: '30290856000160' })

    expect(result).toEqual({
      contacts: [ACTIVE_CONTACT],
      contractor: { displayName: 'Contratante Exemplo', id: CONTRACTOR_ID },
    })
  })

  test('propagates the stable 404 when no contractor is registered for the tax id', async () => {
    const useCase = createFindAddressCorrectionRecipientsUseCase({
      contractorLookup: { findContractorByTaxId: async () => undefined },
      listContacts: { execute: async () => [] },
    })

    await expect(
      useCase.find({ context: CONTEXT, contractorTaxId: '30290856000160' }),
    ).rejects.toBeInstanceOf(AddressCorrectionContractorNotFoundError)
  })
})
