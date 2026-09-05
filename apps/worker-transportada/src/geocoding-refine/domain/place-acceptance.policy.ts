/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ⚠️ **A Places corrige o que não foi pedido, e é por isso que esta política existe.** Medido em
 * 2026-09-05, contra o endereço de Luís Antônio:
 *
 * - rua com **dois** erros de grafia (`AMERICA/PERES` no lugar de `Américo/Píres`) → ela acha o
 *   lugar certo, que é justamente o que a Geocoding não faz;
 * - rua **inventada** na mesma cidade → **nenhum resultado**, e é essa recusa que torna o degrau
 *   seguro: ela não devolve palpite plausível;
 * - rua certa com o número **99999** → ela devolve o **533**, calada.
 *
 * O terceiro é o perigoso: coordenada de outro prédio com cara de acerto, que é a família de defeito
 * da ADR-0044 §1. A guarda é comparar o que voltou com o que se pediu — e recusar em vez de gravar.
 */
export type PlaceAcceptance = 'accepted' | 'city_mismatch' | 'number_mismatch' | 'without_number'

export type PlaceCandidate = Readonly<{
  cityName: string
  streetNumber: string
}>

export type PlaceAcceptanceRequest = Readonly<{
  city: string
  number: string
}>

export function checkPlaceAcceptance(input: {
  readonly candidate: PlaceCandidate
  readonly request: PlaceAcceptanceRequest
}): PlaceAcceptance {
  /**
   * Sem número nos componentes o resultado é ponto de rua, não de porta — e a rua inteira já é o que
   * o degrau 1 sabe dar de graça. Gravá-lo como telhado seria comprar a mesma imprecisão.
   */
  const returnedNumber = toComparableNumber(input.candidate.streetNumber)
  if (returnedNumber.length === 0) return 'without_number'

  const requestedNumber = toComparableNumber(input.request.number)
  if (requestedNumber.length === 0) return 'without_number'
  if (returnedNumber !== requestedNumber) return 'number_mismatch'

  /**
   * O município se compara **dobrado** — sem acento e em caixa alta —, nunca literal: a nota grafa
   * `LUIS ANTONIO` e o provedor devolve `Luís Antônio`, e recusar por isso jogaria fora justamente o
   * caso que o degrau existe para resolver. Município ausente na resposta não recusa: quem afirma a
   * divergência é a presença dela, não a falta de dado.
   */
  const returnedCity = toComparableCity(input.candidate.cityName)
  const requestedCity = toComparableCity(input.request.city)
  if (returnedCity.length === 0 || requestedCity.length === 0) return 'accepted'

  return returnedCity === requestedCity ? 'accepted' : 'city_mismatch'
}

/**
 * Só os dígitos: `533`, `533 A` e `nº 533` são a mesma porta, e a letra do complemento não pode
 * transformar um acerto em recusa.
 */
function toComparableNumber(value: string): string {
  return value.replace(/\D/gu, '')
}

function toComparableCity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/gu, ' ')
    .trim()
}
