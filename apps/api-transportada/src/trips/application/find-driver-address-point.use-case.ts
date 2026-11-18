/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 343 (T6a): o ponto no mapa do endereço correto que o escritório digitou (CEP, número, rua…), para o pino do
 * Google que vai ao motorista. Só consulta o geocodificador; nada é gravado e o endereço (PII) nunca vai a log.
 * Sem coordenada devolve `null`: o envio segue só com o texto.
 */
import type { GeocodingPort } from '../../routing/application/geocoding.port.js'

export type DriverAddressPointRequest = {
  readonly city: string
  readonly district: string
  readonly number: string
  readonly postalCode: string
  readonly state: string
  readonly street: string
}

export type DriverAddressPointResult = {
  readonly latitude: number
  readonly longitude: number
  readonly precision: string
}

export type FindDriverAddressPointUseCase = {
  readonly execute: (request: DriverAddressPointRequest) => Promise<DriverAddressPointResult | null>
}

export function createFindDriverAddressPointUseCase(dependencies: {
  readonly geocoding: GeocodingPort
}): FindDriverAddressPointUseCase {
  return {
    async execute(request) {
      const found = await dependencies.geocoding.geocode({
        ...request,
        addressKey: '',
        cityCode: '',
      })
      if (found === null) return null
      const latitude = Number(found.latitude)
      const longitude = Number(found.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return { latitude, longitude, precision: found.precision }
    },
  }
}
