/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type CompanyGroupUnit = Readonly<{
  companyId: string
  cnpj: string
  tradeName: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
  postalCode: string
  phone: string
}>

/** Posição 9-12 do CNPJ é a ordem do estabelecimento — `0001` é sempre a matriz. */
const MATRIX_BRANCH = '0001'

/**
 * A matriz vem primeiro, o resto por nome fantasia. É a ordem que a landing usa em "Onde estamos":
 * a sede antes das filiais, sem depender de quando cada uma foi cadastrada.
 */
export function orderGroupUnits(units: readonly CompanyGroupUnit[]): readonly CompanyGroupUnit[] {
  return [...units].sort((left, right) => {
    const leftIsMatrix = left.cnpj.slice(8, 12) === MATRIX_BRANCH
    const rightIsMatrix = right.cnpj.slice(8, 12) === MATRIX_BRANCH

    if (leftIsMatrix !== rightIsMatrix) {
      return leftIsMatrix ? -1 : 1
    }

    return left.tradeName.localeCompare(right.tradeName, 'pt-BR')
  })
}
