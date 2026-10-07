/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'

/** As contagens da devolução entram nos fatos do cabeçalho — e só quando há nota marcada ou devolvida. */
export function CargoReturnCountFacts(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { marked, returned } = useCargoOccurrence().returnCounts

  return (
    <>
      {marked > 0 ? <li>{t('occurrence.counts.marked', { count: marked })}</li> : null}
      {returned > 0 ? <li>{t('occurrence.counts.returned', { count: returned })}</li> : null}
    </>
  )
}
