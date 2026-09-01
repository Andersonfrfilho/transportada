/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** O CPF já é conhecido do grupo — como candidatura, ficha, ou as duas coisas. */
export type AggregateAccountEligibility = Readonly<{
  companyId: string
  taxId: string
}>

export type AggregateAccountRepositoryPort = Readonly<{
  /**
   * `null` quando o CPF nunca apareceu no grupo — nem como candidatura, nem como ficha. Casa com
   * qualquer status de candidatura de propósito: a conta pode nascer antes da aprovação, e o
   * portal resolve o estado (`pending`/`approved`/`rejected`) em tempo de leitura (T3), não aqui.
   */
  findEligibleTaxId: (input: {
    readonly companyIds: readonly string[]
    readonly taxId: string
  }) => Promise<AggregateAccountEligibility | null>
  isTaxIdLinked: (input: { readonly companyId: string; readonly taxId: string }) => Promise<boolean>
  link: (input: Readonly<{ companyId: string; taxId: string; userId: string }>) => Promise<void>
}>
