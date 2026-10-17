/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import styles from '@/modules/trip/styles/trip.module.css'

import { OccurrenceMissingTemplateLink } from './OccurrenceMissingTemplateLink.component'

export type OccurrenceMissingTemplateMarkProps = Readonly<{
  isMissing: boolean | undefined
  /** `badge` cabe numa célula ou cartão (que já é um link); `notice` traz o caminho até o editor. */
  variant: 'badge' | 'notice'
}>

/** Spec 269 RF6/D8: o tipo avisa a contratante e não há modelo efetivo — o e-mail não sai, e a marca diz por quê. */
export function OccurrenceMissingTemplateMark({
  isMissing,
  variant,
}: OccurrenceMissingTemplateMarkProps) {
  const { t } = useTranslation('trip')
  if (isMissing !== true) return null

  if (variant === 'badge') {
    return (
      <span className={cn(styles.statusBadge, styles.occurrenceCancelledBadge)}>
        {t('occurrenceFeed.missingTemplate.badge')}
      </span>
    )
  }
  return (
    <div className={styles.occurrenceCancelledNotice} role="status">
      <p className={styles.occurrenceCancelledLabel}>{t('occurrenceFeed.missingTemplate.badge')}</p>
      <OccurrenceMissingTemplateLink />
    </div>
  )
}
