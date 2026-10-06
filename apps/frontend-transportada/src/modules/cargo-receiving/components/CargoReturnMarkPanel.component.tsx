/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCargoMarkPanel } from '../hooks/useCargoMarkPanel.hook'
import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import { CARGO_OCCURRENCE_LIMITS } from '../shared/cargoOccurrence.constant'
import styles from '../styles/cargoOccurrence.module.css'
import { CargoReturnOriginSelect } from './CargoReturnOriginSelect.component'

type CargoReturnMarkPanelProps = Readonly<{
  isPending: boolean
  occurrences: readonly CargoOccurrenceView[]
  onCancel: () => void
  onConfirm: (input: Readonly<{ note: string; occurrenceId: string }>) => void
}>

/** Devolver ao contratante: escolhe a avaria que motiva e, se quiser, deixa uma observação. Só marca ao confirmar. */
export function CargoReturnMarkPanel({
  isPending,
  occurrences,
  onCancel,
  onConfirm,
}: CargoReturnMarkPanelProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const panel = useCargoMarkPanel(occurrences)

  return (
    <div className={styles.markPanel}>
      <CargoReturnOriginSelect
        occurrenceId={panel.occurrenceId}
        occurrences={occurrences}
        onChange={panel.setOccurrenceId}
      />
      <label>
        {t('occurrence.mark.noteLabel')}
        <textarea
          maxLength={CARGO_OCCURRENCE_LIMITS.noteMaxLength}
          onChange={(event) => panel.setNote(event.target.value)}
          value={panel.note}
        />
      </label>
      <div className={styles.panelActions}>
        <Button
          className={styles.noteAction}
          disabled={isPending || panel.occurrenceId === ''}
          onClick={() => onConfirm({ note: panel.note, occurrenceId: panel.occurrenceId })}
          type="button"
        >
          <Icon name="check" />
          {t('occurrence.mark.confirm')}
        </Button>
        <Button
          className={styles.noteAction}
          disabled={isPending}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          {t('occurrence.mark.cancel')}
        </Button>
      </div>
    </div>
  )
}
