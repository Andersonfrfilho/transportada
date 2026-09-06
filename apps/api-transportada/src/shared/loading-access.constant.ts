/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Por onde o veículo carrega — e é isso que decide se a ordem de carregamento é camisa de força.
 *
 * ⚠️ **Não se deduz do tipo do veículo.** Fiorino abre só atrás e van costuma abrir atrás e na
 * lateral, mas **a mesma Sprinter existe com e sem porta lateral**: é característica daquele
 * caminhão, não da categoria. Deduzir erraria justamente no veículo que foge do estereótipo, que é
 * o caso que faz alguém parar de confiar na tela.
 *
 * O `body_type` (`tpCar` do MDF-e) semeia o valor inicial — `05` sider abre a lateral inteira —,
 * mas depois disso quem manda é a ficha.
 */
export const LOADING_ACCESS_KINDS = [
  /** Só a porta traseira: a última entrega viaja no fundo, e a ordem é obrigatória. */
  'rear',
  /** Traseira e lateral: a ordem ainda ajuda, mas dá para alcançar o meio da carga. */
  'rear_and_side',
  /** Carroceria aberta ou sider: a ordem quase não importa; o que passa a valer é o peso. */
  'open',
] as const

export type LoadingAccess = (typeof LOADING_ACCESS_KINDS)[number]

export const LOADING_ACCESS_MAX_LENGTH = 20

/** `05` é sider e abre o comprimento inteiro; `01` é aberta. O resto carrega pela traseira. */
export function resolveDefaultLoadingAccess(bodyType: string): LoadingAccess {
  if (bodyType === '05' || bodyType === '01') return 'open'
  return 'rear'
}
