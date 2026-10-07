/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseCredentialAccess } from '../../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import type { NotaRpV2Client } from '../../src/nfse-issuance/infrastructure/nota-rp-v2.client.js'
import type { NotaRpV3Client } from '../../src/nfse-issuance/infrastructure/nota-rp-v3.types.js'

export const PROVIDER_ORIGIN = 'https://nota-rp.invalid'
export const PROVIDER_ORIGIN_V3 = `${PROVIDER_ORIGIN}/api/v3`
export const BASE_URL = `${PROVIDER_ORIGIN}/api/v2`
export const CALLBACK_BASE_URL = 'https://api.transportada.invalid'
export const CALLBACK_TOKEN = 'callback-token-sintetico-nao-vazar'
export const API_TOKEN = 'api-token-sintetico-nao-vazar'
export const COMPANY_TAX_ID = '12.345.678/0001-90'
export const PROVIDER_DOCUMENT_ID = '12345'
export const PROVIDER_REQUEST_KEY = '0199b7a4-5c1e-7d2a-9f3b-1a2b3c4d5e6f'

export const GATEWAY_CONFIG = {
  baseUrl: BASE_URL,
  callbackBaseUrl: CALLBACK_BASE_URL,
  timeoutMilliseconds: 15_000,
} as const

export const SECRET_SERVICE = {
  decrypt: async () => ({ apiToken: API_TOKEN, callbackToken: CALLBACK_TOKEN }),
}

export const CREDENTIAL: NfseCredentialAccess = {
  companyId: '00000000-0000-4000-8000-000000000001',
  credentialId: '00000000-0000-4000-8000-000000000002',
  envelope: { sealed: true },
  fiscalEnvironment: 'production',
  municipalRegistration: '12345678',
  taxId: COMPANY_TAX_ID,
}

/** O payload congelado pela API na v3: o mesmo de `test/nota-rp-v3/fixture.ts`. */
export const V3_PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Transporte rodoviario de cargas.',
  issAmount: '52.04',
  issExigibility: '1',
  issRate: '0.020000',
  issWithheld: false,
  municipalTaxationCode: '160101',
  municipalityIbgeCode: '3543402',
  nationalTaxationCode: '160201',
  nbsCode: '106011100',
  serviceAmount: '2601.95',
  serviceListItem: '16.02',
  simplesNationalRate: '2.000000',
  taker: {
    address: {
      city: 'Ribeirão Preto',
      complement: '',
      district: 'Centro',
      number: '1000',
      phone: '',
      postalCode: '14010040',
      state: 'SP',
      street: 'Avenida Jerônimo Gonçalves',
    },
    legalName: 'Comercial Exemplo Ltda',
    taxId: '98.765.432/0001-10',
  },
} as const

export type Calls = string[]

export function createFakeV2Client(calls: Calls): NotaRpV2Client {
  return {
    cancel: async () => {
      calls.push('v2.cancel')
      return { status: 'accepted' }
    },
    fetchDocument: async () => {
      calls.push('v2.fetchDocument')
      return { bytes: new Uint8Array([1]), contentType: 'application/pdf', status: 'ok' }
    },
    fetchStatus: async () => {
      calls.push('v2.fetchStatus')
      return { status: 'pending' }
    },
    issue: async () => {
      calls.push('v2.issue')
      return { providerDocumentId: 'v2-nota', status: 'accepted' }
    },
  }
}

export function createFakeV3Client(calls: Calls, seen?: Record<string, unknown>[]): NotaRpV3Client {
  return {
    cancel: async (params) => {
      calls.push('v3.cancel')
      seen?.push({ ...params })
      return { status: 'accepted' }
    },
    fetchDocument: async (params) => {
      calls.push('v3.fetchDocument')
      seen?.push({ ...params })
      return { bytes: new Uint8Array([2]), contentType: 'application/xml', status: 'ok' }
    },
    fetchStatus: async (params) => {
      calls.push('v3.fetchStatus')
      seen?.push({ ...params })
      return { status: 'pending' }
    },
    issue: async (params) => {
      calls.push('v3.issue')
      seen?.push({ ...params })
      return { providerDocumentId: 'v3-nota', status: 'accepted' }
    },
  }
}

export function rejectingFetch(): never {
  throw new Error('This path must not reach the network')
}
