/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@/components/ui/progress'

import type { CargoStateCounts } from '../shared/cargoArrival.types'

type CargoArrivalProgressProps = Readonly<{ counts: CargoStateCounts }>

/** Separadas sobre o total da chegada: em barra para o olho, e em texto para o leitor de tela. */
export function CargoArrivalProgress({ counts }: CargoArrivalProgressProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <ProgressBar
      completed={counts.separated}
      label={t('progress.label')}
      total={counts.total}
      valueText={t('progress.value', { separated: counts.separated, total: counts.total })}
    />
  )
}
