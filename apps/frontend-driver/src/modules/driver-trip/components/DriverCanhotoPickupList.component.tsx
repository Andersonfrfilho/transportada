/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCaptureRegistration } from '../hooks/useCaptureRegistration.hook'
import type { DriverCanhotoPickupOutcome } from '../hooks/useDriverTrip.hook'
import type { OccurrencePhotoState } from '../hooks/useOccurrenceRegistrationForm.hook'
import { usePhotoPreviewUrl } from '../hooks/usePhotoPreviewUrl.hook'
import { reduceProofPhotoToJpeg } from '../shared/proofPhotoReduction.service'
import type { DriverCanhotoPickup } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'
import { OccurrencePhotoField } from './OccurrencePhotoField.component'

type DriverCanhotoPickupListProps = Readonly<{
  /** Spec 321 T6: o ajudante acompanha, não fotografa (`isReadOnly` da parada). */
  isReadOnly: boolean
  onSend: (input: { file: File; pickupId: string }) => Promise<DriverCanhotoPickupOutcome>
  pickups: readonly DriverCanhotoPickup[] | undefined
}>

/**
 * Spec 321 T6 (D4b, RF4/RF6): a parada "Coletar canhoto". A coleta encaixada pelo escritório aparece com o número da nota
 * de origem e o cliente; o motorista fotografa o canhoto e a foto sai direto para a API (sem fila: a coleta já existe e
 * quem decide é a conferência). Depois da foto o cartão só diz que espera a conferência. Sem coleta não renderiza nada.
 */
export function DriverCanhotoPickupList({
  isReadOnly,
  onSend,
  pickups,
}: DriverCanhotoPickupListProps) {
  if (pickups === undefined || pickups.length === 0) return null

  return (
    <ul className={styles.documentList}>
      {pickups.map((pickup) => (
        <DriverCanhotoPickupRow
          isReadOnly={isReadOnly}
          key={pickup.id}
          onSend={onSend}
          pickup={pickup}
        />
      ))}
    </ul>
  )
}

type SendState = 'failed' | 'idle' | 'offline' | 'sending'

function DriverCanhotoPickupRow({
  isReadOnly,
  onSend,
  pickup,
}: Readonly<{
  isReadOnly: boolean
  onSend: DriverCanhotoPickupListProps['onSend']
  pickup: DriverCanhotoPickup
}>) {
  const { t } = useTranslation('driverTrip')
  const [photo, setPhoto] = useState<File | undefined>(undefined)
  const [photoState, setPhotoState] = useState<OccurrencePhotoState>('idle')
  const [sendState, setSendState] = useState<SendState>('idle')
  const preview = usePhotoPreviewUrl()
  const isWaitingReview = pickup.photoSentAt !== null
  const canCapture = !isReadOnly && !isWaitingReview
  /** O formulário aberto é captura: nem o SW novo nem a reautenticação navegam no meio. */
  useCaptureRegistration('proof-form', canCapture && photo !== undefined)

  async function readPhoto(file: File): Promise<void> {
    setPhotoState('reading')
    setSendState('idle')
    try {
      const reduced = await reduceProofPhotoToJpeg(file)
      preview.showPhoto(reduced.blob)
      setPhoto(new File([reduced.blob], reduced.fileName, { type: 'image/jpeg' }))
      setPhotoState('idle')
    } catch {
      setPhotoState('failed')
    }
  }

  async function send(): Promise<void> {
    if (photo === undefined) return
    setSendState('sending')
    const outcome = await onSend({ file: photo, pickupId: pickup.id })
    if (outcome === 'sent') {
      setPhoto(undefined)
      setSendState('idle')
      return
    }
    setSendState(outcome)
  }

  return (
    <li className={styles.document}>
      <div className={styles.documentDetails}>
        <p className={styles.documentDetailsRecipient}>
          <Icon aria-hidden="true" name="document" size="sm" />
          {t('canhotoPickup.title')}
        </p>
        {/* No celular não há passar o mouse: o motivo fica escrito, não escondido em dica. */}
        <p className={styles.documentDetailsMeta}>{t('canhotoPickup.explanation')}</p>
        <p className={styles.documentDetailsMeta}>
          {t('canhotoPickup.note', {
            number: pickup.documentNumber,
            series: pickup.documentSeries,
          })}
        </p>
        {pickup.recipientDisplayName === '' ? null : (
          <p className={styles.documentDetailsMeta}>{pickup.recipientDisplayName}</p>
        )}
      </div>
      {isWaitingReview ? (
        <p className={styles.stopMetaCompleted} role="status">
          <Icon aria-hidden="true" name="check" size="sm" />
          {t('canhotoPickup.waitingReview')}
        </p>
      ) : isReadOnly ? null : (
        <>
          <OccurrencePhotoField
            attachedLabel={t('canhotoPickup.photoAttached')}
            isMissing={photo === undefined}
            limit={1}
            onRemoveLast={() => undefined}
            onSelect={(file) => void readPhoto(file)}
            photoCount={photo === undefined ? 0 : 1}
            photoState={photoState}
            previewUrl={preview.previewUrl}
            title={t('canhotoPickup.photoTitle')}
          />
          <Button
            aria-disabled={photo === undefined || sendState === 'sending'}
            className={styles.proofCaptureAction}
            disabled={photo === undefined || sendState === 'sending'}
            onClick={() => void send()}
            type="button"
          >
            <Icon aria-hidden="true" name="upload" />
            {t(sendState === 'sending' ? 'canhotoPickup.sending' : 'canhotoPickup.send')}
          </Button>
          {sendState === 'offline' || sendState === 'failed' ? (
            <p className={styles.proofFieldError} role="alert">
              {t(sendState === 'offline' ? 'canhotoPickup.offline' : 'canhotoPickup.failed')}
            </p>
          ) : null}
        </>
      )}
    </li>
  )
}
