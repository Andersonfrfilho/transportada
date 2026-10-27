/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type { ClientBoletoEmailOutboxItem } from '../shared/clientBoletoEmail.types'
import { getClientBoletoEmailRuntime } from '../shared/clientBoletoEmailInstance.service'

/** Os envios desta ocorrência que ainda esperam sinal (`queued`) ou foram recusados (`failed`). */
export function useClientBoletoEmailPending(
  occurrenceId: string,
): readonly ClientBoletoEmailOutboxItem[] {
  const [items, setItems] = useState<readonly ClientBoletoEmailOutboxItem[]>([])

  useEffect(() => {
    const { outbox } = getClientBoletoEmailRuntime()
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
