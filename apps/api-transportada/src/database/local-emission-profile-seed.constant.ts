/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileSettingsInput } from '../cte-profiles/application/cte-emission-profile.port.js'
import type { NfseEmissionProfileSettings } from '../nfse-profiles/application/nfse-profile.port.js'

const VALID_FROM = '2020-01-01T00:00:00.000Z'

/**
 * O ADR-0071 move o documento fiscal esperado do código IBGE para o perfil de emissão. Sem um
 * perfil que casa, toda nota vira `no_profile` — o botão de CT-e some da linha e o MDF-e trava. As
 * duas notas abaixo já existem na semente de NF-e local (`local-nfe-seed.service.ts`); os CNPJs do
 * destinatário vêm de lá, não são inventados.
 */
export const LOCAL_CTE_OUTPUT_RECIPIENT_TAX_ID = '01307355000190'
export const LOCAL_NFSE_OUTPUT_RECIPIENT_TAX_ID = '00246872000215'

export const LOCAL_CTE_OUTPUT_PROFILE_SETTINGS: CteEmissionProfileSettingsInput = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  municipalServicePolicy: 'allow',
  name: 'Bancada local — CT-e',
  nfseEmissionProfileId: null,
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  outputDocument: 'cte',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '10',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '3',
}

export const LOCAL_CTE_OUTPUT_PROFILE_MATCHERS = [
  { matchRole: 'recipient' as const, taxId: LOCAL_CTE_OUTPUT_RECIPIENT_TAX_ID },
]

/** Perfil que aponta para NFS-e — `nfseEmissionProfileId` é preenchido em tempo de semeadura. */
export const LOCAL_NFSE_OUTPUT_PROFILE_SETTINGS_BASE: Omit<
  CteEmissionProfileSettingsInput,
  'nfseEmissionProfileId'
> = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  municipalServicePolicy: 'allow',
  name: 'Bancada local — NFS-e',
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  outputDocument: 'nfse',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '20',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '3',
}

export const LOCAL_NFSE_OUTPUT_PROFILE_MATCHERS = [
  { matchRole: 'recipient' as const, taxId: LOCAL_NFSE_OUTPUT_RECIPIENT_TAX_ID },
]

export const LOCAL_CTE_OUTPUT_FREIGHT_RULE = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.120000',
  validFrom: VALID_FROM,
  validUntil: null,
}

export const LOCAL_NFSE_OUTPUT_FREIGHT_RULE = LOCAL_CTE_OUTPUT_FREIGHT_RULE

/**
 * Perfil NFS-e ativo referenciado pelo perfil de CT-e acima (`nfseEmissionProfileId`). O município
 * é o mesmo da empresa (`local-fiscal-profile-seed.constant.ts`), e `freightRuleId` sai da regra de
 * frete da própria bancada (`local-trip-seed.constant.ts` § `LOCAL_FREIGHT_RULE`) — a semente não
 * inventa uma segunda regra, reaproveita a que já existe.
 */
export const LOCAL_NFSE_PROFILE_SETTINGS_BASE: Omit<NfseEmissionProfileSettings, 'freightRuleId'> =
  {
    chargeComponentLabel: 'Frete',
    cnaeCode: '4930202',
    descriptionMaxLength: '2000',
    descriptionTemplate: 'Transporte rodoviário de cargas referente às notas {{notas}}.',
    issExigibility: '1',
    issRate: '0.050000',
    issWithheld: false,
    municipalTaxationCode: '',
    municipalityIbgeCode: '3543402',
    municipalityName: 'Ribeirão Preto',
    name: 'Bancada local — Ribeirão Preto',
    nbsCode: '',
    observations: '',
    serviceListItem: '16.01',
    taker: '3',
  }
