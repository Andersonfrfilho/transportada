/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import type {
  BuildCtePayloadParams,
  CtePayloadCarrier,
  CtePayloadCharge,
  CtePayloadInvoice,
  CtePayloadParty,
  CtePayloadProfile,
} from '../../src/cte-issuance/domain/cte-payload.types.js'
import { ApiError } from '../../src/shared/api.error.js'

export const GOLDEN_ACCESS_KEY = '35260705868574001090550020008526741408978623'
export const GOLDEN_PREDOMINANT_PRODUCT = 'LAVA ROUPA PO TIXAN 1.6K PRIMAVERA'
export const GOLDEN_CHARGE_LABEL = 'Frete Spani 4,5'
export const GOLDEN_OPERATION_NATURE =
  'Prestacao de servico de transporte a estabelecimento comerci'
export const GOLDEN_OBSERVATIONS = 'EMPRESA OPTANTE PELO SIMPLES NACIONAL'

export const GOLDEN_SENDER: CtePayloadParty = {
  city: 'Taubate',
  cityCode: '3554102',
  district: 'JARDIM BARONESA',
  email: null,
  legalName: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
  number: '6707',
  phone: '2430768250',
  postalCode: '12091000',
  state: 'SP',
  stateRegistration: '688292870119',
  street: 'AVENIDA DOM PEDRO I',
  taxId: '05868574001090',
  tradeName: 'TAUBATE-JARDIM BARONESA',
}

export const GOLDEN_RECIPIENT: CtePayloadParty = {
  city: 'Itirapua',
  cityCode: '3523701',
  district: 'CENTRO',
  email: 's.docarmomercado@hotmail.com',
  legalName: 'S. DO CARMO ALVES E SILVA',
  number: '5558',
  phone: '1688646757',
  postalCode: '14420000',
  state: 'SP',
  stateRegistration: '385009288117',
  street: 'R DOZITO MALVAR RIBAS',
  taxId: '19354980000159',
  tradeName: null,
}

export const GOLDEN_INVOICE: CtePayloadInvoice = {
  accessKey: GOLDEN_ACCESS_KEY,
  products: [
    {
      description: GOLDEN_PREDOMINANT_PRODUCT,
      grossWeight: null,
      ordinal: 1,
      quantity: '5.0000',
      totalValue: '700.0000',
    },
    {
      description: 'AMACIANTE FOFO 2L',
      grossWeight: null,
      ordinal: 2,
      quantity: '12.0000',
      totalValue: '258.4800',
    },
  ],
  recipient: GOLDEN_RECIPIENT,
  sender: GOLDEN_SENDER,
  totalAmount: '958.4800',
  volumes: [{ grossWeight: '101.7320', netWeight: '92.7650', quantity: '8.0000' }],
}

export const GOLDEN_PROFILE: CtePayloadProfile = {
  cfopInternal: '5353',
  cfopInterstate: '6353',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '90',
  icmsRate: '0.000000',
  modal: '01',
  observations: GOLDEN_OBSERVATIONS,
  operationNature: GOLDEN_OPERATION_NATURE,
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '0',
}

export const GOLDEN_CARRIER: CtePayloadCarrier = { rntrc: '58151044' }

export const GOLDEN_CHARGE: CtePayloadCharge = {
  components: [{ amount: '43.13', label: GOLDEN_CHARGE_LABEL }],
  totalAmount: '43.13',
}

type GoldenOverrides = {
  readonly carrier?: CtePayloadCarrier
  readonly charge?: CtePayloadCharge
  readonly invoices?: readonly CtePayloadInvoice[]
  readonly profile?: CtePayloadProfile
}

export function buildGoldenParams(overrides: GoldenOverrides = {}): BuildCtePayloadParams {
  return {
    carrier: overrides.carrier ?? GOLDEN_CARRIER,
    charge: overrides.charge ?? GOLDEN_CHARGE,
    invoices: overrides.invoices ?? [GOLDEN_INVOICE],
    profile: overrides.profile ?? GOLDEN_PROFILE,
  }
}

export function expectApiErrorCode(execute: () => unknown, code: string): void {
  try {
    execute()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    return
  }

  throw new Error(`Expected the call to fail with ${code}`)
}
