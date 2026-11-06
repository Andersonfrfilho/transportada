/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export const COMPANY_ID = '00000000-0000-4000-8000-000000000981'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000982'
export const USER_ID = '00000000-0000-4000-8000-000000000983'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000984'
export const LOOKUP_ID = '00000000-0000-4000-8000-000000000985'
export const IMPORT_ID = '00000000-0000-4000-8000-000000000986'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000987'
export const CORRELATION_ID = 'nfe-access-key-lookup-correlation'
export const FINGERPRINT = 'f'.repeat(64)

/** Chaves de 44 posições com dígito verificador (módulo 11) correto. */
export const ACCESS_KEY = '35260811111111000191550010000000031000000011'
export const OTHER_ACCESS_KEY = '35260822222222000144550010000000041000000021'
export const ACCESS_KEY_WITH_WRONG_DV = '35260811111111000191550010000000031000000012'

export const NOW = new Date('2026-11-06T12:00:00.000Z')
export const REFUSAL_WINDOW_MS = 24 * 60 * 60 * 1000

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(['invoices.import', 'invoices.read']),
  roles: ['operator'],
  userId: USER_ID,
}

export type LookupView = {
  readonly documentId: string | null
  readonly id: string
  readonly notBefore: string | null
  readonly reason: string | null
  readonly status: string
}

export const QUEUED_VIEW: LookupView = {
  documentId: null,
  id: LOOKUP_ID,
  notBefore: null,
  reason: null,
  status: 'queued',
}

export const REFUSED_VIEW: LookupView = {
  documentId: null,
  id: LOOKUP_ID,
  notBefore: null,
  reason: 'not_found',
  status: 'refused',
}

export type FakeLookupCalls = {
  readonly attached: { companyId: string; importId: string; lookupId: string }[]
  readonly claimed: Record<string, unknown>[]
  readonly imports: Record<string, unknown>[]
  readonly outbox: Record<string, unknown>[]
  readonly refusalQueries: Record<string, unknown>[]
}

export type FakeLookupScenario = {
  readonly activeLookup?: LookupView | null
  /** Uma resposta por leitura, na ordem: o vencedor de uma corrida só aparece depois do claim. */
  readonly activeLookupSequence?: readonly (LookupView | null)[]
  readonly claimedLookupId?: string | null
  readonly documentId?: string | null
  readonly environment?: 'homologation' | 'production' | null
  readonly recentRefusal?: LookupView | null
}

/** Dublê da transação: devolve o cenário e registra cada escrita, na ordem em que o caso de uso chama. */
export function createFakeLookupUnitOfWork(scenario: FakeLookupScenario = {}) {
  const calls: FakeLookupCalls = {
    attached: [],
    claimed: [],
    imports: [],
    outbox: [],
    refusalQueries: [],
  }
  const order: string[] = []
  const transaction = {
    async attachImport(input: { companyId: string; importId: string; lookupId: string }) {
      order.push('attachImport')
      calls.attached.push(input)
    },
    async claimLookup(input: Record<string, unknown>) {
      order.push('claimLookup')
      calls.claimed.push(input)
      return scenario.claimedLookupId === undefined ? LOOKUP_ID : scenario.claimedLookupId
    },
    async createImport(input: Record<string, unknown>) {
      order.push('createImport')
      calls.imports.push(input)
      return IMPORT_ID
    },
    async findActiveLookup() {
      order.push('findActiveLookup')
      if (scenario.activeLookupSequence !== undefined) {
        return (
          scenario.activeLookupSequence[
            order.filter((name) => name === 'findActiveLookup').length - 1
          ] ?? null
        )
      }
      return scenario.activeLookup ?? null
    },
    async findDocumentId() {
      order.push('findDocumentId')
      return scenario.documentId ?? null
    },
    async findRecentRefusal(input: Record<string, unknown>) {
      order.push('findRecentRefusal')
      calls.refusalQueries.push(input)
      return scenario.recentRefusal ?? null
    },
    async readFiscalEnvironment() {
      order.push('readFiscalEnvironment')
      return scenario.environment === undefined ? 'homologation' : scenario.environment
    },
    async saveOutbox(input: Record<string, unknown>) {
      order.push('saveOutbox')
      calls.outbox.push(input)
    },
  }
  return {
    calls,
    order,
    unitOfWork: {
      execute: <T>(operation: (value: typeof transaction) => Promise<T>) => operation(transaction),
    },
  }
}
