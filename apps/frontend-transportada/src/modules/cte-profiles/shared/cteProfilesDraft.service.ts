/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPONENT_KEYS,
  CTE_PROFILES_ERROR,
  DEFAULT_FREIGHT_PERCENTAGE,
  PROFILE_BODY_KEYS,
  ZERO_RATE,
} from './cteProfiles.constant'
import type {
  CteProfileBody,
  CteProfileComponent,
  CteProfileFreightRule,
  CteProfileMatcher,
  CteProfileSettings,
} from './cteProfiles.types'
import { hasOnlyKeys, isRecord } from './cteProfilesGuards.validation'

export const DEFAULT_VALID_FROM = '2026-01-01T00:00:00.000Z'

const DEFAULT_SETTINGS: CteProfileSettings = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: ZERO_RATE,
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  name: '',
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '1',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '3',
}

const DEFAULT_FREIGHT_RULE: CteProfileFreightRule = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: DEFAULT_FREIGHT_PERCENTAGE,
  validFrom: DEFAULT_VALID_FROM,
  validUntil: null,
}

function draftError(): Error {
  return new Error(CTE_PROFILES_ERROR.INVALID_DRAFT)
}

export function createCteProfileDrafts() {
  return {
    createComponentDraft(input: Record<string, unknown> = {}): CteProfileComponent {
      if (!isRecord(input) || !hasOnlyKeys(input, COMPONENT_KEYS)) throw draftError()
      return {
        amount: null,
        calculationType: 'percentage_of_cargo',
        label: typeof input.label === 'string' ? input.label : '',
        ordinal: typeof input.ordinal === 'string' ? input.ordinal : '1',
        rate: ZERO_RATE,
        validFrom: DEFAULT_VALID_FROM,
        validUntil: null,
      }
    },
    createMatcherDraft(): CteProfileMatcher {
      return { matchRole: 'sender', taxId: '' }
    },
    createProfileDraft(input: Record<string, unknown> = {}): CteProfileBody {
      if (!isRecord(input) || !hasOnlyKeys(input, PROFILE_BODY_KEYS)) throw draftError()
      return {
        components: Array.isArray(input.components)
          ? (input.components as readonly CteProfileComponent[])
          : [],
        freightRule: isRecord(input.freightRule)
          ? (input.freightRule as unknown as CteProfileFreightRule)
          : DEFAULT_FREIGHT_RULE,
        matchers: Array.isArray(input.matchers)
          ? (input.matchers as readonly CteProfileMatcher[])
          : [],
        settings: isRecord(input.settings)
          ? { ...DEFAULT_SETTINGS, ...(input.settings as Partial<CteProfileSettings>) }
          : DEFAULT_SETTINGS,
      }
    },
  }
}
