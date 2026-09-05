/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'
import { compareStreetNames } from './street-comparison.policy.js'

/**
 * O que se pede ao contratante, e em que ordem (spec 084, G8).
 *
 * ⚠️ **A ordem é a do relatório, e ela é por "o que nenhuma coordenada conserta" primeiro.** Um
 * logradouro que o provedor não conhece continua errado depois de qualquer pino que a gente arraste;
 * um CEP genérico é chato mas o caminhão chega. Ordenar por distância poria no topo o centroide de
 * município, que é o caso que já se resolveu sozinho comprando a coordenada.
 */
export const ADDRESS_FINDING_KINDS = [
  /**
   * ADR-0062: o endereço que **nem pagando** o provedor conseguiu apontar. Ele continua no centroide
   * do município, e a entrega sai com um palpite de ~8 km. É o achado mais grave da lista porque é o
   * único em que a carga não sabe para onde ir — os outros quatro são cadastro feio com entrega boa.
   */
  'coordinate_unresolved',
  'street_unknown',
  'city_mismatch',
  'street_different',
  'postal_code_stale',
  'street_incomplete',
] as const
export type AddressFindingKind = (typeof ADDRESS_FINDING_KINDS)[number]

export const FINDING_SEVERITY: Readonly<Record<AddressFindingKind, number>> = {
  city_mismatch: 3,
  coordinate_unresolved: 1,
  postal_code_stale: 5,
  street_different: 4,
  street_incomplete: 6,
  street_unknown: 2,
}

export type AddressComparisonFacts = Readonly<{
  cityMismatch: boolean
  matchLevel: ProviderMatchLevel
  noteStreet: string
  notePostalCode: string
  providerStreet: string
  providerPostalCode: string
}>

/**
 * `null` é o caso comum e desejado: o texto está bom, e o que o lote comprou foi só uma coordenada
 * melhor. Medido em 2026-09-04, é o que aconteceu com a maioria dos 148.
 *
 * ⚠️ **Bairro divergente ficou de fora de propósito.** Ele diverge em 44 dos 148, e a amostra mostra
 * por quê: `JARDIM DO LAGO` contra `Cohab 1`, `CENTRO` contra `Itobi` — o provedor não é autoridade
 * sobre limite de bairro no Brasil, e a fronteira entre dois jardins é discutível até entre vizinhos.
 * Pedir correção disso seria pedir que o contratante concorde com um palpite.
 */
export function resolveAddressFinding(facts: AddressComparisonFacts): AddressFindingKind | null {
  /**
   * ⚠️ **Rua vazia é `street_unknown`, e não "você escreveu a rua errada".** Medido: `not_found` deu
   * **zero** em 148, e treze caíram em `approximate` — que é o caso Luis Antonio, o provedor achando
   * só o município porque o logradouro da nota não existe para ele. Comparar com a rua vazia dava
   * `different`, e o relatório dizia "esta é outra rua" mostrando um campo em branco ao lado.
   */
  if (facts.matchLevel === 'not_found' || facts.providerStreet.trim().length === 0) {
    return 'street_unknown'
  }
  /** Resultado de outro município foi descartado: não há comparação de rua para confiar. */
  if (facts.cityMismatch) return 'city_mismatch'

  const relation = compareStreetNames(facts.noteStreet, facts.providerStreet)
  if (relation === 'different') return 'street_different'

  if (divergesPostalCode(facts)) return 'postal_code_stale'
  if (relation === 'incomplete') return 'street_incomplete'

  return null
}

/**
 * ⚠️ **Recomputado aqui, não lido da coluna.** `address_comparisons` guarda a **observação** — o que
 * a nota dizia e o que o provedor devolveu; a **interpretação** vive nesta política e pode mudar sem
 * tocar em dado pago. Foi o que permitiu a divergência de rua sair de 45 para 6 sem re-consultar
 * nada. A coluna `postal_code_diverges` continua sendo o sinal cru.
 */
function divergesPostalCode(facts: AddressComparisonFacts): boolean {
  const note = facts.notePostalCode.replace(/\D/gu, '')
  const provider = facts.providerPostalCode.replace(/\D/gu, '')

  return note.length === 8 && provider.length === 8 && note !== provider
}
