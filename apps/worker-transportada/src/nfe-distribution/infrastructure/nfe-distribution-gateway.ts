/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeDistribuicaoConfig, NfeDistribuicaoResult } from '@adatechnology/fiscal-provider'

type NfeDistributionRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: 'homologation' | 'production'
}

type NfeDistributionGateway = {
  consultarDFe(input: {
    readonly config: NfeDistributionRuntimeConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
}

type NfeDistributionGatewayFactory = {
  create(input: { readonly config: NfeDistributionRuntimeConfig }): NfeDistributionGateway
}

type NfeDistributionGatewayDependencies = {
  readonly createProvider: (input: {
    readonly config: NfeDistributionRuntimeConfig
  }) => NfeDistributionGateway
}

export function createNfeDistributionGatewayFactory(
  input: NfeDistributionGatewayDependencies,
): NfeDistributionGatewayFactory {
  return {
    create(params: { readonly config: NfeDistributionRuntimeConfig }): NfeDistributionGateway {
      const provider = input.createProvider({
        config: params.config,
      })

      return {
        async consultarDFe(query: {
          readonly config: NfeDistributionRuntimeConfig
          readonly ultNSU: string
        }): Promise<NfeDistribuicaoResult> {
          return provider.consultarDFe(query)
        },
      }
    },
  }
}
