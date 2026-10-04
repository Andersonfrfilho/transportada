/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { ContractorReceivingProfileRepositoryPort } from '../../src/cargo-receiving/application/contractor-receiving-profile.port.js'
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfileRules,
} from '../../src/cargo-receiving/application/contractor-receiving-profile.types.js'
import {
  createGetContractorReceivingProfileUseCase,
  createSaveContractorReceivingProfileUseCase,
} from '../../src/cargo-receiving/application/contractor-receiving-profile.use-case.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const CONTEXT: CompanyContext = {
  companyId: '00000000-0000-4000-8000-000000000a01',
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000a02',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: '00000000-0000-4000-8000-000000000a03',
}
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000a04'

const RULES: ContractorReceivingProfileRules = {
  arrivalReferenceLabel: null,
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: null,
  previewEnabled: false,
  previewSheetName: null,
  requiresDamageCheck: false,
  separationWindowHours: 24,
  weightTolerancePercent: 0,
}
const PROFILE: ContractorReceivingProfile = {
  ...RULES,
  contractorId: CONTRACTOR_ID,
  updatedAt: '2026-10-03T12:00:00.000Z',
}

function createRepository(
  overrides: Partial<ContractorReceivingProfileRepositoryPort>,
): ContractorReceivingProfileRepositoryPort & { readonly calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    async find(params) {
      calls.push(params)
      return { isContractorFound: true, profile: null }
    },
    async save(params) {
      calls.push(params)
      return PROFILE
    },
    ...overrides,
  }
}

describe('ler e gravar o perfil de recebimento (spec 237 T1.3)', () => {
  test('contratante sem perfil é ausência, não erro', async () => {
    const repository = createRepository({})
    const getProfile = createGetContractorReceivingProfileUseCase({ repository })

    expect(await getProfile.execute({ context: CONTEXT, contractorId: CONTRACTOR_ID })).toBeNull()
    expect(repository.calls).toEqual([
      { companyId: CONTEXT.companyId, contractorId: CONTRACTOR_ID },
    ])
  })

  test('contratante fora da empresa do contexto é 404, na leitura e na gravação', async () => {
    const repository = createRepository({
      find: async () => ({ isContractorFound: false }),
      save: async () => null,
    })

    await expect(
      createGetContractorReceivingProfileUseCase({ repository }).execute({
        context: CONTEXT,
        contractorId: CONTRACTOR_ID,
      }),
    ).rejects.toMatchObject({ code: 'CONTRACTOR_NOT_FOUND', status: 404 })
    await expect(
      createSaveContractorReceivingProfileUseCase({ repository }).execute({
        context: CONTEXT,
        contractorId: CONTRACTOR_ID,
        correlationId: 'receiving-profile-contract',
        rules: RULES,
      }),
    ).rejects.toMatchObject({ code: 'CONTRACTOR_NOT_FOUND', status: 404 })
  })

  test('a gravação leva a empresa e o ator do contexto, nunca do corpo', async () => {
    const repository = createRepository({})
    const saveProfile = createSaveContractorReceivingProfileUseCase({ repository })

    const saved = await saveProfile.execute({
      context: CONTEXT,
      contractorId: CONTRACTOR_ID,
      correlationId: 'receiving-profile-contract',
      rules: RULES,
    })

    expect(saved).toEqual(PROFILE)
    expect(repository.calls).toEqual([
      {
        actorUserId: CONTEXT.userId,
        companyId: CONTEXT.companyId,
        contractorId: CONTRACTOR_ID,
        correlationId: 'receiving-profile-contract',
        rules: RULES,
      },
    ])
  })
})
