/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoadingAccess } from '@adatechnology/cargo-placement'

/**
 * Por onde o veículo carrega — e é isso que decide se a ordem de carregamento é camisa de força.
 *
 * ⚠️ **Não se deduz do tipo do veículo.** Fiorino abre só atrás e van costuma abrir atrás e na
 * lateral, mas **a mesma Sprinter existe com e sem porta lateral**: é característica daquele
 * caminhão, não da categoria. Deduzir erraria justamente no veículo que foge do estereótipo, que é
 * o caso que faz alguém parar de confiar na tela.
 *
 * O `body_type` (`tpCar` do MDF-e) semeia o valor inicial — `05` sider abre a lateral inteira —,
 * mas depois disso quem manda é a ficha. O vocabulário mora no pacote do empacotador; a coluna e a
 * semente ficam aqui.
 */
export { LOADING_ACCESS_KINDS, type LoadingAccess } from '@adatechnology/cargo-placement'

export const LOADING_ACCESS_MAX_LENGTH = 20

/** `05` é sider e abre o comprimento inteiro; `01` é aberta. O resto carrega pela traseira. */
export function resolveDefaultLoadingAccess(bodyType: string): LoadingAccess {
  if (bodyType === '05' || bodyType === '01') return 'open'
  return 'rear'
}
