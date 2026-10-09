/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FetchPair, FetchRecord } from '../domain/holiday-fetch.types.js'
import type { ProviderHolidayEntry } from '../domain/holiday-provider.types.js'

export type SaveFetchSuccessParams = {
  readonly entries: readonly ProviderHolidayEntry[]
  readonly nextAttemptAt: Date
  readonly now: Date
  readonly pair: FetchPair
  /** A resposta da cidade trouxe o estadual: o par do estado e do ano também está coberto. */
  readonly stateCovered: { readonly stateCode: string; readonly year: number } | undefined
}

export type HolidayFetchStore = {
  /**
   * Incrementa o contador do mês **antes** da chamada: devolve `false` quando o orçamento já foi
   * atingido. O primeiro pedido do mês cria a linha (upsert), nunca um `UPDATE` sem linha.
   */
  claimBudget(params: { readonly budget: number; readonly month: string }): Promise<boolean>
  /** Cria o par do estado se faltar e o devolve só quando está vencido. */
  ensureStatePair(params: {
    readonly now: Date
    readonly stateCode: string
    readonly year: number
  }): Promise<FetchPair | undefined>
  /**
   * Pares vencidos: a paridade nacional, os pares de estado que já existem e as cidades pela demanda
   * decrescente, nos anos do horizonte. Só lê.
   */
  listDuePairs(params: {
    readonly limit: number
    readonly now: Date
    readonly years: readonly number[]
  }): Promise<readonly FetchPair[]>
  recordFetches(records: readonly FetchRecord[]): Promise<void>
  /** Grava as entradas, marca o que o fornecedor deixou de listar e fecha o par, tudo numa transação. */
  saveSuccess(params: SaveFetchSuccessParams): Promise<void>
}
