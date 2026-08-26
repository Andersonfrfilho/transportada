/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AggregateAccountEligibility,
  AggregateAccountRepositoryPort,
} from '../../src/fleet/application/aggregate-account.port'
import type { AggregateAccountUserModulePort } from '../../src/fleet/application/aggregate-account.use-case'

export class FakeAggregateAccountRepository implements AggregateAccountRepositoryPort {
  public readonly eligibleByTaxId = new Map<string, AggregateAccountEligibility>()
  public readonly linkCalls: Array<{ readonly companyId: string; readonly taxId: string; readonly userId: string }> = []
  public readonly linkedTaxIds = new Set<string>()

  public async findEligibleTaxId({ taxId }: { readonly taxId: string }) {
    return this.eligibleByTaxId.get(taxId) ?? null
  }

  public async isTaxIdLinked({ taxId }: { readonly taxId: string }) {
    return this.linkedTaxIds.has(taxId)
  }

  public async link(input: { readonly companyId: string; readonly taxId: string; readonly userId: string }) {
    this.linkCalls.push(input)
    this.linkedTaxIds.add(input.taxId)
  }
}

export class FakeAggregateAccountUserModule implements AggregateAccountUserModulePort {
  public readonly createUserCalls: Array<{
    readonly email: string
    readonly name: string
    readonly password: string
    readonly role: string
  }> = []

  public readonly useCases: AggregateAccountUserModulePort['useCases'] = {
    authenticateLocal: {
      execute: async (input) => ({
        accessToken: 'access-token',
        expiresInSeconds: 900,
        refreshExpiresInSeconds: 2_592_000,
        refreshToken: 'refresh-token',
        user: { email: input.email, id: 'user-1', isActive: true, name: 'Fulano de Tal', role: 'aggregate' },
      }),
    },
    createUser: {
      execute: async (input) => {
        this.createUserCalls.push(input)
        return { id: 'user-1' }
      },
    },
  }
}
