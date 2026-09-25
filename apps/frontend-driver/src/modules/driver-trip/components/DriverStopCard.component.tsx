/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverNotDeliveredForm } from './DriverNotDeliveredForm.component'
import { DriverNotDeliveredStatus } from './DriverNotDeliveredStatus.component'
import { ProofCrop } from './ProofCrop.component'
import { SignaturePad } from './SignaturePad.component'
import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { useCaptureRegistration } from '../hooks/useCaptureRegistration.hook'
import { usePhotoPreviewUrl } from '../hooks/usePhotoPreviewUrl.hook'
import { useTransientNotice } from '../hooks/useTransientNotice.hook'
import { captureRegistry } from '../shared/captureRegistry.service'
import { describeDeliveryWindow } from '../shared/deliveryWindow.service'
import {
  stopHasOccurrenceMarker,
  type DocumentActivityStatus,
  type DocumentActivityView,
  type DocumentReturnActivityView,
} from '../shared/documentActivity.service'
import { formatDocumentAmount, formatDocumentWeight } from '../shared/driverDocumentFormat.service'
import { formatStopDistance } from '../shared/driverStopDistance.service'
import {
  DRIVER_OCCURRENCE_KINDS,
  type DriverDeliveryProofSettings,
  type DriverOccurrenceKind,
  type DriverOccurrenceTypesState,
  type DriverReportedLocation,
  type DriverTripDocument,
  type DriverTripStop,
} from '../shared/driverTrip.types'
import {
  buildNavigationHref,
  countPendingDocuments,
  findOccurrencePhotoDocument,
  isDocumentSettled,
  isProofPendingWarningDue,
} from '../shared/driverTripView.service'
import type { NotDeliveredDraft, NotDeliveredStatus } from '../shared/notDelivered.service'
import { renderOccurrenceNoticePreview } from '../shared/occurrenceNoticePreview.service'
import {
  canonicalReceiverDocument,
  listMissingProofFields,
  maskReceiverDocument,
  resolveProofFormPlan,
  type ProofFieldKey,
} from '../shared/proofFormPlan.service'
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
  documentId: string
  file: File
  kind: 'photo' | 'signature'
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
  onDeliver: (documentId: string) => void
  /** `Promise<boolean>`: sucesso acende a linha e o aviso transitório no cartão, nunca à cega. */
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => Promise<boolean>
  occurrenceTypes: DriverOccurrenceTypesState
  onProof: (input: DriverProofAttachment) => void
  onOccurrence: (input: { description: string; kind: DriverOccurrenceKind; stopId: string }) => void
  /**
   * ⚠️ A rota de ocorrência de parada não aceita anexo: a foto do local/carga sobe pelo caminho de
   * comprovante da nota associada (`/documents/:id/proof`), rotulada como foto da ocorrência.
   */
  onOccurrencePhoto: (input: { documentId: string; file: File }) => void
  /** Spec 179: "Não entreguei" — ocorrência com foto e devolução, no mesmo toque. */
  onNotDelivered: (input: { documentId: string; draft: NotDeliveredDraft }) => void
  /** Pedido do usuário (25/09): o toque no cabeçalho abre/fecha — o aberto vem da página, derivado. */
  onToggle: () => void
  /** Spec 179 RF5: por nota, "na fila" / "enviado" / "recusado" da ocorrência com foto. */
  notDeliveredStatusByDocumentId: ReadonlyMap<string, NotDeliveredStatus>
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
  onOccurrencePhoto,
  onProof,
  onRetryOccurrenceTypes,
  onToggle,
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
          <span className={styles.stopHeaderTop}>
            <span className={styles.stopHeaderTitle}>
              <p className={styles.stopMeta}>{t('stopTitle', { sequence: stop.sequence })}</p>
              <span className={styles.stopHeaderLabelText}>{stop.label}</span>
            </span>
            <span className={styles.stopHeaderRight}>
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
              </span>
              <Icon
                aria-hidden="true"
                className={`${styles.stopExpandIcon} ${isOpen ? styles.stopExpandIconOpen : ''}`}
                name="chevron-down"
              />
            </span>
          </span>
          {/*
          Spec 060 D3: hora e protocolo **antes do endereço**. É o que o porteiro pede, e quem chega
          sem o número volta com a carga — o endereço ele já sabe, porque está lá.
        */}
          {stop.schedule === null ? null : (
            <p className={styles.stopSchedule}>
              {t('schedule.at', { time: formatScheduleTime(stop.schedule.scheduledAt) })}
              {stop.schedule.protocol === ''
                ? ''
                : ` · ${t('schedule.protocol', { protocol: stop.schedule.protocol })}`}
            </p>
          )}
          {/* RF13 (ADR-0075 §8): a janela vem junto da hora marcada — é o que decide se ele entra. */}
          {deliveryWindow === undefined ? null : (
            <p className={styles.stopSchedule}>
              {t(DELIVERY_WINDOW_KEYS[deliveryWindow.kind], deliveryWindow)}
            </p>
          )}
          <p className={styles.stopMeta}>
            {isCompleted
              ? t('stopCompleted')
              : t('documentsPending', { count: countPendingDocuments(stop) })}
          </p>
          {/* Status da parada no cabeçalho, não entre os botões: lá ele ficava solto e desalinhado */}
          {stop.arrivedAt === null && distanceLabel === null ? null : (
            <p className={styles.stopStatus}>
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
            </p>
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
          <OccurrenceForm
            stop={stop}
            onSubmit={(input) => {
              onOccurrence({ description: input.description, kind: input.kind, stopId: stop.id })
              /* A mesma nota da prévia: a escolha mora em `findOccurrencePhotoDocument`. */
              const photoTarget = findOccurrencePhotoDocument(stop)
              if (photoTarget !== undefined) {
                for (const file of input.photos) {
                  onOccurrencePhoto({ documentId: photoTarget.id, file })
                }
              }
              announce(stop.id, t('activity.toast.occurrence'))
              setOpenOccurrence(false)
            }}
          />
        ) : null}

        <ul className={styles.documentList}>
          {stop.documents.map((document) => (
            <DocumentRow
              deliverActivity={deliverActivityByDocumentId.get(document.id)}
              document={document}
              documentOccurrenceRecordedAt={documentOccurrenceRecordedAtByDocumentId.get(
                document.id,
              )}
              isFieldWorkBlocked={isFieldWorkBlocked}
              key={document.id}
              notDeliveredStatus={notDeliveredStatusByDocumentId.get(document.id)}
              onAnnounce={(message) => announce(document.id, message)}
              onDeliver={onDeliver}
              occurrenceTypes={occurrenceTypes}
              onDocumentOccurrence={handleDocumentOccurrence}
              onNotDelivered={onNotDelivered}
              onProof={onProof}
              onRetryOccurrenceTypes={onRetryOccurrenceTypes}
              returnActivity={returnActivityByDocumentId.get(document.id)}
              stopProofSettings={stop.deliveryProof}
            />
          ))}
        </ul>
      </div>
    </li>
  )
}

type DocumentRowProps = Readonly<{
  /** Pedido do usuário (25/09): "entregue às HH:MM" — mesmo retorno de fila da devolução/ocorrência. */
  deliverActivity: DocumentActivityView | undefined
  document: DriverTripDocument
  /** Painel "Registrar ocorrência" (chamada direta): hora da última confirmação, se houve. */
  documentOccurrenceRecordedAt: string | undefined
  isFieldWorkBlocked: boolean
  notDeliveredStatus: NotDeliveredStatus | undefined
  /** O aviso transitório do cartão inteiro — um por parada, anunciado pela nota que agiu. */
  onAnnounce: (message: string) => void
  onDeliver: (documentId: string) => void
  /** Spec 079: o que aconteceu **sem** a carga voltar. O tipo vem do cadastro da empresa. */
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => void
  occurrenceTypes: DriverOccurrenceTypesState
  onNotDelivered: (input: { documentId: string; draft: NotDeliveredDraft }) => void
  onProof: (input: DriverProofAttachment) => void
  onRetryOccurrenceTypes: () => void
  /** Pedido do usuário (25/09): "devolvida às HH:MM — motivo", mesmo retorno de fila da entrega. */
  returnActivity: DocumentReturnActivityView | undefined
  stopProofSettings: DriverDeliveryProofSettings | null
}>

function DocumentRow({
  deliverActivity,
  document,
  documentOccurrenceRecordedAt,
  isFieldWorkBlocked,
  notDeliveredStatus,
  occurrenceTypes,
  onAnnounce,
  onDeliver,
  onDocumentOccurrence,
  onNotDelivered,
  onProof,
  onRetryOccurrenceTypes,
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
        <span>{document.recipientName}</span>
        <DocumentDetails document={document} />
      </li>
    )
  }

  if (isDocumentSettled(document)) {
    return (
      <li className={`${styles.document} ${styles.documentSettled}`}>
        <span>{document.recipientName}</span>
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
        {/* O canhoto anexa depois: a entrega já está confirmada, e o arquivo não a desfaz */}
        {document.separationStatus === 'delivered' ? (
          <DeliveryProofSection
            documentId={document.id}
            onProof={onProof}
            proofSettings={proofSettings}
          />
        ) : null}
      </li>
    )
  }

  return (
    <li className={styles.document}>
      <span>{document.recipientName}</span>
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
      <div className={styles.actions}>
        <Button
          onClick={() => {
            onAnnounce(t('activity.toast.delivered'))
            onDeliver(document.id)
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
         * ⚠️ Isto **não** é devolver, e o texto do painel diz isso: aqui a carga fica com o cliente.
         * Os tipos oferecidos são só os que a devolução não sabe dizer — ver
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
                    /* ⚠️ Vazio é a nota inteira. O item entra quando a tela dele souber listá-lo — a
                       nota do motorista ainda não carrega os produtos. */
                    productCode: '',
                  })
                  setOpenDocumentOccurrence(false)
                }}
                // O retorno (linha + aviso transitório) chega pelo `.then` de `onDocumentOccurrence`,
                // acima — nunca em silêncio, mesmo essa sendo uma chamada direta (sem fila offline).
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
       * devolução — a devolução fecha a nota, a ocorrência é a prova (`notDelivered.service.ts`).
       */}
      {openReturn ? (
        <DriverNotDeliveredForm
          occurrenceTypes={occurrenceTypes}
          onCancel={() => setOpenReturn(false)}
          onConfirm={(draft) => {
            onNotDelivered({ documentId: document.id, draft })
            onAnnounce(t('activity.toast.returned'))
            setOpenReturn(false)
          }}
          onRetryOccurrenceTypes={onRetryOccurrenceTypes}
        />
      ) : null}
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
      <p className={styles.documentDetailsMeta}>
        {t('loadSheet.note', { number: document.number, series: document.series })}
      </p>
      <p className={styles.documentDetailsMeta}>
        {t('loadSheet.volumes', { count: Number(document.volumeCount) })} ·{' '}
        {t('loadSheet.weight', { weight: formatDocumentWeight(document.grossWeight) })}
      </p>
      <p className={styles.documentDetailsAmount}>{formatDocumentAmount(document.totalAmount)}</p>
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
  onProof: (input: DriverProofAttachment) => void
  proofSettings: DriverDeliveryProofSettings | null
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
  onProof,
  proofSettings,
}: DeliveryProofSectionProps) {
  const { t } = useTranslation('driverTrip')
  const plan = resolveProofFormPlan(proofSettings)
  const [receiverName, setReceiverName] = useState('')
  const [receiverDocument, setReceiverDocument] = useState('')
  const [missing, setMissing] = useState<readonly ProofFieldKey[]>([])
  const [openSignature, setOpenSignature] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [attached, setAttached] = useState<{ photo: boolean; signature: boolean }>({
    photo: false,
    signature: false,
  })
  const canSign = plan.rendersSignature && isSignatureCaptureSupported()
  const rendersPhotoCapture = plan.rendersPhoto || (plan.rendersSignature && !canSign)
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const photoPreview = usePhotoPreviewUrl()
  /**
   * M10: nome ou documento digitados e nada anexado ainda é trabalho em andamento — recarregar
   * para o SW novo jogaria fora. Anexou, o texto foi junto com o anexo, e o formulário não segura.
   */
  const hasUnattachedText =
    (receiverName.trim() !== '' || receiverDocument !== '') &&
    !attached.photo &&
    !attached.signature
  useCaptureRegistration('proof-form', hasUnattachedText)

  function receiverFields(): Pick<DriverProofAttachment, 'receiverDocument' | 'receiverName'> {
    const canonical = canonicalReceiverDocument(receiverDocument)
    return {
      ...(receiverName.trim() === '' ? {} : { receiverName: receiverName.trim() }),
      ...(canonical === '' ? {} : { receiverDocument: canonical }),
    }
  }

  /**
   * O veredito do serviço manda, campo a campo: **todo** faltante bloqueia e é pintado — inclusive
   * assinatura e foto obrigatórias, não só os campos de texto.
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

  function attach(kind: 'photo' | 'signature', file: File): void {
    const next = { ...attached, [kind]: true }
    if (blockedByFields(next)) return
    setAttached(next)
    if (kind === 'photo') photoPreview.showPhoto(file)
    onProof({ documentId, file, kind, ...receiverFields() })
  }

  return (
    <div className={styles.proofSection}>
      {plan.rendersReceiverName ? (
        <label className={styles.proofField}>
          <span>
            {t('proofFields.receiverName')}
            {plan.fields.receiverName === 'required' ? ' *' : ''}
          </span>
          <input
            aria-invalid={missing.includes('receiverName')}
            maxLength={120}
            type="text"
            value={receiverName}
            onChange={(event) => {
              setReceiverName(event.target.value)
              setMissing((current) => current.filter((field) => field !== 'receiverName'))
            }}
          />
          {missing.includes('receiverName') ? (
            <span className={styles.proofFieldError} role="alert">
              {t('proofFields.requiredField')}
            </span>
          ) : null}
        </label>
      ) : null}
      {plan.rendersReceiverDocument ? (
        <label className={styles.proofField}>
          <span>
            {t('proofFields.receiverDocument')}
            {plan.fields.receiverDocument === 'required' ? ' *' : ''}
          </span>
          {/* Sem inputMode numeric: CNPJ tem letra, e o teclado numérico do celular a esconde */}
          <input
            aria-invalid={missing.includes('receiverDocument')}
            autoCapitalize="characters"
            maxLength={18}
            type="text"
            value={receiverDocument}
            onChange={(event) => {
              setReceiverDocument(maskReceiverDocument(event.target.value))
              setMissing((current) => current.filter((field) => field !== 'receiverDocument'))
            }}
          />
          {missing.includes('receiverDocument') ? (
            <span className={styles.proofFieldError} role="alert">
              {t('proofFields.requiredField')}
            </span>
          ) : null}
        </label>
      ) : null}

      {/*
       * Pedido do usuário (25/09): três botões iguais — "Tirar foto" abre a câmera na hora,
       * "Anexar" abre galeria e arquivos, "Colher assinatura" abre o quadro. Em 375 px: as duas
       * portas da foto lado a lado e a assinatura na linha inteira, abaixo — cada rótulo cabe
       * numa linha, e a foto (que é a prova da nota) vem primeiro.
       */}
      {rendersPhotoCapture || canSign ? (
        <div className={styles.proofCapture}>
          <p className={styles.proofCaptureTitle}>{t('proofCapture.title')}</p>
          {photoPreview.previewUrl === undefined ? null : (
            <div className={styles.proofCaptureAttached} role="status">
              <img
                alt={t('proofCapture.thumbnail')}
                className={styles.proofCaptureThumbnail}
                src={photoPreview.previewUrl}
              />
              <span className={styles.proofCaptureAttachedText}>
                <Icon name="check" />
                {t('proofCapture.attached')}
              </span>
            </div>
          )}
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
                  {attached.photo ? t('proofCapture.retake') : t('choosePhoto')}
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
                {t('signature.open')}
                {plan.fields.signature === 'required' && !attached.signature ? ' *' : ''}
              </Button>
            ) : null}
          </div>
          {missing.includes('photo') || missing.includes('signature') ? (
            <span className={styles.proofFieldError} role="alert">
              {t('proofFields.requiredField')}
            </span>
          ) : null}
        </div>
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

type OccurrenceFormProps = Readonly<{
  onSubmit: (input: {
    description: string
    kind: DriverOccurrenceKind
    photos: readonly File[]
  }) => void
  stop: DriverTripStop
}>

/**
 * O motorista descreve o que viu — e só. Não há campo de valor, de custo nem de culpa: quem decide é
 * o escritório (ADR-0045 §6.1). Spec 082 D8: o motivo é escolha por chips, e a prévia mostra o
 * aviso que o cliente vai receber — inclusive quando o motivo não gera aviso nenhum.
 */
function OccurrenceForm({ onSubmit, stop }: OccurrenceFormProps) {
  const { t } = useTranslation('driverTrip')
  const [kind, setKind] = useState<DriverOccurrenceKind>('long_wait')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<readonly File[]>([])
  const cameraFieldRef = useCameraCaptureFieldRef()

  /** Plan D2: aberto do montar ao desmontar — navegar no meio do relato perdia o que já foi digitado. */
  useEffect(() => {
    captureRegistry.open('occurrence-dialog')
    return () => captureRegistry.close('occurrence-dialog')
  }, [])

  const noteDocument = findOccurrencePhotoDocument(stop)
  const preview = renderOccurrenceNoticePreview({
    documentLabel: noteDocument === undefined ? '—' : noteDocument.number,
    kind,
    occurredAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    stopLabel: stop.label,
  })

  return (
    <div className={styles.occurrenceForm}>
      <div aria-label={t('occurrence')} className={styles.occurrenceChips} role="radiogroup">
        {DRIVER_OCCURRENCE_KINDS.map((option) => (
          <Button
            aria-checked={option === kind}
            className={styles.occurrenceChip}
            key={option}
            onClick={() => setKind(option)}
            role="radio"
            type="button"
            variant={option === kind ? 'default' : 'ghost'}
          >
            {t(`occurrenceKind.${option}`)}
          </Button>
        ))}
      </div>
      <label>
        <span>{t('occurrenceDescription')}</span>
        <textarea
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </label>
      <div className={styles.occurrencePreview}>
        <p className={styles.occurrencePreviewTitle}>{t('occurrencePreview.title')}</p>
        {preview === null ? (
          <p className={styles.occurrencePreviewText}>{t('occurrencePreview.none')}</p>
        ) : (
          <>
            <p className={styles.occurrencePreviewText}>{preview.text}</p>
            <p className={styles.occurrencePreviewKey}>{preview.templateKey}</p>
          </>
        )}
      </div>
      {/* ⚠️ A rota da ocorrência não aceita anexo: a foto sobe pelo proof da nota associada. */}
      {noteDocument === undefined ? null : (
        <div className={styles.proofField}>
          <FileField
            resetAfterSelect
            accept="image/*"
            actionLabel={t('choosePhoto')}
            capture="environment"
            inputRef={cameraFieldRef}
            label={t('occurrencePhoto')}
            placeholder={t('noPhotoChosen')}
            onSelect={(file) => {
              if (file !== undefined) setPhotos((current) => [...current, file])
            }}
          />
          {photos.length === 0 ? null : (
            <span>{t('occurrencePhotoCount', { count: photos.length })}</span>
          )}
        </div>
      )}
      <Button onClick={() => onSubmit({ description, kind, photos })} type="button">
        <Icon name="save" />
        {t('occurrenceSend')}
      </Button>
    </div>
  )
}
