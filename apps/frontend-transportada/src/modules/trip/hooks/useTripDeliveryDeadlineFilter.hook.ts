/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEffect, useState } from 'react'

import type { DeliveryDeadlineFilterValue } from '../shared/tripDeliveryDeadline.constant'
import {
  normalizeDeliveryDeadlineValues,
  parseDeliveryDeadlineFilter,
  serializeDeliveryDeadlineFilter,
} from '../shared/tripDeliveryDeadlineFilter.service'

export type TripDeliveryDeadlineFilterController = Readonly<{
  clear: () => void
  setValues: (values: readonly DeliveryDeadlineFilterValue[]) => void
  values: readonly DeliveryDeadlineFilterValue[]
}>

/**
 * A escolha mora na URL, escrita no próprio gesto (`web.md` §7), e a URL é a fonte: a página não remonta ao trocar de
 * viagem, e o `popstate` (voltar, ou outra viagem aberta pelo shell) relê o endereço em vez de deixar a escolha da
 * viagem anterior vazar.
 */
export function useTripDeliveryDeadlineFilter(): TripDeliveryDeadlineFilterController {
  const [values, setSelection] = useState<readonly DeliveryDeadlineFilterValue[]>(() =>
    parseDeliveryDeadlineFilter(window.location.search),
  )

  useEffect(() => {
    function handlePopState(): void {
      setSelection(parseDeliveryDeadlineFilter(window.location.search))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function commit(next: readonly DeliveryDeadlineFilterValue[]): void {
    const ordered = normalizeDeliveryDeadlineValues(next)
    setSelection(ordered)
    const search = serializeDeliveryDeadlineFilter({
      search: window.location.search,
      values: ordered,
    })
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    )
  }

  return { clear: () => commit([]), setValues: commit, values }
}
