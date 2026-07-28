/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveEmissionProfile } from '../../src/cte-profiles/domain/emission-profile-resolution.policy.js'
import { expectApiErrorCode } from './support.js'

const SPANI_TAX_ID = '05868574001090'
const SPANI_ROOT = '05868574'
const RECIPIENT_TAX_ID = '19354980000159'

const INVOICE = {
  recipientTaxId: RECIPIENT_TAX_ID,
  senderTaxId: SPANI_TAX_ID,
} as const

const buildProfile = (
  overrides: Partial<Parameters<typeof resolveEmissionProfile>[0]['profiles'][number]> = {},
) =>
  ({
    id: 'profile-root',
    matchMode: 'sender_tax_id',
    matchers: [{ matchRole: 'sender', taxId: SPANI_ROOT }],
    name: 'Spani',
    priority: 10n,
    status: 'active',
    ...overrides,
  }) as const

describe('cte emission profile resolution', () => {
  test('resolves the profile bound to the sender tax id of the invoice', () => {
    expect(resolveEmissionProfile({ invoice: INVOICE, profiles: [buildProfile()] })).toEqual({
      matchedBy: 'sender_tax_id',
      matchedTaxId: SPANI_ROOT,
      precision: 'root',
      profileId: 'profile-root',
    })
  })

  test('prefers the full CNPJ over the eight digit root of the same group', () => {
    const resolution = resolveEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile({ id: 'profile-root', priority: 1n }),
        buildProfile({
          id: 'profile-branch',
          matchers: [{ matchRole: 'sender', taxId: SPANI_TAX_ID }],
          name: 'Spani filial',
          priority: 99n,
        }),
      ],
    })

    expect(resolution).toEqual({
      matchedBy: 'sender_tax_id',
      matchedTaxId: SPANI_TAX_ID,
      precision: 'full',
      profileId: 'profile-branch',
    })
  })

  test('prefers a sender match over a recipient match at the same precision', () => {
    const resolution = resolveEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile({
          id: 'profile-recipient',
          matchers: [{ matchRole: 'recipient', taxId: RECIPIENT_TAX_ID }],
          name: 'Por destinatario',
          priority: 1n,
        }),
        buildProfile({
          id: 'profile-sender',
          matchers: [{ matchRole: 'sender', taxId: SPANI_TAX_ID }],
          name: 'Por remetente',
          priority: 50n,
        }),
      ],
    })

    expect(resolution.profileId).toBe('profile-sender')
    expect(resolution.matchedBy).toBe('sender_tax_id')
  })

  test('falls back to the recipient matcher when no sender matcher applies', () => {
    const resolution = resolveEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile({
          id: 'profile-recipient',
          matchers: [{ matchRole: 'recipient', taxId: RECIPIENT_TAX_ID }],
          name: 'Por destinatario',
        }),
      ],
    })

    expect(resolution).toEqual({
      matchedBy: 'recipient_tax_id',
      matchedTaxId: RECIPIENT_TAX_ID,
      precision: 'full',
      profileId: 'profile-recipient',
    })
  })

  test('breaks a same precision and same role draw by the lowest priority number', () => {
    const resolution = resolveEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile({ id: 'profile-low', name: 'Menor precedencia', priority: 40n }),
        buildProfile({ id: 'profile-high', name: 'Maior precedencia', priority: 5n }),
      ],
    })

    expect(resolution.profileId).toBe('profile-high')
  })

  test('refuses to guess when two profiles tie on precision, role and priority', () => {
    const resolve = () =>
      resolveEmissionProfile({
        invoice: INVOICE,
        profiles: [
          buildProfile({ id: 'profile-a', name: 'A' }),
          buildProfile({ id: 'profile-b', name: 'B' }),
        ],
      })

    expectApiErrorCode(resolve, 'CTE_PROFILE_AMBIGUOUS')
  })

  test('ignores profiles that are manual, draft or inactive during automatic resolution', () => {
    const resolve = () =>
      resolveEmissionProfile({
        invoice: INVOICE,
        profiles: [
          buildProfile({ id: 'profile-manual', matchMode: 'manual', name: 'Manual' }),
          buildProfile({ id: 'profile-draft', name: 'Rascunho', status: 'draft' }),
          buildProfile({ id: 'profile-inactive', name: 'Inativo', status: 'inactive' }),
        ],
      })

    expectApiErrorCode(resolve, 'CTE_PROFILE_UNRESOLVED')
  })

  test('honours the profile the operator picked, matchers notwithstanding', () => {
    const resolution = resolveEmissionProfile({
      invoice: INVOICE,
      profiles: [
        buildProfile(),
        buildProfile({
          id: 'profile-manual',
          matchMode: 'manual',
          matchers: [],
          name: 'Avulso',
        }),
      ],
      requestedProfileId: 'profile-manual',
    })

    expect(resolution).toEqual({
      matchedBy: 'manual',
      matchedTaxId: null,
      precision: 'none',
      profileId: 'profile-manual',
    })
  })

  test('rejects a requested profile that does not belong to the tenant', () => {
    const resolve = () =>
      resolveEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile()],
        requestedProfileId: 'profile-from-another-tenant',
      })

    expectApiErrorCode(resolve, 'CTE_PROFILE_NOT_FOUND')
  })

  test('rejects a requested profile that is not active', () => {
    const resolve = () =>
      resolveEmissionProfile({
        invoice: INVOICE,
        profiles: [buildProfile({ id: 'profile-draft', status: 'draft' })],
        requestedProfileId: 'profile-draft',
      })

    expectApiErrorCode(resolve, 'CTE_PROFILE_INACTIVE')
  })

  test('rejects an invoice party identifier that is not a full CNPJ', () => {
    const resolve = () =>
      resolveEmissionProfile({
        invoice: { recipientTaxId: RECIPIENT_TAX_ID, senderTaxId: SPANI_ROOT },
        profiles: [buildProfile()],
      })

    expectApiErrorCode(resolve, 'CTE_PROFILE_INVALID_TAX_ID')
  })
})
