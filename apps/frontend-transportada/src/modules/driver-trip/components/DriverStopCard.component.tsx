/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import {
  DRIVER_OCCURRENCE_KINDS,
  DRIVER_RETURN_REASONS,
  driverDocumentOccurrenceTypes,
  type DriverOccurrenceKind,
  type DriverReturnReason,
  type DriverTripDocument,
  type DriverTripStop,
} from '../shared/driverTrip.types'
import {
  buildNavigationHref,
  countPendingDocuments,
  isDocumentSettled,
} from '../shared/driverTripView.service'
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

type DriverStopCardProps = Readonly<{
  isCurrent: boolean
  onArrive: (stopId: string) => void
  onDeliver: (documentId: string) => void
  onDocumentOccurrence: (input: { documentId: string; type: string }) => void
  onProof: (input: { documentId: string; file: File }) => void
  onOccurrence: (input: { description: string; kind: DriverOccurrenceKind; stopId: string }) => void
  onReturn: (input: { documentId: string; reason: DriverReturnReason }) => void
  stop: DriverTripStop
}>

export function DriverStopCard({
  isCurrent,
  onArrive,
  onDeliver,
  onDocumentOccurrence,
  onOccurrence,
  onProof,
  onReturn,
  stop,
}: DriverStopCardProps) {
  const { t } = useTranslation('driverTrip')
  const [openOccurrence, setOpenOccurrence] = useState(false)
  const isCompleted = stop.completedAt !== null

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
            onDocumentOccurrence={onDocumentOccurrence}
            onProof={onProof}
            onReturn={onReturn}
          />
        ))}
      </ul>
    </li>
  )
}

type DocumentRowProps = Readonly<{
  document: DriverTripDocument
  onDeliver: (documentId: string) => void
  /** Spec 079: o que aconteceu **sem** a carga voltar — recusa parcial, avaria que o cliente aceitou. */
  onDocumentOccurrence: (input: { documentId: string; type: string }) => void
  onProof: (input: { documentId: string; file: File }) => void
  onReturn: (input: { documentId: string; reason: DriverReturnReason }) => void
}>

function DocumentRow({
  document,
  onDeliver,
  onDocumentOccurrence,
  onProof,
  onReturn,
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
          <label className={styles.proofField}>
            <span>{t('proof')}</span>
            <input
              accept="image/*"
              capture="environment"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file !== undefined) onProof({ documentId: document.id, file })
              }}
            />
          </label>
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
          {driverDocumentOccurrenceTypes().map((type) => (
            <Button
              key={type}
              onClick={() => {
                onDocumentOccurrence({ documentId: document.id, type })
                setOpenDocumentOccurrence(false)
              }}
              type="button"
              variant="ghost"
            >
              {t(`documentOccurrenceType.${type}`)}
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
