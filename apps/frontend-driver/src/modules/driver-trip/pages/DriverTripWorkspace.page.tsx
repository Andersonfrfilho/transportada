/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverBottomBar, type DriverSection } from '../components/DriverBottomBar.component'
import { DriverForeignPendingNotice } from '../components/DriverForeignPendingNotice.component'
import { DriverHelperNotice } from '../components/DriverHelperNotice.component'
import { DriverLoadSheet } from '../components/DriverLoadSheet.component'
import { DriverLocationSharingIndicator } from '../components/DriverLocationSharingIndicator.component'
import { DriverManifestCard } from '../components/DriverManifestCard.component'
import { DriverProofOutcomeNotice } from '../components/DriverProofOutcomeNotice.component'
import { DriverShellHeader } from '../components/DriverShellHeader.component'
import { DriverStopCard, type DriverProofAttachment } from '../components/DriverStopCard.component'
import { DriverTripAutoSwitchNotice } from '../components/DriverTripAutoSwitchNotice.component'
import { DriverTripProgress } from '../components/DriverTripProgress.component'
import { DriverTripReassignedNotice } from '../components/DriverTripReassignedNotice.component'
import { DriverTripSelector } from '../components/DriverTripSelector.component'
import { DriverStalePendingNotice } from '../components/DriverStalePendingNotice.component'
import { DriverUnverifiedPendingNotice } from '../components/DriverUnverifiedPendingNotice.component'
import { useDriverSession } from '../hooks/useDriverSession.hook'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { useGeolocationPermission } from '../hooks/useGeolocationPermission.hook'
import { useLocationSharing } from '../hooks/useLocationSharing.hook'
import { useSelectedDriverTrip } from '../hooks/useSelectedDriverTrip.hook'
import { useStopExpansion } from '../hooks/useStopExpansion.hook'
import { DriverEventQueuePage } from './DriverEventQueue.page'
import { DriverPendingProofsPage } from './DriverPendingProofs.page'
import { DriverProfilePage } from './DriverProfile.page'
import {
  navigateToDriverSection,
  resolveDriverRouteSection,
  subscribeDriverRoute,
} from '@/modules/shared/driverRoute.service'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import { canReportOnTrip } from '../shared/tripCrewRole.service'
import { resolveStalePending } from '../shared/stalePending.service'
import { describeTripSelectorPath } from '../shared/driverTripSelection.service'
import {
  resolveDocumentActivityStatus,
  type DocumentActivityView,
  type DocumentReturnActivityView,
  type TappedStopReport,
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
import { buildDocumentOccurrenceReport } from '../shared/documentOccurrenceReport.service'
import type { OccurrenceRegistrationHandlers } from '../shared/occurrenceDispatch.service'
import {
  readCachedOccurrenceTypes,
  resolveOccurrenceTypesStorage,
  resolveOccurrenceTypesWithCache,
  saveCachedOccurrenceTypes,
} from '../shared/occurrenceTypesCache.service'
import { createIdempotencyKey } from '../shared/offlineQueue.service'
import { buildStopOccurrenceReports } from '../shared/stopOccurrencePhoto.service'
import { formatShortTripId, formatTripCreatedAt } from '../shared/tripIdentifier.service'
import {
  filterStopsBySearchTerm,
  findCurrentStop,
  findProofDocumentLabel,
  isAwaitingDispatch,
  resolveDispatchState,
  listProofPendingDocuments,
  type ProofDocumentLabel,
} from '../shared/driverTripView.service'
import {
  canReportArrival,
  canStartRouteAtStop,
  resolveEnRouteStopId,
} from '../shared/enRouteStop.service'
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
  const [searchTerm, setSearchTerm] = useState('')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [proofFailed, setProofFailed] = useState(false)
  /** Spec 082 D6: teto da fila de anexos atingido — anunciado antes de qualquer descarte. */
  const [attachmentLimit, setAttachmentLimit] = useState<'count-limit' | 'size-limit' | undefined>(
    undefined,
  )
  /**
   * A ocorrência que falha **não** muda o estado da nota — ao contrário de entregar e devolver. O
   * aviso diz isso, e repetir o toque é o conserto.
   */
  /** Spec 082 (revisão): teto tipado da fila de EVENTOS — recusa anunciada, nada descartado. */
  const [eventLimitReached, setEventLimitReached] = useState(false)
  /** Spec 209 (D3): a foto do "Deu problema" não coube — o relato entrou sem ela, e a tela diz. */
  const [occurrencePhotoDropped, setOccurrencePhotoDropped] = useState(false)
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
  /** O toque de parada ou nota que a tela fez — segura o botão no estado novo depois que a fila o apaga. */
  const [tappedReports, setTappedReports] = useState<readonly TappedStopReport[]>([])
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
  const { autoSwitchedTripId, selectTrip, trip } = useSelectedDriverTrip(snapshot?.trips ?? [])
  /** RF15: roda em qualquer seção, porque o que conta é a app estar na tela, não a aba aberta. */
  /** Spec 243 RF-3: o ajudante não reporta, então a posição dele nunca sobe — a API recusaria. */
  const reportableTrips = (snapshot?.trips ?? []).filter(canReportOnTrip)
  const locationSharingStatus = useLocationSharing(reportableTrips)
  /** Spec 234 D4d: o cartão da parada avisa antes do "Entreguei" quando a localização está negada. */
  const isLocationDenied = useGeolocationPermission()
  /**
   * Spec 206 D9: a parada a caminho, aplicando por cima os toques ainda na fila — sempre local e
   * imediato, funciona sem sinal (`enRouteStop.service.ts`).
   */
  const enRouteStopId =
    trip === undefined
      ? undefined
      : resolveEnRouteStopId({
          queueView: driverTrip.queueView,
          sentReportKeys: driverTrip.sentReportKeys,
          stops: trip.stops,
          tappedReports,
        })
  /** Pedido do usuário (25/09): a parada atual abre sozinha — agora é a que está a caminho (D9). */
  const currentStopId =
    trip === undefined ? undefined : findCurrentStop({ enRouteStopId, trip })?.id
  const stopExpansion = useStopExpansion(currentStopId)
  const visibleStops = trip === undefined ? [] : filterStopsBySearchTerm(trip.stops, searchTerm)
  /**
   * Spec 206 D6: o alvo do atalho "Ir para a parada N" — rola até o cabeçalho da parada a caminho e
   * põe o foco nele (`scrollTo` + `focus()`, `web.md` §11.3). Um `Map` porque o registro é por
   * `stopId`, e as paradas somem/reaparecem quando o motorista troca de viagem.
   */
  const stopHeaderRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  function registerStopHeaderRef(stopId: string, element: HTMLButtonElement | null): void {
    if (element === null) stopHeaderRefs.current.delete(stopId)
    else stopHeaderRefs.current.set(stopId, element)
  }

  function focusStop(stopId: string): void {
    const wasClosed = !stopExpansion.isOpen(stopId)
    if (wasClosed) stopExpansion.toggle(stopId)
    // A parada fechada abre nesta mesma passada de estado — o scroll/foco espera o React desenhar
    // o corpo dela antes de medir a posição, senão mira no cartão ainda recolhido.
    requestAnimationFrame(() => {
      const element = stopHeaderRefs.current.get(stopId)
      if (element === null || element === undefined) return
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus()
    })
  }

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
          {...(enRouteStopId === undefined ? {} : { enRouteStopId })}
          isLoading={driverTrip.isQueueLoading}
          isSyncing={driverTrip.isSyncing}
          items={driverTrip.queueView}
          lastSyncedAtMs={driverTrip.lastSyncedAtMs}
          onBack={() => window.history.back()}
          onDiscard={(idempotencyKey) => void driverTrip.discardRejected(idempotencyKey)}
          onFocusStop={focusStop}
          onSendAll={() => driverTrip.sendAllNow()}
          onSendOne={(idempotencyKey) => driverTrip.sendNow(idempotencyKey)}
          stops={trip?.stops ?? []}
        />
        <DriverBottomBar
          section={section}
          onSelect={(next) => navigateToDriverSection(next === 'profile' ? 'profile' : 'trip')}
        />
      </div>
    )
  }

  /** Spec 218: devolve ao formulário se o anexo entrou na fila — recusado, ele não marca "anexada". */
  async function handleProof(input: DriverProofAttachment): Promise<boolean> {
    setAttachmentLimit(undefined)
    /* Guardado no toque: depois do envio a nota sai de `pendingProofs` e o nome some junto. */
    const label = findProofDocumentLabel({ documentId: input.documentId, snapshot })
    if (label !== undefined) {
      setProofLabelByDocumentId((current) => new Map(current).set(input.documentId, label))
    }
    try {
      const outcome = await driverTrip.attachProof(input)
      if (outcome === 'count-limit' || outcome === 'size-limit') setAttachmentLimit(outcome)
      return outcome === 'queued'
    } catch {
      setProofFailed(true)
      return false
    }
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

  /** Spec 218: "Cancelar" o gate — o canhoto daquela nota não espera mais uma entrega que não vem. */
  function handleDiscardProofAwaitingDelivery(documentId: string): void {
    void driverTrip.discardProofAwaitingDelivery(documentId)
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
      rememberTappedReport({
        documentId: input.documentId,
        idempotencyKey: returnReport.idempotencyKey,
        kind: 'return',
        queuedAt: at,
      })
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
  const stalePending = resolveStalePending({ items: driverTrip.queueView, nowMs: Date.now() })

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
    rememberTappedReport({
      documentId: input.documentId,
      idempotencyKey,
      kind: 'deliver',
      queuedAt: new Date().toISOString(),
    })
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
  async function reportStopOccurrence(
    input: Parameters<OccurrenceRegistrationHandlers['reportStopOccurrence']>[0],
  ): Promise<void> {
    const reports = buildStopOccurrenceReports({
      createKey: createIdempotencyKey,
      description: input.description,
      occurrenceTypeId: input.occurrenceTypeId,
      photo: input.photo,
      stopId: input.stopId,
    })
    const occurrenceKey = reports[0]?.idempotencyKey ?? ''
    setOccurrencePhotoDropped(false)
    setAttachmentLimit(undefined)
    /** Spec 218: foto obrigatória nunca é derrubada — sem espaço, o toque inteiro volta, e a tela diz. */
    const outcome = input.isPhotoRequired
      ? await driverTrip.reportAllOrNothing(reports)
      : await driverTrip.reportStopOccurrence(reports)
    if (outcome === 'count-limit') setEventLimitReached(true)
    if (outcome === 'size-limit') setAttachmentLimit('size-limit')
    if (outcome === 'photo-dropped') setOccurrencePhotoDropped(true)
    if (outcome !== 'queued' && outcome !== 'photo-dropped') return
    setStopOccurrenceKeyByStopId((current) =>
      new Map(current).set(input.stopId, { at: new Date().toISOString(), key: occurrenceKey }),
    )
  }

  /** Spec 218 D3 + 226: a ocorrência de nota — o item da 179, que sobe a foto (se há) antes do registro. */
  async function reportDocumentOccurrence(
    input: Parameters<OccurrenceRegistrationHandlers['enqueueDocumentOccurrence']>[0],
  ): Promise<void> {
    setAttachmentLimit(undefined)
    const report = buildDocumentOccurrenceReport({
      idempotencyKey: createIdempotencyKey(),
      occurrence: input,
    })
    const outcome = await driverTrip.reportAllOrNothing([report])
    if (outcome === 'count-limit') setEventLimitReached(true)
    if (outcome === 'size-limit') setAttachmentLimit('size-limit')
    if (outcome !== 'queued') return
    setNotDeliveredKeyByDocumentId((current) =>
      new Map(current).set(input.documentId, report.idempotencyKey),
    )
  }

  /**
   * Spec 230: o despacho entra na fila como qualquer toque de campo — sem sinal fica como pendência de
   * envio e sobe sozinho (ou pelo envio manual). Quando sobe, o snapshot novo abre as ações de campo.
   */
  function dispatchTrip(tripId: string): void {
    void report((location) => ({
      idempotencyKey: createIdempotencyKey(),
      kind: 'dispatch',
      location,
      tripId,
    }))
  }

  function rememberTappedReport(tappedReport: TappedStopReport): void {
    setTappedReports((current) => [...current, tappedReport])
  }

  function arriveAtStop(stopId: string): void {
    const idempotencyKey = createIdempotencyKey()
    rememberTappedReport({
      idempotencyKey,
      kind: 'arrive',
      queuedAt: new Date().toISOString(),
      stopId,
    })
    void report((location) => ({ idempotencyKey, kind: 'arrive', location, stopId }))
  }

  /** Spec 206 D6/D1: o toque nasce com a hora dele — é ela, não a do envio, que decide quem chegou primeiro (D3). */
  function departStop(stopId: string): void {
    const tappedAt = new Date().toISOString()
    const idempotencyKey = createIdempotencyKey()
    rememberTappedReport({ idempotencyKey, kind: 'depart', queuedAt: tappedAt, stopId })
    void report((location) => ({
      idempotencyKey,
      kind: 'depart',
      location,
      stopId,
      tappedAt,
    }))
  }

  /** Spec 206 D18: desfaz o "Iniciar rota" desta parada — libera as outras na hora, sem sinal. */
  function cancelStopDeparture(stopId: string): void {
    const tappedAt = new Date().toISOString()
    const idempotencyKey = createIdempotencyKey()
    rememberTappedReport({ idempotencyKey, kind: 'cancelDeparture', queuedAt: tappedAt, stopId })
    void report((location) => ({
      idempotencyKey,
      kind: 'cancelDeparture',
      location,
      stopId,
      tappedAt,
    }))
  }

  /**
   * Spec 230: o despacho na fila destrava as ações de campo — ele sobe antes de tudo que vier depois
   * (a fila é em ordem), então o motorista segue trabalhando sem sinal. Recusado volta ao botão.
   */
  const dispatchItems = driverTrip.queueView.filter(
    (item) => item.kind === 'dispatch' && item.tripId === trip?.id,
  )
  const isDispatchQueued = dispatchItems.some((item) => item.status.state !== 'rejected')
  const isDispatchRejected = dispatchItems.some((item) => item.status.state === 'rejected')
  const dispatchState =
    trip === undefined ? undefined : resolveDispatchState({ isDispatchQueued, trip })
  const isTripAwaitingDispatch = dispatchState?.isAwaiting ?? false
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
            <p className={styles.vehicle}>
              {t('vehicle', { plate: trip.vehiclePlate })}
              {/*
               * Pedido do usuário (01/10): o identificador curto da viagem, o MESMO que a listagem
               * do escritório mostra — é por ele que motorista e escritório falam da mesma viagem
               * ao telefone (`tripIdentifier.service.ts`). Rotulado: sem a palavra "Viagem" o
               * código cola na placa e se lê como parte dela (visto no print da revisão).
               */}
              <span className={styles.tripCodeLabel}>{t('tripCodeLabel')}</span>
              <code className={styles.tripCode}>{formatShortTripId(trip.id)}</code>
              {/*
               * Copia o id INTEIRO, como a listagem do escritório: o recorte é para ler na tela, e
               * o que o escritório procura é o id completo — mandar os 8 pelo WhatsApp obrigaria
               * alguém a adivinhar o resto.
               */}
              <CopyButton
                copiedLabel={t('tripCodeCopied')}
                label={t('tripCodeCopy')}
                value={trip.id}
              />
            </p>
          )}
          {/* Pedido do usuário (02/10): de quando é esta viagem — o código curto não diz a data. */}
          {trip === undefined || formatTripCreatedAt(trip.createdAt) === '' ? null : (
            <p className={styles.tripCreatedAt}>
              {t('tripCreatedAt', { date: formatTripCreatedAt(trip.createdAt) })}
            </p>
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

        {trip !== undefined && autoSwitchedTripId === trip.id ? (
          <DriverTripAutoSwitchNotice
            onDismiss={() => selectTrip(trip.id)}
            path={describeTripSelectorPath(trip).path}
          />
        ) : null}

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

        {trip === undefined || canReportOnTrip(trip) ? null : <DriverHelperNotice />}

        {trip === undefined ? null : <DriverTripProgress trip={trip} />}

        {/* Spec 082 (revisão): viagem `route_planned` só abre as ações depois de iniciar o trajeto */}
        {dispatchState?.canDispatch === true && trip !== undefined ? (
          <div className={styles.actions}>
            <Button onClick={() => dispatchTrip(trip.id)} type="button">
              <Icon name="check" />
              {t('dispatch.start')}
            </Button>
            <p className={styles.stopMeta}>{t('dispatch.waiting')}</p>
          </div>
        ) : null}
        {/* Spec 230: o despacho ficou na fila — a tela diz que ainda não chegou ao servidor */}
        {isDispatchQueued && trip !== undefined && isAwaitingDispatch(trip) ? (
          <p className={styles.stopMeta} role="status">
            <Icon name="clock" />
            {t('dispatch.queued')}
          </p>
        ) : null}
        {isDispatchRejected ? (
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

        {/* Spec 217 (RF8, D6): a viagem que estava aqui e sumiu — reatribuição ou volta a draft */}
        {driverTrip.hasReassignedTripNotice ? (
          <DriverTripReassignedNotice onDismiss={driverTrip.dismissReassignedTripNotice} />
        ) : null}

        {/* Spec 229: parado há mais de um dia — o app só envia aberto, e nada sai da fila por idade */}
        {stalePending === undefined ? null : (
          <DriverStalePendingNotice
            count={stalePending.count}
            oldestQueuedAt={stalePending.oldestQueuedAt}
            onOpenQueue={() => navigateToDriverSection('queue')}
          />
        )}

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

        {trip === undefined || trip.stops.length === 0 ? null : (
          <div className={styles.stopSearch} role="search">
            <Icon aria-hidden="true" name="search" />
            <input
              aria-label={t('search.placeholder')}
              placeholder={t('search.placeholder')}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {/*
              A etiqueta da nota traz a chave de 44 dígitos em Code128 (e a NFC-e em QR): ler com a
              câmera é digitar a chave inteira sem errar um dígito no caminhão.
            */}
            <Button
              aria-label={t('search.scanTrigger')}
              className={styles.stopSearchScan}
              onClick={() => setIsScannerOpen(true)}
              type="button"
              variant="ghost"
            >
              <Icon name="camera" />
            </Button>
          </div>
        )}

        <BarcodeScanner
          closeLabel={t('search.scanClose')}
          deniedMessage={t('search.scanDenied')}
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onRead={(text) => {
            setSearchTerm(text)
            setIsScannerOpen(false)
          }}
          readingMessage={t('search.scanReading')}
          startingMessage={t('search.scanStarting')}
          title={t('search.scanTitle')}
          unavailableMessage={t('search.scanUnavailable')}
        />

        {trip === undefined ? (
          snapshot?.isRegisteredDriver === false ? null : (
            <p>{t('noTrip')}</p>
          )
        ) : visibleStops.length === 0 ? (
          <p className={styles.stopSearchEmpty} role="status">
            {t('search.noResults')}
          </p>
        ) : (
          <ul className={styles.stopList}>
            {visibleStops.map((stop) => {
              const startRouteBlock = canStartRouteAtStop({ enRouteStopId, stopId: stop.id })
              const blockingStopSequence = startRouteBlock.enabled
                ? undefined
                : trip.stops.find((candidate) => candidate.id === startRouteBlock.blockingStopId)
                    ?.sequence
              return (
                <DriverStopCard
                  {...(blockingStopSequence === undefined ? {} : { blockingStopSequence })}
                  canReportArrival={canReportArrival({
                    enRouteStopId,
                    isLegacyEnRouteTracking: trip.isLegacyEnRouteTracking ?? false,
                    stop,
                  })}
                  canStartRoute={startRouteBlock}
                  deliverActivityByDocumentId={deliverActivityByDocumentId}
                  isCurrent={stop.id === currentStopId}
                  isEnRoute={stop.id === enRouteStopId}
                  isFieldWorkBlocked={isTripAwaitingDispatch}
                  isLocationDenied={isLocationDenied}
                  isOpen={stopExpansion.isOpen(stop.id)}
                  isReadOnly={!canReportOnTrip(trip)}
                  key={stop.id}
                  lastKnownLocation={lastKnownLocation}
                  queueView={driverTrip.queueView}
                  sentReportKeys={driverTrip.sentReportKeys}
                  tappedReports={tappedReports}
                  returnActivityByDocumentId={returnActivityByDocumentId}
                  stop={stop}
                  stopOccurrenceActivity={stopOccurrenceActivityByStopId.get(stop.id)}
                  onArrive={arriveAtStop}
                  onCancelDeparture={cancelStopDeparture}
                  onDeliver={deliverDocument}
                  onDepart={departStop}
                  onDiscardProofAwaitingDelivery={handleDiscardProofAwaitingDelivery}
                  onFocusStop={focusStop}
                  onHeaderRef={registerStopHeaderRef}
                  onProof={handleProof}
                  onProofFieldsUpdate={handleProofFieldsUpdate}
                  onRemoveProof={handleRemoveProof}
                  occurrenceTypes={occurrenceTypes}
                  onRetryOccurrenceTypes={handleRetryOccurrenceTypes}
                  onToggle={() => stopExpansion.toggle(stop.id)}
                  onQueuedDocumentOccurrence={(input) => void reportDocumentOccurrence(input)}
                  onStopOccurrence={(input) => void reportStopOccurrence(input)}
                  notDeliveredStatusByDocumentId={notDeliveredStatusByDocumentId}
                  onNotDelivered={(input) => void reportNotDelivered(input)}
                />
              )
            })}
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
