/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { OCCURRENCE_MOMENTS } from '@/modules/trip/shared/occurrence.constant'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

/**
 * Spec 247 D10: o que cada momento quer dizer, com o exemplo — "Entrega da nota" soava a hora em que a nota foi
 * entregue, e o momento é **quem registra, e onde**. À vista, não no tooltip: é a explicação que a operação lê
 * antes de escolher, e a lista do `MultiSelect` não tem onde pôr uma segunda linha sem poluir as pílulas.
 */
export function OccurrenceTypeMomentHints() {
  const { t } = useTranslation('companySettings')

  return (
    <dl aria-label={t('occurrenceTypeCatalog.moments.hintsTitle')} className={styles.momentHints}>
      {OCCURRENCE_MOMENTS.map((moment) => (
        <div className={styles.momentHint} key={moment}>
          <dt>{t(`occurrenceTypeCatalog.moments.labels.${moment}`)}</dt>
          <dd>{t(`occurrenceTypeCatalog.moments.hints.${moment}`)}</dd>
        </div>
      ))}
    </dl>
  )
}
