/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DriverTripRequestError, getDriverTripClient } from '../shared/driverTripClient.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import type {
  DriverFieldReport,
  DriverTripSnapshot,
  ProofPunctuality,
} from '../shared/driverTrip.types'
import { buildEventQueueView, type EventQueueItemView } from '../shared/eventQueueView.service'
import {
  createIndexedDbAttachmentStore,
  createIndexedDbQueueStore,
} from '../shared/indexedDbQueue.service'
import {
  ATTACHMENT_QUEUE_LIMIT,
  applyAttachmentLocation,
  discardStaleAttachments,
  drainQueueWithAttachments,
  enqueueAttachment,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '../shared/offlineAttachments.service'
import {
  createIdempotencyKey,
  enqueueReport,
  enqueueReports,
  sumReportPhotoBytes,
  type OfflineQueueStore,
} from '../shared/offlineQueue.service'
import {
  countPending,
  scheduleQueueDrainTriggers,
  type DrainTriggerTarget,
  type PendingCounts,
} from '../shared/pendingQueue.service'
import {
  reduceProofPhotoToJpeg,
  shouldReduceProofFile,
} from '../shared/proofPhotoReduction.service'
import {
  recoverQueuedProofPhotos,
  reduceQueuedProofPhoto,
  type ProofPhotoReductions,
} from '../shared/proofPhotoRecovery.service'
import { discardRejectedQueueItem } from '../shared/queueDiscard.service'
import { fitStopOccurrenceReports, withoutPhotos } from '../shared/stopOccurrencePhoto.service'

const CURRENT_TRIP_QUERY_KEY = ['driver-trip', 'current'] as const

/** A viagem muda pelas mãos do escritório também — cancelamento chega no próximo poll, não por push. */
const CURRENT_TRIP_REFETCH_MS = 30_000

/** Gatilhos da drenagem (revisão M4): `visibilitychange` é do `document`, o resto é do `window`. */
const DRAIN_TRIGGER_TARGET: DrainTriggerTarget = {
  addEventListener: (type, listener) =>
    (type === 'visibilitychange' ? document : window).addEventListener(type, listener),
  clearInterval: (id) => window.clearInterval(id),
  isVisible: () => document.visibilityState === 'visible',
  removeEventListener: (type, listener) =>
    (type === 'visibilitychange' ? document : window).removeEventListener(type, listener),
  setInterval: (handler, timeout) => window.setInterval(handler, timeout),
}

export type DriverProofInput = Readonly<{
  documentId: string
  file: File
  kind: 'photo' | 'signature'
  receiverDocument?: string
  receiverName?: string
}>

/**
 * Spec 159 (revisão D6): todo anexo aceito vira `queued` — a fila sempre recebe primeiro, mesmo
 * online, e a drenagem sobe quase na hora.
 */
export type DriverProofOutcome = 'count-limit' | 'queued' | 'size-limit'

/** Spec 082 (revisão): o teto da fila de eventos recusa tipado, nunca `QuotaExceededError` cru. */
export type DriverReportOutcome = 'count-limit' | 'queued'

/** Spec 209 (D3): a foto do "Deu problema" que não coube saiu — o relato entrou mesmo assim. */
export type DriverStopOccurrenceOutcome = DriverReportOutcome | 'photo-dropped'

export type DriverTripController = Readonly<{
  attachProof: (input: DriverProofInput) => Promise<DriverProofOutcome>
  /** ADR-0075 §6: o recusado sai da fila antiga só pela mão do motorista, com confirmação na tela. */
  discardRejected: (idempotencyKey: string) => Promise<void>
  /** `true` até a primeira leitura do IndexedDB voltar — é o que segura o esqueleto da tela. */
  isQueueLoading: boolean
  isSyncing: boolean
  /** ADR-0075 §6: a pendência da fila antiga — `undefined` até a primeira leitura do IndexedDB. */
  pendingCounts: PendingCounts | undefined
  /**
   * Spec 159 (P6): a pontualidade da última foto que subiu para cada documento, nesta sessão — a
   * tela traduz em linguagem simples ("em dia", "tardia", "longe"). Some ao trocar de sessão: não é
   * persistido, e o snapshot não carrega esse detalhe por documento.
   */
  proofOutcomeByDocumentId: ReadonlyMap<string, ProofPunctuality>
  /** Spec 082 D7: a fila como a tela de pendentes imprime — tipo, hora, anexos e estado. */
  queueView: readonly EventQueueItemView[]
  /** Quantos toques ainda não subiram. É o que a tela mostra como "aguardando envio". */
  queuedCount: number
  refetchTrip: () => void
  rejectedCount: number
  report: (report: DriverFieldReport) => Promise<DriverReportOutcome>
  /** Spec 209: o "Deu problema" — a ocorrência sempre entra; a foto, se couber. */
  reportStopOccurrence: (
    reports: readonly DriverFieldReport[],
  ) => Promise<DriverStopOccurrenceOutcome>
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
  providedStore?: OfflineQueueStore,
  providedAttachmentStore?: AttachmentStore,
) {
  /**
   * ⚠️ As lojas padrão nascem uma vez por montagem. Como parâmetro padrão, elas eram recriadas a
   * cada render; o efeito de montagem depende delas, então re-rodava a cada render e disparava uma
   * drenagem nova — drenagem emendada sem fim, com `isSyncing` preso em verdadeiro.
   */
  const [defaultStores] = useState(() => ({
    attachmentStore: createIndexedDbAttachmentStore(),
    store: createIndexedDbQueueStore(),
  }))
  const store = providedStore ?? defaultStores.store
  const attachmentStore = providedAttachmentStore ?? defaultStores.attachmentStore
  const queryClient = useQueryClient()
  const [queueView, setQueueView] = useState<readonly EventQueueItemView[] | undefined>(undefined)
  const [pendingCounts, setPendingCounts] = useState<PendingCounts | undefined>(undefined)
  const [proofOutcomeByDocumentId, setProofOutcomeByDocumentId] = useState<
    ReadonlyMap<string, ProofPunctuality>
  >(new Map())
  /** Revisão M4: o temporizador da drenagem só corre enquanto isto for maior que zero. */
  const drainableCountRef = useRef(0)
  /** O `sync` do temporizador (`onQueueSync`): a fila que ganha pendência liga o relógio na hora. */
  const syncDrainTimerRef = useRef<() => void>(() => undefined)

  const refreshQueueView = useCallback(async (): Promise<void> => {
    const [queued, attachments] = await Promise.all([store.read(), attachmentStore.readAll()])
    setQueueView(buildEventQueueView({ attachments, queued }))
    const counts = countPending({ attachments, now: new Date(), reports: queued })
    setPendingCounts(counts)
    drainableCountRef.current = counts.drainable
    syncDrainTimerRef.current()
  }, [attachmentStore, store])

  const currentTrip = useQuery({
    queryFn: () => getDriverTripClient().readCurrent(),
    queryKey: CURRENT_TRIP_QUERY_KEY,
    refetchInterval: CURRENT_TRIP_REFETCH_MS,
  })

  const isDrainingRef = useRef(false)
  const hasPendingDrainRef = useRef(false)
  const requestDrainRef = useRef<(only?: string) => void>(() => undefined)

  /** Spec 212: as reduções do canhoto em voo — a varredura e a drenagem esperam por elas. */
  const [proofPhotoReductions] = useState<ProofPhotoReductions>(() => new Map())
  const recoverProofPhotos = useCallback(async (): Promise<void> => {
    const recovered = await recoverQueuedProofPhotos({
      attachmentStore,
      reduce: reduceProofPhotoToJpeg,
      reductions: proofPhotoReductions,
    })
    if (recovered > 0) await refreshQueueView()
  }, [attachmentStore, proofPhotoReductions, refreshQueueView])

  /** A drenagem é uma só — automática e manual entram pela mesma porta, `only` restringe. */
  const drain = useMutation({
    mutationFn: async (only?: string) => {
      /** Spec 212: a foto grande presa (413) volta reduzida e sem causa antes de a fila ser lida. */
      await recoverProofPhotos()
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
            const result = await client.attachProof({
              attachmentKey: attachment.attachmentKey,
              capturedAt: attachment.capturedAt,
              documentId: attachment.documentId,
              file: new File([attachment.blob], attachment.fileName, {
                type: attachment.blob.type,
              }),
              kind: attachment.kind,
              ...(attachment.latitude === undefined ? {} : { latitude: attachment.latitude }),
              ...(attachment.longitude === undefined ? {} : { longitude: attachment.longitude }),
              ...(attachment.accuracyMeters === undefined
                ? {}
                : { accuracyMeters: attachment.accuracyMeters }),
              ...(attachment.receiverDocument === undefined
                ? {}
                : { receiverDocument: attachment.receiverDocument }),
              ...(attachment.receiverName === undefined
                ? {}
                : { receiverName: attachment.receiverName }),
            })
            return { kind: 'sent', punctuality: result.punctuality }
          } catch (error) {
            return toOutcome(error)
          }
        },
        store,
      })
    },
    onSuccess: (result) => {
      void refreshQueueView()
      if (result.attachmentsSent.length > 0) {
        setProofOutcomeByDocumentId((current) => {
          const next = new Map(current)
          for (const item of result.attachmentsSent) {
            if (item.punctuality !== undefined) next.set(item.documentId, item.punctuality)
          }
          return next
        })
      }
      /* Spec 159 (T12): foto enviada tira a nota de `pendingProofs` — sem reler, a contagem mentia. */
      if (result.sent > 0 || result.rejected > 0 || result.attachmentsSent.length > 0) {
        void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY })
      }
    },
    /**
     * ⚠️ **A trava se libera aqui, na mutação, e não no callback do `mutate()` — e a diferença
     * travava a fila para sempre.** Os callbacks passados a `mutate(vars, {...})` não rodam se o
     * observador for desmontado antes de a mutação terminar, e o `useEffect` de montagem roda duas
     * vezes sob StrictMode: a primeira drenagem terminava com o observador dela já descartado, o
     * `onSettled` nunca disparava, e `isDrainingRef` — que é `useRef` e sobrevive à remontagem —
     * ficava `true` pelo resto da vida da tela. Toda drenagem seguinte era engolida pelo guarda,
     * com a tela dizendo "aguardando envio" e a rede perfeita.
     *
     * O `onSettled` da mutação é da mutação, não de quem a chamou: ele roda mesmo que o chamador
     * tenha ido embora. Fora do StrictMode o sintoma some, e é por isso que ele sobreviveu — mas a
     * fragilidade é real em produção também: navegar para fora e voltar durante uma drenagem
     * deixaria a fila trancada do mesmo jeito.
     */
    onSettled: () => {
      isDrainingRef.current = false
      if (!hasPendingDrainRef.current) return
      hasPendingDrainRef.current = false
      requestDrainRef.current(undefined)
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
  const requestDrain = useCallback(
    (only?: string) => {
      if (isDrainingRef.current) {
        hasPendingDrainRef.current = true
        return
      }
      isDrainingRef.current = true
      drain.mutate(only)
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
    /**
     * Spec 159 (T11, item 4): o descarte roda uma vez por abertura do app, antes da drenagem — o
     * que passou dos 7 dias sai da fila com o dado (blob, posição) junto, nunca só a entrada.
     */
    void discardStaleAttachments({ attachmentStore, now: new Date() })
      .then(() => refreshQueueView())
      /** Spec 212: a foto presa já sai reduzida quando a drenagem puder levá-la. */
      .then(() => recoverProofPhotos())
    /** "Abertura" (revisão M4): o gatilho de fora, antes dos que `scheduleQueueDrainTriggers` liga. */
    drainRef.current(undefined)

    const cancelTriggers = scheduleQueueDrainTriggers({
      drain: () => drainRef.current(undefined),
      getDrainable: () => drainableCountRef.current,
      onQueueSync: (sync) => {
        syncDrainTimerRef.current = sync
      },
      target: DRAIN_TRIGGER_TARGET,
    })

    return () => {
      syncDrainTimerRef.current = () => undefined
      cancelTriggers()
    }
  }, [attachmentStore, recoverProofPhotos, refreshQueueView])

  async function report(fieldReport: DriverFieldReport): Promise<DriverReportOutcome> {
    const result = await enqueueReport({ now: new Date(), report: fieldReport, store })
    if (!result.accepted) return result.reason
    await refreshQueueView()
    requestDrain(undefined)
    return 'queued'
  }

  /**
   * Spec 209 (D3): a ocorrência e, atrás dela, a foto. Fila cheia derruba a foto, nunca o relato —
   * pelo teto de bytes dos anexos, ou pela contagem quando os dois não cabem juntos.
   */
  async function reportStopOccurrence(
    reports: readonly DriverFieldReport[],
  ): Promise<DriverStopOccurrenceOutcome> {
    const [queued, attachmentTotals] = await Promise.all([
      store.read(),
      attachmentStore.readTotals(),
    ])
    const fitted = fitStopOccurrenceReports({
      maxBytes: ATTACHMENT_QUEUE_LIMIT.maxTotalBytes,
      reports,
      usedBytes:
        attachmentTotals.totalBytes + sumReportPhotoBytes(queued.map((item) => item.report)),
    })
    let isPhotoDropped = fitted.isPhotoDropped
    let result = await enqueueReports({ now: new Date(), reports: fitted.reports, store })
    if (!result.accepted && fitted.reports.length > 1) {
      isPhotoDropped = true
      result = await enqueueReports({
        now: new Date(),
        reports: withoutPhotos(fitted.reports),
        store,
      })
    }
    if (!result.accepted) return result.reason
    await refreshQueueView()
    requestDrain(undefined)
    return isPhotoDropped ? 'photo-dropped' : 'queued'
  }

  /**
   * Spec 159 (revisão D6): o comprovante **sempre** entra na fila offline, com a entrega ainda na
   * fila ou já aceita — nunca mais pela rota multipart direta. Isso é o que garante o aceite 8: a
   * foto de uma nota já entregue segue offline como qualquer outro anexo, e sobe na próxima
   * drenagem (que roda logo em seguida, quase instantânea quando há rede). Teto atingido volta como
   * recusa anunciada — nada é descartado. A chave do anexo nasce **aqui, na captura**.
   *
   * Spec 159 (T11, item 6): a foto grava no IndexedDB **antes** de esperar o GPS, não depois — o
   * `getCurrentPosition` pode levar até 8 s, e a foto só em memória durante essa espera some se o
   * motorista fechar o app no meio. A posição chega em seguida, atualizando o mesmo anexo; se a
   * drenagem subir antes dela (rede rápida), a foto vai sem posição e conta como longe (ADR-0070
   * §4) — nunca perdida.
   */
  async function attachProof(input: DriverProofInput): Promise<DriverProofOutcome> {
    const attachmentKey = createIdempotencyKey()
    /** Spec 212: a foto nasce marcada — nenhuma drenagem a leva antes da versão leve. */
    const shouldReduce = shouldReduceProofFile({ file: input.file, kind: input.kind })
    const attachment: QueuedAttachment = {
      attachmentKey,
      blob: input.file,
      capturedAt: new Date().toISOString(),
      documentId: input.documentId,
      fileName: input.file.name,
      kind: input.kind,
      ...(shouldReduce ? { pendingReduction: true as const } : {}),
      ...(input.receiverDocument === undefined ? {} : { receiverDocument: input.receiverDocument }),
      ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
    }
    const result = await enqueueAttachment({ attachment, attachmentStore, store })
    if (!result.accepted) return result.reason

    const eventKey = result.eventKey
    /* Grava primeiro (spec 203) e só então reduz: a versão leve troca o arquivo no mesmo item. */
    const reduction = shouldReduce
      ? reduceQueuedProofPhoto({
          attachment,
          attachmentStore,
          eventKey,
          reduce: reduceProofPhotoToJpeg,
          reductions: proofPhotoReductions,
        })
      : Promise.resolve()
    void readCurrentLocation().then((location) => {
      if (location === null) return
      void attachmentStore
        .update({
          eventKey,
          mutate: (items) => applyAttachmentLocation({ attachmentKey, items, location }),
        })
        .then(() => refreshQueueView())
    })

    await refreshQueueView()
    // O envio espera a versão leve: o original da câmera (3–5 MB) passa do corpo de 1 MiB da API.
    void reduction.finally(() => requestDrain(undefined))
    return 'queued'
  }

  async function discardRejected(idempotencyKey: string): Promise<void> {
    await discardRejectedQueueItem({ attachmentStore, idempotencyKey, store })
    await refreshQueueView()
  }

  const loadedView = queueView ?? []

  return {
    attachProof,
    discardRejected,
    isQueueLoading: queueView === undefined,
    isSyncing: drain.isPending,
    pendingCounts,
    proofOutcomeByDocumentId,
    queueView: loadedView,
    queuedCount: loadedView.filter((item) => item.status.state !== 'rejected').length,
    refetchTrip: () => void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY }),
    rejectedCount: loadedView.filter((item) => item.status.state === 'rejected').length,
    report,
    reportStopOccurrence,
    sendAllNow: () => requestDrain(undefined),
    sendNow: (idempotencyKey: string) => requestDrain(idempotencyKey),
    snapshot: currentTrip.data,
    status: currentTrip.isLoading ? 'loading' : currentTrip.isError ? 'error' : 'ready',
  } satisfies DriverTripController
}
