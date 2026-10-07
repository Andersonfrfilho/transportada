/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoArrivalStatus } from './cargoArrival.types'
import { CARGO_ARRIVAL_LIMITS } from './cargoReceiving.constant'

type ArrivalPollingInput = Readonly<{
  isTouchInFlight: boolean
  isVisible: boolean
  status: CargoArrivalStatus | undefined
}>

/**
 * Mais de uma pessoa separa a mesma chegada: a leitura periódica traz o que o colega fez, e o aviso de
 * "já avançou" deixa de ser a primeira notícia. Só roda com a chegada aberta e a aba visível, e nunca com
 * um toque meu em voo — a releitura brigaria com a atualização otimista. Fechada, para sozinha.
 */
export function resolveCargoArrivalRefetchInterval(input: ArrivalPollingInput): number | false {
  if (input.status !== 'open') return false
  if (input.isTouchInFlight || !input.isVisible) return false
  return CARGO_ARRIVAL_LIMITS.detailRefetchIntervalMs
}
