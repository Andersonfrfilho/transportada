/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quando procurar a coordenada da casa do motorista — e, sobretudo, quando **não** procurar.
 *
 * A regra pedida é "quando não houver, busca e adiciona; depois não faz mais". As duas metades são
 * igualmente importantes: a primeira preenche as fichas que já existem, e a segunda é o que impede
 * a montagem de virar uma chamada externa por carregamento de página.
 */

/** O que a ficha guarda hoje sobre a casa. */
export type DriverHomeState = Readonly<{
  city: string
  /** Quando alguém já procurou — `null` é "ninguém procurou ainda". */
  geocodedAt: Date | null
  latitude: null | string
  longitude: null | string
  number: string
  postalCode: string
  state: string
  street: string
}>

export const DRIVER_HOME_GEOCODING_SKIPS = ['already_searched', 'address_incomplete'] as const
export type DriverHomeGeocodingSkip = (typeof DRIVER_HOME_GEOCODING_SKIPS)[number]

export type DriverHomeGeocodingPlan =
  | Readonly<{ action: 'search'; term: string }>
  | Readonly<{ action: 'skip'; reason: DriverHomeGeocodingSkip }>

/**
 * ⚠️ **`geocodedAt` preenchido encerra o assunto, com ou sem coordenada.** Ele é a marca de
 * *procurou*; a coordenada é a de *achou*. Sem essa distinção, o motorista cujo endereço o provedor
 * não encontra dispararia uma busca a cada leitura — para sempre, e sem ninguém ver, porque nada
 * falha: só sai uma chamada externa a mais por página.
 *
 * ⚠️ Endereço incompleto não vira busca. Termo com rua vazia devolve o centro da cidade, e o centro
 * da cidade gravado como "casa do motorista" é um palpite com aparência de medida — a rota de
 * retorno passaria a terminar num lugar onde ninguém mora.
 */
export function planDriverHomeGeocoding(home: DriverHomeState): DriverHomeGeocodingPlan {
  if (home.geocodedAt !== null) return { action: 'skip', reason: 'already_searched' }
  if (home.street.trim() === '' || home.city.trim() === '') {
    return { action: 'skip', reason: 'address_incomplete' }
  }

  return { action: 'search', term: buildSearchTerm(home) }
}

/**
 * O termo é o endereço como se escreve num envelope. O CEP entra **no fim** e só quando tem os oito
 * dígitos: o Photon o usa para desempatar homônimos, e um CEP pela metade só adiciona ruído ao
 * casamento textual.
 */
function buildSearchTerm(home: DriverHomeState): string {
  const digits = home.postalCode.replace(/\D/gu, '')

  return [
    [home.street, home.number].filter((part) => part.trim() !== '').join(', '),
    home.city,
    home.state,
    digits.length === 8 ? digits : '',
  ]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(', ')
}
