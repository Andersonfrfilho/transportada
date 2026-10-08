/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import styles from '../styles/trip.module.css'
import type { TripDocumentDetail, TripDriverLine, TripStopDetail } from '../shared/trip.types'

import { TripConferenceDialog } from './TripConferenceDialog.component'

type TripConferenceActionProps = Readonly<{
  creatorName: null | string | undefined
  documents: readonly TripDocumentDetail[]
  drivers: readonly TripDriverLine[]
  stops: readonly TripStopDetail[]
  tripCode: string
  vehiclePlate: null | string
}>

export function TripConferenceAction({
  creatorName,
  documents,
  drivers,
  stops,
  tripCode,
  vehiclePlate,
}: TripConferenceActionProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Tooltip label={t('conference.button')}>
        <Button
          aria-label={t('conference.button')}
          onClick={() => setIsOpen(true)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="clipboard-list" />
          <span className={styles.conferenceButtonLabel}>{t('conference.button')}</span>
        </Button>
      </Tooltip>
      <TripConferenceDialog
        creatorName={creatorName}
        documents={documents}
        drivers={drivers}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        stops={stops}
        tripCode={tripCode}
        vehiclePlate={vehiclePlate}
      />
    </>
  )
}
