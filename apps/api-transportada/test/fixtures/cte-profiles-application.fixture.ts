/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteEmissionProfileAuditRecord,
  CteEmissionProfileComponentInput,
  CteEmissionProfileDetail,
  CteEmissionProfileFreightRuleInput,
  CteEmissionProfileMatcherInput,
  CteEmissionProfileSettings,
  CteEmissionProfileTransactionPort,
  CteEmissionProfilesUnitOfWorkPort,
} from '../../src/cte-profiles/application/cte-emission-profile.port'
import { createCteEmissionProfilesUseCase } from '../../src/cte-profiles/application/cte-emission-profiles.use-case'

const TEXT_DECODER = new TextDecoder()

export const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000909'
export const USER_ID = '00000000-0000-4000-8000-000000000902'
export const PROFILE_ID = '00000000-0000-4000-8000-000000000903'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-000000000904'
export const CORRELATION_ID = 'cte-profiles-correlation'
export const IDEMPOTENCY_KEY = 'cte-profile-create-key-0001'
export const VALID_FROM = '2026-01-01T00:00:00.000Z'
export const CREATED_AT = '2026-07-27T12:00:00.000Z'

export const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as const

export const PROFILE_SETTINGS: CteEmissionProfileSettings = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete Spani 4,5',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  name: 'Spani',
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '10',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '3',
}

export const FREIGHT_RULE: CteEmissionProfileFreightRuleInput = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.045000',
  validFrom: VALID_FROM,
  validUntil: null,
}

export const MATCHERS: readonly CteEmissionProfileMatcherInput[] = [
  { matchRole: 'sender', taxId: '05868574' },
]

export const COMPONENTS: readonly CteEmissionProfileComponentInput[] = [
  {
    amount: null,
    calculationType: 'percentage_of_cargo',
    label: 'GRIS',
    ordinal: '1',
    rate: '0.003000',
    validFrom: VALID_FROM,
    validUntil: null,
  },
]

type StoredFreightRule = {
  currentVersion: string
  status: 'draft' | 'active' | 'inactive'
  readonly versions: string[]
}

type Store = {
  readonly audits: CteEmissionProfileAuditRecord[]
  readonly freightRules: Map<string, StoredFreightRule>
  readonly idempotency: Map<
    string,
    { readonly fingerprint: string; readonly response: CteEmissionProfileDetail }
  >
  readonly profiles: Map<string, CteEmissionProfileDetail>
}

export type CteProfilesFixture = {
  readonly audits: CteEmissionProfileAuditRecord[]
  readonly freightRuleOf: (profileId: string) => StoredFreightRule
  readonly listCalls: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
    readonly status?: string
  }[]
  readonly profileOf: (profileId: string) => CteEmissionProfileDetail
  readonly transactionCount: () => number
  readonly useCase: ReturnType<typeof createCteEmissionProfilesUseCase>
}

export function createCteProfilesFixture(
  params: { readonly seedOtherCompanyProfile?: boolean } = {},
): CteProfilesFixture {
  const store: Store = {
    audits: [],
    freightRules: new Map(),
    idempotency: new Map(),
    profiles: new Map(),
  }
  const listCalls: CteProfilesFixture['listCalls'] = []
  let transactionCount = 0

  const nextIdentifier = sequentialIdentifier(PROFILE_ID, '00000091')
  const nextFreightRuleIdentifier = sequentialIdentifier(FREIGHT_RULE_ID, '00000092')

  if (params.seedOtherCompanyProfile === true) {
    store.profiles.set('foreign-profile', {
      ...buildDetail({
        companyId: OTHER_COMPANY_ID,
        freightRule: FREIGHT_RULE,
        freightRuleId: 'foreign-rule',
        id: 'foreign-profile',
        settings: { ...PROFILE_SETTINGS, name: 'Outro tenant' },
      }),
    })
  }

  const unitOfWork: CteEmissionProfilesUnitOfWorkPort = {
    execute: async (operation) => {
      transactionCount += 1
      return operation(
        createTransaction({ listCalls, nextFreightRuleIdentifier, nextIdentifier, store }),
      )
    },
  }

  return {
    audits: store.audits,
    freightRuleOf: (profileId) => {
      const profile = store.profiles.get(profileId)
      const rule = profile === undefined ? undefined : store.freightRules.get(profile.freightRuleId)
      if (rule === undefined) throw new Error(`No freight rule stored for ${profileId}`)
      return rule
    },
    listCalls,
    profileOf: (profileId) => {
      const profile = store.profiles.get(profileId)
      if (profile === undefined) throw new Error(`No profile stored for ${profileId}`)
      return profile
    },
    transactionCount: () => transactionCount,
    useCase: createCteEmissionProfilesUseCase({
      fingerprintService: {
        async create({ fields, operation }) {
          return [operation, ...fields.map((field) => TEXT_DECODER.decode(field))].join('|')
        },
      },
      unitOfWork,
    }),
  }
}

function sequentialIdentifier(first: string, group: string): () => string {
  let sequence = 0
  return () => {
    sequence += 1
    if (sequence === 1) return first
    return `00000000-0000-4000-8000-${group}${String(sequence).padStart(4, '0')}`
  }
}

function createTransaction(input: {
  readonly listCalls: CteProfilesFixture['listCalls']
  readonly nextFreightRuleIdentifier: () => string
  readonly nextIdentifier: () => string
  readonly store: Store
}): CteEmissionProfileTransactionPort {
  const { listCalls, nextFreightRuleIdentifier, nextIdentifier, store } = input

  return {
    async appendAudit(record) {
      store.audits.push(record)
    },
    async createFreightRule() {
      const freightRuleId = nextFreightRuleIdentifier()
      store.freightRules.set(freightRuleId, { currentVersion: '0', status: 'draft', versions: [] })
      return { freightRuleId }
    },
    async createProfile(record) {
      if (
        [...store.profiles.values()].some(
          (profile) =>
            profile.companyId === record.companyId && profile.name === record.settings.name,
        )
      ) {
        throw new Error('CTE_PROFILE_NAME_TAKEN')
      }
      const detail = buildDetail({
        companyId: record.companyId,
        freightRule: record.freightRule,
        freightRuleId: record.freightRuleId,
        id: nextIdentifier(),
        settings: record.settings,
      })
      store.profiles.set(detail.id, detail)
      return detail
    },
    async findIdempotency({ companyId, idempotencyKey, operation }) {
      return store.idempotency.get(`${companyId}:${operation}:${idempotencyKey}`) ?? null
    },
    async findProfile({ companyId, profileId }) {
      const profile = store.profiles.get(profileId)
      return profile === undefined || profile.companyId !== companyId ? null : profile
    },
    async listProfiles({ companyId, cursor, filters, limit }) {
      listCalls.push({
        companyId,
        cursor,
        limit,
        ...(filters?.statusEq === undefined ? {} : { status: filters.statusEq }),
      })
      const items = [...store.profiles.values()].filter(
        (profile) =>
          profile.companyId === companyId &&
          (filters?.statusEq === undefined || profile.status === filters.statusEq),
      )
      return { items, nextCursor: null }
    },
    async openFreightRuleVersion({ freightRuleId }) {
      const rule = store.freightRules.get(freightRuleId)
      if (rule === undefined) throw new Error('FREIGHT_RULE_NOT_FOUND')
      const version = (BigInt(rule.currentVersion) + 1n).toString()
      rule.versions.push(version)
      rule.currentVersion = version
      return { version }
    },
    async replaceComponents({ components, profileId }) {
      const profile = store.profiles.get(profileId)
      if (profile === undefined) throw new Error('CTE_PROFILE_NOT_FOUND')
      store.profiles.set(profileId, { ...profile, components })
    },
    async replaceMatchers({ matchers, profileId }) {
      const profile = store.profiles.get(profileId)
      if (profile === undefined) throw new Error('CTE_PROFILE_NOT_FOUND')
      store.profiles.set(profileId, { ...profile, matchers })
    },
    async saveIdempotency({ companyId, fingerprint, idempotencyKey, operation, response }) {
      store.idempotency.set(`${companyId}:${operation}:${idempotencyKey}`, {
        fingerprint,
        response,
      })
    },
    async setFreightRuleStatus({ freightRuleId, nextStatus }) {
      const rule = store.freightRules.get(freightRuleId)
      if (rule === undefined) throw new Error('FREIGHT_RULE_NOT_FOUND')
      rule.status = nextStatus
    },
    async updateProfile({ companyId, expectedVersion, freightRule, profileId, settings }) {
      const profile = store.profiles.get(profileId)
      if (profile === undefined || profile.companyId !== companyId) return null
      if (profile.version !== expectedVersion) return null
      const updated: CteEmissionProfileDetail = {
        ...profile,
        ...settings,
        freightRule,
        updatedAt: CREATED_AT,
        version: (BigInt(profile.version) + 1n).toString(),
      }
      store.profiles.set(profileId, updated)
      return updated
    },
    async updateProfileStatus({ companyId, expectedVersion, nextStatus, profileId }) {
      const profile = store.profiles.get(profileId)
      if (profile === undefined || profile.companyId !== companyId) return null
      if (profile.version !== expectedVersion) return null
      const updated: CteEmissionProfileDetail = {
        ...profile,
        status: nextStatus,
        updatedAt: CREATED_AT,
        version: (BigInt(profile.version) + 1n).toString(),
      }
      store.profiles.set(profileId, updated)
      return updated
    },
  }
}

function buildDetail(input: {
  readonly companyId: string
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly freightRuleId: string
  readonly id: string
  readonly settings: CteEmissionProfileSettings
}): CteEmissionProfileDetail {
  return {
    ...input.settings,
    companyId: input.companyId,
    components: [],
    createdAt: CREATED_AT,
    freightRule: input.freightRule,
    freightRuleId: input.freightRuleId,
    id: input.id,
    matchers: [],
    status: 'draft',
    updatedAt: CREATED_AT,
    version: '1',
  }
}
