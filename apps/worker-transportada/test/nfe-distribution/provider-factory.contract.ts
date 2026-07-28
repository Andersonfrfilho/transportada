/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfeDistribuicaoConfig, NfeDistribuicaoResult } from '@adatechnology/fiscal-provider'

import { DISTRIBUTION_CONFIG } from './nfe-distribution.fixture.js'

type NfeDistributionRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: 'homologation' | 'production'
}

type SefazDistributionProvider = {
  consultarDFe(params: {
    readonly config: NfeDistribuicaoConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
}

type ProductionProviderModule = {
  readonly createAdatechnologyNfeDistributionProvider: (dependencies?: {
    readonly instantiateProvider?: () => SefazDistributionProvider
  }) => (input: { readonly config: NfeDistributionRuntimeConfig }) => {
    consultarDFe(input: {
      readonly config: NfeDistributionRuntimeConfig
      readonly ultNSU: string
    }): Promise<NfeDistribuicaoResult>
  }
  readonly toNfeDistribuicaoProviderConfig: (
    config: NfeDistributionRuntimeConfig,
  ) => NfeDistribuicaoConfig
}

const MODULE_PATH =
  '../../src/nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.js'
const SOURCE_PATH =
  '../../src/nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.ts'

async function loadModule(): Promise<ProductionProviderModule> {
  return (await import(MODULE_PATH)) as ProductionProviderModule
}

describe('NF-e distribution production provider factory contract', () => {
  test('maps the runtime environment to the SEFAZ environment while preserving certificate material', async () => {
    const { toNfeDistribuicaoProviderConfig } = await loadModule()

    const homologation = toNfeDistribuicaoProviderConfig(DISTRIBUTION_CONFIG)
    expect(homologation).toEqual({
      certificadoBase64: 'BASE64CERT',
      certificadoSenha: 'secret-password',
      cnpj: '12345678000190',
      environment: 'homologacao',
      model: 'nfe-distribuicao',
      uf: 'SP',
    })

    const production = toNfeDistribuicaoProviderConfig({
      ...DISTRIBUTION_CONFIG,
      environment: 'production',
    })
    expect(production.environment).toBe('producao')
  })

  test('delegates to the SEFAZ provider with the mapped config and forwards the paginated result', async () => {
    const { createAdatechnologyNfeDistributionProvider } = await loadModule()

    const seen: Array<{ readonly environment: string; readonly ultNSU: string }> = []
    const page: NfeDistribuicaoResult = {
      itens: [],
      maxNSU: '000000000000051',
      temMais: false,
      ultNSU: '000000000000001',
    }

    const createProvider = createAdatechnologyNfeDistributionProvider({
      instantiateProvider: () => ({
        async consultarDFe(params) {
          seen.push({ environment: params.config.environment, ultNSU: params.ultNSU })
          expect(params.config.certificadoBase64).toBe('BASE64CERT')
          expect(params.config.certificadoSenha).toBe('secret-password')
          return page
        },
      }),
    })

    const gateway = createProvider({ config: DISTRIBUTION_CONFIG })
    await expect(
      gateway.consultarDFe({ config: DISTRIBUTION_CONFIG, ultNSU: '000000000000000' }),
    ).resolves.toEqual(page)

    expect(seen).toEqual([{ environment: 'homologacao', ultNSU: '000000000000000' }])
  })

  test('keeps the real Ada fiscal package isolated in the provider factory without leaking secrets', async () => {
    const source = await Bun.file(new URL(SOURCE_PATH, import.meta.url)).text()

    expect(source).toContain("from '@adatechnology/fiscal-provider'")
    expect(source).toContain('NfeDistribuicaoProvider')
    expect(source).not.toContain('@adatechnology/fiscal-provider/')
    expect(source).not.toContain('src/sefaz')
    expect(source).not.toContain('console.')
  })
})
