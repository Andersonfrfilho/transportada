/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  cteEmissionProfileComponents,
  cteEmissionProfiles,
  freightRuleVersions,
} from '../../src/database/database.schema.js'

type ProfileRecord = typeof cteEmissionProfiles.$inferSelect
type ComponentRecord = typeof cteEmissionProfileComponents.$inferSelect
type FreightRuleVersionRecord = typeof freightRuleVersions.$inferSelect

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const PROFILE_ID = '00000000-0000-4000-8000-0000000000a1'
const FREIGHT_RULE_ID = '00000000-0000-4000-8000-0000000000b1'
const AUTHOR_ID = '00000000-0000-4000-8000-0000000000c1'
const VALID_FROM = new Date('2026-01-01T00:00:00.000Z')
const CREATED_AT = new Date('2026-07-27T22:43:13.649Z')
const UPDATED_AT = new Date('2026-07-27T22:43:24.353Z')

export function buildProfileRecord(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    cargoInsuranceDeclared: false,
    cfopInternal: '5353',
    cfopInterstate: '6353',
    chargeComponentLabel: 'Frete Spani 4,5',
    companyId: COMPANY_ID,
    createdAt: CREATED_AT,
    createdByUserId: AUTHOR_ID,
    deliveryDays: 0n,
    freightRuleId: FREIGHT_RULE_ID,
    groupingMode: 'per_invoice',
    icmsBaseReductionRate: '0',
    icmsCst: '90',
    icmsRate: '0',
    id: PROFILE_ID,
    matchMode: 'sender_tax_id',
    modal: '01',
    name: 'Spani 4,5% - homologacao',
    observations: 'EMPRESA OPTANTE PELO SIMPLES NACIONAL',
    operationNature: 'Prestacao de servico de transporte',
    pickupDetails: '',
    pickupIndicator: '1',
    predominantProductMode: 'highest_value',
    predominantProductName: '',
    priority: 1n,
    receiverIeIndicator: '1',
    serviceType: '0',
    status: 'active',
    taker: '0',
    updatedAt: UPDATED_AT,
    version: 2n,
    ...overrides,
  }
}

export function buildComponentRecord(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
  return {
    amount: null,
    calculationType: 'percentage_of_freight',
    companyId: COMPANY_ID,
    createdAt: CREATED_AT,
    id: '00000000-0000-4000-8000-0000000000d1',
    label: 'Pedagio',
    ordinal: 1n,
    profileId: PROFILE_ID,
    rate: null,
    updatedAt: UPDATED_AT,
    validFrom: VALID_FROM,
    validUntil: null,
    ...overrides,
  }
}

export function buildFreightRuleVersionRecord(
  overrides: Partial<FreightRuleVersionRecord> = {},
): FreightRuleVersionRecord {
  return {
    companyId: COMPANY_ID,
    createdAt: CREATED_AT,
    createdByUserId: AUTHOR_ID,
    filters: {},
    freightRuleId: FREIGHT_RULE_ID,
    id: '00000000-0000-4000-8000-0000000000e1',
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.045000',
    snapshot: {},
    status: 'active',
    updatedAt: UPDATED_AT,
    validFrom: VALID_FROM,
    validUntil: null,
    version: 2n,
    ...overrides,
  }
}
