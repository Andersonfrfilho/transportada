/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DriverTripRequestError, getDriverTripClient } from '../shared/driverTripClient.service'
import type { DriverFieldReport, DriverTripSnapshot } from '../shared/driverTrip.types'
import { buildEventQueueView, type EventQueueItemView } from '../shared/eventQueueView.service'
import {
  createIndexedDbAttachmentStore,
  createIndexedDbQueueStore,
} from '../shared/indexedDbQueue.service'
import {
  drainQueueWithAttachments,
  enqueueAttachment,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '../shared/offlineAttachments.service'
import {
  createIdempotencyKey,
  enqueueReport,
  type OfflineQueueStore,
} from '../shared/offlineQueue.service'

const CURRENT_TRIP_QUERY_KEY = ['driver-trip', 'current'] as const

/** A viagem muda pelas mãos do escritório também — cancelamento chega no próximo poll, não por push. */
const CURRENT_TRIP_REFETCH_MS = 30_000

export type DriverProofInput = Readonly<{
  documentId: string
  file: File
  kind: 'photo' | 'signature'
  receiverDocument?: string
  receiverName?: string
}>

/** `sent` cobre o envio direto e o enfileirado — para quem toca, os dois são "ficou comigo". */
export type DriverProofOutcome = 'count-limit' | 'queued' | 'sent' | 'size-limit'

/** Spec 082 (revisão): o teto da fila de eventos recusa tipado, nunca `QuotaExceededError` cru. */
export type DriverReportOutcome = 'count-limit' | 'queued'

export type DriverTripController = Readonly<{
  attachProof: (input: DriverProofInput) => Promise<DriverProofOutcome>
  /** `true` até a primeira leitura do IndexedDB voltar — é o que segura o esqueleto da tela. */
  isQueueLoading: boolean
  isSyncing: boolean
  /** Spec 082 D7: a fila como a tela de pendentes imprime — tipo, hora, anexos e estado. */
  queueView: readonly EventQueueItemView[]
  /** Quantos toques ainda não subiram. É o que a tela mostra como "aguardando envio". */
  queuedCount: number
  refetchTrip: () => void
  rejectedCount: number
  report: (report: DriverFieldReport) => Promise<DriverReportOutcome>
  sendAllNow: () => void
  sendNow: (idempotencyKey: string) => void
  snapshot: DriverTripSnapshot | undefined
  status: 'error' | 'loading' | 'ready'
}>

function toOutcome(error: unknown): AttachmentSendOutcome {
  if (error instanceof DriverTripRequestError && error.isOffline) return { kind: 'failed-network' }
  const cause =
    error instanceof DriverTripRequestError
      ? error.status !== undefined
        ? `${error.status} ${error.code}`
        : error.code
      : 'REQUEST_FAILED'
  return { cause, kind: 'rejected' }
}

export function useDriverTrip(
  store: OfflineQueueStore = createIndexedDbQueueStore(),
  attachmentStore: AttachmentStore = createIndexedDbAttachmentStore(),
) {
  const queryClient = useQueryClient()
  const [queueView, setQueueView] = useState<readonly EventQueueItemView[] | undefined>(undefined)

  const refreshQueueView = useCallback(async (): Promise<void> => {
    const [queued, attachments] = await Promise.all([store.read(), attachmentStore.readAll()])
    setQueueView(buildEventQueueView({ attachments, queued }))
  }, [attachmentStore, store])

  const currentTrip = useQuery({
    queryFn: () => getDriverTripClient().readCurrent(),
    queryKey: CURRENT_TRIP_QUERY_KEY,
    refetchInterval: CURRENT_TRIP_REFETCH_MS,
  })

  /** A drenagem é uma só — automática e manual entram pela mesma porta, `only` restringe. */
  const drain = useMutation({
    mutationFn: (only?: string) => {
      const client = getDriverTripClient()
      return drainQueueWithAttachments({
        attachmentStore,
        ...(only === undefined ? {} : { only }),
        send: async (report): Promise<AttachmentSendOutcome> => {
          try {
            await client.send(report)
            return { kind: 'sent' }
          } catch (error) {
            return toOutcome(error)
          }
        },
        sendAttachment: async (attachment: QueuedAttachment): Promise<AttachmentSendOutcome> => {
          try {
            await client.attachProof({
              attachmentKey: attachment.attachmentKey,
              documentId: attachment.documentId,
              file: new File([attachment.blob], attachment.fileName, {
                type: attachment.blob.type,
              }),
              kind: attachment.kind,
              ...(attachment.receiverDocument === undefined
                ? {}
                : { receiverDocument: attachment.receiverDocument }),
              ...(attachment.receiverName === undefined
                ? {}
                : { receiverName: attachment.receiverName }),
            })
            return { kind: 'sent' }
          } catch (error) {
            return toOutcome(error)
          }
        },
        store,
      })
    },
    onSuccess: (result) => {
      void refreshQueueView()
      if (result.sent > 0 || result.rejected > 0) {
        void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY })
      }
    },
  })

  /**
   * Spec 082 (revisão): **uma drenagem por vez** — duas em paralelo mandariam o mesmo evento duas
   * vezes, e a idempotência do servidor existe para o reenvio, não para a corrida.
   *
   * ⚠️ **Mas o pedido que chega durante uma drenagem não pode ser descartado, e era.** A versão
   * anterior o ignorava confiando em "o gatilho seguinte pega o que sobrou" — só que os gatilhos
   * são a rede voltando e a montagem da tela, e nenhum dos dois acontece com a rede boa. O toque
   * do motorista caía exatamente nessa janela: `report()` enfileira e pede a drenagem enquanto a
   * drenagem de montagem ainda está em voo, o pedido era engolido, e a confirmação ficava parada
   * na fila **indefinidamente**, com a tela dizendo "1 confirmação aguardando envio" e a rede
   * perfeita. Medido pelo smoke do motorista, que reprovava por isso.
   *
   * O conserto é coalescer com execução final: o pedido que chega ocupado marca uma repetição, e
   * ela roda assim que a atual termina. Continua sendo uma por vez.
   *
   * ⚠️ A repetição vai **sem `only`** de propósito: ela é a rede de segurança de tudo o que entrou
   * durante a drenagem anterior, não de um item específico. Drenar o superconjunto é sempre seguro
   * — o que já foi enviado não está mais na fila.
   */
  const isDrainingRef = useRef(false)
  const hasPendingDrainRef = useRef(false)
  const requestDrainRef = useRef<(only?: string) => void>(() => undefined)
  const requestDrain = useCallback(
    (only?: string) => {
      if (isDrainingRef.current) {
        hasPendingDrainRef.current = true
        return
      }
      isDrainingRef.current = true
      drain.mutate(only, {
        onSettled: () => {
          isDrainingRef.current = false
          if (!hasPendingDrainRef.current) return
          hasPendingDrainRef.current = false
          requestDrainRef.current(undefined)
        },
      })
    },
    [drain],
  )
  requestDrainRef.current = requestDrain

  /**
   * A rede voltando é evento do navegador — é o gatilho de drenagem, e o único `useEffect` daqui.
   * A referência fica numa `ref` para a assinatura do evento não se refazer a cada render:
   * religar o ouvinte a cada estado novo perderia o evento que chega no meio.
   */
  const drainRef = useRef(requestDrain)
  drainRef.current = requestDrain

  useEffect(() => {
    function handleOnline(): void {
      drainRef.current(undefined)
    }
    window.addEventListener('online', handleOnline)
    void refreshQueueView()
    drainRef.current(undefined)

    return () => window.removeEventListener('online', handleOnline)
  }, [refreshQueueView])

  async function report(fieldReport: DriverFieldReport): Promise<DriverReportOutcome> {
    const result = await enqueueReport({ now: new Date(), report: fieldReport, store })
    if (!result.accepted) return result.reason
    await refreshQueueView()
    requestDrain(undefined)
    return 'queued'
  }

  /**
   * Spec 082 D6: com a entrega ainda na fila, o comprovante entra atrás dela; entrega já enviada
   * segue pela rota multipart direta. Teto atingido volta como recusa anunciada — nada é descartado.
   * A chave do anexo nasce **aqui, na captura**, e é a mesma nos dois caminhos.
   */
  async function attachProof(input: DriverProofInput): Promise<DriverProofOutcome> {
    const attachmentKey = createIdempotencyKey()
    const result = await enqueueAttachment({
      attachment: {
        attachmentKey,
        blob: input.file,
        capturedAt: new Date().toISOString(),
        documentId: input.documentId,
        fileName: input.file.name,
        kind: input.kind,
        ...(input.receiverDocument === undefined
          ? {}
          : { receiverDocument: input.receiverDocument }),
        ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
      },
      attachmentStore,
      store,
    })
    if (result.accepted) {
      await refreshQueueView()
      requestDrain(undefined)
      return 'queued'
    }
    if (result.reason === 'event-not-queued') {
      await getDriverTripClient().attachProof({ ...input, attachmentKey })
      return 'sent'
    }
    return result.reason
  }

  const loadedView = queueView ?? []

  return {
    attachProof,
    isQueueLoading: queueView === undefined,
    isSyncing: drain.isPending,
    queueView: loadedView,
    queuedCount: loadedView.filter((item) => item.status.state !== 'rejected').length,
    refetchTrip: () => void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY }),
    rejectedCount: loadedView.filter((item) => item.status.state === 'rejected').length,
    report,
    sendAllNow: () => requestDrain(undefined),
    sendNow: (idempotencyKey: string) => requestDrain(idempotencyKey),
    snapshot: currentTrip.data,
    status: currentTrip.isLoading ? 'loading' : currentTrip.isError ? 'error' : 'ready',
  } satisfies DriverTripController
}
