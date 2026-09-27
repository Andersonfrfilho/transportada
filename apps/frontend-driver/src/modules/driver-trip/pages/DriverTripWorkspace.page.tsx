/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverBottomBar, type DriverSection } from '../components/DriverBottomBar.component'
import { DriverForeignPendingNotice } from '../components/DriverForeignPendingNotice.component'
import { DriverLoadSheet } from '../components/DriverLoadSheet.component'
import { DriverLocationSharingIndicator } from '../components/DriverLocationSharingIndicator.component'
import { DriverManifestCard } from '../components/DriverManifestCard.component'
import { DriverProofOutcomeNotice } from '../components/DriverProofOutcomeNotice.component'
import { DriverShellHeader } from '../components/DriverShellHeader.component'
import { DriverStopCard, type DriverProofAttachment } from '../components/DriverStopCard.component'
import { DriverTripProgress } from '../components/DriverTripProgress.component'
import { DriverTripSelector } from '../components/DriverTripSelector.component'
import { DriverUnverifiedPendingNotice } from '../components/DriverUnverifiedPendingNotice.component'
import { useDriverSession } from '../hooks/useDriverSession.hook'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { useLocationSharing } from '../hooks/useLocationSharing.hook'
import { useSelectedDriverTrip } from '../hooks/useSelectedDriverTrip.hook'
import { useStopExpansion } from '../hooks/useStopExpansion.hook'
import type { StopOccurrenceDraft } from '../hooks/useStopOccurrenceForm.hook'
import { useTransientNotice } from '../hooks/useTransientNotice.hook'
import { DriverEventQueuePage } from './DriverEventQueue.page'
import { DriverPendingProofsPage } from './DriverPendingProofs.page'
import { DriverProfilePage } from './DriverProfile.page'
import {
  navigateToDriverSection,
  resolveDriverRouteSection,
  subscribeDriverRoute,
} from '@/modules/shared/driverRoute.service'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import {
  resolveDocumentActivityStatus,
  type DocumentActivityView,
  type DocumentReturnActivityView,
} from '../shared/documentActivity.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import { saveDriverFile } from '../shared/driverFileSave.service'
import type {
  DriverOccurrenceTypesState,
  DriverReportedLocation,
  DriverReturnReason,
} from '../shared/driverTrip.types'
import {
  buildNotDeliveredReports,
  findOccurrenceKey,
  resolveNotDeliveredStatus,
  type NotDeliveredDraft,
  type NotDeliveredStatus,
} from '../shared/notDelivered.service'
import {
  readCachedOccurrenceTypes,
  resolveOccurrenceTypesStorage,
  resolveOccurrenceTypesWithCache,
  saveCachedOccurrenceTypes,
} from '../shared/occurrenceTypesCache.service'
import { createIdempotencyKey } from '../shared/offlineQueue.service'
import { buildStopOccurrenceReports } from '../shared/stopOccurrencePhoto.service'
import {
  findCurrentStop,
  findProofDocumentLabel,
  canStartRoute,
  isAwaitingDispatch,
  listProofPendingDocuments,
  type ProofDocumentLabel,
} from '../shared/driverTripView.service'
import styles from '../styles/driverTrip.module.css'

/**
 * Spec 057: só a viagem dele, as paradas na ordem congelada, e dois toques por parada. O que a tela
 * **não** faz é tão decidido quanto o que ela faz: não reordena parada (congelada desde o despacho),
 * não mostra XML e não pede valor de nada.
 */
export function DriverTripWorkspacePage() {
  const { t } = useTranslation('driverTrip')
  const driverTrip = useDriverTrip()
  const { subHash } = useDriverSession()
  /**
   * RF5 (plan D4): a navegação interna do módulo deixou de ser estado local isolado — ela deriva da
   * mesma leitura de caminho/`popstate` que a casca usa para decidir entre a viagem e as
   * notificações. `history.back()` desfaz o `pushState` de quem abriu a fila ou as fotos, e volta
   * exatamente para onde a pessoa estava (viagem ou perfil).
   */
  const [routeSection, setRouteSection] = useState(() =>
    resolveDriverRouteSection(window.location.pathname),
  )
  useEffect(() => subscribeDriverRoute(setRouteSection), [])
  const section: DriverSection = routeSection === 'profile' ? 'profile' : 'trip'
  /** Spec 082 D7: a tela de pendentes abre por cima da seção corrente — banner e Perfil chegam nela. */
  const isQueueOpen = routeSection === 'queue'
  /** Spec 159 T9: a tela de fotos pendentes, mesmo padrão da fila de eventos. */
  const isPendingProofsOpen = routeSection === 'pending-proofs'
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
  /** Spec 209 (D3): a foto do "Deu problema" não coube — o relato entrou sem ela, e a tela diz. */
  const [occurrencePhotoDropped, setOccurrencePhotoDropped] = useState(false)
  /** Iniciar trajeto: falhar não muda nada no servidor — repetir o toque é o conserto. */
  const [isDispatching, setIsDispatching] = useState(false)
  const [dispatchFailed, setDispatchFailed] = useState(false)
  const [isStartingRoute, setIsStartingRoute] = useState(false)
  const [startRouteFailed, setStartRouteFailed] = useState(false)
  /** Sem isto o toque em "Iniciar rota" só fazia o botão sumir — e o motorista achava que nada aconteceu. */
  const startRouteNotice = useTransientNotice()
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
  /**
   * Spec 179 RF5: a chave da ocorrência com foto que o toque desta sessão gravou, por nota — é ela
   * que o cartão acompanha de "na fila" até "enviado".
   */
  const [notDeliveredKeyByDocumentId, setNotDeliveredKeyByDocumentId] = useState<
    ReadonlyMap<string, string>
  >(new Map())
  /**
   * Pedido do usuário (25/09): "registrei... e nada aconteceu?" — a chave e a hora que o toque de
   * entregar, devolver ou "Deu problema" gerou, para a linha de estado mostrar "na fila"/"enviada"
   * até o snapshot confirmar. Sem chave (recarregou no meio), a linha simplesmente não aparece.
   */
  const [deliverKeyByDocumentId, setDeliverKeyByDocumentId] = useState<
    ReadonlyMap<string, Readonly<{ at: string; key: string }>>
  >(new Map())
  const [returnKeyByDocumentId, setReturnKeyByDocumentId] = useState<
    ReadonlyMap<string, Readonly<{ at: string; key: string; reason: DriverReturnReason }>>
  >(new Map())
  const [stopOccurrenceKeyByStopId, setStopOccurrenceKeyByStopId] = useState<
    ReadonlyMap<string, Readonly<{ at: string; key: string }>>
  >(new Map())
  /** Spec 159 (T12): de qual nota é cada aviso de pontualidade. */
  const [proofLabelByDocumentId, setProofLabelByDocumentId] = useState<
    ReadonlyMap<string, ProofDocumentLabel>
  >(new Map())

  useEffect(() => {
    let isActive = true
    void readCurrentLocation().then((location) => {
      if (isActive) setLastKnownLocation(location)
    })
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true
    void loadOccurrenceTypes(subHash).then((result) => {
      if (isActive) setOccurrenceTypes(result)
    })
    return () => {
      isActive = false
    }
  }, [subHash])

  /** O card chama isto quando o motorista toca "Tentar de novo" — o cliente nunca lança. */
  function handleRetryOccurrenceTypes(): void {
    setOccurrenceTypes({ status: 'loading' })
    void loadOccurrenceTypes(subHash).then(setOccurrenceTypes)
  }

  const snapshot = driverTrip.snapshot
  /** RF12: com duas viagens ativas, a da tela é a escolhida — nunca mais `trips[0]` às cegas. */
  const { selectTrip, trip } = useSelectedDriverTrip(snapshot?.trips ?? [])
  /** RF15: roda em qualquer seção, porque o que conta é a app estar na tela, não a aba aberta. */
  const locationSharingStatus = useLocationSharing(snapshot?.trips ?? [])
  /** Pedido do usuário (25/09): a parada atual abre sozinha — o hook só guarda o que o motorista tocou. */
  const currentStopId = trip === undefined ? undefined : findCurrentStop(trip)?.id
  const stopExpansion = useStopExpansion(currentStopId)

  if (driverTrip.status === 'loading') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
        <main className={styles.shell}>
          <SkeletonGroup label={t('loading')}>
            <Skeleton variant="text" />
            <Skeleton variant="block" />
            <Skeleton variant="block" />
          </SkeletonGroup>
        </main>
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
      </div>
    )
  }

  if (driverTrip.status === 'error') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
        <main className={styles.shell}>
          <p role="alert">{t('error')}</p>
        </main>
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
      </div>
    )
  }

  if (isQueueOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
        <DriverEventQueuePage
          isLoading={driverTrip.isQueueLoading}
          isSyncing={driverTrip.isSyncing}
          items={driverTrip.queueView}
          onBack={() => window.history.back()}
          onSendAll={() => driverTrip.sendAllNow()}
          onSendOne={(idempotencyKey) => driverTrip.sendNow(idempotencyKey)}
        />
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
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

  /**
   * Spec 203/193: o campo preenchido depois do anexo já estar na fila alcança o mesmo item, ou —
   * anexo já enviado — vira o PATCH `.../proof/receiver` enfileirado (D7).
   */
  function handleProofFieldsUpdate(input: {
    documentId: string
    receivedBy?: string
    receivedByDetail?: string
    receiverDocument?: string
    receiverName?: string
  }): void {
    void driverTrip.updateProofFields(input)
  }

  /** Spec 207: "Remover" a foto/assinatura ainda na fila, pelo attachmentKey do item escolhido. */
  function handleRemoveProof(attachmentKey: string): void {
    void driverTrip.removeProof(attachmentKey)
  }

  if (isPendingProofsOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
        <DriverPendingProofsPage
          onBack={() => window.history.back()}
          onProof={handleProof}
          onProofFieldsUpdate={handleProofFieldsUpdate}
          onRemoveProof={handleRemoveProof}
          proofOutcomeByDocumentId={driverTrip.proofOutcomeByDocumentId}
          queueView={driverTrip.queueView}
          snapshot={snapshot}
        />
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
      </div>
    )
  }

  if (section === 'profile') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
        <DriverProfilePage
          canSync={!driverTrip.isOfflineBoot}
          onDiscardOwnPending={() => driverTrip.discardOwnPending()}
          onSendAll={() => driverTrip.sendAllNow()}
          ownPendingCount={driverTrip.ownPendingCount}
          queuedCount={driverTrip.queuedCount}
          snapshot={snapshot}
          trip={trip}
          onOpenPendingProofs={() => navigateToDriverSection('pending-proofs')}
          onOpenQueue={() => navigateToDriverSection('queue')}
        />
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
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

  /** Spec 179 (T303): a ocorrência com foto e a devolução entram juntas na fila. */
  async function reportNotDelivered(input: {
    documentId: string
    draft: NotDeliveredDraft
    lateRegistration?: boolean
  }): Promise<void> {
    setAttachmentLimit(undefined)
    const reports = buildNotDeliveredReports({
      createIdempotencyKey,
      documentId: input.documentId,
      draft: input.draft,
      ...(input.lateRegistration === undefined ? {} : { lateRegistration: input.lateRegistration }),
      occurrenceTypes,
    })
    const outcome = await driverTrip.reportNotDelivered(reports)
    if (outcome === 'count-limit') setEventLimitReached(true)
    if (outcome === 'size-limit') setAttachmentLimit('size-limit')
    if (outcome !== 'queued') return
    const at = new Date().toISOString()
    const occurrenceKey = findOccurrenceKey(reports)
    if (occurrenceKey !== undefined) {
      setNotDeliveredKeyByDocumentId((current) =>
        new Map(current).set(input.documentId, occurrenceKey),
      )
    }
    const returnReport = reports.find((report) => report.kind === 'return')
    if (returnReport !== undefined && returnReport.kind === 'return') {
      setReturnKeyByDocumentId((current) =>
        new Map(current).set(input.documentId, {
          at,
          key: returnReport.idempotencyKey,
          reason: returnReport.reason,
        }),
      )
    }
  }

  /** RF5: por nota da viagem na tela, o estado da ocorrência com foto — derivado a cada render. */
  function buildNotDeliveredStatuses(): ReadonlyMap<string, NotDeliveredStatus> {
    const statuses = new Map<string, NotDeliveredStatus>()
    for (const document of trip?.stops.flatMap((stop) => stop.documents) ?? []) {
      const status = resolveNotDeliveredStatus({
        documentId: document.id,
        occurrenceKey: notDeliveredKeyByDocumentId.get(document.id),
        queueView: driverTrip.queueView,
        sentReportKeys: driverTrip.sentReportKeys,
      })
      if (status !== undefined) statuses.set(document.id, status)
    }
    return statuses
  }
  const notDeliveredStatusByDocumentId = buildNotDeliveredStatuses()

  /**
   * Pedido do usuário (25/09): "registrei... e nada aconteceu?" — entrega, devolução e "Deu
   * problema" usam a mesma fila de sempre; esta é a leitura genérica de "na fila"/"enviada" para as
   * três, na mesma regra RF5 do `notDelivered.service.ts` (a ocorrência com foto tem a própria).
   */
  function buildDeliverActivity(): ReadonlyMap<string, DocumentActivityView> {
    const activity = new Map<string, DocumentActivityView>()
    for (const [documentId, record] of deliverKeyByDocumentId) {
      const status = resolveDocumentActivityStatus({
        key: record.key,
        kind: 'deliver',
        queueView: driverTrip.queueView,
        sentReportKeys: driverTrip.sentReportKeys,
      })
      if (status !== undefined) activity.set(documentId, { at: record.at, status })
    }
    return activity
  }
  const deliverActivityByDocumentId = buildDeliverActivity()

  function buildReturnActivity(): ReadonlyMap<string, DocumentReturnActivityView> {
    const activity = new Map<string, DocumentReturnActivityView>()
    for (const [documentId, record] of returnKeyByDocumentId) {
      const status = resolveDocumentActivityStatus({
        key: record.key,
        kind: 'return',
        queueView: driverTrip.queueView,
        sentReportKeys: driverTrip.sentReportKeys,
      })
      if (status !== undefined) {
        activity.set(documentId, { at: record.at, reason: record.reason, status })
      }
    }
    return activity
  }
  const returnActivityByDocumentId = buildReturnActivity()

  function buildStopOccurrenceActivity(): ReadonlyMap<string, DocumentActivityView> {
    const activity = new Map<string, DocumentActivityView>()
    for (const [stopId, record] of stopOccurrenceKeyByStopId) {
      const status = resolveDocumentActivityStatus({
        key: record.key,
        kind: 'occurrence',
        queueView: driverTrip.queueView,
        sentReportKeys: driverTrip.sentReportKeys,
      })
      if (status !== undefined) activity.set(stopId, { at: record.at, status })
    }
    return activity
  }
  const stopOccurrenceActivityByStopId = buildStopOccurrenceActivity()

  /** M1: o toque grava na hora; a posição (até 8 s de GPS) completa o item depois, no hook. */
  async function report(build: Parameters<typeof driverTrip.reportWithLocation>[0]): Promise<void> {
    const outcome = await driverTrip.reportWithLocation(build)
    if (outcome === 'count-limit') setEventLimitReached(true)
  }

  /** Pedido do usuário (25/09): a chave nasce aqui — é ela que liga o toque à linha "na fila"/"enviada". */
  function deliverDocument(input: { documentId: string; lateRegistration: boolean }): void {
    const idempotencyKey = createIdempotencyKey()
    setDeliverKeyByDocumentId((current) =>
      new Map(current).set(input.documentId, { at: new Date().toISOString(), key: idempotencyKey }),
    )
    void report((location) => ({
      documentId: input.documentId,
      idempotencyKey,
      kind: 'deliver',
      ...(input.lateRegistration ? { lateRegistration: true } : {}),
      location,
    }))
  }

  /**
   * Spec 209: a ocorrência e, atrás dela, a foto — a foto é da ocorrência e nunca vira canhoto de
   * nota. A linha "ocorrência registrada" do cartão lê a chave da ocorrência, não a da foto.
   */
  function reportStopOccurrence(input: StopOccurrenceDraft & { stopId: string }): void {
    const reports = buildStopOccurrenceReports({
      createKey: createIdempotencyKey,
      description: input.description,
      kind: input.kind,
      photo: input.photo,
      stopId: input.stopId,
    })
    const occurrenceKey = reports[0]?.idempotencyKey ?? ''
    setStopOccurrenceKeyByStopId((current) =>
      new Map(current).set(input.stopId, { at: new Date().toISOString(), key: occurrenceKey }),
    )
    setOccurrencePhotoDropped(false)
    void driverTrip.reportStopOccurrence(reports).then((outcome) => {
      if (outcome === 'count-limit') setEventLimitReached(true)
      if (outcome === 'photo-dropped') setOccurrencePhotoDropped(true)
    })
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

  /** O "saí" do motorista: a API grava o evento na linha do tempo; o snapshot novo tira o botão. */
  async function startRoute(): Promise<void> {
    setStartRouteFailed(false)
    setIsStartingRoute(true)
    try {
      await getDriverTripClient().startRoute()
      startRouteNotice.announce(
        'start-route',
        t('startRoute.done', {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }),
      )
      driverTrip.refetchTrip()
    } catch {
      setStartRouteFailed(true)
    } finally {
      setIsStartingRoute(false)
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
      <DriverShellHeader pendingCount={driverTrip.pendingTotal} />
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('title')}</h1>
          {trip === undefined ? null : (
            <p className={styles.vehicle}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
          )}
          {trip?.status === 'on_delivery_route' ? (
            <p className={styles.tripOnRoute}>
              <Icon aria-hidden="true" name="workspace-driver-trip" size="sm" />
              {t('startRoute.onRoute')}
            </p>
          ) : null}
        </header>

        <DriverTripSelector
          onSelect={selectTrip}
          selectedTripId={trip?.id}
          trips={snapshot?.trips ?? []}
        />

        <DriverLocationSharingIndicator status={locationSharingStatus} />

        {/*
          ADR-0075 §8: boot sem rede, ou releitura que falhou com a viagem em memória — a tela
          continua com o dado e diz de quando ele é
        */}
        {driverTrip.dataSavedAt === undefined ? null : (
          <p className={styles.queueBanner} role="status">
            {t(driverTrip.isOfflineBoot ? 'offline.snapshotFrom' : 'offline.refetchFailed', {
              time: new Date(driverTrip.dataSavedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        )}

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
        {trip !== undefined && canStartRoute(trip) ? (
          <div className={styles.actions}>
            <Button disabled={isStartingRoute} onClick={() => void startRoute()} type="button">
              <Icon aria-hidden="true" name="workspace-driver-trip" />
              {t('startRoute.start')}
            </Button>
          </div>
        ) : null}
        {startRouteNotice.notice === undefined ? null : (
          <p className={styles.activityNotice} role="status">
            <Icon aria-hidden="true" name="check" size="sm" />
            {startRouteNotice.notice.message}
          </p>
        )}
        {startRouteFailed ? (
          <p className={styles.alert} role="alert">
            {t('startRoute.failed')}
          </p>
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

        {/* Spec 159 T9: atalho visível com a contagem — leva à tela de anexo em lote. */}
        {proofPendingCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => navigateToDriverSection('pending-proofs')}
          >
            {t('pendingProofs.open')} ({proofPendingCount})
          </button>
        ) : null}

        {/* Spec 189 T9.2: o que foi feito sem rede, sem sessão, sobe só com a confirmação do dono */}
        {driverTrip.unverifiedPending === undefined ? null : (
          <DriverUnverifiedPendingNotice
            count={driverTrip.unverifiedPending.count}
            firstRecordedAt={driverTrip.unverifiedPending.firstRecordedAt}
            onConfirm={() => void driverTrip.confirmUnverifiedPending()}
            onDiscard={() => void driverTrip.discardUnverifiedPending()}
          />
        )}

        {/* ADR-0075 §8: a fila de outra conta neste celular nunca sai com o token desta */}
        {driverTrip.foreignPendingCount > 0 ? (
          <DriverForeignPendingNotice
            count={driverTrip.foreignPendingCount}
            onDiscard={() => void driverTrip.discardForeignPending()}
          />
        ) : null}

        {/* A tela diz a verdade: o que está na fila aparece como aguardando, nunca como enviado */}
        {driverTrip.queuedCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => navigateToDriverSection('queue')}
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
            onClick={() => navigateToDriverSection('queue')}
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
                deliverActivityByDocumentId={deliverActivityByDocumentId}
                isCurrent={stop.id === currentStopId}
                isFieldWorkBlocked={isTripAwaitingDispatch}
                isOpen={stopExpansion.isOpen(stop.id)}
                key={stop.id}
                lastKnownLocation={lastKnownLocation}
                queueView={driverTrip.queueView}
                returnActivityByDocumentId={returnActivityByDocumentId}
                stop={stop}
                stopOccurrenceActivity={stopOccurrenceActivityByStopId.get(stop.id)}
                onArrive={(stopId) =>
                  void report((location) => ({
                    idempotencyKey: createIdempotencyKey(),
                    kind: 'arrive',
                    location,
                    stopId,
                  }))
                }
                onDeliver={deliverDocument}
                onProof={handleProof}
                onProofFieldsUpdate={handleProofFieldsUpdate}
                onRemoveProof={handleRemoveProof}
                occurrenceTypes={occurrenceTypes}
                onRetryOccurrenceTypes={handleRetryOccurrenceTypes}
                onToggle={() => stopExpansion.toggle(stop.id)}
                onDocumentOccurrence={(input: {
                  documentId: string
                  occurrenceTypeId: string
                  productCode: string
                }) =>
                  getDriverTripClient()
                    .registerDocumentOccurrence(input)
                    .then(() => true)
                    .catch(() => {
                      setOccurrenceFailed(true)
                      return false
                    })
                }
                onOccurrence={reportStopOccurrence}
                notDeliveredStatusByDocumentId={notDeliveredStatusByDocumentId}
                onNotDelivered={(input) => void reportNotDelivered(input)}
              />
            ))}
          </ul>
        )}
      </main>
      <DriverBottomBar
        section={section}
        onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
      />
    </div>
  )
}

/**
 * Spec 179 P3: a lista da API, e a última boa do mesmo dono quando ela falha — sem sinal, "Não
 * entreguei" continua pedindo o tipo e a foto.
 */
async function loadOccurrenceTypes(subHash: string): Promise<DriverOccurrenceTypesState> {
  const storage = resolveOccurrenceTypesStorage()
  const result = await getDriverTripClient().listOccurrenceTypes()
  if (result.status === 'loaded')
    saveCachedOccurrenceTypes({ storage, subHash, types: result.types })
  return resolveOccurrenceTypesWithCache({
    cached: readCachedOccurrenceTypes({ storage, subHash }),
    result,
  })
}
