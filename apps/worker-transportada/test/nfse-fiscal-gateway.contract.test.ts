/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseCredentialAccess } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { createNfseFiscalGateway } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'

const HOMOLOGATION_BASE_URL = 'https://homologacao.exemplo/api/v2'
const PRODUCTION_BASE_URL = 'https://producao.exemplo/api/v2'

const PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Transporte rodoviário de carga',
  issAmount: '10.00',
  issExigibility: '1',
  issRate: '2.00',
  issWithheld: false,
  municipalityIbgeCode: '3543402',
  municipalTaxationCode: '',
  nbsCode: '',
  serviceAmount: '500.00',
  serviceListItem: '16.02',
  taker: { legalName: 'Tomador Exemplo', taxId: '11222333000181' },
} as const

function createCredential(
  fiscalEnvironment: NfseCredentialAccess['fiscalEnvironment'],
): NfseCredentialAccess {
  return {
    companyId: '00000000-0000-4000-8000-000000000001',
    credentialId: '00000000-0000-4000-8000-000000000002',
    envelope: { sealed: true },
    fiscalEnvironment,
  }
}

function rejectingFetch(): never {
  throw new Error('The gateway contract must not reach the network')
}

describe('NFS-e fiscal gateway configuration contract', () => {
  test('picks the base URL of the fiscal environment declared by the credential', async () => {
    const baseUrls: string[] = []
    const gateway = createNfseFiscalGateway({
      config: {
        baseUrls: { homologation: HOMOLOGATION_BASE_URL, production: PRODUCTION_BASE_URL },
        timeoutMilliseconds: 15_000,
      },
      createClient: ({ config }) => {
        baseUrls.push(config.baseUrl)
        return {
          cancel: async () => ({ status: 'accepted' as const }),
          fetchDocument: async () => ({ status: 'error' as const }),
          fetchStatus: async () => ({ status: 'pending' as const }),
          issue: async () => ({ providerDocumentId: 'nota-1', status: 'accepted' as const }),
        }
      },
      fetch: rejectingFetch,
      secretService: { decrypt: async () => ({ apiToken: 'token-sintetico' }) },
    })

    await gateway.issue({ credential: createCredential('homologation'), payload: PAYLOAD })
    await gateway.issue({ credential: createCredential('production'), payload: PAYLOAD })

    expect(baseUrls).toEqual([HOMOLOGATION_BASE_URL, PRODUCTION_BASE_URL])
  })

  /**
   * Instalação que ainda não contratou a Nota RP não tem endereço para chamar. A causa é própria:
   * `transport_failure` mandaria o trilho tentar de novo para sempre contra uma URL vazia, e
   * `credential_unreadable` acusaria o segredo de um defeito que é de configuração.
   */
  test('reports an unconfigured provider without opening the sealed token', async () => {
    const decryptCalls: number[] = []
    const gateway = createNfseFiscalGateway({
      config: {
        baseUrls: { homologation: undefined, production: undefined },
        timeoutMilliseconds: 15_000,
      },
      createClient: () => {
        throw new Error('The gateway must not build a client without a base URL')
      },
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => {
          decryptCalls.push(1)
          return { apiToken: 'token-sintetico' }
        },
      },
    })

    const credential = createCredential('production')

    expect(await gateway.issue({ credential, payload: PAYLOAD })).toEqual({
      cause: 'provider_not_configured',
      status: 'error',
    })
    expect(
      await gateway.cancel({ credential, providerDocumentId: 'nota-1', reason: 'erro' }),
    ).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(await gateway.fetchStatus({ credential, providerDocumentId: 'nota-1' })).toEqual({
      cause: 'provider_not_configured',
      status: 'error',
    })
    expect(
      await gateway.fetchDocument({ credential, kind: 'pdf', providerDocumentId: 'nota-1' }),
    ).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(decryptCalls).toEqual([])
  })
})
