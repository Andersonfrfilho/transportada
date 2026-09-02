/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T018: o símbolo de cada pendência fiscal.
 *
 * O ícone acelera a varredura de uma lista de pendências — o olho acha o símbolo antes de ler a
 * frase (`web.md` §9) —, e aqui ele **acompanha** o rótulo, nunca o substitui: "recusado" e
 * "cancelado" são fatos diferentes que nenhum desenho distingue sozinho.
 */
import type { IconName } from '@/components/ui/icon'

import type { TripDocumentReadinessReason } from './trip.types'

/**
 * ⚠️ `Record` completo, **sem `as`**: razão nova no catálogo não compila sem escolher um símbolo.
 * Sem isso a linha nova apareceria sem ícone enquanto as vizinhas o têm, e ninguém notaria.
 *
 * O que falhou (`alert`) se separa do que está a caminho (`spinner`) e do que ainda não começou
 * (`document`): tratá-los com o mesmo desenho devolveria a lista indistinta que o ícone veio
 * resolver.
 */
const ICON_BY_REASON: Record<TripDocumentReadinessReason, IconName> = {
  cte_cancelled: 'close',
  cte_in_progress: 'spinner',
  cte_rejected: 'alert',
  city_unknown: 'search',
  nfse_expected: 'invoice',
  no_cte: 'document',
  ok: 'check',
}

export function readinessReasonIcon(reason: TripDocumentReadinessReason): IconName {
  return ICON_BY_REASON[reason]
}
