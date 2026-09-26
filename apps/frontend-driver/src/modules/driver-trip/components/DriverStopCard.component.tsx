/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverNotDeliveredForm } from './DriverNotDeliveredForm.component'
import { DriverNotDeliveredStatus } from './DriverNotDeliveredStatus.component'
import { DriverStopOccurrenceForm } from './DriverStopOccurrenceForm.component'
import { ProofCrop } from './ProofCrop.component'
import { ProofImageLightbox } from './ProofImageLightbox.component'
import { SignaturePad } from './SignaturePad.component'
import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { useCaptureRegistration } from '../hooks/useCaptureRegistration.hook'
import type { StopOccurrenceDraft } from '../hooks/useStopOccurrenceForm.hook'
import { usePhotoPreviewUrl } from '../hooks/usePhotoPreviewUrl.hook'
import { useTransientNotice } from '../hooks/useTransientNotice.hook'
import { describeDeliveryWindow } from '../shared/deliveryWindow.service'
import {
  isStopArrivalRecorded,
  stopHasOccurrenceMarker,
  type DocumentActivityStatus,
  type DocumentActivityView,
  type DocumentReturnActivityView,
} from '../shared/documentActivity.service'
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
import type { EventQueueItemView } from '../shared/eventQueueView.service'
import { canOfferLateRegistration } from '../shared/lateRegistration.service'
import type { NotDeliveredDraft, NotDeliveredStatus } from '../shared/notDelivered.service'
import {
  applyRecipientShortcut,
  buildReceiverFields,
  listAllPendingFields,
  listMissingProofFields,
  listPendingReceiverFields,
  maskReceiverDocument,
  resolveProofFormPlan,
  type ProofFieldKey,
} from '../shared/proofFormPlan.service'
import {
  RECEIVED_BY_DETAIL_MAX_LENGTH,
  RECEIVED_BY_OPTIONS,
} from '../shared/receivedBy.constant'
import { isSignatureCaptureSupported } from '../shared/signatureCapture.service'
import styles from '../styles/driverTrip.module.css'

/** Cheguei, entreguei, devolvi, registrei — sempre HH:MM local, nunca com segundos. */
function formatActivityTime(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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
  documentId: string
  file: File
  kind: 'photo' | 'signature'
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
  /** Pedido do usuário (25/09): "entrega guardada" — a foto/nota que veio de `onDocumentOccurrence`. */
  deliverActivityByDocumentId: ReadonlyMap<string, DocumentActivityView>
  isCurrent: boolean
  /**
   * Spec 082 (revisão): viagem `route_planned` chega à tela, mas as ações de campo ficam trancadas
   * até o motorista iniciar o trajeto — a API recusa essas escritas, e a fila offline não pode
   * acumular eventos condenados.
   */
  isFieldWorkBlocked: boolean
  /** Pedido do usuário (25/09): a atual abre sozinha e destacada; as outras ficam fechadas. */
  isOpen: boolean
  /** Spec 082 D2: a última posição conhecida — sem ela, a distância simplesmente não aparece. */
  lastKnownLocation: DriverReportedLocation | null
  onArrive: (stopId: string) => void
  onDeliver: (input: { documentId: string; lateRegistration: boolean }) => void
  /** `Promise<boolean>`: sucesso acende a linha e o aviso transitório no cartão, nunca à cega. */
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => Promise<boolean>
  occurrenceTypes: DriverOccurrenceTypesState
  onProof: (input: DriverProofAttachment) => void
  /** Spec 203: campo do recebedor preenchido depois do anexo já estar na fila — atualiza o mesmo item. */
  onProofFieldsUpdate?: (input: DriverProofFieldsUpdate) => void
  /** Spec 207: "Remover" a foto/assinatura do canhoto — só cabe com o anexo ainda na fila. */
  onRemoveProof?: (documentId: string) => void
  /** Spec 209: a foto é da ocorrência, e vai junto dela — nunca pelo comprovante de uma nota. */
  onOccurrence: (input: StopOccurrenceDraft & { stopId: string }) => void
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
  /** Pedido do usuário (25/09): "devolvida às HH:MM — motivo", com o mesmo retorno de fila. */
  returnActivityByDocumentId: ReadonlyMap<string, DocumentReturnActivityView>
  /** Spec 157 RF5: o toque em "Tentar de novo" no painel de ocorrência da nota. */
  onRetryOccurrenceTypes: () => void
  stop: DriverTripStop
  /** Pedido do usuário (25/09): "ocorrência registrada às HH:MM · na fila/enviada" do "Deu problema". */
  stopOccurrenceActivity: DocumentActivityView | undefined
}>

export function DriverStopCard({
  deliverActivityByDocumentId,
  isCurrent,
  isFieldWorkBlocked,
  isOpen,
  lastKnownLocation,
  notDeliveredStatusByDocumentId,
  onArrive,
  onDeliver,
  occurrenceTypes,
  onDocumentOccurrence,
  onNotDelivered,
  onOccurrence,
  onProof,
  onProofFieldsUpdate,
  onRemoveProof,
  onRetryOccurrenceTypes,
  onToggle,
  queueView,
  returnActivityByDocumentId,
  stop,
  stopOccurrenceActivity,
}: DriverStopCardProps) {
  const { t } = useTranslation('driverTrip')
  const [openOccurrence, setOpenOccurrence] = useState(false)
  /** Pedido do usuário (25/09): quem registra vê — um aviso que some sozinho, perto do que ele tocou. */
  const { announce, notice } = useTransientNotice()
  /** Painel "Registrar ocorrência" da nota (`onDocumentOccurrence`): chamada direta, sem fila offline. */
  const [documentOccurrenceRecordedAtByDocumentId, setDocumentOccurrenceRecordedAtByDocumentId] =
    useState<ReadonlyMap<string, string>>(new Map())
  /**
   * Pedido do usuário (25/09): "Registrar entrega depois" — escape hatch de quem não tocou
   * "Cheguei" na hora. Vale só para ESTA parada, e só no estado da página (nunca `localStorage`):
   * o `key={stop.id}` do `.map()` que monta o cartão já dá o "por stopId" de graça.
   */
  const [isLateRegistration, setIsLateRegistration] = useState(false)
  const [isConfirmingLateRegistration, setIsConfirmingLateRegistration] = useState(false)
  const isCompleted = stop.completedAt !== null
  const distanceLabel = formatStopDistance({ location: lastKnownLocation, stop })
  const deliveryWindow = describeDeliveryWindow({
    end: stop.deliveryWindowEnd,
    start: stop.deliveryWindowStart,
  })
  const bodyId = useId()
  const stopChipView = isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'
  const documentIdsWithOccurrence = new Set(
    stop.documents
      .filter(
        (document) =>
          documentOccurrenceRecordedAtByDocumentId.has(document.id) ||
          notDeliveredStatusByDocumentId.get(document.id) !== undefined,
      )
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
    stopId: stop.id,
  })
  const canActOnDocuments = isArrivalRecorded || isLateRegistration
  const offersLateRegistration = canOfferLateRegistration({ canActOnDocuments, stop })

  function handleConfirmLateRegistration(): void {
    setIsLateRegistration(true)
    setIsConfirmingLateRegistration(false)
  }

  function handleDocumentOccurrence(input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }): void {
    void onDocumentOccurrence(input).then((success) => {
      if (!success) return
      setDocumentOccurrenceRecordedAtByDocumentId((current) =>
        new Map(current).set(input.documentId, new Date().toISOString()),
      )
      announce(input.documentId, t('activity.toast.documentOccurrence'))
    })
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
          type="button"
        >
          {/* Só a seta fica à direita: os selos na mesma linha espremiam o endereço em uma coluna. */}
          <span className={styles.stopHeaderTop}>
            <span className={styles.stopHeaderTitle}>
              <span className={styles.stopMeta}>{t('stopTitle', { sequence: stop.sequence })}</span>
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
          {/* Status da parada no cabeçalho, não entre os botões: lá ele ficava solto e desalinhado */}
          {stop.arrivedAt === null && distanceLabel === null ? null : (
            <span className={styles.stopStatus}>
              {stop.arrivedAt === null ? null : (
                <span className={styles.stopArrived}>
                  <Icon aria-hidden="true" name="check" size="sm" />
                  {t('arrived', { time: formatActivityTime(stop.arrivedAt) })}
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
          {/* Trancado até o despacho: a API recusa `arrive` fora de dispatched/in_transit */}
          {isFieldWorkBlocked || stop.arrivedAt !== null ? null : (
            <Button onClick={() => onArrive(stop.id)} type="button">
              <Icon name="check" />
              {t('arrive')}
            </Button>
          )}
          {isFieldWorkBlocked ? null : (
            <Button
              onClick={() => setOpenOccurrence((open) => !open)}
              type="button"
              variant="ghost"
            >
              <Icon name="alert" />
              {t('occurrence')}
            </Button>
          )}
        </div>

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

        {openOccurrence ? (
          <DriverStopOccurrenceForm
            stop={stop}
            onSubmit={(draft) => {
              onOccurrence({ ...draft, stopId: stop.id })
              announce(stop.id, t('activity.toast.occurrence'))
              setOpenOccurrence(false)
            }}
          />
        ) : null}

        <ul className={styles.documentList}>
          {stop.documents.map((document) => (
            <DocumentRow
              canActOnDocuments={canActOnDocuments}
              deliverActivity={deliverActivityByDocumentId.get(document.id)}
              document={document}
              documentOccurrenceRecordedAt={documentOccurrenceRecordedAtByDocumentId.get(
                document.id,
              )}
              isFieldWorkBlocked={isFieldWorkBlocked}
              isLateRegistration={isLateRegistration}
              key={document.id}
              notDeliveredStatus={notDeliveredStatusByDocumentId.get(document.id)}
              onAnnounce={(message) => announce(document.id, message)}
              onDeliver={onDeliver}
              occurrenceTypes={occurrenceTypes}
              onDocumentOccurrence={handleDocumentOccurrence}
              onNotDelivered={onNotDelivered}
              onProof={onProof}
              {...(onProofFieldsUpdate === undefined ? {} : { onProofFieldsUpdate })}
              {...(onRemoveProof === undefined ? {} : { onRemoveProof })}
              onRetryOccurrenceTypes={onRetryOccurrenceTypes}
              queueView={queueView}
              returnActivity={returnActivityByDocumentId.get(document.id)}
              stopProofSettings={stop.deliveryProof}
            />
          ))}
        </ul>

        {/*
         * Pedido do usuário (25/09): quem não tocou "Cheguei" na hora ainda registra a entrega —
         * só na parada que ainda está travada e tem nota para agir. O aviso reduz a nota do
         * motorista de propósito: é o preço de pular a chegada, não um erro a esconder.
         */}
        {isFieldWorkBlocked || !offersLateRegistration ? null : isConfirmingLateRegistration ? (
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
  /** Painel "Registrar ocorrência" (chamada direta): hora da última confirmação, se houve. */
  documentOccurrenceRecordedAt: string | undefined
  isFieldWorkBlocked: boolean
  /** Pedido do usuário (25/09): carimba `lateRegistration` no deliver/return/proof desta parada. */
  isLateRegistration: boolean
  notDeliveredStatus: NotDeliveredStatus | undefined
  /** O aviso transitório do cartão inteiro — um por parada, anunciado pela nota que agiu. */
  onAnnounce: (message: string) => void
  onDeliver: (input: { documentId: string; lateRegistration: boolean }) => void
  /** Spec 079: o que aconteceu **sem** a carga voltar. O tipo vem do cadastro da empresa. */
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => void
  occurrenceTypes: DriverOccurrenceTypesState
  onNotDelivered: (input: {
    documentId: string
    draft: NotDeliveredDraft
    lateRegistration: boolean
  }) => void
  onProof: (input: DriverProofAttachment) => void
  onProofFieldsUpdate?: (input: DriverProofFieldsUpdate) => void
  /** Spec 207: "Remover" a foto/assinatura do canhoto — só cabe com o anexo ainda na fila. */
  onRemoveProof?: (documentId: string) => void
  onRetryOccurrenceTypes: () => void
  /** Spec 207: para saber se o anexo desta nota ainda está na fila (oferece "Remover") ou já subiu. */
  queueView: readonly EventQueueItemView[]
  /** Pedido do usuário (25/09): "devolvida às HH:MM — motivo", mesmo retorno de fila da entrega. */
  returnActivity: DocumentReturnActivityView | undefined
  stopProofSettings: DriverDeliveryProofSettings | null
}>

function DocumentRow({
  canActOnDocuments,
  deliverActivity,
  document,
  documentOccurrenceRecordedAt,
  isFieldWorkBlocked,
  isLateRegistration,
  notDeliveredStatus,
  occurrenceTypes,
  onAnnounce,
  onDeliver,
  onDocumentOccurrence,
  onNotDelivered,
  onProof,
  onProofFieldsUpdate,
  onRemoveProof,
  onRetryOccurrenceTypes,
  queueView,
  returnActivity,
  stopProofSettings,
}: DocumentRowProps) {
  const { t } = useTranslation('driverTrip')
  const [openReturn, setOpenReturn] = useState(false)
  const [openOccurrence, setOpenDocumentOccurrence] = useState(false)
  /** O botão "Tentar de novo" some ao ser tocado; o foco fica no painel, não cai no `body`. */
  const occurrencePanelRef = useRef<HTMLFieldSetElement>(null)

  function handleRetryOccurrenceTypes(): void {
    onRetryOccurrenceTypes()
    occurrencePanelRef.current?.focus()
  }
  /** Spec 082 (revisão): a configuração é do **documento** — a da parada é só o shape antigo. */
  const proofSettings = document.deliveryProof ?? stopProofSettings

  if (isFieldWorkBlocked) {
    return (
      <li className={styles.document}>
        <DocumentDetails document={document} />
      </li>
    )
  }

  if (isDocumentSettled(document)) {
    return (
      <li className={`${styles.document} ${styles.documentSettled}`}>
        <DocumentDetails document={document} />
        <span>
          {document.separationStatus === 'delivered'
            ? t('deliver')
            : t(`returnReason.${document.returnReason ?? 'recipient_absent'}`)}
        </span>
        <DriverNotDeliveredStatus status={notDeliveredStatus} />
        {documentOccurrenceRecordedAt === undefined ? null : (
          <ActivityStatusLine
            status="sent"
            text={t('activity.documentOccurrenceRecorded', {
              time: formatActivityTime(documentOccurrenceRecordedAt),
            })}
          />
        )}
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
          />
        ) : null}
      </li>
    )
  }

  return (
    <li className={styles.document}>
      <DocumentDetails document={document} />
      <DriverNotDeliveredStatus status={notDeliveredStatus} />
      {documentOccurrenceRecordedAt === undefined ? null : (
        <ActivityStatusLine
          status="sent"
          text={t('activity.documentOccurrenceRecorded', {
            time: formatActivityTime(documentOccurrenceRecordedAt),
          })}
        />
      )}
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
       * entrega depois" confirmado), Entreguei/Não entreguei/Registrar ocorrência nem entram no
       * DOM. Nada de desabilitado e cinza: o aviso ocupa o lugar delas.
       */}
      {canActOnDocuments ? (
        <>
          <div className={styles.actions}>
            <Button
              onClick={() => {
                onAnnounce(t('activity.toast.delivered'))
                onDeliver({ documentId: document.id, lateRegistration: isLateRegistration })
              }}
              type="button"
            >
              <Icon name="check" />
              {t('deliver')}
            </Button>
            <Button onClick={() => setOpenReturn((open) => !open)} type="button" variant="ghost">
              <Icon name="close" />
              {t('return')}
            </Button>
            {/*
             * ⚠️ Isto **não** é devolver, e o texto do painel diz isso: aqui a carga fica com o
             * cliente. Os tipos oferecidos são só os que a devolução não sabe dizer — ver
             * `driverDocumentOccurrenceTypes`.
             */}
            <Button
              onClick={() => setOpenDocumentOccurrence((open) => !open)}
              type="button"
              variant="ghost"
            >
              <Icon name="alert" />
              {t('documentOccurrence')}
            </Button>
          </div>
          {openOccurrence ? (
            <fieldset className={styles.occurrenceForm} ref={occurrencePanelRef} tabIndex={-1}>
              <legend>{t('documentOccurrence')}</legend>
              <p>{t('documentOccurrenceHint')}</p>
              {occurrenceTypes.status === 'failed' ? (
                <div>
                  <p className={styles.proofFieldError} role="alert">
                    {t('documentOccurrenceTypesFailed')}
                  </p>
                  <Button onClick={handleRetryOccurrenceTypes} type="button" variant="ghost">
                    <Icon name="refresh" />
                    {t('documentOccurrenceTypesRetry')}
                  </Button>
                </div>
              ) : occurrenceTypes.status === 'loading' ? (
                <SkeletonGroup
                  className={styles.occurrenceChips}
                  label={t('documentOccurrenceTypesLoading')}
                >
                  <Skeleton height="var(--control-height)" width="40%" />
                  <Skeleton height="var(--control-height)" width="55%" />
                </SkeletonGroup>
              ) : occurrenceTypes.types.length === 0 ? (
                <p className={styles.stopMeta}>{t('documentOccurrenceTypesEmpty')}</p>
              ) : (
                occurrenceTypes.types.map((occurrenceType) => (
                  <Button
                    key={occurrenceType.id}
                    onClick={() => {
                      onDocumentOccurrence({
                        documentId: document.id,
                        occurrenceTypeId: occurrenceType.id,
                        /* ⚠️ Vazio é a nota inteira. O item entra quando a tela dele souber
                           listá-lo — a nota do motorista ainda não carrega os produtos. */
                        productCode: '',
                      })
                      setOpenDocumentOccurrence(false)
                    }}
                    // O retorno (linha + aviso transitório) chega pelo `.then` de
                    // `onDocumentOccurrence`, acima — nunca em silêncio, mesmo essa sendo uma
                    // chamada direta (sem fila offline).
                    type="button"
                    variant="ghost"
                  >
                    {occurrenceType.name}
                  </Button>
                ))
              )}
            </fieldset>
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
    </li>
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
  onProof: (input: DriverProofAttachment) => void
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
}>

/**
 * Spec 082 T053: o formulário do comprovante é o que a configuração manda — `off` não renderiza,
 * `required` bloqueia o anexo com mensagem **no campo** (todos de uma vez), e o documento do
 * recebedor entra mascarado e sobe canônico. Sem canvas/pointer, a assinatura cai para a foto.
 *
 * Spec 159 (T9): exportado para ser reaproveitado pela tela "Fotos pendentes" — o mesmo formulário,
 * a mesma validação, sem uma segunda implementação divergindo calada.
 */
export function DeliveryProofSection({
  documentId,
  lateRegistration,
  onProof,
  onProofFieldsUpdate,
  onRemoveProof,
  proofSettings,
  queueView = [],
  recipientDisplayName,
  recipientIsCompany,
}: DeliveryProofSectionProps) {
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
  const [attached, setAttached] = useState<{ photo: boolean; signature: boolean }>({
    photo: false,
    signature: false,
  })
  /**
   * Spec 211 (defeito 26/09): foto do canhoto e assinatura são anexos distintos, com miniatura,
   * chave e "Remover" próprios — os dois cabem juntos, e um nunca pisa no lugar do outro.
   */
  const [attachedKey, setAttachedKey] = useState<{ photo?: string; signature?: string }>({})
  const [openImageKind, setOpenImageKind] = useState<'photo' | 'signature' | undefined>(undefined)
  /** Spec 207: "Concluir" — estado só da tela, por nota; nunca `localStorage` (derivado seria melhor,
   * mas o momento em que o motorista concluiu não vem de nenhum outro dado). */
  const [concludedAt, setConcludedAt] = useState<string | undefined>(undefined)
  /** Spec 207: enquanto o anexo está aqui, "Remover" é seguro — enviado, só "Substituir". */
  const isProofQueued = queueView.some(
    (item) => item.kind === 'proof' && item.documentId === documentId,
  )
  const canSign = plan.rendersSignature && isSignatureCaptureSupported()
  const rendersPhotoCapture = plan.rendersPhoto || (plan.rendersSignature && !canSign)
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  /** Spec 211: uma miniatura por kind — cada anexo revoga só a própria URL `blob:` ao trocar. */
  const photoPreview = usePhotoPreviewUrl()
  const signaturePreview = usePhotoPreviewUrl()
  const previewByKind = { photo: photoPreview, signature: signaturePreview }
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
  function blockedByFields(next: { photo: boolean; signature: boolean }): boolean {
    const failures = listMissingProofFields({
      plan,
      values: {
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
   */
  function attach(kind: 'photo' | 'signature', file: File): void {
    const next = { ...attached, [kind]: true }
    setAttached(next)
    /* Spec 207: gerada aqui — é a chave que "Remover" vai pedir de volta, por item, nunca por nota. */
    const attachmentKey = crypto.randomUUID()
    setAttachedKey((current) => ({ ...current, [kind]: attachmentKey }))
    /* Spec 211: cada kind tem a própria miniatura — anexar um nunca troca a do outro. */
    previewByKind[kind].showPhoto(file)
    onProof({
      attachmentKey,
      documentId,
      file,
      kind,
      ...(lateRegistration === true ? { lateRegistration: true } : {}),
      ...currentFields(),
    })
    blockedByFields(next)
  }

  /** Spec 203/193: o campo chega depois do anexo — alcança o mesmo item na fila, se ele ainda estiver lá. */
  function pushLateFieldUpdate(
    overrides: Readonly<{ receivedBy?: string; receiverName?: string }> = {},
  ): void {
    if (attached.photo || attached.signature) {
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
   * Pedido do usuário (25/09, spec 207): "Concluir" nunca trava (spec 203) — com pendência
   * obrigatória, pede confirmação nomeando o que falta; a foto/assinatura já guardada não é
   * descartada em nenhum dos dois caminhos. Antes de fechar, garante que edições digitadas e ainda
   * não confirmadas (`onBlur`) cheguem pelo caminho que já existe (fila ou PATCH).
   */
  function handleComplete(): void {
    pushLateFieldUpdate()
    const pending = listAllPendingFields({
      plan,
      values: {
        hasPhoto: attached.photo,
        hasSignature: attached.signature,
        receivedBy,
        receivedByDetail,
        receiverDocument,
        receiverName,
      },
    })
    if (pending.length > 0) {
      const fieldsText = pending
        .map((field) => t(`proofFields.missing.${field}`))
        .join(', ')
      if (!window.confirm(t('proofFields.completeMissing', { fields: fieldsText }))) return
    }
    setConcludedAt(new Date().toISOString())
  }

  /**
   * Spec 193 D14: "O próprio cliente recebeu" marca `recipient` (quando o campo renderiza) e
   * preenche o nome com `recipientDisplayName`. Para destinatário PJ, o nome fica selecionado com
   * o foco no campo — o motorista digita o nome de quem assinou por cima; para PF, o nome só entra.
   */
  function handleRecipientShortcut(): void {
    const shortcut = applyRecipientShortcut({
      plan,
      recipientDisplayName: recipientDisplayName ?? '',
    })
    setReceiverName(shortcut.receiverName)
    if (shortcut.receivedBy !== undefined) setReceivedBy(shortcut.receivedBy)
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

  /** Spec 207: "Refazer" enquanto o anexo pode ser trocado sem custo; enviado, é "Substituir". */
  const retakeLabel = isProofQueued ? t('proofCapture.retake') : t('proofCapture.replace')

  /**
   * Spec 211 (defeito 26/09): a miniatura, o texto e os botões de um anexo — chamada uma vez por
   * foto e uma vez por assinatura, nunca compartilhada entre os dois.
   */
  function renderAttachedThumbnail(kind: 'photo' | 'signature'): ReactNode {
    const preview = previewByKind[kind]
    if (!attached[kind] || preview.previewUrl === undefined) return null
    return (
      <div className={styles.proofCaptureAttached} role="status">
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
        <span className={styles.proofCaptureAttachedText}>
          <Icon name="check" />
          {kind === 'signature' ? t('signature.attached') : t('proofCapture.attached')}
        </span>
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
    )
  }

  return (
    <div className={styles.proofSection}>
      {concludedAt === undefined ? (
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
                      {attached.photo ? retakeLabel : t('choosePhoto')}
                      {plan.fields.photo === 'required' && !attached.photo ? ' *' : ''}
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
            </div>
          ) : null}

          {/*
       * Spec 193 D7: "Quem recebeu" vem depois da captura — a foto nunca espera por este bloco
       * (C1). Botão rápido, select compacto (R1) e "Detalhes"; nome e documento seguem abaixo.
       */}
      {plan.rendersReceivedBy ? (
        <div className={styles.proofSection}>
          {plan.rendersRecipientShortcut && (recipientDisplayName ?? '') !== '' ? (
            <Button onClick={handleRecipientShortcut} type="button" variant="ghost">
              <Icon name="check" />
              {t('proofFields.recipientShortcut')}
            </Button>
          ) : null}
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
       * Pedido do usuário (25/09, spec 207): o documento aparece SEMPRE, como opcional por
       * padrão — "off"/"optional" nunca escondem o campo, só "required" muda o rótulo/pendência
       * (`resolveProofFormPlan`: `rendersReceiverDocument` é sempre `true`). Sem inputMode numeric:
       * CNPJ e RG podem ter letra, e o teclado numérico do celular a esconde.
       */}
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

      <div className={styles.actions}>
        <Button onClick={handleComplete} type="button">
          <Icon name="check" />
          {t('proofFields.complete')}
        </Button>
      </div>
        </>
      ) : (
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
      )}

      {openImageKind !== undefined && previewByKind[openImageKind].previewUrl !== undefined ? (
        <ProofImageLightbox
          alt={
            openImageKind === 'signature' ? t('signature.thumbnail') : t('proofCapture.thumbnail')
          }
          onClose={() => setOpenImageKind(undefined)}
          src={previewByKind[openImageKind].previewUrl}
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
