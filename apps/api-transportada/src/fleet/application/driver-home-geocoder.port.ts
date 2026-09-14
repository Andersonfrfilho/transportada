/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  planDriverHomeGeocoding,
  type DriverHomeState,
} from '../domain/driver-home-geocoding.policy.js'

export type DriverHomeCoordinate = Readonly<{ latitude: string; longitude: string }>

export type DriverHomeGeocoderPort = Readonly<{
  /** Preenche a coordenada da casa **uma vez**, se a ficha ainda não tiver sido procurada. */
  fill: (input: { readonly companyId: string; readonly driverId: string }) => Promise<void>
}>

export type DriverHomeRepositoryPort = Readonly<{
  readHome: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<DriverHomeState | null>
  writeHome: (input: {
    readonly companyId: string
    readonly coordinate: DriverHomeCoordinate | null
    readonly driverId: string
  }) => Promise<void>
}>

/**
 * "Quando não houver, busca e adiciona; depois não faz mais."
 *
 * ⚠️ **A gravação acontece mesmo quando o provedor não acha nada** — é ela que carimba a marca de
 * "já procurei". Sem isso, o motorista cujo endereço o Photon não encontra dispararia uma busca a
 * cada salvamento, para sempre, e nada falharia para denunciar.
 *
 * ⚠️ Falha do provedor **não** grava a marca: rede fora do ar não é resposta, e carimbar aqui
 * condenaria a ficha a nunca mais tentar por causa de um timeout. Ela sai calada e tenta de novo no
 * próximo salvamento — que é o único gatilho, então não vira repetição por página.
 */
export function createDriverHomeGeocoder(dependencies: {
  readonly provider: Readonly<{
    search: (term: string, expectedCity: string) => Promise<DriverHomeCoordinate | null>
  }>
  readonly repository: DriverHomeRepositoryPort
}): DriverHomeGeocoderPort {
  return {
    async fill(input) {
      const home = await dependencies.repository.readHome(input)
      if (home === null) return

      const plan = planDriverHomeGeocoding(home)
      if (plan.action === 'skip') return

      /** ⚠️ A cidade vai junto: sem ela o provedor casa a rua homônima da cidade mais famosa. */
      const coordinate = await dependencies.provider.search(plan.term, home.city)
      await dependencies.repository.writeHome({ ...input, coordinate })
    },
  }
}
