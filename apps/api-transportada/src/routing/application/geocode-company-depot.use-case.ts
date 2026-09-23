/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 165 (bancada): o barracão nunca chega a `geocoded_addresses` pelo caminho de produção —
 * quem geocodifica endereço de entrega é a fila do worker (`geocoding-backfill`), que só enfileira
 * o que `nfe_addresses`/`company_fiscal_profiles` pedem, e **nenhum worker roda nesta bancada**. Sem
 * o barracão geocodificado, `readDepot` (`route-depot.query.ts`) devolve `not_geocoded`, a rota
 * nasce sem a perna de saída/retorno, e uma viagem com uma única parada nem chega a ter as duas
 * paradas que `readRouteGeometry` exige.
 *
 * Este caso de uso cobre só o último degrau da cascata do worker (centroide de município,
 * `source`/`precision` = `'city'`) — o mesmo degrau que `save-municipality-centroids.use-case.ts`
 * alimenta. Não tenta reproduzir os degraus de CEP/logradouro do worker (`BrasilAPI`/Google): eles
 * pertencem a outra app, e a regra do monorepo veta importar código-fonte entre apps
 * (`CLAUDE.md` "Estrutura"). Um centroide de ~8 km é pior que geocodificação fina, mas é
 * exatamente o degrau que o produto já aceita mostrar na tela (`GEOCODING_PRECISIONS`), e é
 * infinitamente melhor que a rota nunca ser calculada.
 */
import type { GeocodedAddressRecord, GeocodedAddressRepository } from './geocoding.port.js'
import type { MunicipalityCentroidRepository } from './municipality-centroid.port.js'

export type GeocodeCompanyDepotInput = Readonly<{
  readonly addressKey: string
  readonly cityIbgeCode: string
}>

export type GeocodeCompanyDepotResult =
  | Readonly<{ readonly status: 'already_geocoded' }>
  | Readonly<{ readonly status: 'centroid_missing' }>
  | Readonly<{ readonly status: 'geocoded' }>

export type GeocodeCompanyDepotDependencies = Readonly<{
  readonly centroids: MunicipalityCentroidRepository
  readonly geocodedAddresses: GeocodedAddressRepository
}>

/**
 * Idempotente por leitura: uma chave já presente em `geocoded_addresses` — inclusive uma
 * geocodificação fina que o worker tenha feito depois — nunca é sobrescrita por um centroide pior.
 */
export async function geocodeCompanyDepot(
  dependencies: GeocodeCompanyDepotDependencies,
  input: GeocodeCompanyDepotInput,
): Promise<GeocodeCompanyDepotResult> {
  const [existing] = await dependencies.geocodedAddresses.findByKeys([input.addressKey])
  if (existing !== undefined) return { status: 'already_geocoded' }

  const centroid = await dependencies.centroids.findByCityCode(input.cityIbgeCode)
  if (centroid === null) return { status: 'centroid_missing' }

  const record: GeocodedAddressRecord = {
    addressKey: input.addressKey,
    externalPlaceId: '',
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    precision: 'city',
    source: 'city',
  }
  await dependencies.geocodedAddresses.save(record)

  return { status: 'geocoded' }
}
