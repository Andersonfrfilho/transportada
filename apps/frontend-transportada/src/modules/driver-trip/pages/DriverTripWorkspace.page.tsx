/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverBottomBar, type DriverSection } from '../components/DriverBottomBar.component'
import { DriverLoadSheet } from '../components/DriverLoadSheet.component'
import { DriverManifestCard } from '../components/DriverManifestCard.component'
import { DriverProofOutcomeNotice } from '../components/DriverProofOutcomeNotice.component'
import { DriverShellHeader } from '../components/DriverShellHeader.component'
import {
  DriverStopCard,
  type DriverProofAttachment,
  type StopOccurrenceSubmission,
} from '../components/DriverStopCard.component'
import { DriverTripProgress } from '../components/DriverTripProgress.component'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { DriverEventQueuePage } from './DriverEventQueue.page'
import { DriverOccurrenceConversationsPage } from './DriverOccurrenceConversations.page'
import { DriverPendingProofsPage } from './DriverPendingProofs.page'
import { DriverProfilePage } from './DriverProfile.page'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import { saveDriverFile } from '../shared/driverFileSave.service'
import type {
  DriverOccurrenceTypesState,
  DriverReportedLocation,
  DriverReturnReason,
} from '../shared/driverTrip.types'
import { createIdempotencyKey } from '../shared/offlineQueue.service'
import {
  buildStopOccurrencePhotoReport,
  buildStopOccurrenceReports,
  prepareStopOccurrencePhoto,
} from '../shared/stopOccurrencePhoto.service'
import {
  findCurrentStop,
  findProofDocumentLabel,
  isAwaitingDispatch,
  listProofPendingDocuments,
  type ProofDocumentLabel,
} from '../shared/driverTripView.service'
import { useDriverConversationsQuery } from '@/modules/occurrence-conversation/queries/driverConversation.query'
import { countDriverUnread } from '@/modules/occurrence-conversation/shared/driverConversationClient.service'
import styles from '../styles/driverTrip.module.css'

/**
 * Spec 057: só a viagem dele, as paradas na ordem congelada, e dois toques por parada. O que a tela
 * **não** faz é tão decidido quanto o que ela faz: não reordena parada (congelada desde o despacho),
 * não mostra XML e não pede valor de nada.
 */
export function DriverTripWorkspacePage() {
  const { t } = useTranslation('driverTrip')
  const { t: tConversation } = useTranslation('occurrenceConversation')
  const driverTrip = useDriverTrip()
  /** Spec 082 D1: navegação interna do módulo — estado local, sem rota nova no shell do app. */
  const [section, setSection] = useState<DriverSection>('trip')
  /** Spec 082 D7: a tela de pendentes abre por cima da seção corrente — banner e Perfil chegam nela. */
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  /** Spec 159 T9: a tela de fotos pendentes, mesmo padrão da fila de eventos. */
  const [isPendingProofsOpen, setIsPendingProofsOpen] = useState(false)
  /** Spec 183 T604: as conversas da operação com o motorista, com a contagem no atalho. */
  const [isConversationsOpen, setIsConversationsOpen] = useState(false)
  const driverConversations = useDriverConversationsQuery({ enabled: true })
  const driverConversationCount = driverConversations.data?.length ?? 0
  const driverUnread = countDriverUnread(driverConversations.data ?? [])
  /** O anexo que falha **não** desfaz a entrega: o aviso é do arquivo, e diz isso por extenso. */
  const [proofFailed, setProofFailed] = useState(false)
  /** Spec 082 D6: teto da fila de anexos atingido — anunciado antes de qualquer descarte. */
  const [attachmentLimit, setAttachmentLimit] = useState<'count-limit' | 'size-limit' | undefined>(
    undefined,
  )
  /**
   * A ocorrência que falha **não** muda o estado da nota — ao contrário de entregar e devolver. O
   * aviso diz isso, e repetir o toque é o conserto.
   */
  const [occurrenceFailed, setOccurrenceFailed] = useState(false)
  /** Spec 082 (revisão): teto tipado da fila de EVENTOS — recusa anunciada, nada descartado. */
  const [eventLimitReached, setEventLimitReached] = useState(false)
  /** Spec 209 (D3): a foto do "Deu problema" não coube ou não se deixou ler — o relato entrou. */
  const [occurrencePhotoDropped, setOccurrencePhotoDropped] = useState(false)
  /** Iniciar trajeto: falhar não muda nada no servidor — repetir o toque é o conserto. */
  const [isDispatching, setIsDispatching] = useState(false)
  const [dispatchFailed, setDispatchFailed] = useState(false)
  /**
   * Os tipos cadastrados pela empresa. Spec 157 RF5: falha e lista vazia de verdade são estados
   * diferentes — o painel avisa a falha e oferece tentar de novo; entregar e devolver nunca
   * dependem disto.
   */
  const [occurrenceTypes, setOccurrenceTypes] = useState<DriverOccurrenceTypesState>({
    status: 'loading',
  })
  /** Spec 082 D2: uma leitura ao abrir — recusa vira `null`, e a distância só não aparece. */
  const [lastKnownLocation, setLastKnownLocation] = useState<DriverReportedLocation | null>(null)
  /**
   * Spec 159 (T11): o resultado da pontualidade fica visível fora da tela de pendentes — um aviso
   * persistente até o motorista dispensar. Derivado direto do estado do hook a cada render, sem
   * `useEffect`: dispensar é só marcar o documento como lido.
   */
  const [dismissedProofOutcomeIds, setDismissedProofOutcomeIds] = useState<ReadonlySet<string>>(
    new Set(),
  )
  /** Spec 159 (T12): de qual nota é cada aviso de pontualidade. */
  const [proofLabelByDocumentId, setProofLabelByDocumentId] = useState<
    ReadonlyMap<string, ProofDocumentLabel>
  >(new Map())

  useEffect(() => {
    let ativo = true
    void readCurrentLocation().then((location) => {
      if (ativo) setLastKnownLocation(location)
    })
    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => {
    let ativo = true
    void getDriverTripClient()
      .listOccurrenceTypes()
      .then((result) => {
        if (ativo) setOccurrenceTypes(result)
      })
    return () => {
      ativo = false
    }
  }, [])

  /** O card chama isto quando o motorista toca "Tentar de novo" — o cliente nunca lança. */
  function handleRetryOccurrenceTypes(): void {
    setOccurrenceTypes({ status: 'loading' })
    void getDriverTripClient().listOccurrenceTypes().then(setOccurrenceTypes)
  }

  const snapshot = driverTrip.snapshot
  const trip = snapshot?.trips[0]

  if (driverTrip.status === 'loading') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <main className={styles.shell}>
          <SkeletonGroup label={t('loading')}>
            <Skeleton variant="text" />
            <Skeleton variant="block" />
            <Skeleton variant="block" />
          </SkeletonGroup>
        </main>
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (driverTrip.status === 'error') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <main className={styles.shell}>
          <p role="alert">{t('error')}</p>
        </main>
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (isQueueOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverEventQueuePage
          isLoading={driverTrip.isQueueLoading}
          isSyncing={driverTrip.isSyncing}
          items={driverTrip.queueView}
          onBack={() => setIsQueueOpen(false)}
          onSendAll={() => driverTrip.sendAllNow()}
          onSendOne={(idempotencyKey) => driverTrip.sendNow(idempotencyKey)}
        />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  function handleProof(input: DriverProofAttachment): void {
    setAttachmentLimit(undefined)
    /* Guardado no toque: depois do envio a nota sai de `pendingProofs` e o nome some junto. */
    const label = findProofDocumentLabel({ documentId: input.documentId, snapshot })
    if (label !== undefined) {
      setProofLabelByDocumentId((current) => new Map(current).set(input.documentId, label))
    }
    void driverTrip
      .attachProof(input)
      .then((outcome) => {
        if (outcome === 'count-limit' || outcome === 'size-limit') setAttachmentLimit(outcome)
      })
      .catch(() => setProofFailed(true))
  }

  if (isConversationsOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverOccurrenceConversationsPage onBack={() => setIsConversationsOpen(false)} />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (isPendingProofsOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverPendingProofsPage
          onBack={() => setIsPendingProofsOpen(false)}
          onProof={handleProof}
          proofOutcomeByDocumentId={driverTrip.proofOutcomeByDocumentId}
          queueView={driverTrip.queueView}
          snapshot={snapshot}
        />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (section === 'profile') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverProfilePage
          queuedCount={driverTrip.queuedCount}
          snapshot={snapshot}
          onOpenPendingProofs={() => setIsPendingProofsOpen(true)}
          onOpenQueue={() => setIsQueueOpen(true)}
        />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  async function openManifestDamdfe(manifestId: string): Promise<void> {
    const file = await getDriverTripClient().readManifestDamdfe(manifestId)
    saveDriverFile(file)
  }

  async function openManifestXml(manifestId: string): Promise<void> {
    const download = await getDriverTripClient().readManifestXml(manifestId)
    window.open(download.downloadUrl, '_blank', 'noopener')
  }

  async function report(
    build: (
      location: Awaited<ReturnType<typeof readCurrentLocation>>,
    ) => Parameters<typeof driverTrip.report>[0],
  ): Promise<void> {
    const outcome = await driverTrip.report(build(await readCurrentLocation()))
    if (outcome === 'count-limit') setEventLimitReached(true)
  }

  /**
   * Spec 209: a ocorrência entra na fila **antes** da redução da foto — ela nunca espera a foto. A
   * foto, reduzida, entra atrás, amarrada pela chave da ocorrência; se não coube ou não se deixou
   * ler, a ocorrência já está lá e a tela avisa. Nada vai ao comprovante de nota nenhuma.
   */
  async function reportStopOccurrence(
    input: StopOccurrenceSubmission & { stopId: string },
  ): Promise<void> {
    setOccurrencePhotoDropped(false)
    const [occurrence] = buildStopOccurrenceReports({
      createKey: createIdempotencyKey,
      description: input.description,
      kind: input.kind,
      photo: undefined,
      stopId: input.stopId,
    })
    if (occurrence?.kind !== 'occurrence') return
    const outcome = await driverTrip.reportStopOccurrence([occurrence])
    if (outcome === 'count-limit') setEventLimitReached(true)
    if (outcome === 'count-limit' || input.photo === undefined) return

    const photo = await prepareStopOccurrencePhoto(input.photo)
    const photoOutcome =
      photo === undefined
        ? 'photo-dropped'
        : await driverTrip.reportStopOccurrence([
            buildStopOccurrencePhotoReport({ createKey: createIdempotencyKey, occurrence, photo }),
          ])
    if (photoOutcome !== 'queued') setOccurrencePhotoDropped(true)
  }

  /** Sucesso → refetch: é o snapshot novo que abre as ações de campo. */
  async function dispatchTrip(tripId: string): Promise<void> {
    setDispatchFailed(false)
    setIsDispatching(true)
    try {
      await getDriverTripClient().dispatchTrip({ tripId })
      driverTrip.refetchTrip()
    } catch {
      setDispatchFailed(true)
    } finally {
      setIsDispatching(false)
    }
  }

  const isTripAwaitingDispatch = trip !== undefined && isAwaitingDispatch(trip)
  const proofPendingCount = listProofPendingDocuments(snapshot).length
  /** Spec 159 (T11): entradas ainda não dispensadas — computado no render, nunca em `useEffect`. */
  const visibleProofOutcomes = [...driverTrip.proofOutcomeByDocumentId].filter(
    ([documentId]) => !dismissedProofOutcomeIds.has(documentId),
  )

  return (
    <div className={styles.moduleShell}>
      <DriverShellHeader />
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('title')}</h1>
          {trip === undefined ? null : (
            <p className={styles.vehicle}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
          )}
        </header>

        {trip === undefined ? null : <DriverTripProgress trip={trip} />}

        {/* Spec 082 (revisão): viagem `route_planned` só abre as ações depois de iniciar o trajeto */}
        {isTripAwaitingDispatch && trip !== undefined ? (
          <div className={styles.actions}>
            <Button
              disabled={isDispatching}
              onClick={() => void dispatchTrip(trip.id)}
              type="button"
            >
              <Icon name="check" />
              {t('dispatch.start')}
            </Button>
            <p className={styles.stopMeta}>{t('dispatch.waiting')}</p>
          </div>
        ) : null}
        {dispatchFailed ? (
          <p className={styles.alert} role="alert">
            {t('dispatch.failed')}
          </p>
        ) : null}

        {eventLimitReached ? (
          <p className={styles.alert} role="alert">
            {t('eventLimitCount')}
          </p>
        ) : null}

        {/* Spec 183 T604: as mensagens da operação, com as novas contadas. */}
        {driverConversationCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => setIsConversationsOpen(true)}
          >
            {driverUnread > 0
              ? tConversation('driverApp.open', { count: driverUnread })
              : tConversation('driverApp.openAll')}
          </button>
        ) : null}

        {/* Spec 159 T9: atalho visível com a contagem — leva à tela de anexo em lote. */}
        {proofPendingCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => setIsPendingProofsOpen(true)}
          >
            {t('pendingProofs.open')} ({proofPendingCount})
          </button>
        ) : null}

        {/* A tela diz a verdade: o que está na fila aparece como aguardando, nunca como enviado */}
        {driverTrip.queuedCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => setIsQueueOpen(true)}
          >
            {t('queued', { count: driverTrip.queuedCount })}
            <span className={styles.queueBannerAction}>{t('eventQueue.open')}</span>
          </button>
        ) : null}

        {/* Spec 159 (T11): a pontualidade da foto, fora da lista de pendentes, até ser dispensada */}
        {visibleProofOutcomes.map(([documentId, outcome]) => (
          <DriverProofOutcomeNotice
            key={documentId}
            label={proofLabelByDocumentId.get(documentId)}
            onDismiss={() =>
              setDismissedProofOutcomeIds((current) => new Set(current).add(documentId))
            }
            outcome={outcome}
          />
        ))}

        {attachmentLimit !== undefined ? (
          <p className={styles.alert} role="alert">
            {t(attachmentLimit === 'count-limit' ? 'attachmentLimitCount' : 'attachmentLimitSize')}
          </p>
        ) : null}

        {occurrencePhotoDropped ? (
          <p className={styles.alert} role="alert">
            {t('occurrencePhotoDropped')}
          </p>
        ) : null}

        {occurrenceFailed ? (
          <p className={styles.alert} role="alert">
            {t('documentOccurrenceFailed')}
          </p>
        ) : null}
        {proofFailed ? (
          <p className={styles.rejectedBanner} role="alert">
            {t('proofFailed')}
          </p>
        ) : null}

        {driverTrip.rejectedCount > 0 ? (
          <button
            className={styles.rejectedBannerButton}
            type="button"
            onClick={() => setIsQueueOpen(true)}
          >
            {t('rejected')}
          </button>
        ) : null}

        {snapshot?.isRegisteredDriver === false ? <p role="alert">{t('notRegistered')}</p> : null}

        {/* Spec 065 D9: com manifesto autorizado, o documento da barreira vem antes do romaneio */}
        {trip?.manifest == null ? null : (
          <DriverManifestCard
            manifest={trip.manifest}
            onOpenDamdfe={(manifestId) => openManifestDamdfe(manifestId)}
            onOpenXml={(manifestId) => openManifestXml(manifestId)}
          />
        )}

        {/* Spec 065 D1: o que ele leva na mão desde o despacho, e antes de existir MDF-e */}
        {trip === undefined ? null : <DriverLoadSheet trip={trip} />}

        {trip === undefined ? (
          snapshot?.isRegisteredDriver === false ? null : (
            <p>{t('noTrip')}</p>
          )
        ) : (
          <ul className={styles.stopList}>
            {trip.stops.map((stop) => (
              <DriverStopCard
                isCurrent={stop.id === findCurrentStop(trip)?.id}
                isFieldWorkBlocked={isTripAwaitingDispatch}
                key={stop.id}
                lastKnownLocation={lastKnownLocation}
                stop={stop}
                onArrive={(stopId) =>
                  void report((location) => ({
                    idempotencyKey: createIdempotencyKey(),
                    kind: 'arrive',
                    location,
                    stopId,
                  }))
                }
                onDeliver={(documentId) =>
                  void report((location) => ({
                    documentId,
                    idempotencyKey: createIdempotencyKey(),
                    kind: 'deliver',
                    location,
                  }))
                }
                onProof={handleProof}
                occurrenceTypes={occurrenceTypes}
                onRetryOccurrenceTypes={handleRetryOccurrenceTypes}
                onDocumentOccurrence={(input: {
                  documentId: string
                  occurrenceTypeId: string
                  productCode: string
                }) => {
                  void getDriverTripClient()
                    .registerDocumentOccurrence(input)
                    .catch(() => setOccurrenceFailed(true))
                }}
                onOccurrence={(input) => void reportStopOccurrence(input)}
                onReturn={(input: { documentId: string; reason: DriverReturnReason }) =>
                  void report((location) => ({
                    documentId: input.documentId,
                    idempotencyKey: createIdempotencyKey(),
                    kind: 'return',
                    location,
                    reason: input.reason,
                  }))
                }
              />
            ))}
          </ul>
        )}
      </main>
      <DriverBottomBar section={section} onSelect={setSection} />
    </div>
  )
}
