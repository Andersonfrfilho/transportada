/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import { DriverNotDeliveredForm } from './DriverNotDeliveredForm.component'
import { DriverNotDeliveredStatus } from './DriverNotDeliveredStatus.component'
import { DriverOccurrenceRegistrationForm } from './DriverOccurrenceRegistrationForm.component'
import { ProofCargoField } from './ProofCargoField.component'
import { ProofCrop } from './ProofCrop.component'
import { ProofImageLightbox } from './ProofImageLightbox.component'
import { SignaturePad } from './SignaturePad.component'
import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { useCaptureRegistration } from '../hooks/useCaptureRegistration.hook'
import { usePhotoPreviewUrl } from '../hooks/usePhotoPreviewUrl.hook'
import { useStoredProofThumbnail } from '../hooks/useStoredProofThumbnail.hook'
import { ProofUploadStatus } from './ProofUploadStatus.component'
import { useProofUploadStatus } from '../hooks/useProofUploadStatus.hook'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useTransientNotice } from '../hooks/useTransientNotice.hook'
import { describeDeliveryWindow } from '../shared/deliveryWindow.service'
import {
  formatActivityTime,
  isStopArrivalRecorded,
  stopHasOccurrenceMarker,
  type DocumentActivityStatus,
  type DocumentActivityView,
  type DocumentReturnActivityView,
  type TappedStopReport,
} from '../shared/documentActivity.service'
import { PROOF_FRAME_SIZE } from '../shared/proofUpload.constant'
import {
  isProofConfirmedByServer,
  resolveProofUploadObservation,
} from '../shared/proofUploadStatus.service'
import { formatDocumentAmount, formatDocumentWeight } from '../shared/driverDocumentFormat.service'
import { formatStopDistance } from '../shared/driverStopDistance.service'
import {
  type DriverDeliveryProofSettings,
  type DriverOccurrenceTypesState,
  type DriverReportedLocation,
  type DriverTripDocument,
  type DriverTripStop,
} from '../shared/driverTrip.types'
import {
  buildNavigationHref,
  countPendingDocuments,
  isDocumentSettled,
  isProofPendingWarningDue,
} from '../shared/driverTripView.service'
import type { StartRouteBlock } from '../shared/enRouteStop.service'
import {
  resolveQueuedProofAttachments,
  type EventQueueItemView,
} from '../shared/eventQueueView.service'
import { canOfferLateRegistration } from '../shared/lateRegistration.service'
import type { NotDeliveredDraft, NotDeliveredStatus } from '../shared/notDelivered.service'
import type { OccurrenceRegistrationHandlers } from '../shared/occurrenceRegistration.service'
import {
  applyRecipientShortcut,
  buildReceiverFields,
  countMissingCargoPhotos,
  listAllPendingFields,
  listMissingProofFields,
  listPendingReceiverFields,
  maskReceiverDocument,
  requiresProofBeforeDelivery,
  resolveProofFormPlan,
  type ProofFieldKey,
  type ProofFormPlan,
  type ProofFormValues,
} from '../shared/proofFormPlan.service'
import { RECEIVED_BY_DETAIL_MAX_LENGTH, RECEIVED_BY_OPTIONS } from '../shared/receivedBy.constant'
import { isSignatureCaptureSupported } from '../shared/signatureCapture.service'
import styles from '../styles/driverTrip.module.css'

const ACTIVITY_ICON: Readonly<Record<DocumentActivityStatus, IconName>> = {
  queued: 'clock',
  rejected: 'alert',
  sent: 'check',
}

const ACTIVITY_CLASS: Readonly<Record<DocumentActivityStatus, string>> = {
  queued: styles.activityStatusQueued ?? '',
  rejected: styles.activityStatusRejected ?? '',
  sent: styles.activityStatusSent ?? '',
}

/**
 * A linha que fica depois do toque — pedido do usuário (25/09): "registrei... e nada aconteceu?".
 * Ícone e cor acompanham o texto (que carrega o sentido), igual a `DriverNotDeliveredStatus`.
 */
function ActivityStatusLine({
  status,
  text,
}: Readonly<{ status: DocumentActivityStatus; text: string }>) {
  return (
    <p className={`${styles.activityStatus} ${ACTIVITY_CLASS[status]}`} role="status">
      <Icon aria-hidden="true" name={ACTIVITY_ICON[status]} size="sm" />
      {text}
    </p>
  )
}

/** Sem hora marcada o agendamento ainda está sendo pedido — e dizer isso é melhor que uma data vazia. */
function formatScheduleTime(scheduledAt: string | null): string {
  if (scheduledAt === null) return '—'
  return new Date(scheduledAt).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })
}

const DELIVERY_WINDOW_KEYS = {
  between: 'deliveryWindow.between',
  from: 'deliveryWindow.from',
  until: 'deliveryWindow.until',
} as const

export type DriverProofAttachment = Readonly<{
  /**
   * Spec 207: gerado aqui (não no hook) para a tela já saber a própria chave — é o que permite
   * "Remover" alcançar só este item, nunca todo anexo desta nota (spec 211 traz mais de um).
   */
  attachmentKey?: string
  /** Spec 218 (RF-A3): colhido no gate, antes da entrega — a fila o segura até ela entrar. */
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

/** Spec 203/193: o mesmo conjunto de campos de `DriverProofAttachment`, sem o arquivo — só a atualização tardia. */
export type DriverProofFieldsUpdate = Readonly<{
  documentId: string
  receivedBy?: string
  receivedByDetail?: string
  receiverDocument?: string
  receiverName?: string
}>

type DriverStopCardProps = Readonly<{
  /**
   * Spec 206 D9: o número da parada bloqueante — o cartão só tem a própria parada, nunca a lista
   * inteira; sem isto o motivo não teria "N" para nomear (D6).
   */
  blockingStopSequence?: number
  /** Spec 206 D6/D9: pode ficar em branco (bloqueado, com o atalho) ou liberado, sem escolher UI. */
  canStartRoute: StartRouteBlock
  /** Pedido do usuário (25/09): "entrega guardada" — o retorno de fila da entrega. */
  deliverActivityByDocumentId: ReadonlyMap<string, DocumentActivityView>
  /** Spec 206 D6: "Cheguei" só aparece aqui — parada a caminho, ou qualquer uma na API antiga (D17). */
  canReportArrival: boolean
  isCurrent: boolean
  /** Spec 206 D9: esta é a parada com o "Iniciar rota" ativo — mostra o selo e "Cancelar rota". */
  isEnRoute: boolean
  /**
   * Spec 082 (revisão): viagem `route_planned` chega à tela, mas as ações de campo ficam trancadas
   * até o motorista iniciar o trajeto — a API recusa essas escritas, e a fila offline não pode
   * acumular eventos condenados.
   */
  isFieldWorkBlocked: boolean
  /**
   * Spec 243 RF-3: o ajudante acompanha a viagem, não reporta — a API recusa (`trip.report`) todo
   * toque de campo dele, então o cartão fica só de leitura e nada chega à fila.
   */
  isReadOnly?: boolean
  /** Spec 234 D4d: a permissão de localização do aparelho está negada — só avisa antes do "Entreguei". */
  isLocationDenied: boolean
  /** Pedido do usuário (25/09): a atual abre sozinha e destacada; as outras ficam fechadas. */
  isOpen: boolean
  /** Spec 082 D2: a última posição conhecida — sem ela, a distância simplesmente não aparece. */
  lastKnownLocation: DriverReportedLocation | null
  onArrive: (stopId: string) => void
  /** Spec 206 D18: desfaz o "Iniciar rota" desta parada — só existe enquanto ela está a caminho. */
  onCancelDeparture: (stopId: string) => void
  onDeliver: (input: { documentId: string; lateRegistration: boolean }) => void
  /** Spec 206 D6: "Iniciar rota" desta parada — a API recebe a hora do TOQUE, não a do envio. */
  onDepart: (stopId: string) => void
  /**
   * Spec 206 D6: o atalho do motivo de bloqueio — rola até o cartão da parada a caminho e põe o
   * foco nele (`scrollTo` + `focus()`, `web.md` §11.3). Nunca inicia nada: só leva até lá.
   */
  onFocusStop: (stopId: string) => void
  /** Spec 206: o cabeçalho se registra aqui — é o alvo do `scrollTo`/`focus()` de `onFocusStop`. */
  onHeaderRef: (stopId: string, element: HTMLButtonElement | null) => void
  /** Spec 218 D3 + 226: ocorrência de nota, com ou sem foto — o item `documentOccurrence` da fila. */
  onQueuedDocumentOccurrence: OccurrenceRegistrationHandlers['enqueueDocumentOccurrence']
  occurrenceTypes: DriverOccurrenceTypesState
  onProof: (input: DriverProofAttachment) => Promise<boolean>
  /** Spec 203: campo do recebedor preenchido depois do anexo já estar na fila — atualiza o mesmo item. */
  onProofFieldsUpdate?: (input: DriverProofFieldsUpdate) => void
  /** Spec 207: "Remover" a foto/assinatura do canhoto — só cabe com o anexo ainda na fila. */
  onRemoveProof?: (documentId: string) => void
  /** Spec 218: "Cancelar" o gate — o canhoto colhido para aquela nota não espera mais a entrega. */
  onDiscardProofAwaitingDelivery: (documentId: string) => void
  /** Spec 209 + 218 D2: a ocorrência de parada, com o tipo do catálogo e a foto dela. */
  onStopOccurrence: OccurrenceRegistrationHandlers['reportStopOccurrence']
  /** Spec 179: "Não entreguei" — ocorrência com foto e devolução, no mesmo toque. */
  onNotDelivered: (input: {
    documentId: string
    draft: NotDeliveredDraft
    lateRegistration: boolean
  }) => void
  /** Pedido do usuário (25/09): o toque no cabeçalho abre/fecha — o aberto vem da página, derivado. */
  onToggle: () => void
  /** Spec 179 RF5: por nota, "na fila" / "enviado" / "recusado" da ocorrência com foto. */
  notDeliveredStatusByDocumentId: ReadonlyMap<string, NotDeliveredStatus>
  /**
   * Pedido do usuário (25/09): "Cheguei" libera a entrega — a mesma fila que o resto do cartão lê,
   * só para saber se ESTA parada já tem uma chegada, na hora, mesmo sem o servidor ter confirmado.
   */
  queueView: readonly EventQueueItemView[]
  /** O que o servidor aceitou nesta sessão, e os toques que a tela fez — seguram "Cheguei" depois que a fila esvazia. */
  sentReportKeys: ReadonlySet<string>
  tappedReports: readonly TappedStopReport[]
  /** Pedido do usuário (25/09): "devolvida às HH:MM — motivo", com o mesmo retorno de fila. */
  returnActivityByDocumentId: ReadonlyMap<string, DocumentReturnActivityView>
  /** Spec 157 RF5: o toque em "Tentar de novo" no painel de ocorrência da nota. */
  onRetryOccurrenceTypes: () => void
  stop: DriverTripStop
  /** Pedido do usuário (25/09): "ocorrência registrada às HH:MM · na fila/enviada" do "Deu problema". */
  stopOccurrenceActivity: DocumentActivityView | undefined
}>

export function DriverStopCard({
  blockingStopSequence,
  canReportArrival,
  canStartRoute,
  deliverActivityByDocumentId,
  isCurrent,
  isEnRoute,
  isFieldWorkBlocked,
  isLocationDenied,
  isOpen,
  isReadOnly = false,
  lastKnownLocation,
  notDeliveredStatusByDocumentId,
  onArrive,
  onCancelDeparture,
  onDeliver,
  onDepart,
  onDiscardProofAwaitingDelivery,
  onFocusStop,
  onHeaderRef,
  occurrenceTypes,
  onNotDelivered,
  onProof,
  onQueuedDocumentOccurrence,
  onProofFieldsUpdate,
  onRemoveProof,
  onRetryOccurrenceTypes,
  onStopOccurrence,
  onToggle,
  queueView,
  returnActivityByDocumentId,
  sentReportKeys,
  stop,
  stopOccurrenceActivity,
  tappedReports,
}: DriverStopCardProps) {
  const { t } = useTranslation('driverTrip')
  const [isConfirmingCancelDeparture, setIsConfirmingCancelDeparture] = useState(false)
  /** Pedido do usuário (25/09): quem registra vê — um aviso que some sozinho, perto do que ele tocou. */
  const { announce, notice } = useTransientNotice()
  /**
   * Pedido do usuário (25/09): "Registrar entrega depois" — escape hatch de quem não tocou
   * "Cheguei" na hora. Vale só para ESTA parada, e só no estado da página (nunca `localStorage`):
   * o `key={stop.id}` do `.map()` que monta o cartão já dá o "por stopId" de graça.
   */
  const [isLateRegistration, setIsLateRegistration] = useState(false)
  const [isConfirmingLateRegistration, setIsConfirmingLateRegistration] = useState(false)
  const isCompleted = stop.completedAt !== null
  const areFieldActionsHidden = isFieldWorkBlocked || isReadOnly
  /** Spec 206 D9: `enRouteTappedAt` (hora do toque) é a âncora; `enRouteSince` é a reserva. */
  const enRouteAnchor = stop.enRouteTappedAt ?? stop.enRouteSince ?? undefined
  const distanceLabel = formatStopDistance({ location: lastKnownLocation, stop })
  const deliveryWindow = describeDeliveryWindow({
    end: stop.deliveryWindowEnd,
    start: stop.deliveryWindowStart,
  })
  const bodyId = useId()
  const stopChipView = isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'
  const documentIdsWithOccurrence = new Set(
    stop.documents
      .filter((document) => notDeliveredStatusByDocumentId.get(document.id) !== undefined)
      .map((document) => document.id),
  )
  const hasOccurrenceMarker = stopHasOccurrenceMarker({
    documentIds: stop.documents.map((document) => document.id),
    documentOccurrenceIds: documentIdsWithOccurrence,
    stopOccurrenceKey: stopOccurrenceActivity === undefined ? undefined : 'present',
  })
  /** Pedido do usuário (25/09): "Cheguei" libera a entrega — no toque, na hora, mesmo sem sinal. */
  const isArrivalRecorded = isStopArrivalRecorded({
    arrivedAt: stop.arrivedAt,
    queueView,
    sentReportKeys,
    stopId: stop.id,
    tappedReports,
  })
  const canActOnDocuments = isArrivalRecorded || isLateRegistration
  const offersLateRegistration = canOfferLateRegistration({ canActOnDocuments, stop })

  function handleConfirmLateRegistration(): void {
    setIsLateRegistration(true)
    setIsConfirmingLateRegistration(false)
  }

  /**
   * Spec 218 (RF-A5): as três rotas do botão único. Cada uma avisa perto da nota tocada — a de
   * parada também, porque é dali que o motorista registrou (D4).
   */
  const occurrenceHandlers: OccurrenceRegistrationHandlers = {
    enqueueDocumentOccurrence: (input) => {
      onQueuedDocumentOccurrence(input)
      announce(input.documentId, t('activity.toast.documentOccurrence'))
    },
    reportStopOccurrence: (input) => {
      onStopOccurrence(input)
      announce(stop.id, t('activity.toast.occurrence'))
    },
  }

  return (
    <li
      className={`${styles.stop} ${isCurrent ? styles.stopCurrent : ''} ${isCompleted ? styles.stopDone : ''}`}
    >
      {/* Padrão WAI-ARIA de acordeão: o `<h2>` embrulha o botão, nunca o inverso (heading não é
          conteúdo de frase — não pode morar dentro de um `<button>`). */}
      <h2 className={styles.stopLabel}>
        <button
          aria-controls={bodyId}
          aria-expanded={isOpen}
          className={styles.stopHeader}
          onClick={onToggle}
          ref={(element) => onHeaderRef(stop.id, element)}
          type="button"
        >
          {/* Só a seta fica à direita: os selos na mesma linha espremiam o endereço em uma coluna. */}
          <span className={styles.stopHeaderTop}>
            <span className={styles.stopHeaderTitle}>
              <span className={styles.stopMeta}>{t('stopTitle', { sequence: stop.sequence })}</span>
              {/*
              Pedido do usuário (02/10): a parada se identifica pela nota, e ela estava só dentro da
              expansão — para saber de qual entrega era o cartão, era preciso abrir cada um.
            */}
              <span className={styles.stopNotes}>
                {stop.documents.map((document) => (
                  <span className={styles.stopNote} key={document.id}>
                    <span className={styles.stopNoteTitle}>
                      <Icon aria-hidden="true" name="invoice" size="sm" />
                      {t('loadSheet.note', { number: document.number, series: document.series })}
                    </span>
                    <span className={styles.stopNoteAmount}>
                      {formatDocumentAmount(document.totalAmount)}
                    </span>
                    <span className={styles.stopNoteRecipient}>
                      <Icon aria-hidden="true" name="organization" size="sm" />
                      {document.recipientName}
                    </span>
                  </span>
                ))}
              </span>
              <span className={styles.stopHeaderLabelText}>{stop.label}</span>
            </span>
            <Icon
              aria-hidden="true"
              className={`${styles.stopExpandIcon} ${isOpen ? styles.stopExpandIconOpen : ''}`}
              name="chevron-down"
            />
          </span>
          <span className={styles.stopChips}>
            <span
              className={`${styles.stopChip} ${stopChipView === 'current' ? styles.stopChipCurrent : ''} ${stopChipView === 'completed' ? styles.stopChipCompleted : ''}`}
            >
              {stopChipView === 'completed' ? (
                <Icon aria-hidden="true" name="check" size="sm" />
              ) : null}
              {t(`stopState.${stopChipView}`)}
            </span>
            {hasOccurrenceMarker ? (
              <span className={`${styles.stopChip} ${styles.stopChipOccurrence}`}>
                <Icon aria-hidden="true" name="alert" size="sm" />
                {t('activity.occurrenceMarker')}
              </span>
            ) : null}
            {isLateRegistration ? (
              <span className={`${styles.stopChip} ${styles.stopChipOccurrence}`}>
                <Icon aria-hidden="true" name="clock" size="sm" />
                {t('lateRegistration.badge')}
              </span>
            ) : null}
          </span>
          {/*
          Spec 060 D3: hora e protocolo **antes do endereço**. É o que o porteiro pede, e quem chega
          sem o número volta com a carga — o endereço ele já sabe, porque está lá.
        */}
          {stop.schedule === null ? null : (
            <span className={styles.stopSchedule}>
              {t('schedule.at', { time: formatScheduleTime(stop.schedule.scheduledAt) })}
              {stop.schedule.protocol === ''
                ? ''
                : ` · ${t('schedule.protocol', { protocol: stop.schedule.protocol })}`}
            </span>
          )}
          {/* RF13 (ADR-0075 §8): a janela vem junto da hora marcada — é o que decide se ele entra. */}
          {deliveryWindow === undefined ? null : (
            <span className={styles.stopSchedule}>
              {t(DELIVERY_WINDOW_KEYS[deliveryWindow.kind], deliveryWindow)}
            </span>
          )}
          <span className={styles.stopMeta}>
            {isCompleted
              ? t('stopCompleted')
              : t('documentsPending', { count: countPendingDocuments(stop) })}
          </span>
          {/* Spec 206: o selo "A caminho" — na hora, mesmo enquanto o toque ainda está na fila. */}
          {isEnRoute && !isArrivalRecorded ? (
            <span className={styles.stopStatus}>
              <span className={styles.stopEnRoute}>
                <Icon aria-hidden="true" name="workspace-driver-trip" size="sm" />
                {enRouteAnchor === undefined
                  ? t('enRoute.queued')
                  : t('enRoute.since', { time: formatActivityTime(enRouteAnchor) })}
              </span>
            </span>
          ) : null}
          {/* Status da parada no cabeçalho, não entre os botões: lá ele ficava solto e desalinhado */}
          {!isArrivalRecorded && distanceLabel === null ? null : (
            <span className={styles.stopStatus}>
              {!isArrivalRecorded ? null : (
                <span className={styles.stopArrived}>
                  <Icon aria-hidden="true" name="check" size="sm" />
                  {/* Sem hora do servidor a chegada ainda está na fila — o selo diz isso, não "às --:--". */}
                  {stop.arrivedAt === null
                    ? t('arrivedQueued')
                    : t('arrived', { time: formatActivityTime(stop.arrivedAt) })}
                </span>
              )}
              {/* Spec 082 D2: sem posição ou sem coordenada da parada, nada — nunca "0 km" */}
              {distanceLabel === null ? null : (
                <span className={styles.stopDistance}>{distanceLabel}</span>
              )}
            </span>
          )}
        </button>
      </h2>

      {notice === undefined ? null : (
        <p className={styles.activityNotice} role="status">
          <Icon aria-hidden="true" name="check" size="sm" />
          {notice.message}
        </p>
      )}

      <div className={styles.stopBody} hidden={!isOpen} id={bodyId}>
        <div className={styles.actions}>
          <Button
            // O botão abre o app de mapa que a pessoa já usa — navegar é delegar (ADR-0045 §8)
            onClick={() => window.open(buildNavigationHref(stop), '_blank', 'noopener,noreferrer')}
            type="button"
            variant="ghost"
          >
            <Icon name="link" />
            {t('navigate')}
          </Button>
          {/*
           * Trancado até o despacho: a API recusa `arrive`/`depart` fora de dispatched/in_transit.
           * Defeito medido (01/10): aqui se lia `stop.arrivedAt` cru, do servidor — o botão voltava
           * depois do toque e só sumia no refetch (até 30 s, ou mais sem sinal), e o motorista
           * tocava de novo. `isArrivalRecorded` é a mesma chegada que já libera as ações da parada:
           * conta o "Cheguei" ainda na fila.
           */}
          {areFieldActionsHidden || isArrivalRecorded ? null : canReportArrival ? (
            <Button onClick={() => onArrive(stop.id)} type="button">
              <Icon name="check" />
              {t('arrive')}
            </Button>
          ) : (
            <Button
              aria-disabled={!canStartRoute.enabled}
              disabled={!canStartRoute.enabled}
              onClick={() => onDepart(stop.id)}
              type="button"
            >
              <Icon aria-hidden="true" name="workspace-driver-trip" />
              {t('depart.start')}
            </Button>
          )}
        </div>

        {/*
         * Spec 206 D6 (Revisão 2): o "Iniciar rota" fica desabilitado e VISÍVEL — nunca escondido —
         * com o motivo em texto (não só `title`) e o atalho que rola até o cartão da parada aberta.
         * O atalho não inicia nada: ele só leva até lá (D6, D18).
         */}
        {!areFieldActionsHidden && !canStartRoute.enabled ? (
          <p className={styles.departBlocked} role="status">
            <Icon aria-hidden="true" name="alert" size="sm" />
            <span>
              {t('departBlocked.reason', { sequence: blockingStopSequence })}{' '}
              {t('departBlocked.hint')}
            </span>
            <button
              className={styles.departBlockedShortcut}
              onClick={() => onFocusStop(canStartRoute.blockingStopId)}
              type="button"
            >
              <Icon aria-hidden="true" name="link" size="sm" />
              {t('departBlocked.shortcut', { sequence: blockingStopSequence })}
            </button>
          </p>
        ) : null}

        {/* Spec 206 D18: só existe na parada a caminho, e some assim que o "Cheguei" chega. */}
        {!areFieldActionsHidden && isEnRoute && stop.arrivedAt === null ? (
          isConfirmingCancelDeparture ? (
            <div className={styles.cancelDepartureConfirm} role="alertdialog">
              <p>{t('cancelDeparture.confirmTitle', { sequence: stop.sequence })}</p>
              <p>{t('cancelDeparture.confirmBody')}</p>
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    onCancelDeparture(stop.id)
                    setIsConfirmingCancelDeparture(false)
                  }}
                  type="button"
                >
                  <Icon name="close" />
                  {t('cancelDeparture.confirm')}
                </Button>
                <Button
                  onClick={() => setIsConfirmingCancelDeparture(false)}
                  type="button"
                  variant="ghost"
                >
                  {t('cancelDeparture.back')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <Button
                onClick={() => setIsConfirmingCancelDeparture(true)}
                type="button"
                variant="ghost"
              >
                <Icon name="close" />
                {t('cancelDeparture.open')}
              </Button>
            </div>
          )
        ) : null}

        {isFieldWorkBlocked ? <p className={styles.stopMeta}>{t('dispatch.waiting')}</p> : null}

        {stopOccurrenceActivity === undefined ? null : (
          <ActivityStatusLine
            status={stopOccurrenceActivity.status}
            text={t(
              stopOccurrenceActivity.status === 'sent'
                ? 'activity.occurrenceSent'
                : stopOccurrenceActivity.status === 'rejected'
                  ? 'activity.occurrenceRejected'
                  : 'activity.occurrenceQueued',
              { time: formatActivityTime(stopOccurrenceActivity.at) },
            )}
          />
        )}

        <ul className={styles.documentList}>
          {stop.documents.map((document) => (
            <DocumentRow
              canActOnDocuments={canActOnDocuments}
              deliverActivity={deliverActivityByDocumentId.get(document.id)}
              document={document}
              isFieldWorkBlocked={isFieldWorkBlocked}
              isReadOnly={isReadOnly}
              isLocationDenied={isLocationDenied}
              isLateRegistration={isLateRegistration}
              key={document.id}
              notDeliveredStatus={notDeliveredStatusByDocumentId.get(document.id)}
              onAnnounce={(message) => announce(document.id, message)}
              onDeliver={onDeliver}
              onDiscardProofAwaitingDelivery={onDiscardProofAwaitingDelivery}
              occurrenceHandlers={occurrenceHandlers}
              occurrenceTypes={occurrenceTypes}
              onNotDelivered={onNotDelivered}
              onProof={onProof}
              {...(onProofFieldsUpdate === undefined ? {} : { onProofFieldsUpdate })}
              {...(onRemoveProof === undefined ? {} : { onRemoveProof })}
              onRetryOccurrenceTypes={onRetryOccurrenceTypes}
              queueView={queueView}
              returnActivity={returnActivityByDocumentId.get(document.id)}
              stop={stop}
            />
          ))}
        </ul>

        {/*
         * Pedido do usuário (25/09): quem não tocou "Cheguei" na hora ainda registra a entrega —
         * só na parada que ainda está travada e tem nota para agir. O aviso reduz a nota do
         * motorista de propósito: é o preço de pular a chegada, não um erro a esconder.
         */}
        {areFieldActionsHidden || !offersLateRegistration ? null : isConfirmingLateRegistration ? (
          <div role="alertdialog">
            <p role="alert">{t('lateRegistration.warning')}</p>
            <div className={styles.actions}>
              <Button onClick={handleConfirmLateRegistration} type="button">
                <Icon name="check" />
                {t('lateRegistration.confirm')}
              </Button>
              <Button
                onClick={() => setIsConfirmingLateRegistration(false)}
                type="button"
                variant="ghost"
              >
                <Icon name="close" />
                {t('lateRegistration.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setIsConfirmingLateRegistration(true)}
            type="button"
            variant="ghost"
          >
            <Icon name="clock" />
            {t('lateRegistration.open')}
          </Button>
        )}
      </div>
    </li>
  )
}

type DocumentRowProps = Readonly<{
  /**
   * Pedido do usuário (25/09): "Cheguei" libera a entrega — `isArrivalRecorded` da parada, OU
   * `isLateRegistration` confirmado pelo escape hatch. Sem nenhum dos dois, Entreguei/Não
   * entreguei/Registrar ocorrência simplesmente não entram no DOM.
   */
  canActOnDocuments: boolean
  /** Pedido do usuário (25/09): "entregue às HH:MM" — mesmo retorno de fila da devolução/ocorrência. */
  deliverActivity: DocumentActivityView | undefined
  document: DriverTripDocument
  isFieldWorkBlocked: boolean
  isLocationDenied: boolean
  /** Spec 243: ajudante — mantém o estado e a hora da nota e esconde só as ações. */
  isReadOnly: boolean
  /** Pedido do usuário (25/09): carimba `lateRegistration` no deliver/return/proof desta parada. */
  isLateRegistration: boolean
  notDeliveredStatus: NotDeliveredStatus | undefined
  /** O aviso transitório do cartão inteiro — um por parada, anunciado pela nota que agiu. */
  onAnnounce: (message: string) => void
  onDeliver: (input: { documentId: string; lateRegistration: boolean }) => void
  /** Spec 218: "Cancelar" o gate — o canhoto colhido para esta nota não espera mais a entrega. */
  onDiscardProofAwaitingDelivery: (documentId: string) => void
  /** Spec 218 (RF-A5): as três rotas do botão único de ocorrência — o `flow` do tipo escolhe. */
  occurrenceHandlers: OccurrenceRegistrationHandlers
  occurrenceTypes: DriverOccurrenceTypesState
  onNotDelivered: (input: {
    documentId: string
    draft: NotDeliveredDraft
    lateRegistration: boolean
  }) => void
  onProof: (input: DriverProofAttachment) => Promise<boolean>
  onProofFieldsUpdate?: (input: DriverProofFieldsUpdate) => void
  /** Spec 207: "Remover" a foto/assinatura do canhoto — só cabe com o anexo ainda na fila. */
  onRemoveProof?: (documentId: string) => void
  onRetryOccurrenceTypes: () => void
  /** Spec 207: para saber se o anexo desta nota ainda está na fila (oferece "Remover") ou já subiu. */
  queueView: readonly EventQueueItemView[]
  /** Pedido do usuário (25/09): "devolvida às HH:MM — motivo", mesmo retorno de fila da entrega. */
  returnActivity: DocumentReturnActivityView | undefined
  /** A configuração de comprovante antiga (da parada) e o destino da ocorrência de parada. */
  stop: DriverTripStop
}>

function DocumentSettledState({ document }: Readonly<{ document: DriverTripDocument }>) {
  const { t } = useTranslation('driverTrip')

  return (
    <span>
      {document.separationStatus === 'delivered'
        ? document.deliveredAt === null
          ? t('deliveredState')
          : t('activity.delivered', { time: formatActivityTime(document.deliveredAt) })
        : t(`returnReason.${document.returnReason ?? 'recipient_absent'}`)}
    </span>
  )
}

function DocumentRow({
  canActOnDocuments,
  deliverActivity,
  document,
  isFieldWorkBlocked,
  isLateRegistration,
  isLocationDenied,
  isReadOnly,
  notDeliveredStatus,
  occurrenceHandlers,
  occurrenceTypes,
  onAnnounce,
  onDeliver,
  onDiscardProofAwaitingDelivery,
  onNotDelivered,
  onProof,
  onProofFieldsUpdate,
  onRemoveProof,
  onRetryOccurrenceTypes,
  queueView,
  returnActivity,
  stop,
}: DocumentRowProps) {
  const { t } = useTranslation('driverTrip')
  const [openReturn, setOpenReturn] = useState(false)
  const [openOccurrence, setOpenOccurrence] = useState(false)
  const stopProofSettings = stop.deliveryProof
  /** Spec 082 (revisão): a configuração é do **documento** — a da parada é só o shape antigo. */
  const proofSettings = document.deliveryProof ?? stopProofSettings
  /** Spec 218 (RF-A1): o servidor já resolveu as camadas — aqui só se lê o plano pronto. */
  const requiresProof = requiresProofBeforeDelivery(resolveProofFormPlan(proofSettings))

  function confirmDelivery(): void {
    onAnnounce(t('activity.toast.delivered'))
    onDeliver({ documentId: document.id, lateRegistration: isLateRegistration })
  }

  if (isReadOnly) {
    return isDocumentSettled(document) ? (
      <li className={`${styles.document} ${styles.documentSettled}`}>
        <DocumentDetails document={document} />
        <DocumentSettledState document={document} />
        <DriverNotDeliveredStatus status={notDeliveredStatus} />
      </li>
    ) : (
      <li className={styles.document}>
        <DocumentDetails document={document} />
      </li>
    )
  }

  if (isFieldWorkBlocked) {
    return (
      <li className={styles.document}>
        <DocumentDetails document={document} />
      </li>
    )
  }

  /** Spec 218 (D4): o formulário do botão único — o mesmo na nota em aberto e na já resolvida. */
  const occurrenceForm = openOccurrence ? (
    <DriverOccurrenceRegistrationForm
      document={document}
      handlers={occurrenceHandlers}
      occurrenceTypes={occurrenceTypes}
      onClose={() => setOpenOccurrence(false)}
      onRetryOccurrenceTypes={onRetryOccurrenceTypes}
      stop={stop}
    />
  ) : null

  if (isDocumentSettled(document)) {
    return (
      <li className={`${styles.document} ${styles.documentSettled}`}>
        <DocumentDetails document={document} />
        <DocumentSettledState document={document} />
        <DriverNotDeliveredStatus status={notDeliveredStatus} />
        <div className={styles.actions}>
          <DocumentOccurrenceButton
            isOpen={openOccurrence}
            onToggle={() => setOpenOccurrence((open) => !open)}
          />
        </div>
        {occurrenceForm}
        {/*
         * O canhoto anexa depois: a entrega já está confirmada, e o arquivo não a desfaz — por
         * isso nunca trava atrás de "Cheguei" (nota já entregue, foto pendente de verdade).
         */}
        {document.separationStatus === 'delivered' ? (
          <DeliveryProofSection
            documentId={document.id}
            {...(isLateRegistration ? { lateRegistration: true } : {})}
            onProof={onProof}
            {...(onProofFieldsUpdate === undefined ? {} : { onProofFieldsUpdate })}
            {...(onRemoveProof === undefined ? {} : { onRemoveProof })}
            proofSettings={proofSettings}
            queueView={queueView}
            recipientDisplayName={document.recipientDisplayName}
            recipientIsCompany={document.recipientIsCompany}
            serverProof={{ isDelivered: true, proofPending: document.proofPending }}
          />
        ) : null}
      </li>
    )
  }

  return (
    <li className={styles.document}>
      <DocumentDetails document={document} />
      <DriverNotDeliveredStatus status={notDeliveredStatus} />
      {/*
       * Pedido do usuário (25/09): "registrei e nada aconteceu?" — a nota ainda não bate como
       * entregue/devolvida no snapshot (a API não confirmou), mas o toque já está na fila, e a
       * linha diz isso. Some sozinha quando o snapshot confirmar: o cartão vira o ramo "settled".
       */}
      {deliverActivity === undefined ? null : (
        <ActivityStatusLine
          status={deliverActivity.status}
          text={t(
            deliverActivity.status === 'sent'
              ? 'activity.delivered'
              : deliverActivity.status === 'rejected'
                ? 'activity.deliveredRejected'
                : 'activity.deliveredQueued',
            { time: formatActivityTime(deliverActivity.at) },
          )}
        />
      )}
      {returnActivity === undefined ? null : (
        <ActivityStatusLine
          status={returnActivity.status}
          text={t(
            returnActivity.status === 'sent'
              ? 'activity.returned'
              : returnActivity.status === 'rejected'
                ? 'activity.returnedRejected'
                : 'activity.returnedQueued',
            {
              reason: t(`returnReason.${returnActivity.reason}`),
              time: formatActivityTime(returnActivity.at),
            },
          )}
        />
      )}
      {/* Spec 159 RF12: avisa antes de entregar — nunca bloqueia o botão abaixo. */}
      {/* Aviso, não erro: cobre em vez de vermelho, e o detalhe da regra fica a um toque. */}
      {isProofPendingWarningDue({ document, stopProofSettings }) ? (
        <div className={styles.proofPendingWarning} role="note">
          <p className={styles.proofPendingWarningTitle}>
            <Icon name="camera" />
            {t('proofPendingWarningTitle')}
          </p>
          <p className={styles.proofPendingWarningLead}>{t('proofPendingWarningLead')}</p>
          <details className={styles.proofPendingWarningDetails}>
            <summary>{t('proofPendingWarningDetails')}</summary>
            <p>{t('proofPendingWarning')}</p>
          </details>
        </div>
      ) : null}
      {/*
       * Pedido do usuário (25/09): "Cheguei" libera a entrega — sem chegada (e sem "Registrar
       * entrega depois" confirmado), Entreguei e Não entreguei nem entram no DOM. Nada de
       * desabilitado e cinza: o aviso ocupa o lugar delas. Spec 218 (D4): "Ocorrência" fica fora
       * disso — doca fechada se relata antes de chegar.
       */}
      {/* Spec 234 D4d: só avisa — sem localização a entrega conta como longe, e o botão abaixo segue tocável. */}
      {canActOnDocuments && isLocationDenied ? (
        <div className={styles.proofPendingWarning} role="status">
          <p className={styles.proofPendingWarningLead}>{t('locationOffWarning')}</p>
        </div>
      ) : null}
      <div className={styles.actions}>
        {canActOnDocuments ? (
          <>
            {/*
             * Spec 218 (P1/P2): sem obrigatório, o toque entrega na hora. Com obrigatório não há
             * "Entreguei": a captura abaixo já está na tela e o único primário é o "Confirmar
             * entrega", desabilitado até completar.
             */}
            {!requiresProof ? (
              <Button onClick={confirmDelivery} type="button">
                <Icon name="check" />
                {t('deliver')}
              </Button>
            ) : null}
            <Button onClick={() => setOpenReturn((open) => !open)} type="button" variant="ghost">
              <Icon name="close" />
              {t('return')}
            </Button>
          </>
        ) : null}
        <DocumentOccurrenceButton
          isOpen={openOccurrence}
          onToggle={() => setOpenOccurrence((open) => !open)}
        />
      </div>
      {canActOnDocuments ? (
        <>
          {requiresProof ? (
            <PreDeliveryProofGate
              captureProps={{
                documentId: document.id,
                ...(isLateRegistration ? { lateRegistration: true } : {}),
                onProof,
                ...(onProofFieldsUpdate === undefined ? {} : { onProofFieldsUpdate }),
                ...(onRemoveProof === undefined ? {} : { onRemoveProof }),
                proofSettings,
                queueView,
                recipientDisplayName: document.recipientDisplayName,
                recipientIsCompany: document.recipientIsCompany,
              }}
              onCancel={() => onDiscardProofAwaitingDelivery(document.id)}
              onConfirm={confirmDelivery}
            />
          ) : null}
          {/*
           * Spec 179, ajuste do usuário de 25/09: "Não entreguei" é a ocorrência com foto **e** a
           * devolução — a devolução fecha a nota, a ocorrência é a prova
           * (`notDelivered.service.ts`).
           */}
          {openReturn ? (
            <DriverNotDeliveredForm
              occurrenceTypes={occurrenceTypes}
              onCancel={() => setOpenReturn(false)}
              onConfirm={(draft) => {
                onNotDelivered({
                  documentId: document.id,
                  draft,
                  lateRegistration: isLateRegistration,
                })
                onAnnounce(t('activity.toast.returned'))
                setOpenReturn(false)
              }}
              onRetryOccurrenceTypes={onRetryOccurrenceTypes}
            />
          ) : null}
        </>
      ) : (
        <p className={styles.stopMeta}>{t('arrivalRequired')}</p>
      )}
      {occurrenceForm}
    </li>
  )
}

type DocumentOccurrenceButtonProps = Readonly<{
  isOpen: boolean
  onToggle: () => void
}>

/**
 * Spec 218 (D4): o botão único de ocorrência da nota — rótulo curto, ícone e dica (pedido do
 * usuário), para não pesar a linha ao lado de Entreguei/Não entreguei.
 */
function DocumentOccurrenceButton({ isOpen, onToggle }: DocumentOccurrenceButtonProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <Tooltip label={t('occurrenceRegistration.openHint')}>
      <Button aria-expanded={isOpen} onClick={onToggle} type="button" variant="ghost">
        <Icon name="alert" />
        {t('occurrenceRegistration.open')}
      </Button>
    </Tooltip>
  )
}

type PreDeliveryProofGateProps = Readonly<{
  captureProps: DeliveryProofSectionProps
  onCancel: () => void
  onConfirm: () => void
}>

/**
 * Spec 218 (RF-A1/RF-A2, P1): a captura de antes da entrega — o mesmo `ProofCaptureFields` de
 * depois — e "Confirmar entrega", desabilitado enquanto faltar obrigatório. Cada anexo entra na
 * fila na hora (spec 203), marcado para esperar a entrega: o gate atrasa só o `deliver`.
 */
function PreDeliveryProofGate({ captureProps, onCancel, onConfirm }: PreDeliveryProofGateProps) {
  const { t } = useTranslation('driverTrip')
  const titleId = useId()
  const missingId = useId()
  const { onProof } = captureProps

  /* Sem quadro de `fieldset`: é a mesma seção de depois da entrega, só que antes — mesma largura. */
  return (
    <div aria-labelledby={titleId} className={styles.deliveryGate} role="group">
      <p className={styles.proofCaptureTitle} id={titleId}>
        {t('deliveryGate.title')}
      </p>
      <p className={styles.stopMeta}>{t('deliveryGate.lead')}</p>
      <ProofCaptureFields
        {...captureProps}
        onProof={(input) => onProof({ ...input, awaitingDelivery: true })}
        renderFooter={(capture) => {
          const missingFields = listMissingProofFields({
            plan: capture.plan,
            values: capture.values,
          })
          const cargoMissingCount = countMissingCargoPhotos({
            plan: capture.plan,
            values: capture.values,
          })
          const fieldsText = missingFields
            .map((field) => t(`proofFields.missing.${field}`, { count: cargoMissingCount }))
            .join(', ')
          return (
            <>
              {missingFields.length > 0 ? (
                <p className={styles.notDeliveredMissing} id={missingId} role="status">
                  {t('deliveryGate.missingLead', { fields: fieldsText })}
                </p>
              ) : null}
              <div className={styles.actions}>
                <Button
                  aria-describedby={missingFields.length > 0 ? missingId : undefined}
                  disabled={missingFields.length > 0}
                  onClick={() => {
                    capture.pushLateFieldUpdate()
                    onConfirm()
                  }}
                  type="button"
                >
                  <Icon name="check" />
                  {t('deliveryGate.confirm')}
                </Button>
                <Button onClick={onCancel} type="button" variant="ghost">
                  {t('deliveryGate.cancel')}
                </Button>
              </div>
            </>
          )
        }}
      />
    </div>
  )
}

type DocumentDetailsProps = Readonly<{
  document: DriverTripDocument
}>

/**
 * NF-e, volumes/peso e valor de cada nota — visível em todo estado do cartão, porque descreve a
 * nota em si, não a entrega dela. A chave fica atrás de um toque: por extenso ela não cabe numa
 * linha sem empurrar o resto do cartão, e ela só importa para quem vai conferir ou bipar.
 */
function DocumentDetails({ document }: DocumentDetailsProps) {
  const { t } = useTranslation('driverTrip')
  const [isKeyVisible, setKeyVisible] = useState(false)
  const keyId = useId()

  return (
    <div className={styles.documentDetails}>
      {/* Pedido do usuário (25/09): cada dado com o ícone ao lado, para ler de relance. */}
      <p className={styles.documentDetailsRecipient}>
        <Icon aria-hidden="true" name="organization" size="sm" />
        {document.recipientName}
      </p>
      <p className={styles.documentDetailsMeta}>
        <Icon aria-hidden="true" name="invoice" size="sm" />
        {t('loadSheet.note', { number: document.number, series: document.series })}
      </p>
      <p className={styles.documentDetailsMeta}>
        <Icon aria-hidden="true" name="package" size="sm" />
        {t('loadSheet.volumes', { count: Number(document.volumeCount) })} ·{' '}
        {t('loadSheet.weight', { weight: formatDocumentWeight(document.grossWeight) })}
      </p>
      <p className={styles.documentDetailsAmount}>
        <Icon aria-hidden="true" name="money" size="sm" />
        {formatDocumentAmount(document.totalAmount)}
      </p>
      <button
        aria-controls={keyId}
        aria-expanded={isKeyVisible}
        className={styles.documentDetailsKeyToggle}
        onClick={() => setKeyVisible((current) => !current)}
        type="button"
      >
        {isKeyVisible ? t('documentDetails.hideKey') : t('documentDetails.seeKey')}
      </button>
      {isKeyVisible ? (
        <p className={styles.documentDetailsKey} id={keyId}>
          {document.accessKey}
        </p>
      ) : null}
    </div>
  )
}

export type DeliveryProofSectionProps = Readonly<{
  documentId: string
  /** Pedido do usuário (25/09): carimba o anexo com a mesma marca do deliver/return da parada. */
  lateRegistration?: boolean
  /** Spec 218: `false` quando a fila recusou (teto da spec 203) — a captura não marca "anexada". */
  onProof: (input: DriverProofAttachment) => Promise<boolean>
  onProofFieldsUpdate?: (input: DriverProofFieldsUpdate) => void
  /** Spec 207: "Remover" a foto/assinatura do canhoto — só cabe com o anexo ainda na fila. */
  onRemoveProof?: (documentId: string) => void
  proofSettings: DriverDeliveryProofSettings | null
  /** Spec 207: diz se o anexo desta nota ainda está na fila — oferece "Remover" só nesse caso. */
  queueView?: readonly EventQueueItemView[]
  /** Spec 193 D14: o nome que "O próprio cliente recebeu" preenche. Ausente (API anterior) é vazio. */
  recipientDisplayName?: string
  /** Spec 193 D14: PJ seleciona o nome preenchido (foco + seleção); PF só o deixa no campo. */
  recipientIsCompany?: boolean
  /** O que o snapshot sabe da foto: `proofPending` só fala da obrigatória. Ausente = gate de antes. */
  serverProof?: Readonly<{ isDelivered: boolean; proofPending: boolean }>
}>

/**
 * Spec 082 T053: o formulário do comprovante é o que a configuração manda — `off` não renderiza,
 * `required` bloqueia o anexo com mensagem **no campo** (todos de uma vez), e o documento do
 * recebedor entra mascarado e sobe canônico. Sem canvas/pointer, a assinatura cai para a foto.
 *
 * Spec 159 (T9): exportado para ser reaproveitado pela tela "Fotos pendentes" — o mesmo formulário,
 * a mesma validação, sem uma segunda implementação divergindo calada.
 *
 * Spec 218 (RF-A2): a captura em si mora em `ProofCaptureFields`, a mesma que o gate de antes da
 * entrega monta — aqui só entra o que é do depois: "Concluir", que nunca trava (spec 203/207).
 */
export function DeliveryProofSection(props: DeliveryProofSectionProps) {
  const { t } = useTranslation('driverTrip')
  /** Spec 207: "Concluir" — estado só da tela, por nota; nunca `localStorage` (derivado seria melhor,
   * mas o momento em que o motorista concluiu não vem de nenhum outro dado). */
  const [concludedAt, setConcludedAt] = useState<string | undefined>(undefined)

  /**
   * Pedido do usuário (25/09, spec 207): "Concluir" nunca trava (spec 203) — com pendência
   * obrigatória, pede confirmação nomeando o que falta; a foto/assinatura já guardada não é
   * descartada em nenhum dos dois caminhos. Antes de fechar, garante que edições digitadas e ainda
   * não confirmadas (`onBlur`) cheguem pelo caminho que já existe (fila ou PATCH).
   */
  function handleComplete(capture: ProofCaptureState): void {
    capture.pushLateFieldUpdate()
    const pending = listAllPendingFields({ plan: capture.plan, values: capture.values })
    if (pending.length > 0) {
      const cargoMissingCount = countMissingCargoPhotos({
        plan: capture.plan,
        values: capture.values,
      })
      const fieldsText = pending
        .map((field) => t(`proofFields.missing.${field}`, { count: cargoMissingCount }))
        .join(', ')
      if (!window.confirm(t('proofFields.completeMissing', { fields: fieldsText }))) return
    }
    setConcludedAt(new Date().toISOString())
  }

  return (
    <ProofCaptureFields
      {...props}
      renderFooter={(capture) => (
        <div className={styles.actions}>
          <Button onClick={() => handleComplete(capture)} type="button">
            <Icon name="check" />
            {t('proofFields.complete')}
          </Button>
        </div>
      )}
      summary={
        concludedAt === undefined ? undefined : (
          <>
            <ActivityStatusLine
              status="sent"
              text={t('proofFields.completedAt', { time: formatActivityTime(concludedAt) })}
            />
            <Button onClick={() => setConcludedAt(undefined)} type="button" variant="ghost">
              <Icon name="pen" />
              {t('proofFields.edit')}
            </Button>
          </>
        )
      }
    />
  )
}

/** O que o rodapé de quem monta a captura precisa ler dela — nada além disso sai do componente. */
type ProofCaptureState = Readonly<{
  plan: ProofFormPlan
  /** Envia o que foi digitado e ainda não saiu pelo `onBlur` (fila ou PATCH). */
  pushLateFieldUpdate: () => void
  values: ProofFormValues & Readonly<{ receivedBy: string; receivedByDetail: string }>
}>

type ProofCaptureFieldsProps = DeliveryProofSectionProps &
  Readonly<{
    /** Quem monta decide o fim do formulário: "Concluir" depois da entrega, "Confirmar" antes. */
    renderFooter: (capture: ProofCaptureState) => ReactNode
    /** Presente, ocupa o lugar dos campos — o estado da captura continua montado por baixo. */
    summary?: ReactNode
  }>

/**
 * Spec 218 (RF-A2): o miolo do comprovante — botões de captura, miniaturas e campos de quem
 * recebeu —, sem nenhuma ideia de "concluído" ou de "entregue". O mesmo código antes e depois da
 * entrega: os dois formulários são iguais por construção, não por disciplina.
 */
function ProofCaptureFields({
  documentId,
  lateRegistration,
  onProof,
  onProofFieldsUpdate,
  onRemoveProof,
  proofSettings,
  queueView = [],
  recipientDisplayName,
  recipientIsCompany,
  renderFooter,
  serverProof,
  summary,
}: ProofCaptureFieldsProps) {
  const { t } = useTranslation('driverTrip')
  const plan = resolveProofFormPlan(proofSettings)
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  /** Spec 193 D1: quem recebeu e o detalhe — o select compacto (R1) e o campo "Detalhes". */
  const [receivedBy, setReceivedBy] = useState('')
  const [receivedByDetail, setReceivedByDetail] = useState('')
  const [missing, setMissing] = useState<readonly ProofFieldKey[]>([])
  const [openSignature, setOpenSignature] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  /**
   * Spec 218: a captura nasce do que a fila já guarda para a nota — o canhoto colhido no gate
   * continua "anexado" quando a nota passa a entregue e esta seção remonta. Lida uma vez: o anexo que
   * sobe depois sai da fila, e a tela não volta a "Tirar foto" por isso.
   */
  const [queuedAtMount] = useState(() => resolveQueuedProofAttachments({ documentId, queueView }))
  const [attached, setAttached] = useState<{ photo: boolean; signature: boolean }>({
    photo: queuedAtMount.photo !== undefined,
    signature: queuedAtMount.signature !== undefined,
  })
  /**
   * Spec 211 (defeito 26/09): foto do canhoto e assinatura são anexos distintos, com miniatura,
   * chave e "Remover" próprios — os dois cabem juntos, e um nunca pisa no lugar do outro.
   */
  const [attachedKey, setAttachedKey] = useState<{ photo?: string; signature?: string }>({
    ...(queuedAtMount.photo === undefined ? {} : { photo: queuedAtMount.photo.attachmentKey }),
    ...(queuedAtMount.signature === undefined
      ? {}
      : { signature: queuedAtMount.signature.attachmentKey }),
  })
  /** Spec 220: a mercadoria acumula — cada foto tem a própria chave, e a contagem é o tamanho da lista. */
  const [cargoKeys, setCargoKeys] = useState<readonly string[]>(() =>
    queuedAtMount.cargo.map((attachment) => attachment.attachmentKey),
  )
  const [openImageKind, setOpenImageKind] = useState<'photo' | 'signature' | undefined>(undefined)
  /** Spec 218: o kind que a fila recusou por último (teto cheio) — nunca aparece como anexado. */
  const [refusedKind, setRefusedKind] = useState<'photo' | 'signature' | undefined>(undefined)
  const [isCargoRefused, setIsCargoRefused] = useState(false)
  /** Spec 207: enquanto o anexo está aqui, "Remover" é seguro — enviado, só "Substituir". */
  const isProofQueued = queueView.some(
    (item) => item.kind === 'proof' && item.documentId === documentId,
  )
  const canSign = plan.rendersSignature && isSignatureCaptureSupported()
  const rendersPhotoCapture = plan.rendersPhoto || (plan.rendersSignature && !canSign)
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  /** Spec 211: uma miniatura por kind — cada anexo revoga só a própria URL `blob:` ao trocar. */
  const photoPreview = usePhotoPreviewUrl(queuedAtMount.photo?.blob)
  const signaturePreview = usePhotoPreviewUrl(queuedAtMount.signature?.blob)
  const previewByKind = { photo: photoPreview, signature: signaturePreview }
  const photoUpload = useProofUploadStatus({
    isAttached: attached.photo,
    ...resolveProofUploadObservation({ documentId, kind: 'photo', queueView }),
  })
  const isPhotoConfirmedByServer = isProofConfirmedByServer({
    hasLocalAttachment: attached.photo,
    isDelivered: serverProof?.isDelivered ?? false,
    isRequired: plan.fields.photo === 'required',
    kind: 'photo',
    proofPending: serverProof?.proofPending ?? true,
  })
  /** A miniatura que ficou no aparelho quando a drenagem levou o original (pedido de 01/10). */
  const storedThumbnailUrl = useStoredProofThumbnail({
    documentId,
    enabled: isPhotoConfirmedByServer,
  })
  /** "Ver" abre o que a tela está mostrando: o anexo da fila, ou a miniatura guardada do enviado. */
  const openImageUrl =
    openImageKind === undefined
      ? undefined
      : (previewByKind[openImageKind].previewUrl ??
        (openImageKind === 'photo' ? storedThumbnailUrl : undefined))
  const nameInputRef = useRef<HTMLInputElement>(null)
  /** Spec 193 D14: PJ recebe o nome selecionado, com foco — o motorista digita por cima. */
  const [selectNameOnNextRender, setSelectNameOnNextRender] = useState(false)
  useEffect(() => {
    if (!selectNameOnNextRender) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
    setSelectNameOnNextRender(false)
  }, [selectNameOnNextRender])
  /**
   * M10: nome ou documento digitados e nada anexado ainda é trabalho em andamento — recarregar
   * para o SW novo jogaria fora. Anexou, o texto foi junto com o anexo, e o formulário não segura.
   */
  const hasUnattachedText =
    (receiverName.trim() !== '' ||
      receiverDocument !== '' ||
      receivedBy !== '' ||
      receivedByDetail.trim() !== '') &&
    !attached.photo &&
    !attached.signature
  useCaptureRegistration('proof-form', hasUnattachedText)

  function currentFields(
    overrides: Readonly<{
      receivedBy?: string
      receiverName?: string
    }> = {},
  ): Pick<
    DriverProofAttachment,
    'receivedBy' | 'receivedByDetail' | 'receiverDocument' | 'receiverName'
  > {
    return buildReceiverFields({
      receivedBy: overrides.receivedBy ?? receivedBy,
      receivedByDetail,
      receiverDocument,
      receiverName: overrides.receiverName ?? receiverName,
    })
  }

  /**
   * O veredito do serviço manda, campo a campo: **todo** faltante é pintado — inclusive assinatura
   * e foto obrigatórias, não só os campos de texto. Spec 203: nunca bloqueia mais o anexo — só
   * alimenta o aviso não-intrusivo (`role="status"`) de que falta completar o comprovante.
   */
  function blockedByFields(next: {
    cargoCount: number
    photo: boolean
    signature: boolean
  }): boolean {
    const failures = listMissingProofFields({
      plan,
      values: {
        cargoCount: next.cargoCount,
        hasPhoto: next.photo,
        hasSignature: next.signature,
        receiverDocument,
        receiverName,
      },
    })
    setMissing(failures)
    return failures.length > 0
  }

  /**
   * Spec 203 (o attach nunca descarta a foto): a foto é a prova nº 1 do usuário — entra na fila
   * incondicionalmente, **antes** de qualquer veredito de campo. Campo obrigatório vazio vira aviso
   * visível (`missing`), nunca motivo para jogar fora o que o motorista já fotografou.
   *
   * Spec 218: "anexada" só depois do aceite da fila — com o teto cheio (spec 203), a fila recusa, e o
   * formulário diz isso em vez de mostrar uma foto que não está guardada em lugar nenhum.
   */
  function attach(kind: 'photo' | 'signature', file: File): void {
    /* Spec 207: gerada aqui — é a chave que "Remover" vai pedir de volta, por item, nunca por nota. */
    const attachmentKey = crypto.randomUUID()
    setRefusedKind(undefined)
    void onProof({
      attachmentKey,
      documentId,
      file,
      kind,
      ...(lateRegistration === true ? { lateRegistration: true } : {}),
      ...currentFields(),
    }).then((isAccepted) => {
      if (!isAccepted) {
        setRefusedKind(kind)
      } else {
        const next = { ...attached, [kind]: true, cargoCount: cargoKeys.length }
        setAttached((current) => ({ ...current, [kind]: true }))
        setAttachedKey((current) => ({ ...current, [kind]: attachmentKey }))
        /* Spec 211: cada kind tem a própria miniatura — anexar um nunca troca a do outro. */
        previewByKind[kind].showPhoto(file)
        blockedByFields(next)
      }
    })
  }

  /**
   * Spec 220 RF09: a foto da mercadoria entra na fila **sempre** — abaixo do mínimo é pendência de
   * confirmação, nunca recusa do anexo. Sem nome nem documento: a mercadoria não é o comprovante de
   * quem recebeu.
   */
  function attachCargo(file: File): void {
    const attachmentKey = crypto.randomUUID()
    setIsCargoRefused(false)
    void onProof({
      attachmentKey,
      documentId,
      file,
      kind: 'cargo',
      ...(lateRegistration === true ? { lateRegistration: true } : {}),
    }).then((isAccepted) => {
      if (!isAccepted) {
        setIsCargoRefused(true)
        return
      }
      setCargoKeys((current) => [...current, attachmentKey])
      blockedByFields({ ...attached, cargoCount: cargoKeys.length + 1 })
    })
  }

  /** Spec 203/193: o campo chega depois do anexo — alcança o mesmo item na fila, se ele ainda estiver lá. */
  function pushLateFieldUpdate(
    overrides: Readonly<{ receivedBy?: string; receiverName?: string }> = {},
  ): void {
    if (attached.photo || attached.signature || cargoKeys.length > 0) {
      onProofFieldsUpdate?.({ documentId, ...currentFields(overrides) })
    }
  }

  /**
   * Pedido do usuário (25/09, spec 207): "Remover" só cabe com o anexo ainda na fila — enviado, a
   * tela nunca oferece o botão (mostra "Substituir" no lugar do "Refazer"). Sempre pede confirmação
   * explícita antes de descartar. Pela `attachmentKey` do item, nunca pelo documento — a nota pode
   * ter mais de um anexo (spec 211), e apagar pelo documento levaria os outros junto.
   *
   * Spec 211 (defeito 26/09): remove só o `kind` escolhido — o outro anexo (foto ou assinatura)
   * continua intacto, com a própria miniatura e a própria chave.
   */
  function handleRemove(kind: 'photo' | 'signature'): void {
    if (!window.confirm(t('proofCapture.confirmRemove'))) return
    const key = attachedKey[kind]
    if (key !== undefined) onRemoveProof?.(key)
    setAttached((current) => ({ ...current, [kind]: false }))
    setAttachedKey((current) => ({ ...current, [kind]: undefined }))
    setMissing((current) => current.filter((field) => field !== kind))
  }

  /**
   * Spec 193 D14: escolher "Próprio destinatário" preenche o nome com `recipientDisplayName`. Para
   * destinatário PJ, o nome fica selecionado com o foco no campo — o motorista digita o nome de
   * quem assinou por cima; para PF, o nome só entra.
   *
   * ⚠️ Pedido do usuário (26/09): isto era um botão "O próprio cliente recebeu" **ao lado** do
   * select, e os dois faziam a mesma coisa. Ficou a opção do select, que herdou o preenchimento do
   * nome — o único trabalho que só o botão fazia.
   */
  function fillNameWithRecipient(): void {
    const shortcut = applyRecipientShortcut({
      plan,
      recipientDisplayName: recipientDisplayName ?? '',
    })
    setReceiverName(shortcut.receiverName)
    pushLateFieldUpdate({
      receiverName: shortcut.receiverName,
      ...(shortcut.receivedBy === undefined ? {} : { receivedBy: shortcut.receivedBy }),
    })
    if (recipientIsCompany === true) setSelectNameOnNextRender(true)
  }

  /**
   * Spec 193 R2/C1: quem recebeu **nunca** entra em `blockedByFields` — é pendência visível, à
   * parte, computada a cada render (nunca guardada em estado: nunca bloqueia, então não precisa
   * sobreviver a um "toque" como o `missing` acima).
   */
  const pendingReceiverFields = listPendingReceiverFields({
    plan,
    values: { receivedBy, receivedByDetail },
  })

  const currentValues = {
    cargoCount: cargoKeys.length,
    hasPhoto: attached.photo,
    hasSignature: attached.signature,
    receivedBy,
    receivedByDetail,
    receiverDocument,
    receiverName,
  }

  /** Spec 207: "Refazer" enquanto o anexo pode ser trocado sem custo; enviado, é "Substituir". */
  const retakeLabel = isProofQueued ? t('proofCapture.retake') : t('proofCapture.replace')

  /** A moldura ainda sem foto: estática — nada carrega, o app espera o motorista. */
  function renderEmptyFrame(): ReactNode {
    return (
      <div className={styles.proofCaptureAttached}>
        <div className={styles.proofEmptyFrame}>
          <Icon name="camera" />
          <span>{t('proofCapture.upload.empty')}</span>
        </div>
      </div>
    )
  }

  /**
   * O servidor já tem a foto: sem hora (o snapshot não manda) e sem convite à primeira captura.
   *
   * Pedido do usuário (01/10): a miniatura guardada no aparelho aparece aqui — a foto é a prova, e
   * uma frase sozinha não diz qual foto subiu. Quando não há miniatura guardada (foto anexada pelo
   * escritório, outro aparelho, as 24 h vencidas), fica só a frase, como antes.
   */
  function renderConfirmedFrame(): ReactNode {
    return (
      <div className={styles.proofCaptureAttached}>
        <div className={styles.proofConfirmedFrame}>
          {storedThumbnailUrl === undefined ? null : (
            <button
              aria-label={t('proofCapture.view')}
              className={styles.proofConfirmedThumbnailButton}
              onClick={() => setOpenImageKind('photo')}
              type="button"
            >
              <img
                alt={t('proofCapture.thumbnail')}
                className={styles.proofConfirmedThumbnail}
                src={storedThumbnailUrl}
              />
            </button>
          )}
          <span className={styles.proofConfirmedText}>
            <Icon name="check" />
            {t('proofCapture.upload.confirmed')}
          </span>
        </div>
      </div>
    )
  }

  /** O anexo existe: a moldura carrega, e o leitor de tela ouve por quê. */
  function renderLoadingFrame(kind: 'photo' | 'signature'): ReactNode {
    return (
      <SkeletonGroup
        className={styles.proofCaptureAttached}
        label={t(`proofCapture.upload.loading.${kind}`)}
      >
        <Skeleton height={PROOF_FRAME_SIZE} width={PROOF_FRAME_SIZE} />
      </SkeletonGroup>
    )
  }

  /**
   * Spec 211 (defeito 26/09): a miniatura, o texto e os botões de um anexo — chamada uma vez por
   * foto e uma vez por assinatura, nunca compartilhada entre os dois.
   */
  function renderAttachedThumbnail(kind: 'photo' | 'signature'): ReactNode {
    const preview = previewByKind[kind]
    if (kind === 'photo' && isPhotoConfirmedByServer) return renderConfirmedFrame()
    if (!attached[kind]) return kind === 'photo' && rendersPhotoCapture ? renderEmptyFrame() : null
    if (preview.previewUrl === undefined) return renderLoadingFrame(kind)
    return (
      <div className={styles.proofCaptureAttached}>
        <button
          aria-label={t('proofCapture.view')}
          className={styles.proofCaptureThumbnailButton}
          onClick={() => setOpenImageKind(kind)}
          type="button"
        >
          <img
            alt={kind === 'signature' ? t('signature.thumbnail') : t('proofCapture.thumbnail')}
            className={styles.proofCaptureThumbnail}
            src={preview.previewUrl}
          />
        </button>
        <div className={styles.proofUploadColumn}>
          {kind === 'photo' ? (
            <ProofUploadStatus upload={photoUpload} />
          ) : (
            <span className={styles.proofCaptureAttachedText}>
              <Icon name="check" />
              {t('signature.attached')}
            </span>
          )}
          <div className={styles.actions}>
            <Button onClick={() => setOpenImageKind(kind)} type="button" variant="ghost">
              <Icon name="eye" />
              {t('proofCapture.view')}
            </Button>
            {isProofQueued ? (
              <Button onClick={() => handleRemove(kind)} type="button" variant="ghost">
                <Icon name="trash" />
                {t('proofCapture.remove')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.proofSection}>
      {summary === undefined ? (
        <>
          {/*
           * Pedido do usuário (25/09): três botões iguais — "Tirar foto" abre a câmera na hora,
           * "Anexar" abre galeria e arquivos, "Colher assinatura" abre o quadro. Em 375 px: as duas
           * portas da foto lado a lado e a assinatura na linha inteira, abaixo — cada rótulo cabe
           * numa linha, e a foto (que é a prova da nota) vem primeiro.
           */}
          {rendersPhotoCapture || canSign ? (
            <div className={styles.proofCapture}>
              <p className={styles.proofCaptureTitle}>{t('proofCapture.title')}</p>
              {renderAttachedThumbnail('photo')}
              {renderAttachedThumbnail('signature')}
              <div className={styles.proofCaptureGrid}>
                {rendersPhotoCapture ? (
                  <>
                    <FilePickerButton
                      accept="image/*"
                      capture="environment"
                      className={styles.proofCaptureAction}
                      inputRef={cameraFieldRef}
                      onSelect={setCropFile}
                    >
                      <Icon name="camera" />
                      {attached.photo || isPhotoConfirmedByServer ? retakeLabel : t('choosePhoto')}
                      {plan.fields.photo === 'required' &&
                      !attached.photo &&
                      !isPhotoConfirmedByServer
                        ? ' *'
                        : ''}
                    </FilePickerButton>
                    <FilePickerButton
                      accept="image/*"
                      className={styles.proofCaptureAction}
                      inputRef={galleryFieldRef}
                      onSelect={setCropFile}
                    >
                      <Icon name="upload" />
                      {t('proofCapture.attach')}
                    </FilePickerButton>
                  </>
                ) : null}
                {canSign ? (
                  <Button
                    className={`${styles.proofCaptureAction} ${styles.proofCaptureWide}`}
                    onClick={() => setOpenSignature((open) => !open)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="pen" />
                    {attached.signature ? retakeLabel : t('signature.open')}
                    {plan.fields.signature === 'required' && !attached.signature ? ' *' : ''}
                  </Button>
                ) : null}
              </div>
              {/* Enviado ao servidor não há rota de exclusão — só "Substituir" (spec 082/207). */}
              {(attached.photo || attached.signature) && !isProofQueued ? (
                <p className={styles.stopMeta}>{t('proofCapture.replaceHint')}</p>
              ) : null}
              {missing.includes('photo') || missing.includes('signature') ? (
                <span className={styles.proofFieldError} role="status">
                  {t('proofFields.pendingField')}
                </span>
              ) : null}
              {refusedKind === undefined ? null : (
                <span className={styles.proofFieldError} role="status">
                  {t(`proofCapture.refused.${refusedKind}`)}
                </span>
              )}
            </div>
          ) : null}

          {plan.rendersCargo ? (
            <ProofCargoField
              attachedCount={cargoKeys.length}
              isRefused={isCargoRefused}
              isRequired={plan.fields.cargo === 'required'}
              missingCount={
                missing.includes('cargo')
                  ? countMissingCargoPhotos({ plan, values: currentValues })
                  : 0
              }
              onSelect={attachCargo}
            />
          ) : null}

          {/*
           * Spec 193 D7: "Quem recebeu" vem depois da captura — a foto nunca espera por este bloco
           * (C1). Botão rápido, select compacto (R1) e "Detalhes"; nome e documento seguem abaixo.
           */}
          {plan.rendersReceivedBy ? (
            <div className={styles.proofSection}>
              <label className={styles.proofField}>
                <span>
                  {t('proofFields.receivedBy')}
                  {plan.fields.receivedBy === 'required' ? ' *' : ''}
                </span>
                <Select
                  ariaLabel={t('proofFields.receivedBy')}
                  clearable
                  onChange={(value) => {
                    setReceivedBy(value)
                    if (
                      value === 'recipient' &&
                      plan.rendersRecipientShortcut &&
                      (recipientDisplayName ?? '') !== ''
                    ) {
                      fillNameWithRecipient()
                      return
                    }
                    pushLateFieldUpdate({ receivedBy: value })
                  }}
                  options={RECEIVED_BY_OPTIONS.map((option) => ({
                    label: t(`proofFields.receivedByOption.${option}`),
                    value: option,
                  }))}
                  placeholder={t('proofFields.receivedByPlaceholder')}
                  value={receivedBy}
                />
                {pendingReceiverFields.includes('receivedBy') ? (
                  <span className={styles.proofFieldError} role="status">
                    {t('proofFields.pendingReceivedBy')}
                  </span>
                ) : null}
              </label>
              <label className={styles.proofField}>
                <span>{t('proofFields.receivedByDetail')}</span>
                <input
                  maxLength={RECEIVED_BY_DETAIL_MAX_LENGTH}
                  onBlur={() => pushLateFieldUpdate()}
                  onChange={(event) => setReceivedByDetail(event.target.value)}
                  placeholder={t(
                    receivedBy === 'neighbor'
                      ? 'proofFields.receivedByDetailPlaceholderNeighbor'
                      : 'proofFields.receivedByDetailPlaceholder',
                  )}
                  type="text"
                  value={receivedByDetail}
                />
                {pendingReceiverFields.includes('receivedByDetail') ? (
                  <span className={styles.proofFieldError} role="status">
                    {t('proofFields.pendingReceivedByDetail')}
                  </span>
                ) : null}
              </label>
            </div>
          ) : null}

          {plan.rendersReceiverName ? (
            <label className={styles.proofField}>
              <span>
                {t('proofFields.receiverName')}
                {plan.fields.receiverName === 'required' ? ' *' : ''}
              </span>
              <input
                aria-invalid={missing.includes('receiverName')}
                maxLength={120}
                ref={nameInputRef}
                type="text"
                value={receiverName}
                onBlur={() => pushLateFieldUpdate()}
                onChange={(event) => {
                  setReceiverName(event.target.value)
                  setMissing((current) => current.filter((field) => field !== 'receiverName'))
                }}
              />
              {missing.includes('receiverName') ? (
                <span className={styles.proofFieldError} role="status">
                  {t('proofFields.pendingField')}
                </span>
              ) : null}
            </label>
          ) : null}
          {/*
           * Pedido do usuário (01/10): quem decide se o campo aparece é a configuração — geral ou a
           * exceção por CNPJ (`plan.rendersReceiverDocument`), igual aos outros campos. Revoga a
           * regra da spec 207 ("aparece sempre"). Sem inputMode numeric: CNPJ e RG podem ter letra,
           * e o teclado numérico do celular a esconde.
           */}
          {plan.rendersReceiverDocument ? (
            <label className={styles.proofField}>
              <span>
                {t('proofFields.receiverDocument')}
                {plan.fields.receiverDocument === 'required' ? ' *' : ''}
              </span>
              <input
                aria-invalid={missing.includes('receiverDocument')}
                autoCapitalize="characters"
                maxLength={18}
                type="text"
                value={receiverDocument}
                onBlur={() => pushLateFieldUpdate()}
                onChange={(event) => {
                  setReceiverDocument(maskReceiverDocument(event.target.value))
                  setMissing((current) => current.filter((field) => field !== 'receiverDocument'))
                }}
              />
              {missing.includes('receiverDocument') ? (
                <span className={styles.proofFieldError} role="status">
                  {t('proofFields.pendingField')}
                </span>
              ) : null}
            </label>
          ) : null}

          {renderFooter({
            plan,
            pushLateFieldUpdate: () => pushLateFieldUpdate(),
            values: currentValues,
          })}
        </>
      ) : (
        summary
      )}

      {openImageKind !== undefined && openImageUrl !== undefined ? (
        <ProofImageLightbox
          alt={
            openImageKind === 'signature' ? t('signature.thumbnail') : t('proofCapture.thumbnail')
          }
          onClose={() => setOpenImageKind(undefined)}
          src={openImageUrl}
        />
      ) : null}

      {openSignature ? (
        <SignaturePad
          onCancel={() => setOpenSignature(false)}
          onConfirm={(blob) => {
            setOpenSignature(false)
            attach('signature', new File([blob], 'assinatura.png', { type: 'image/png' }))
          }}
        />
      ) : null}

      {cropFile === null ? null : (
        <ProofCrop
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(file) => {
            setCropFile(null)
            attach('photo', file)
          }}
        />
      )}
    </div>
  )
}
