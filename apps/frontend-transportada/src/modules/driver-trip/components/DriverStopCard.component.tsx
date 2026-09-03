/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { ProofCrop } from './ProofCrop.component'
import { SignaturePad } from './SignaturePad.component'
import { formatStopDistance } from '../shared/driverStopDistance.service'
import {
  DRIVER_OCCURRENCE_KINDS,
  DRIVER_RETURN_REASONS,
  driverSelectableOccurrenceTypes,
  type DriverDeliveryProofSettings,
  type DriverOccurrenceKind,
  type DriverOccurrenceType,
  type DriverReportedLocation,
  type DriverReturnReason,
  type DriverTripDocument,
  type DriverTripStop,
} from '../shared/driverTrip.types'
import {
  buildNavigationHref,
  countPendingDocuments,
  isDocumentSettled,
} from '../shared/driverTripView.service'
import {
  canonicalReceiverDocument,
  listMissingProofFields,
  maskReceiverDocument,
  resolveProofFormPlan,
  type ProofFieldKey,
} from '../shared/proofFormPlan.service'
import { isSignatureCaptureSupported } from '../shared/signatureCapture.service'
import styles from '../styles/driverTrip.module.css'

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

export type DriverProofAttachment = Readonly<{
  documentId: string
  file: File
  kind: 'photo' | 'signature'
  receiverDocument?: string
  receiverName?: string
}>

type DriverStopCardProps = Readonly<{
  isCurrent: boolean
  /** Spec 082 D2: a última posição conhecida — sem ela, a distância simplesmente não aparece. */
  lastKnownLocation: DriverReportedLocation | null
  onArrive: (stopId: string) => void
  onDeliver: (documentId: string) => void
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => void
  occurrenceTypes: readonly DriverOccurrenceType[]
  onProof: (input: DriverProofAttachment) => void
  onOccurrence: (input: { description: string; kind: DriverOccurrenceKind; stopId: string }) => void
  onReturn: (input: { documentId: string; reason: DriverReturnReason }) => void
  stop: DriverTripStop
}>

export function DriverStopCard({
  isCurrent,
  lastKnownLocation,
  onArrive,
  onDeliver,
  occurrenceTypes,
  onDocumentOccurrence,
  onOccurrence,
  onProof,
  onReturn,
  stop,
}: DriverStopCardProps) {
  const { t } = useTranslation('driverTrip')
  const [openOccurrence, setOpenOccurrence] = useState(false)
  const isCompleted = stop.completedAt !== null
  const distanceLabel = formatStopDistance({ location: lastKnownLocation, stop })

  return (
    <li
      className={`${styles.stop} ${isCurrent ? styles.stopCurrent : ''} ${isCompleted ? styles.stopDone : ''}`}
    >
      <header className={styles.stopHeader}>
        <p className={styles.stopMeta}>{t('stopTitle', { sequence: stop.sequence })}</p>
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
        <h2 className={styles.stopLabel}>{stop.label}</h2>
        <p className={styles.stopMeta}>
          {isCompleted
            ? t('stopCompleted')
            : t('documentsPending', { count: countPendingDocuments(stop) })}
        </p>
      </header>

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
        {/* Spec 082 D2: sem posição ou sem coordenada da parada, nada — nunca "0 km" */}
        {distanceLabel === null ? null : (
          <span className={styles.stopDistance}>{distanceLabel}</span>
        )}
        {stop.arrivedAt === null ? (
          <Button onClick={() => onArrive(stop.id)} type="button">
            <Icon name="check" />
            {t('arrive')}
          </Button>
        ) : (
          <span className={styles.stopMeta}>
            {t('arrived', { time: new Date(stop.arrivedAt).toLocaleTimeString() })}
          </span>
        )}
        <Button onClick={() => setOpenOccurrence((open) => !open)} type="button" variant="ghost">
          <Icon name="alert" />
          {t('occurrence')}
        </Button>
      </div>

      {openOccurrence ? (
        <OccurrenceForm
          onSubmit={(input) => {
            onOccurrence({ ...input, stopId: stop.id })
            setOpenOccurrence(false)
          }}
        />
      ) : null}

      <ul className={styles.documentList}>
        {stop.documents.map((document) => (
          <DocumentRow
            document={document}
            key={document.id}
            onDeliver={onDeliver}
            occurrenceTypes={occurrenceTypes}
            onDocumentOccurrence={onDocumentOccurrence}
            onProof={onProof}
            onReturn={onReturn}
            proofSettings={stop.deliveryProof}
          />
        ))}
      </ul>
    </li>
  )
}

type DocumentRowProps = Readonly<{
  document: DriverTripDocument
  onDeliver: (documentId: string) => void
  /** Spec 079: o que aconteceu **sem** a carga voltar. O tipo vem do cadastro da empresa. */
  onDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => void
  occurrenceTypes: readonly DriverOccurrenceType[]
  onProof: (input: DriverProofAttachment) => void
  onReturn: (input: { documentId: string; reason: DriverReturnReason }) => void
  proofSettings: DriverDeliveryProofSettings | null
}>

function DocumentRow({
  document,
  occurrenceTypes,
  onDeliver,
  onDocumentOccurrence,
  onProof,
  onReturn,
  proofSettings,
}: DocumentRowProps) {
  const { t } = useTranslation('driverTrip')
  const [openReturn, setOpenReturn] = useState(false)
  const [openOccurrence, setOpenDocumentOccurrence] = useState(false)

  if (isDocumentSettled(document)) {
    return (
      <li className={`${styles.document} ${styles.documentSettled}`}>
        <span>{document.recipientName}</span>
        <span>
          {document.separationStatus === 'delivered'
            ? t('deliver')
            : t(`returnReason.${document.returnReason ?? 'recipient_absent'}`)}
        </span>
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
      <div className={styles.actions}>
        <Button onClick={() => onDeliver(document.id)} type="button">
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
        <fieldset className={styles.occurrenceForm}>
          <legend>{t('documentOccurrence')}</legend>
          <p>{t('documentOccurrenceHint')}</p>
          {driverSelectableOccurrenceTypes(occurrenceTypes).map((occurrenceType) => (
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
              type="button"
              variant="ghost"
            >
              {occurrenceType.name}
            </Button>
          ))}
        </fieldset>
      ) : null}
      {openReturn ? (
        <fieldset className={styles.occurrenceForm}>
          <legend>{t('returnTitle')}</legend>
          {DRIVER_RETURN_REASONS.map((reason) => (
            <Button
              key={reason}
              onClick={() => {
                onReturn({ documentId: document.id, reason })
                setOpenReturn(false)
              }}
              type="button"
              variant="ghost"
            >
              {t(`returnReason.${reason}`)}
            </Button>
          ))}
        </fieldset>
      ) : null}
    </li>
  )
}

type DeliveryProofSectionProps = Readonly<{
  documentId: string
  onProof: (input: DriverProofAttachment) => void
  proofSettings: DriverDeliveryProofSettings | null
}>

/**
 * Spec 082 T053: o formulário do comprovante é o que a configuração manda — `off` não renderiza,
 * `required` bloqueia o anexo com mensagem **no campo** (todos de uma vez), e o documento do
 * recebedor entra mascarado e sobe canônico. Sem canvas/pointer, a assinatura cai para a foto.
 */
function DeliveryProofSection({ documentId, onProof, proofSettings }: DeliveryProofSectionProps) {
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

  function receiverFields(): Pick<DriverProofAttachment, 'receiverDocument' | 'receiverName'> {
    const canonical = canonicalReceiverDocument(receiverDocument)
    return {
      ...(receiverName.trim() === '' ? {} : { receiverName: receiverName.trim() }),
      ...(canonical === '' ? {} : { receiverDocument: canonical }),
    }
  }

  /** A checagem dos campos de texto vem **antes** do anexo: campo obrigatório vazio segura o envio. */
  function blockedByFields(next: { photo: boolean; signature: boolean }): boolean {
    const failures = listMissingProofFields({
      plan,
      values: {
        hasPhoto: next.photo,
        hasSignature: next.signature,
        receiverDocument,
        receiverName,
      },
    }).filter((field) => field === 'receiverName' || field === 'receiverDocument')
    setMissing(failures)
    return failures.length > 0
  }

  function attach(kind: 'photo' | 'signature', file: File): void {
    const next = { ...attached, [kind]: true }
    if (blockedByFields(next)) return
    setAttached(next)
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

      <div className={styles.actions}>
        {canSign ? (
          <Button
            aria-label={t('signature.open')}
            onClick={() => setOpenSignature((open) => !open)}
            type="button"
            variant="ghost"
          >
            <Icon name="save" />
            {t('signature.open')}
            {plan.fields.signature === 'required' && !attached.signature ? ' *' : ''}
          </Button>
        ) : null}
        {plan.rendersPhoto || (plan.rendersSignature && !canSign) ? (
          <label className={styles.proofField}>
            <span>
              {t('proof')}
              {plan.fields.photo === 'required' && !attached.photo ? ' *' : ''}
            </span>
            <input
              accept="image/*"
              capture="environment"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file !== undefined) setCropFile(file)
              }}
            />
          </label>
        ) : null}
      </div>

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
  onSubmit: (input: { description: string; kind: DriverOccurrenceKind }) => void
}>

/**
 * O motorista descreve o que viu — e só. Não há campo de valor, de custo nem de culpa: quem decide é
 * o escritório (ADR-0045 §6.1).
 */
function OccurrenceForm({ onSubmit }: OccurrenceFormProps) {
  const { t } = useTranslation('driverTrip')
  const [kind, setKind] = useState<DriverOccurrenceKind>('long_wait')
  const [description, setDescription] = useState('')

  return (
    <div className={styles.occurrenceForm}>
      <label>
        <span>{t('occurrence')}</span>
        <Select
          ariaLabel={t('occurrence')}
          options={DRIVER_OCCURRENCE_KINDS.map((option) => ({
            label: t(`occurrenceKind.${option}`),
            value: option,
          }))}
          value={kind}
          onChange={(next) => setKind(next as DriverOccurrenceKind)}
        />
      </label>
      <label>
        <span>{t('occurrenceDescription')}</span>
        <input
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          type="text"
          value={description}
        />
      </label>
      <Button onClick={() => onSubmit({ description, kind })} type="button">
        <Icon name="save" />
        {t('occurrenceSend')}
      </Button>
    </div>
  )
}
