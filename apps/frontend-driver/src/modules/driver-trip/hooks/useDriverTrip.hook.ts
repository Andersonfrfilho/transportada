/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/hooks/useDriverTrip.hook.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { driverClockOffset } from '../shared/clockOffset.service'
import { getDriverTripClient, toAttachmentSendOutcome } from '../shared/driverTripClient.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import { captureRegistry, persistWhileOpen } from '../shared/captureRegistry.service'
import type {
  DriverFieldReport,
  DriverReportedLocation,
  DriverTrip,
  DriverTripSnapshot,
  ProofPunctuality,
} from '../shared/driverTrip.types'
import { buildEventQueueView, type EventQueueItemView } from '../shared/eventQueueView.service'
import {
  createIndexedDbAttachmentStore,
  createIndexedDbProofThumbnailStore,
  createIndexedDbQueueStore,
  createIndexedDbTripSnapshotStore,
} from '../shared/indexedDbQueue.service'
import {
  ATTACHMENT_QUEUE_LIMIT,
  applyAttachmentLocation,
  applyAttachmentReceiverFields,
  drainQueueWithAttachments,
  enqueueAttachment,
  releaseAttachmentsAwaitingDelivery,
  discardAttachmentsAwaitingDelivery,
  removeQueuedAttachmentByKey,
  type AttachmentSendOutcome,
  type AttachmentStore,
  type QueuedAttachment,
} from '../shared/offlineAttachments.service'
import {
  applyReportLocation,
  createIdempotencyKey,
  enqueueReport,
  enqueueReports,
  sumReportPhotoBytes,
  type OfflineQueueStore,
} from '../shared/offlineQueue.service'
import {
  countPending,
  createDrainScheduler,
  scheduleQueueDrainTriggers,
  selectPendingTotal,
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
import { buildProofReceiverReport } from '../shared/proofReceiver.service'
import { saveProofThumbnail } from '../shared/proofThumbnailArchive.service'
import {
  discardForeignPending,
  discardOwnPending,
  partitionPendingByOwner,
} from '../shared/queueOwner.service'
import { discardRejectedQueueItem } from '../shared/queueDiscard.service'
import { fitStopOccurrenceReports, withoutPhotos } from '../shared/stopOccurrencePhoto.service'
import { resolveTripDataSavedAt, resolveTripViewStatus } from '../shared/tripQueryStatus.service'
import { hasReassignedTrip } from '../shared/tripReassignment.service'
import { saveTripSnapshot } from '../shared/tripSnapshot.service'
import {
  confirmUnverifiedPending,
  discardUnverifiedPending,
  summarizeUnverifiedPending,
  type UnverifiedSummary,
} from '../shared/unverifiedPending.service'
import { useDriverSession } from './useDriverSession.hook'

/** Gatilhos da drenagem (plan D5): `visibilitychange` é do `document`, o resto é do `window`. */
const DRAIN_TRIGGER_TARGET = {
  addEventListener: (type: 'online' | 'pageshow' | 'visibilitychange', listener: () => void) =>
    (type === 'visibilitychange' ? document : window).addEventListener(type, listener),
  clearInterval: (id: number) => window.clearInterval(id),
  isVisible: () => document.visibilityState === 'visible',
  removeEventListener: (type: 'online' | 'pageshow' | 'visibilitychange', listener: () => void) =>
    (type === 'visibilitychange' ? document : window).removeEventListener(type, listener),
  setInterval: (handler: () => void, timeout: number) => window.setInterval(handler, timeout),
}

const CURRENT_TRIP_QUERY_KEY = ['driver-trip', 'current'] as const

/** A viagem muda pelas mãos do escritório também — cancelamento chega no próximo poll, não por push. */
const CURRENT_TRIP_REFETCH_MS = 30_000

/**
 * Defeito medido (27/09): a drenagem automática do canhoto disparava assim que a redução da foto
 * terminava, sem pausa nenhuma — numa rede rápida (ou no mock do smoke), o envio podia terminar
 * antes de a tela sequer pintar "Refazer", quebrando a garantia do comentário de `retakeLabel`
 * ("enquanto o anexo pode ser trocado sem custo"). Essa folga é o que dá à tela uma janela real e
 * previsível antes de a foto poder ser considerada enviada — não é sobre esperar a rede, é sobre
 * nunca deixar a drenagem vencer a corrida contra o primeiro paint.
 */
const PROOF_AUTO_DRAIN_GRACE_MS = 3_000
const THUMBNAIL_FILE_NAME = 'thumbnail.jpg'

/** O store não guarda estado — cada operação abre a base —, então um só serve a app inteira. */
const TRIP_SNAPSHOT_STORE = createIndexedDbTripSnapshotStore()
const PROOF_THUMBNAIL_STORE = createIndexedDbProofThumbnailStore()

export type DriverProofInput = Readonly<{
  /** Spec 207: gerada na tela — é o que "Remover" (por item, nunca por nota) precisa depois. */
  attachmentKey?: string
  /** Spec 218 (RF-A3): colhido antes da entrega — espera o "Confirmar entrega" para drenar. */
  awaitingDelivery?: true
  documentId: string
  file: File
  kind: 'cargo' | 'photo' | 'signature'
  /** Pedido do usuário (25/09): "Registrar entrega depois" — atrás de `LATE_REGISTRATION_FIELD_ENABLED`. */
  lateRegistration?: boolean
  /** Spec 193 D1: quem recebeu, em relação ao destinatário, e o detalhe curto. */
  receivedBy?: string
  receivedByDetail?: string
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

/** Spec 179: a foto da ocorrência conta no mesmo teto de bytes dos anexos. */
export type DriverNotDeliveredOutcome = DriverReportOutcome | 'size-limit'

/** Spec 209 (D3): a foto do "Deu problema" que não coube saiu — o relato entrou mesmo assim. */
export type DriverStopOccurrenceOutcome = DriverReportOutcome | 'photo-dropped'

export type DriverTripController = Readonly<{
  attachProof: (input: DriverProofInput) => Promise<DriverProofOutcome>
  /**
   * Spec 203/193: o motorista completou um campo depois do anexo já estar na fila — atualiza o(s)
   * item(ns) daquele documento in place. Sem grupo na fila (o anexo já subiu), vira `proofReceiver`
   * — o PATCH `.../proof/receiver`, enfileirado como evento (D7). `receiverDocument` só se aplica
   * com o item ainda na fila: o PATCH não o aceita.
   */
  updateProofFields: (input: {
    documentId: string
    receivedBy?: string
    receivedByDetail?: string
    receiverDocument?: string
    receiverName?: string
  }) => Promise<void>
  /**
   * Pedido do usuário (25/09, spec 207): "Remover" a foto/assinatura ainda na fila, pelo
   * `attachmentKey` do item escolhido (nunca por `documentId` — a nota pode ter mais de um anexo,
   * spec 211). Sem o item (já enviado) é no-op — a tela não oferece "Remover" nesse caso, só
   * "Substituir".
   */
  removeProof: (attachmentKey: string) => Promise<void>
  /** Spec 218: o gate foi cancelado — o canhoto que esperava a entrega daquela nota sai da fila. */
  discardProofAwaitingDelivery: (documentId: string) => Promise<void>
  /** "Confirmar em lote": tira a marca do que foi feito sem rede e drena. */
  confirmUnverifiedPending: () => Promise<void>
  /** Descarta o que foi feito sem rede — o item e o dado saem do aparelho. */
  discardUnverifiedPending: () => Promise<void>
  /** ADR-0075 §8: "Descartar" as pendências de outra conta — o item e o dado saem do aparelho. */
  discardForeignPending: () => Promise<void>
  /** "Sair" com pendência própria: apaga o que o dono deixou na fila, com o dado junto. */
  discardOwnPending: () => Promise<void>
  /** Itens da fila de outra conta neste aparelho: nunca enviados com o token desta. */
  foreignPendingCount: number
  /** RF8/D6: `true` quando uma viagem deixou de ser do motorista — reatribuição ou volta a draft. */
  hasReassignedTripNotice: boolean
  /** O motorista dispensou o aviso de reatribuição. */
  dismissReassignedTripNotice: () => void
  /** `true` até a primeira leitura do IndexedDB voltar — é o que segura o esqueleto da tela. */
  isQueueLoading: boolean
  isSyncing: boolean
  /**
   * Pedido do usuário (01/10): de quando é a última leitura do servidor, para a tela de
   * pendências dizer a idade da sincronização. `0` é "nunca nesta sessão" (`dataUpdatedAt`
   * do TanStack Query nasce assim) — cru de propósito: a idade se calcula na hora de mostrar.
   */
  lastSyncedAtMs: number
  /**
   * A hora do dado na tela ("dados de HH:MM"): a do snapshot no boot sem rede, ou a da última
   * leitura boa quando a releitura falhou com sessão viva. `undefined` com a leitura em dia.
   */
  dataSavedAt: string | undefined
  /** Spec 227: o recusado de negócio sai da fila só pela mão do motorista, com confirmação na tela. */
  discardRejected: (idempotencyKey: string) => Promise<void>
  /** `true` no boot sem rede — a faixa diz "sem conexão"; com sessão viva, "sem atualização". */
  isOfflineBoot: boolean
  /** Tudo o que é do dono e ainda está no aparelho — o "Sair" avisa antes de deixar para trás. */
  ownPendingCount: number
  /** Spec 193 D13: o número do ícone da fila no cabeçalho (`selectPendingTotal`). */
  pendingTotal: number
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
  /** Spec 179: os itens do mesmo toque ("Não entreguei"), todos ou nenhum. */
  reportNotDelivered: (reports: readonly DriverFieldReport[]) => Promise<DriverNotDeliveredOutcome>
  /**
   * Spec 218: itens de um toque, todos ou nenhum, com a foto contando no teto — o mesmo caminho do
   * "Não entreguei". A ocorrência com foto obrigatória vai por aqui: fila cheia recusa o toque
   * inteiro, nunca registra sem a foto que o tipo exige.
   */
  reportAllOrNothing: (reports: readonly DriverFieldReport[]) => Promise<DriverNotDeliveredOutcome>
  /** Spec 209: o "Deu problema" — a ocorrência sempre entra; a foto, se couber. */
  reportStopOccurrence: (
    reports: readonly DriverFieldReport[],
  ) => Promise<DriverStopOccurrenceOutcome>
  /** M1: grava o toque na hora, com a posição completando o item depois. */
  reportWithLocation: (
    build: (location: DriverReportedLocation | null) => DriverFieldReport,
  ) => Promise<DriverReportOutcome>
  sendAllNow: () => void
  sendNow: (idempotencyKey: string) => void
  /** Spec 179 RF5: as chaves que o servidor aceitou nesta sessão — o "enviado" da tela. */
  sentReportKeys: ReadonlySet<string>
  snapshot: DriverTripSnapshot | undefined
  status: 'error' | 'loading' | 'ready'
  /** O que o dono fez sem rede e ainda não confirmou — só com sessão viva. */
  unverifiedPending: UnverifiedSummary | undefined
}>

export function useDriverTrip(
  providedStore?: OfflineQueueStore,
  providedAttachmentStore?: AttachmentStore,
) {
  /**
   * ⚠️ **Um parâmetro com padrão de função cria uma loja nova a cada chamada sem argumento** — e
   * `useDriverTrip()` é chamado sem argumento em produção. A loja nova muda a identidade de
   * `store`/`attachmentStore` a cada render, `refreshQueueView` (que depende delas) é recriada
   * junto, e o `useEffect` de montagem (que depende de `refreshQueueView`) roda de novo a cada
   * render — uma drenagem emendada na outra, sem fim, com `isSyncing` nunca voltando a `false`
   * mesmo sem pedido nenhum em voo. `useState` com inicializador preguiçoso cria a loja **uma vez**
   * por instância do hook; `??` cede a quem passar uma própria (os contratos).
   */
  const [defaultStores] = useState(() => ({
    attachmentStore: createIndexedDbAttachmentStore(),
    store: createIndexedDbQueueStore(),
  }))
  const store = providedStore ?? defaultStores.store
  const attachmentStore = providedAttachmentStore ?? defaultStores.attachmentStore
  const queryClient = useQueryClient()
  const session = useDriverSession()
  const [foreignPendingCount, setForeignPendingCount] = useState(0)
  const [unverifiedPending, setUnverifiedPending] = useState<UnverifiedSummary | undefined>(
    undefined,
  )
  const [queueView, setQueueView] = useState<readonly EventQueueItemView[] | undefined>(undefined)
  const [proofOutcomeByDocumentId, setProofOutcomeByDocumentId] = useState<
    ReadonlyMap<string, ProofPunctuality>
  >(new Map())
  const [sentReportKeys, setSentReportKeys] = useState<ReadonlySet<string>>(new Set())
  const [pendingTotal, setPendingTotal] = useState(0)
  /** RF8/D6: fica `true` até o motorista dispensar — mesmo se a viagem seguinte também sumir. */
  const [isTripReassignedNoticeVisible, setIsTripReassignedNoticeVisible] = useState(false)
  const previousTripsRef = useRef<readonly DriverTrip[]>([])
  const previousDataUpdatedAtRef = useRef<number | undefined>(undefined)
  /** Plan D5: o temporizador da drenagem só corre enquanto isto for maior que zero. */
  const drainableCountRef = useRef(0)
  /** O `sync` do temporizador (`onQueueSync`): a fila que ganha pendência liga o relógio na hora. */
  const syncDrainTimerRef = useRef<() => void>(() => undefined)

  const refreshQueueView = useCallback(async (): Promise<void> => {
    const [queued, attachments] = await Promise.all([store.read(), attachmentStore.readAll()])
    /** ADR-0075 §8: a fila da tela é a do dono da sessão; o resto é "pendência de outra conta". */
    const pending = partitionPendingByOwner({
      attachments,
      ownerSubHash: session.subHash,
      reports: queued,
    })
    setForeignPendingCount(pending.foreignCount)
    setUnverifiedPending(
      summarizeUnverifiedPending({ attachments, ownerSubHash: session.subHash, reports: queued }),
    )
    setQueueView(
      buildEventQueueView({ attachments: pending.ownAttachments, queued: pending.ownReports }),
    )
    const now = new Date()
    drainableCountRef.current = countPending({
      attachments,
      now,
      ownerSubHash: session.subHash,
      reports: queued,
    }).drainable
    setPendingTotal(
      selectPendingTotal({ attachments, now, ownerSubHash: session.subHash, reports: queued }),
    )
    syncDrainTimerRef.current()
  }, [attachmentStore, session.subHash, store])

  /**
   * Plan D5: a viagem abre do snapshot guardado (`initialData`, com a hora dele) e a leitura da API
   * grava o novo. Sem token (boot sem rede) a consulta não roda — o snapshot é a tela inteira.
   */
  const initialSnapshot = session.initialSnapshot
  const currentTrip = useQuery({
    enabled: session.canSync,
    ...(initialSnapshot === undefined
      ? {}
      : {
          initialData: initialSnapshot.snapshot,
          initialDataUpdatedAt: Date.parse(initialSnapshot.savedAt),
        }),
    queryFn: async () => {
      const snapshot = await getDriverTripClient().readCurrent()
      /** Falhar ao guardar não derruba a tela: o próximo boot sem rede só abre um snapshot mais velho. */
      await saveTripSnapshot({
        now: new Date(),
        snapshot,
        store: TRIP_SNAPSHOT_STORE,
        subHash: session.subHash,
      }).catch(() => undefined)
      return snapshot
    },
    queryKey: CURRENT_TRIP_QUERY_KEY,
    refetchInterval: CURRENT_TRIP_REFETCH_MS,
    /**
     * B7: o dado inicial que veio da checagem de autorização tem `savedAt` de agora — sem prazo de
     * frescor, a consulta o releria ao montar, no mesmo segundo. O snapshot antigo do boot já nasce
     * vencido e é relido na hora, como antes.
     */
    staleTime: CURRENT_TRIP_REFETCH_MS,
  })

  /**
   * RF8/D6: a cada leitura nova, compara com a anterior — viagem que estava lá, não veio agora e
   * não terminou deixou de ser do motorista. Comparação feita no render (guardada por
   * `dataUpdatedAt`, para não repetir a cada re-render), sem `useEffect`.
   */
  const currentTrips = currentTrip.data?.trips ?? []
  if (currentTrip.dataUpdatedAt !== previousDataUpdatedAtRef.current) {
    const reassigned = hasReassignedTrip({
      currentTrips,
      previousTrips: previousTripsRef.current,
    })
    previousTripsRef.current = currentTrips
    previousDataUpdatedAtRef.current = currentTrip.dataUpdatedAt
    if (reassigned) setIsTripReassignedNoticeVisible(true)
  }

  /** O `run` do agendador aponta para a mutação do render corrente. */
  const runDrainRef = useRef<(only: string | undefined) => void>(() => undefined)
  const [drainScheduler] = useState(() =>
    createDrainScheduler({ run: (only) => runDrainRef.current(only) }),
  )

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
      /** O que o servidor aceitou nesta drenagem, chave a chave — é isso que a tela chama de enviado. */
      const sentKeys: string[] = []
      const result = await drainQueueWithAttachments({
        attachmentStore,
        ...(only === undefined ? {} : { only }),
        ownerSubHash: session.subHash,
        send: async (report, stamp): Promise<AttachmentSendOutcome> => {
          try {
            await client.send(report, stamp)
            sentKeys.push(report.idempotencyKey)
            return { kind: 'sent' }
          } catch (error) {
            return toAttachmentSendOutcome(error)
          }
        },
        sendAttachment: async (attachment: QueuedAttachment): Promise<AttachmentSendOutcome> => {
          try {
            const result = await client.attachProof({
              attachmentKey: attachment.attachmentKey,
              capturedAt: attachment.capturedAt,
              ...(attachment.clockOffsetMs === undefined
                ? {}
                : { clockOffsetMs: attachment.clockOffsetMs }),
              documentId: attachment.documentId,
              file: new File([attachment.blob], attachment.fileName, {
                type: attachment.blob.type,
              }),
              kind: attachment.kind,
              ...(attachment.thumbnail === undefined
                ? {}
                : {
                    thumbnail: new File([attachment.thumbnail], THUMBNAIL_FILE_NAME, {
                      type: attachment.thumbnail.type,
                    }),
                  }),
              ...(attachment.latitude === undefined ? {} : { latitude: attachment.latitude }),
              ...(attachment.longitude === undefined ? {} : { longitude: attachment.longitude }),
              ...(attachment.accuracyMeters === undefined
                ? {}
                : { accuracyMeters: attachment.accuracyMeters }),
              ...(attachment.receivedBy === undefined ? {} : { receivedBy: attachment.receivedBy }),
              ...(attachment.receivedByDetail === undefined
                ? {}
                : { receivedByDetail: attachment.receivedByDetail }),
              ...(attachment.receiverDocument === undefined
                ? {}
                : { receiverDocument: attachment.receiverDocument }),
              ...(attachment.receiverName === undefined
                ? {}
                : { receiverName: attachment.receiverName }),
              ...(attachment.lateRegistration === undefined
                ? {}
                : { lateRegistration: attachment.lateRegistration }),
            })
            /**
             * Pedido do usuário (01/10): aceito o anexo, o original sai da fila — a miniatura fica
             * no aparelho para a tela mostrar a foto, e não só a frase "Comprovante já enviado".
             * Falhar ao guardar não desfaz o envio: o canhoto está no servidor, a tela é que volta
             * à frase.
             */
            if (attachment.kind === 'photo') {
              await saveProofThumbnail({
                blob: attachment.thumbnail ?? attachment.blob,
                documentId: attachment.documentId,
                now: new Date(),
                store: PROOF_THUMBNAIL_STORE,
                subHash: session.subHash,
              }).catch(() => undefined)
            }
            return { kind: 'sent', punctuality: result.punctuality }
          } catch (error) {
            return toAttachmentSendOutcome(error)
          }
        },
        store,
      })
      return { ...result, sentKeys }
    },
    onSuccess: (result) => {
      void refreshQueueView()
      if (result.sentKeys.length > 0) {
        setSentReportKeys((current) => new Set([...current, ...result.sentKeys]))
      }
      if (result.attachmentsSent.length > 0) {
        setProofOutcomeByDocumentId((current) => {
          const next = new Map(current)
          for (const item of result.attachmentsSent) {
            if (item.punctuality !== undefined) next.set(item.documentId, item.punctuality)
          }
          return next
        })
        /**
         * Spec 193 D7: a edição que chegou **durante** o envio não se perde — a drenagem já
         * comparou o que mandou com o que ficou gravado (`receiverDrift`), e aqui só falta subir a
         * diferença pelo mesmo PATCH da atualização tardia.
         */
        for (const item of result.attachmentsSent) {
          if (item.receiverDrift === undefined) continue
          void report(
            buildProofReceiverReport({
              documentId: item.documentId,
              fields: item.receiverDrift,
              idempotencyKey: createIdempotencyKey(),
            }),
          )
        }
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
     * `onSettled` nunca disparava, e a trava (hoje o `isRunning` de `createDrainScheduler`, que vive
     * num `useState` e sobrevive à remontagem) ficava ligada pelo resto da vida da tela. Toda drenagem seguinte era engolida pelo guarda,
     * com a tela dizendo "aguardando envio" e a rede perfeita.
     *
     * O `onSettled` da mutação é da mutação, não de quem a chamou: ele roda mesmo que o chamador
     * tenha ido embora. Fora do StrictMode o sintoma some, e é por isso que ele sobreviveu — mas a
     * fragilidade é real em produção também: navegar para fora e voltar durante uma drenagem
     * deixaria a fila trancada do mesmo jeito.
     */
    onSettled: () => {
      drainScheduler.settled()
    },
  })
  runDrainRef.current = (only) => drain.mutate(only)

  /**
   * Spec 082 (revisão): **uma drenagem por vez** — duas em paralelo mandariam o mesmo evento duas
   * vezes, e a idempotência do servidor existe para o reenvio, não para a corrida.
   *
   * ⚠️ **Mas o pedido que chega durante uma drenagem não pode ser descartado, e era.** O toque do
   * motorista caía exatamente na janela da drenagem de montagem, o pedido era engolido, e a
   * confirmação ficava parada na fila com a rede perfeita. `createDrainScheduler` coalesce com
   * execução final — e, desde a spec 189 T9.2 (M3), guarda cada `only` do "Enviar agora" num `Set`,
   * porque a repetição geral pula os recusados e engolia o reenvio manual deles.
   */
  const requestDrain = useCallback(
    (only?: string) => {
      /** Boot sem rede: a drenagem fica suspensa até haver token (plan D4). */
      if (!session.canSync) return
      drainScheduler.request(only)
    },
    [drainScheduler, session.canSync],
  )

  /**
   * A rede voltando é evento do navegador — é o gatilho de drenagem, e o único `useEffect` daqui.
   * A referência fica numa `ref` para a assinatura do evento não se refazer a cada render:
   * religar o ouvinte a cada estado novo perderia o evento que chega no meio.
   */
  const drainRef = useRef(requestDrain)
  drainRef.current = requestDrain

  useEffect(() => {
    /**
     * Spec 227: nada sai da fila por idade — o que não subiu é a única cópia do trabalho do
     * motorista, e só sincronizar (ou o descarte explícito do recusado) o tira de lá.
     */
    void refreshQueueView()
      /** Spec 212: também sem rede — a foto já sai reduzida quando a drenagem puder levá-la. */
      .then(() => recoverProofPhotos())
    /** "Abertura" (plan D5): o gatilho de fora, antes dos que `scheduleQueueDrainTriggers` liga. */
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
  }, [attachmentStore, recoverProofPhotos, refreshQueueView, store])

  /** A4: a gravação conta como captura aberta até o IndexedDB confirmar — nada navega no meio. */
  function report(fieldReport: DriverFieldReport): Promise<DriverReportOutcome> {
    return persistWhileOpen(captureRegistry, async () => {
      const result = await enqueueReport({
        clockOffsetMs: driverClockOffset.read(),
        isUnverified: !session.canSync,
        now: new Date(),
        report: fieldReport,
        store,
        subHash: session.subHash,
      })
      if (!result.accepted) return result.reason
      await refreshQueueView()
      requestDrain(undefined)
      return 'queued'
    })
  }

  /**
   * Spec 189 T9.2 (M1): "Cheguei/Entreguei/Devolvi" gravam **antes** de esperar o GPS — até 8 s
   * em que fechar a app perdia o toque. O item entra com `location: null`, a posição o completa pela
   * chave, e só então a drenagem é pedida: a espera conta no registro de capturas (`persisting`),
   * então nem o SW novo nem o `keycloak.init` navegam no meio. Uma drenagem que já estava em voo
   * pode levar o item sem posição — como a foto (spec 159 T11) —, mas nunca perdê-lo.
   */
  function reportWithLocation(
    build: (location: DriverReportedLocation | null) => DriverFieldReport,
  ): Promise<DriverReportOutcome> {
    return persistWhileOpen(captureRegistry, async () => {
      const fieldReport = build(null)
      const result = await enqueueReport({
        clockOffsetMs: driverClockOffset.read(),
        isUnverified: !session.canSync,
        now: new Date(),
        report: fieldReport,
        store,
        subHash: session.subHash,
      })
      if (!result.accepted) return result.reason
      /* Spec 218 (RF-A3): o canhoto colhido no gate passa para trás desta entrega — evento primeiro. */
      if (fieldReport.kind === 'deliver') {
        await releaseAttachmentsAwaitingDelivery({
          attachmentStore,
          documentId: fieldReport.documentId,
          eventKey: fieldReport.idempotencyKey,
        })
      }
      await refreshQueueView()

      const location = await readCurrentLocation()
      if (location !== null) {
        await store.update((items) =>
          applyReportLocation({ idempotencyKey: fieldReport.idempotencyKey, items, location }),
        )
      }
      requestDrain(undefined)
      return 'queued'
    })
  }

  /**
   * Spec 179 (T303): "Não entreguei" grava a ocorrência com foto e a devolução juntas, antes do GPS —
   * como o `reportWithLocation`. A foto conta no teto de bytes dos anexos: estourou, nada entra e a
   * tela diz (nunca descarte calado). A posição completa só a devolução, que é quem a leva.
   */
  function reportNotDelivered(
    reports: readonly DriverFieldReport[],
  ): Promise<DriverNotDeliveredOutcome> {
    return persistWhileOpen(captureRegistry, async () => {
      const [queued, attachmentTotals] = await Promise.all([
        store.read(),
        attachmentStore.readTotals(),
      ])
      const photoBytes =
        sumReportPhotoBytes(queued.map((item) => item.report)) + sumReportPhotoBytes(reports)
      if (attachmentTotals.totalBytes + photoBytes > ATTACHMENT_QUEUE_LIMIT.maxTotalBytes) {
        return 'size-limit'
      }

      const result = await enqueueReports({
        clockOffsetMs: driverClockOffset.read(),
        isUnverified: !session.canSync,
        now: new Date(),
        reports,
        store,
        subHash: session.subHash,
      })
      if (!result.accepted) return result.reason
      const returned = reports.find((report) => report.kind === 'return')
      /* Spec 218: a nota voltou — o canhoto colhido no gate para ela não tem mais entrega a esperar. */
      if (returned !== undefined && returned.kind === 'return') {
        await discardAttachmentsAwaitingDelivery({
          attachmentStore,
          documentId: returned.documentId,
        })
      }
      await refreshQueueView()

      const location = returned === undefined ? null : await readCurrentLocation()
      if (returned !== undefined && location !== null) {
        await store.update((items) =>
          applyReportLocation({ idempotencyKey: returned.idempotencyKey, items, location }),
        )
      }
      requestDrain(undefined)
      return 'queued'
    })
  }

  /**
   * Spec 209 (D3): o "Deu problema" grava a ocorrência e, atrás dela, a foto. Fila cheia derruba a
   * foto, nunca o relato — pelo teto de bytes, ou pela contagem quando os dois não cabem juntos.
   */
  function reportStopOccurrence(
    reports: readonly DriverFieldReport[],
  ): Promise<DriverStopOccurrenceOutcome> {
    return persistWhileOpen(captureRegistry, async () => {
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
      const enqueue = (items: readonly DriverFieldReport[]) =>
        enqueueReports({
          clockOffsetMs: driverClockOffset.read(),
          isUnverified: !session.canSync,
          now: new Date(),
          reports: items,
          store,
          subHash: session.subHash,
        })

      let isPhotoDropped = fitted.isPhotoDropped
      let result = await enqueue(fitted.reports)
      if (!result.accepted && fitted.reports.length > 1) {
        isPhotoDropped = true
        result = await enqueue(withoutPhotos(fitted.reports))
      }
      if (!result.accepted) return result.reason
      await refreshQueueView()
      requestDrain(undefined)
      return isPhotoDropped ? 'photo-dropped' : 'queued'
    })
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
  function attachProof(input: DriverProofInput): Promise<DriverProofOutcome> {
    return persistWhileOpen(captureRegistry, () => enqueueProof(input))
  }

  async function enqueueProof(input: DriverProofInput): Promise<DriverProofOutcome> {
    /* Spec 207: usa a chave da tela quando ela vem — é a mesma que "Remover" vai pedir depois. */
    const attachmentKey = input.attachmentKey ?? createIdempotencyKey()
    /** Spec 212: a foto nasce marcada — nenhuma drenagem a leva antes da versão leve. */
    const shouldReduce = shouldReduceProofFile({ file: input.file, kind: input.kind })
    const clockOffsetMs = driverClockOffset.read()
    const attachment: QueuedAttachment = {
      attachmentKey,
      blob: input.file,
      capturedAt: new Date().toISOString(),
      ...(clockOffsetMs === undefined ? {} : { clockOffsetMs }),
      documentId: input.documentId,
      fileName: input.file.name,
      kind: input.kind,
      ...(shouldReduce ? { pendingReduction: true as const } : {}),
      ...(input.receivedBy === undefined ? {} : { receivedBy: input.receivedBy }),
      ...(input.receivedByDetail === undefined ? {} : { receivedByDetail: input.receivedByDetail }),
      ...(input.receiverDocument === undefined ? {} : { receiverDocument: input.receiverDocument }),
      ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
      ...(input.lateRegistration === undefined ? {} : { lateRegistration: input.lateRegistration }),
      subHash: session.subHash,
    }
    const result = await enqueueAttachment({
      attachment,
      attachmentStore,
      awaitingDelivery: input.awaitingDelivery === true,
      isUnverified: !session.canSync,
      store,
    })
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
    // A folga (`PROOF_AUTO_DRAIN_GRACE_MS`) é depois da redução, não no lugar dela — a versão leve
    // já está pronta quando a drenagem finalmente dispara.
    void reduction.finally(() => {
      window.setTimeout(() => requestDrain(undefined), PROOF_AUTO_DRAIN_GRACE_MS)
    })
    return 'queued'
  }

  /**
   * Spec 203/193 (D7): mesma varredura de grupos que a drenagem usa (`attachmentStore.readAll()`)
   * — achou o grupo com um item deste documento, aplica os campos in place, pela `eventKey` do
   * grupo. **Sem grupo** (o anexo já subiu): o que sobrar de `receivedBy`/`receivedByDetail`/
   * `receiverName` vira `proofReceiver`, o PATCH enfileirado — `receiverDocument` não viaja por
   * aqui, porque o PATCH não o aceita.
   */
  async function updateProofFields(input: {
    documentId: string
    receivedBy?: string
    receivedByDetail?: string
    receiverDocument?: string
    receiverName?: string
  }): Promise<void> {
    const groups = await attachmentStore.readAll()
    const target = groups.find(([, items]) =>
      items.some((item) => item.documentId === input.documentId),
    )
    if (target !== undefined) {
      const [eventKey] = target
      await attachmentStore.update({
        eventKey,
        mutate: (items) =>
          applyAttachmentReceiverFields({
            documentId: input.documentId,
            items,
            ...(input.receivedBy === undefined ? {} : { receivedBy: input.receivedBy }),
            ...(input.receivedByDetail === undefined
              ? {}
              : { receivedByDetail: input.receivedByDetail }),
            ...(input.receiverDocument === undefined
              ? {}
              : { receiverDocument: input.receiverDocument }),
            ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
          }),
      })
      await refreshQueueView()
      return
    }

    const fields = {
      ...(input.receivedBy === undefined ? {} : { receivedBy: input.receivedBy }),
      ...(input.receivedByDetail === undefined ? {} : { receivedByDetail: input.receivedByDetail }),
      ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
    }
    if (Object.keys(fields).length === 0) return
    await report(
      buildProofReceiverReport({
        documentId: input.documentId,
        fields,
        idempotencyKey: createIdempotencyKey(),
      }),
    )
  }

  /**
   * Pedido do usuário (25/09, spec 207): "Remover" a foto/assinatura do canhoto — só cabe com o
   * anexo ainda na fila (mesma varredura de `updateProofFields`). Enviado ao servidor, o grupo já
   * não existe mais em `attachmentStore` (não há rota de exclusão — spec 082: pontualidade e
   * auditoria já leram aquele anexo), e esta função não tem o que fazer.
   *
   * ⚠️ Por `attachmentKey`, nunca por `documentId` (achado de revisão, spec 211 traz mais de um
   * anexo por nota) — remover pelo documento apagaria os outros anexos dela junto.
   */
  async function removeProof(attachmentKey: string): Promise<void> {
    const groups = await attachmentStore.readAll()
    const target = groups.find(([, items]) =>
      items.some((item) => item.attachmentKey === attachmentKey),
    )
    if (target === undefined) return
    const [eventKey] = target
    await attachmentStore.update({
      eventKey,
      mutate: (items) => removeQueuedAttachmentByKey({ attachmentKey, items }),
    })
    await refreshQueueView()
  }

  async function discardProofAwaitingDelivery(documentId: string): Promise<void> {
    await discardAttachmentsAwaitingDelivery({ attachmentStore, documentId })
    await refreshQueueView()
  }

  async function discardForeign(): Promise<void> {
    await discardForeignPending({ attachmentStore, ownerSubHash: session.subHash, store })
    await refreshQueueView()
  }

  /** Spec 227: o recusado de negócio e o dado dele (blob, posição) saem do aparelho. */
  async function discardRejected(idempotencyKey: string): Promise<void> {
    await discardRejectedQueueItem({ attachmentStore, idempotencyKey, store })
    await refreshQueueView()
  }

  /** "Sair" com pendência própria (segurança M2): o item e o dado saem do aparelho. */
  async function discardOwn(): Promise<void> {
    await discardOwnPending({ attachmentStore, ownerSubHash: session.subHash, store })
    await refreshQueueView()
  }

  /** "Confirmar em lote": o dono autenticado assume o que foi feito sem rede, e a drenagem leva. */
  async function confirmUnverified(): Promise<void> {
    await confirmUnverifiedPending({ attachmentStore, ownerSubHash: session.subHash, store })
    await refreshQueueView()
    requestDrain(undefined)
  }

  async function discardUnverified(): Promise<void> {
    await discardUnverifiedPending({ attachmentStore, ownerSubHash: session.subHash, store })
    await refreshQueueView()
  }

  function dismissReassignedTripNotice(): void {
    setIsTripReassignedNoticeVisible(false)
  }

  const loadedView = queueView ?? []

  return {
    attachProof,
    updateProofFields,
    removeProof,
    discardProofAwaitingDelivery,
    confirmUnverifiedPending: confirmUnverified,
    discardForeignPending: discardForeign,
    discardOwnPending: discardOwn,
    discardRejected,
    discardUnverifiedPending: discardUnverified,
    dismissReassignedTripNotice,
    foreignPendingCount,
    hasReassignedTripNotice: isTripReassignedNoticeVisible,
    isQueueLoading: queueView === undefined,
    isSyncing: drain.isPending,
    lastSyncedAtMs: currentTrip.dataUpdatedAt,
    dataSavedAt: resolveTripDataSavedAt({
      canSync: session.canSync,
      dataUpdatedAt: currentTrip.dataUpdatedAt,
      initialSavedAt: initialSnapshot?.savedAt,
      isRefetchError: currentTrip.isRefetchError,
    }),
    isOfflineBoot: !session.canSync,
    ownPendingCount: loadedView.length,
    pendingTotal,
    proofOutcomeByDocumentId,
    queueView: loadedView,
    queuedCount: loadedView.filter((item) => item.status.state !== 'rejected').length,
    refetchTrip: () => void queryClient.invalidateQueries({ queryKey: CURRENT_TRIP_QUERY_KEY }),
    rejectedCount: loadedView.filter((item) => item.status.state === 'rejected').length,
    report,
    reportAllOrNothing: reportNotDelivered,
    reportNotDelivered,
    reportStopOccurrence,
    reportWithLocation,
    sendAllNow: () => requestDrain(undefined),
    sendNow: (idempotencyKey: string) => requestDrain(idempotencyKey),
    sentReportKeys,
    snapshot: currentTrip.data,
    /** Sem sessão não há quem confirme: a faixa só aparece depois de entrar. */
    unverifiedPending: session.canSync ? unverifiedPending : undefined,
    status: resolveTripViewStatus({
      hasData: currentTrip.data !== undefined,
      isError: currentTrip.isError,
      isLoading: currentTrip.isLoading,
    }),
  } satisfies DriverTripController
}
