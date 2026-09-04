/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildClientStreetKey } from './client-address-key.js'
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'

/**
 * O que a nota diz e o que o provedor devolveu, campo a campo.
 *
 * ⚠️ **Comparar não é procurar.** O que a spec 084 rejeita — medido em 14% de acerto com falsos
 * positivos mandando `RUA 02` para `Rua 12` — é **procurar** uma rua entre milhares por semelhança,
 * um-para-muitos. Aqui se compara o nosso texto com o texto que o provedor devolveu **para aquela
 * mesma consulta**: um-para-um, e o resultado não elege nada. Ele diz que os dois diferem.
 *
 * ⚠️ **Divergência sinaliza; ela nunca corrige.** Provedor errado depois de gravado é
 * indistinguível de provedor certo.
 */
export type AddressSide = Readonly<{
  district: null | string
  number: null | string
  postalCode: null | string
  street: null | string
}>

export type AddressComparison = Readonly<{
  districtDiverges: boolean
  matchLevel: ProviderMatchLevel
  postalCodeDiverges: boolean
  streetDiverges: boolean
}>

/** Só dígitos: `14210-000` e `14210000` são o mesmo CEP, e a nota escreve dos dois jeitos. */
function normalizePostalCode(value: null | string): string {
  return (value ?? '').replace(/\D/gu, '')
}

/**
 * ⚠️ **O município é portão, não campo de comparação.** Resultado que volta em outra cidade é
 * **descartado** (RF2) — comparar rua de outra cidade é comparar outra coisa, e gravar `rooftop` na
 * cidade errada é precisão alta no lugar errado, que ninguém mais desconfia.
 */
export function compareAddresses(input: {
  readonly cityMismatch: boolean
  readonly matchLevel: ProviderMatchLevel
  readonly note: AddressSide
  readonly provider: AddressSide
}): AddressComparison {
  const inerte: AddressComparison = {
    districtDiverges: false,
    matchLevel: input.matchLevel,
    postalCodeDiverges: false,
    streetDiverges: false,
  }

  if (input.cityMismatch) return inerte

  /**
   * ⚠️ Sem rua no retorno não há o que comparar — e **isso já é o sinal**: `approximate` com rua
   * ausente significa que o texto da nota não existe para o provedor. Medido com a chave real:
   * `R AMERICA DE ARAUJO PERES` devolve só o município. Marcar `streetDiverges` aqui seria dizer
   * "as duas ruas diferem" quando só há uma.
   */
  if (input.matchLevel === 'approximate' || input.matchLevel === 'not_found') return inerte

  const ruaNota = buildClientStreetKey(input.note.street)
  const ruaProvedor = buildClientStreetKey(input.provider.street)

  const cepNota = normalizePostalCode(input.note.postalCode)
  const cepProvedor = normalizePostalCode(input.provider.postalCode)

  /**
   * ⚠️ **Bairro ausente na nota é acréscimo, não conflito.** A NF-e vem sem bairro o tempo todo, e
   * tratar isso como divergência encheria o relatório de linhas que não pedem decisão nenhuma.
   */
  const bairroNota = buildClientStreetKey(input.note.district)
  const bairroProvedor = buildClientStreetKey(input.provider.district)

  return {
    districtDiverges:
      bairroNota.length > 0 && bairroProvedor.length > 0 && bairroNota !== bairroProvedor,
    matchLevel: input.matchLevel,
    postalCodeDiverges: cepNota.length > 0 && cepProvedor.length > 0 && cepNota !== cepProvedor,
    streetDiverges: ruaNota.length > 0 && ruaProvedor.length > 0 && ruaNota !== ruaProvedor,
  }
}

/**
 * A ordem em que o relatório mostra: quem nem foi achado primeiro, porque é quem tem defeito no
 * **texto** — e é o único que nenhuma correção de coordenada resolve.
 */
export const MATCH_LEVEL_SEVERITY: Readonly<Record<ProviderMatchLevel, number>> = {
  approximate: 1,
  not_found: 0,
  range_interpolated: 2,
  rooftop: 3,
}

/**
 * Precisa de gente? `approximate` e `not_found` sempre, porque o texto não existe. Divergência de
 * texto também — inclusive com `rooftop`, que é o caso sutil: o provedor achou **outra** rua e a
 * coordenada está certa para ela, não para a que a nota queria.
 */
export function needsHuman(comparison: AddressComparison): boolean {
  return (
    MATCH_LEVEL_SEVERITY[comparison.matchLevel] <= MATCH_LEVEL_SEVERITY.approximate ||
    comparison.streetDiverges ||
    comparison.postalCodeDiverges
  )
}
