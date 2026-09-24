/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P2/P3: cadastrar espécie nova sem deploy, e recusar nome repetido no mesmo lado (CA06).
 */
import { describe, expect, it } from 'bun:test'

import type {
  CompanyEntryKind,
  CompanyEntryKindPort,
} from '../../src/companies/application/company-entry-kind.port.js'
import {
  createCreateCompanyEntryKindUseCase,
  createDeactivateCompanyEntryKindUseCase,
} from '../../src/companies/application/company-entry-kind.use-case.js'
import { CompanyEntryKindNameConflictError } from '../../src/companies/domain/company-entry-kind.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

function buildPort(overrides: Partial<CompanyEntryKindPort> = {}): CompanyEntryKindPort {
  return {
    create: async (input) => ({ active: true, displayOrder: 1, id: crypto.randomUUID(), ...input }),
    deactivate: async () => null,
    existsByName: async () => false,
    listActiveBySide: async () => [],
    listByCompany: async () => [],
    ...overrides,
  }
}

describe('cadastrar espécie nova, sem deploy (spec 169 P2)', () => {
  it('cria a espécie quando o nome ainda não existe no lado', async () => {
    const useCase = createCreateCompanyEntryKindUseCase({ entryKinds: buildPort() })

    const created = await useCase.execute({
      companyId: COMPANY_ID,
      name: 'Estacionamento',
      side: 'expense',
    })

    expect(created.name).toBe('Estacionamento')
    expect(created.side).toBe('expense')
  })

  /** CA06: nome repetido no mesmo lado é recusado com código estável. */
  it('recusa nome repetido no mesmo lado com CompanyEntryKindNameConflictError', async () => {
    const useCase = createCreateCompanyEntryKindUseCase({
      entryKinds: buildPort({ existsByName: async () => true }),
    })

    const attempt = useCase.execute({ companyId: COMPANY_ID, name: 'Pedágio', side: 'expense' })

    await expect(attempt).rejects.toBeInstanceOf(CompanyEntryKindNameConflictError)
  })
})

describe('desativar espécie em uso (spec 169 RF6)', () => {
  it('desativa sem apagar — o lançamento antigo continua mostrando o nome dela', async () => {
    const deactivated: CompanyEntryKind = {
      active: false,
      displayOrder: 1,
      id: crypto.randomUUID(),
      name: 'Pedágio',
      side: 'expense',
    }
    const useCase = createDeactivateCompanyEntryKindUseCase({
      entryKinds: buildPort({ deactivate: async () => deactivated }),
    })

    const result = await useCase.execute({ companyId: COMPANY_ID, entryKindId: deactivated.id })

    expect(result).toEqual(deactivated)
  })
})
