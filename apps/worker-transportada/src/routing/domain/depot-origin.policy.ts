/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/trips/domain/depot-origin.policy.ts`. As duas apps
 * não importam código uma da outra, e esta regra decide **de onde a rota parte**: se divergir,
 * "Propor ordem" parte de um lugar e o mapa da montagem de outro (spec 097 D7).
 * `test/routing/depot-origin-parity.contract.ts` guarda a paridade das duas.
 */
import { buildStopAddressKey } from './pool-address-key.js'

export const DEPOT_ORIGIN_SOURCES = ['route_settings', 'company_address'] as const
export type DepotOriginSource = (typeof DEPOT_ORIGIN_SOURCES)[number]

export type DepotOrigin = Readonly<{ addressKey: string; source: DepotOriginSource }>

export type ResolveDepotOriginParams = {
  /** O endereço de `company_fiscal_profiles`; `null` quando a empresa não tem perfil fiscal. */
  readonly companyAddress: null | {
    readonly cityIbgeCode: string
    readonly number: string
    readonly postalCode: string
  }
  /** `company_route_optimization_settings.origin_address_key`; `null` quando não há linha. */
  readonly configuredAddressKey: null | string
}

/**
 * A origem configurada sempre vence. Sem ela — sem linha, ou com a coluna no `''` com que nasce —,
 * o barracão é o endereço cadastrado da empresa, na **mesma chave das paradas**: é por ela que
 * `geocoded_addresses` guarda a coordenada. CEP incompleto não vira chave inventada (D2).
 */
export function resolveDepotOrigin(input: ResolveDepotOriginParams): DepotOrigin | null {
  const configured = input.configuredAddressKey ?? ''
  if (configured !== '') return { addressKey: configured, source: 'route_settings' }
  if (input.companyAddress === null) return null

  const addressKey = buildStopAddressKey({
    cityCode: input.companyAddress.cityIbgeCode,
    number: input.companyAddress.number,
    postalCode: input.companyAddress.postalCode,
  })

  return addressKey === null ? null : { addressKey, source: 'company_address' }
}
