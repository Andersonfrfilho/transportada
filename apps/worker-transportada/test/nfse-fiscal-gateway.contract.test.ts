/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseCredentialAccess } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { createNfseFiscalGateway } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'

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
    municipalRegistration: '12345678',
  }
}

function rejectingFetch(): never {
  throw new Error('The gateway contract must not reach the network')
}

describe('NFS-e fiscal gateway configuration contract', () => {
  // O ambiente fiscal da credencial continua existindo e continua escolhendo a credencial; ele não
  // escolhe mais o endereço, porque a Nota RP tem um só (ADR-0035).
  test('uses the single configured base URL whatever the credential declares', async () => {
    const baseUrls: string[] = []
    const gateway = createNfseFiscalGateway({
      config: { baseUrl: PRODUCTION_BASE_URL, timeoutMilliseconds: 15_000 },
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

    expect(baseUrls).toEqual([PRODUCTION_BASE_URL, PRODUCTION_BASE_URL])
  })

  /**
   * A exigibilidade do ISS é escrita `ExigibilidadeISS` — a sigla em caixa alta, como no XSD da
   * ABRASF 2.04, de onde a Nota RP tira os nomes que empresta. Escrita `ExigibilidadeIss` ela chega
   * ao provedor como campo desconhecido, e a prefeitura devolve "Por favor informe o campo
   * Exigibilidade ISS" com o valor preenchido do nosso lado. Chave de JSON diferencia caixa; o teste
   * existe porque o defeito é invisível na leitura.
   */
  test('spells every RPS key the way the provider reads it', async () => {
    const sent: Readonly<Record<string, unknown>>[] = []
    const gateway = createNfseFiscalGateway({
      config: { baseUrl: PRODUCTION_BASE_URL, timeoutMilliseconds: 15_000 },
      createClient: () => ({
        cancel: async () => ({ status: 'accepted' as const }),
        fetchDocument: async () => ({ status: 'error' as const }),
        fetchStatus: async () => ({ status: 'pending' as const }),
        issue: async ({ rps }) => {
          sent.push(rps)
          return { providerDocumentId: 'nota-1', status: 'accepted' as const }
        },
      }),
      fetch: rejectingFetch,
      secretService: { decrypt: async () => ({ apiToken: 'token-sintetico' }) },
    })

    await gateway.issue({ credential: createCredential('production'), payload: PAYLOAD })

    const rps = sent[0]
    expect(rps).toBeDefined()
    expect(rps?.['ExigibilidadeISS']).toBe(PAYLOAD.issExigibility)
    expect(Object.keys(rps ?? {})).not.toContain('ExigibilidadeIss')
  })

  /**
   * Instalação que ainda não contratou a Nota RP não tem endereço para chamar. A causa é própria:
   * `transport_failure` mandaria o trilho tentar de novo para sempre contra uma URL vazia, e
   * `credential_unreadable` acusaria o segredo de um defeito que é de configuração.
   */
  test('reports an unconfigured provider without opening the sealed token', async () => {
    const decryptCalls: number[] = []
    const gateway = createNfseFiscalGateway({
      config: { baseUrl: undefined, timeoutMilliseconds: 15_000 },
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
