/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type { ClientBoletoWhatsAppOutboxItem } from '../shared/clientBoletoWhatsApp.types'
import { getClientBoletoWhatsAppRuntime } from '../shared/clientBoletoWhatsAppInstance.service'

/** Os envios desta ocorrência que ainda esperam sinal (`queued`) ou foram recusados (`failed`). */
export function useClientBoletoWhatsAppPending(
  occurrenceId: string,
): readonly ClientBoletoWhatsAppOutboxItem[] {
  const [items, setItems] = useState<readonly ClientBoletoWhatsAppOutboxItem[]>([])

  useEffect(() => {
    const { outbox } = getClientBoletoWhatsAppRuntime()
    let isActive = true
    function refresh(): void {
      outbox
        .listPending()
        .then((pending) => {
          if (isActive) {
            setItems(pending.filter((item) => item.request.occurrenceId === occurrenceId))
          }
        })
        .catch(() => undefined)
    }
    refresh()
    const unsubscribe = outbox.subscribe(refresh)
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [occurrenceId])

  return items
}
