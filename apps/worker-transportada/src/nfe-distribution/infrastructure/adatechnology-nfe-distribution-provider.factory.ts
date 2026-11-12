/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  NfeDistribuicaoProvider,
  type NfeDistribuicaoConfig,
  type DfeItem,
  type NfeDistribuicaoResult,
} from '@adatechnology/fiscal-provider'

import type { AccessKeyLookupGatewayResult } from '../../nfe-access-key-lookup/domain/nfe-access-key-lookup.types.js'

import {
  mapAccessKeyLookupError,
  mapAccessKeyLookupItem,
} from './nfe-access-key-lookup-result.mapper.js'

const DISTRIBUTION_MODEL = 'nfe-distribuicao' as const

const SEFAZ_ENVIRONMENT = {
  homologation: 'homologacao',
  production: 'producao',
} as const

type NfeDistributionRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: keyof typeof SEFAZ_ENVIRONMENT
}

type SefazDistributionProvider = {
  consultarDFe(params: {
    readonly config: NfeDistribuicaoConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
  consultarPorChave(params: {
    readonly config: NfeDistribuicaoConfig
    readonly chaveNfe: string
  }): Promise<DfeItem | undefined>
}

type NfeDistributionProviderGateway = {
  consultarDFe(input: {
    readonly config: NfeDistributionRuntimeConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
  consultarPorChave(input: {
    readonly config: NfeDistributionRuntimeConfig
    readonly chaveNfe: string
  }): Promise<AccessKeyLookupGatewayResult>
}

type CreateAdatechnologyNfeDistributionProviderDependencies = {
  readonly instantiateProvider?: () => SefazDistributionProvider
}

export function toNfeDistribuicaoProviderConfig(
  config: NfeDistributionRuntimeConfig,
): NfeDistribuicaoConfig {
  return {
    certificadoBase64: config.certificadoBase64,
    certificadoSenha: config.certificadoSenha,
    cnpj: config.cnpj,
    environment: SEFAZ_ENVIRONMENT[config.environment],
    model: DISTRIBUTION_MODEL,
    uf: config.uf,
  }
}

export function createAdatechnologyNfeDistributionProvider(
  dependencies: CreateAdatechnologyNfeDistributionProviderDependencies = {},
): (input: { readonly config: NfeDistributionRuntimeConfig }) => NfeDistributionProviderGateway {
  const instantiateProvider =
    dependencies.instantiateProvider ?? (() => new NfeDistribuicaoProvider())

  return () => {
    const provider = instantiateProvider()
    return {
      async consultarDFe(input) {
        return provider.consultarDFe({
          config: toNfeDistribuicaoProviderConfig(input.config),
          ultNSU: input.ultNSU,
        })
      },
      async consultarPorChave(input) {
        try {
          const item = await provider.consultarPorChave({
            config: toNfeDistribuicaoProviderConfig(input.config),
            chaveNfe: input.chaveNfe,
          })
          return mapAccessKeyLookupItem(item)
        } catch (error) {
          return mapAccessKeyLookupError(error)
        }
      },
    }
  }
}
