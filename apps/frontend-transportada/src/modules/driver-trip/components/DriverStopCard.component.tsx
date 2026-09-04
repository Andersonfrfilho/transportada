/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

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
  findOccurrencePhotoDocument,
  isDocumentSettled,
} from '../shared/driverTripView.service'
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
  /**
   * Spec 082 (revisão): viagem `route_planned` chega à tela, mas as ações de campo ficam trancadas
   * até o motorista iniciar o trajeto — a API recusa essas escritas, e a fila offline não pode
   * acumular eventos condenados.
   */
  isFieldWorkBlocked: boolean
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
  /**
   * ⚠️ A rota de ocorrência de parada não aceita anexo: a foto do local/carga sobe pelo caminho de
   * comprovante da nota associada (`/documents/:id/proof`), rotulada como foto da ocorrência.
   */
  onOccurrencePhoto: (input: { documentId: string; file: File }) => void
  onReturn: (input: { documentId: string; reason: DriverReturnReason }) => void
  stop: DriverTripStop
}>

export function DriverStopCard({
  isCurrent,
  isFieldWorkBlocked,
  lastKnownLocation,
  onArrive,
  onDeliver,
  occurrenceTypes,
  onDocumentOccurrence,
  onOccurrence,
  onOccurrencePhoto,
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
        {/* Trancado até o despacho: a API recusa `arrive` fora de dispatched/in_transit */}
        {isFieldWorkBlocked ? null : stop.arrivedAt === null ? (
          <Button onClick={() => onArrive(stop.id)} type="button">
            <Icon name="check" />
            {t('arrive')}
          </Button>
        ) : (
          <span className={styles.stopMeta}>
            {t('arrived', { time: new Date(stop.arrivedAt).toLocaleTimeString() })}
          </span>
        )}
        {isFieldWorkBlocked ? null : (
          <Button onClick={() => setOpenOccurrence((open) => !open)} type="button" variant="ghost">
            <Icon name="alert" />
            {t('occurrence')}
          </Button>
        )}
      </div>

      {isFieldWorkBlocked ? <p className={styles.stopMeta}>{t('dispatch.waiting')}</p> : null}

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
            setOpenOccurrence(false)
          }}
        />
      ) : null}

      <ul className={styles.documentList}>
        {stop.documents.map((document) => (
          <DocumentRow
            document={document}
            isFieldWorkBlocked={isFieldWorkBlocked}
            key={document.id}
            onDeliver={onDeliver}
            occurrenceTypes={occurrenceTypes}
            onDocumentOccurrence={onDocumentOccurrence}
            onProof={onProof}
            onReturn={onReturn}
            stopProofSettings={stop.deliveryProof}
          />
        ))}
      </ul>
    </li>
  )
}

type DocumentRowProps = Readonly<{
  document: DriverTripDocument
  isFieldWorkBlocked: boolean
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
  stopProofSettings: DriverDeliveryProofSettings | null
}>

function DocumentRow({
  document,
  isFieldWorkBlocked,
  occurrenceTypes,
  onDeliver,
  onDocumentOccurrence,
  onProof,
  onReturn,
  stopProofSettings,
}: DocumentRowProps) {
  const { t } = useTranslation('driverTrip')
  const [openReturn, setOpenReturn] = useState(false)
  const [openOccurrence, setOpenDocumentOccurrence] = useState(false)
  /** Spec 082 (revisão): a configuração é do **documento** — a da parada é só o shape antigo. */
  const proofSettings = document.deliveryProof ?? stopProofSettings

  if (isFieldWorkBlocked) {
    return (
      <li className={styles.document}>
        <span>{document.recipientName}</span>
      </li>
    )
  }

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
        {missing.includes('signature') ? (
          <span className={styles.proofFieldError} role="alert">
            {t('proofFields.requiredField')}
          </span>
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
            {missing.includes('photo') ? (
              <span className={styles.proofFieldError} role="alert">
                {t('proofFields.requiredField')}
              </span>
            ) : null}
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
        <label className={styles.proofField}>
          <span>{t('occurrencePhoto')}</span>
          <input
            accept="image/*"
            capture="environment"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file !== undefined) setPhotos((current) => [...current, file])
            }}
          />
          {photos.length === 0 ? null : (
            <span>{t('occurrencePhotoCount', { count: photos.length })}</span>
          )}
        </label>
      )}
      <Button onClick={() => onSubmit({ description, kind, photos })} type="button">
        <Icon name="save" />
        {t('occurrenceSend')}
      </Button>
    </div>
  )
}
