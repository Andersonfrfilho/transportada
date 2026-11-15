/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 342: localiza um endereço digitado pelo parceiro. Ordem da cascata da ADR-0044 §3: coordenada
 * já guardada (`geocoded_addresses`, chave `cidade|CEP|número`) → provedor fino (Google, só com
 * chave) → nada. O que o provedor devolve é guardado, então o mesmo endereço nunca é comprado duas
 * vezes. Nunca lança por "não achei": devolve `null` e o caso de uso recusa a cotação.
 *
 * ⚠️ O endereço é PII: nada daqui vai a log.
 */
import type {
  GeocodedAddressRepository,
  GeocodingPort,
} from '../../routing/application/geocoding.port.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import type {
  QuoteAddress,
  QuoteAddressLocatorPort,
  QuoteLocation,
} from '../application/freight-quote-by-address.use-case.js'

export function createQuoteAddressLocator(dependencies: {
  readonly geocoded: GeocodedAddressRepository
  /** Ausente sem `GOOGLE_MAPS_API_KEY`: só o que já está guardado é localizado. */
  readonly geocoding: GeocodingPort | undefined
}): QuoteAddressLocatorPort {
  return {
    async locate({ address }: { readonly address: QuoteAddress }): Promise<null | QuoteLocation> {
      const addressKey =
        address.cityIbgeCode === null
          ? null
          : buildStopAddressKey({
              cityCode: address.cityIbgeCode,
              number: address.number,
              postalCode: address.postalCode,
            })

      if (addressKey !== null) {
        const [stored] = await dependencies.geocoded.findByKeys([addressKey])
        if (stored !== undefined) {
          return {
            latitude: stored.latitude,
            longitude: stored.longitude,
            precision: stored.precision,
          }
        }
      }

      if (dependencies.geocoding === undefined) return null
      const found = await dependencies.geocoding.geocode({
        addressKey: addressKey ?? '',
        city: address.city,
        cityCode: address.cityIbgeCode ?? '',
        district: address.district,
        number: address.number,
        postalCode: address.postalCode,
        state: address.state,
        street: address.street,
      })
      if (found === null) return null

      if (addressKey !== null) await dependencies.geocoded.save({ ...found, addressKey })
      return { latitude: found.latitude, longitude: found.longitude, precision: found.precision }
    },
  }
}
