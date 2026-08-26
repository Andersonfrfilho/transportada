/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DriverTripRequestError, getDriverTripClient } from '../shared/driverTripClient.service'
import type { DriverFieldReport, DriverTripSnapshot } from '../shared/driverTrip.types'
import { createIndexedDbQueueStore } from '../shared/indexedDbQueue.service'
import {
  drainQueue,
  enqueueReport,
  type DrainOutcome,
  type OfflineQueueStore,
  type QueuedReport,
} from '../shared/offlineQueue.service'

const CURRENT_TRIP_QUERY_KEY = ['driver-trip', 'current'] as const

/** A viagem muda pelas mãos do escritório também — cancelamento chega no próximo poll, não por push. */
const CURRENT_TRIP_REFETCH_MS = 30_000

export type DriverTripController = Readonly<{
  isSyncing: boolean
  /** O que o servidor recusou: fica à vista, porque sumir com o toque do motorista é pior. */
  rejected: readonly QueuedReport[]
  report: (report: DriverFieldReport) => Promise<void>
  /** Quantos toques ainda não subiram. É o que a tela mostra como "aguardando envio". */
  queuedCount: number
  snapshot: DriverTripSnapshot | undefined
  status: 'error' | 'loading' | 'ready'
}>

export function useDriverTrip(store: OfflineQueueStore = createIndexedDbQueueStore()) {
  const queryClient = useQueryClient()
  const [queuedCount, setQueuedCount] = useState(0)
  const [rejected, setRejected] = useState<readonly QueuedReport[]>([])

  const currentTrip = useQuery({
    queryFn: () => getDriverTripClient().readCurrent(),
    queryKey: CURRENT_TRIP_QUERY_KEY,
    refetchInterval: CURRENT_TRIP_REFETCH_MS,
  })

  const drain = useMutation({
    mutationFn: async () => {
      const client = getDriverTripClient()
      return drainQueue({
        send: async (report): Promise<DrainOutcome> => {
          try {
            await client.send(report)
            return 'sent'
          } catch (error) {
            return error instanceof DriverTripRequestError && error.isOffline
              ? 'failed-network'
              : 'rejected'
          }
        },
        store,
      })
    },
    onSuccess: (result) => {
      setQueuedCount(result.remaining)
      if (result.rejected.length > 0) {
        setRejected((previous) => [...previous, ...result.rejected])
      }
      if (result.sent > 0 || result.rejected.length > 0) {
        void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY })
      }
    },
  })

  /**
   * A rede voltando é evento do navegador — é o gatilho de drenagem, e o único `useEffect` daqui.
   * A referência da mutação fica numa `ref` para a assinatura do evento não se refazer a cada
   * render: religar o ouvinte a cada estado novo perderia o evento que chega no meio.
   */
  const drainRef = useRef(drain.mutate)
  drainRef.current = drain.mutate

  useEffect(() => {
    function handleOnline(): void {
      drainRef.current()
    }
    window.addEventListener('online', handleOnline)
    drainRef.current()

    return () => window.removeEventListener('online', handleOnline)
  }, [])

  async function report(fieldReport: DriverFieldReport): Promise<void> {
    const queued = await enqueueReport({ now: new Date(), report: fieldReport, store })
    setQueuedCount(queued.length)
    drain.mutate()
  }

  return {
    isSyncing: drain.isPending,
    queuedCount,
    rejected,
    report,
    snapshot: currentTrip.data,
    status: currentTrip.isLoading ? 'loading' : currentTrip.isError ? 'error' : 'ready',
  } satisfies DriverTripController
}
