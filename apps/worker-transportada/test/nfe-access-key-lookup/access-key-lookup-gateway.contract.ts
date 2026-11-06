/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  FiscalConnectionError,
  FiscalRejectionError,
  FiscalTimeoutError,
  type DfeItem,
  type NfeDistribuicaoConfig,
} from '@adatechnology/fiscal-provider'

import { createAdatechnologyNfeDistributionProvider } from '../../src/nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.js'
import { createNfeDistributionGatewayFactory } from '../../src/nfe-distribution/infrastructure/nfe-distribution-gateway.js'
import { DISTRIBUTION_CONFIG } from '../nfe-distribution/nfe-distribution.fixture.js'

const ACCESS_KEY = '35260112345678000190550010000000011000000011'

type LookupProvider = {
  consultarPorChave(params: {
    readonly config: NfeDistribuicaoConfig
    readonly chaveNfe: string
  }): Promise<DfeItem | undefined>
}

function gatewayFor(lookup: LookupProvider['consultarPorChave']) {
  return createAdatechnologyNfeDistributionProvider({
    instantiateProvider: () => ({
      async consultarDFe() {
        throw new Error('not used')
      },
      consultarPorChave: lookup,
    }),
  })({ config: DISTRIBUTION_CONFIG })
}

function query() {
  return { config: DISTRIBUTION_CONFIG, chaveNfe: ACCESS_KEY }
}

describe('access key lookup gateway contract', () => {
  test('passes the mapped config and key to the provider and returns the document', async () => {
    const item: DfeItem = {
      nsu: '1',
      schema: 'procNFe',
      xmlComprimido: 'H4sI',
      xmlDecoded: '<nfeProc/>',
    }
    const seen: Array<{ environment: string; chaveNfe: string }> = []
    const gateway = gatewayFor(async (params) => {
      seen.push({ environment: params.config.environment, chaveNfe: params.chaveNfe })
      expect(params.config.certificadoSenha).toBe('secret-password')
      return item
    })

    await expect(gateway.consultarPorChave(query())).resolves.toEqual({ kind: 'document', item })
    expect(seen).toEqual([{ environment: 'homologacao', chaveNfe: ACCESS_KEY }])
  })

  test('an empty answer (137) is not-found', async () => {
    const gateway = gatewayFor(async () => undefined)
    await expect(gateway.consultarPorChave(query())).resolves.toEqual({ kind: 'not-found' })
  })

  test('reads the cStat from the raw package error message', async () => {
    for (const cStat of ['217', '640', '632', '653', '654', '593']) {
      const gateway = gatewayFor(async () => {
        throw new Error(`SEFAZ NFeDistribuicaoDFe cStat ${cStat}: Rejeicao qualquer`)
      })
      await expect(gateway.consultarPorChave(query())).resolves.toEqual({
        kind: 'sefaz-rejection',
        cStat,
      })
    }
  })

  test('reads the 656 rate limit message of the package', async () => {
    const gateway = gatewayFor(async () => {
      throw new Error(
        'SEFAZ NFeDistribuicaoDFe: rate limit atingido — aguarde 1 hora antes de consultar novamente o mesmo CNPJ (cStat 656)',
      )
    })
    await expect(gateway.consultarPorChave(query())).resolves.toEqual({
      kind: 'sefaz-rejection',
      cStat: '656',
    })
  })

  test('prefers the typed code of a rejection error and never reads rawResponse', async () => {
    const gateway = gatewayFor(async () => {
      throw new FiscalRejectionError('640', 'Nao interessado', '<xml>cStat 999</xml>')
    })
    await expect(gateway.consultarPorChave(query())).resolves.toEqual({
      kind: 'sefaz-rejection',
      cStat: '640',
    })
  })

  test('timeout and connection errors are unavailable', async () => {
    for (const error of [
      new FiscalTimeoutError('SEFAZ NFeDistribuicaoDFe'),
      new FiscalConnectionError('SEFAZ NFeDistribuicaoDFe', 'ECONNRESET'),
    ]) {
      const gateway = gatewayFor(async () => {
        throw error
      })
      await expect(gateway.consultarPorChave(query())).resolves.toEqual({ kind: 'unavailable' })
    }
  })

  test('a non-SEFAZ body (empty cStat, e.g. 5xx HTML) is unavailable', async () => {
    const gateway = gatewayFor(async () => {
      throw new Error('SEFAZ NFeDistribuicaoDFe cStat : erro desconhecido')
    })
    await expect(gateway.consultarPorChave(query())).resolves.toEqual({ kind: 'unavailable' })
  })

  test('unrelated errors (invalid key, certificate) propagate', async () => {
    const gateway = gatewayFor(async () => {
      throw new Error('Chave de acesso inválida: "1"')
    })
    await expect(gateway.consultarPorChave(query())).rejects.toThrow('Chave de acesso inválida')
  })

  test('the gateway factory forwards consultarPorChave to the provider', async () => {
    const factory = createNfeDistributionGatewayFactory({
      createProvider: () => ({
        async consultarDFe() {
          throw new Error('not used')
        },
        async consultarPorChave() {
          return { kind: 'unavailable' as const }
        },
      }),
    })
    const gateway = factory.create({ config: DISTRIBUTION_CONFIG })
    await expect(gateway.consultarPorChave(query())).resolves.toEqual({ kind: 'unavailable' })
  })
})
