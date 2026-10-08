/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { formatPreviewEmailMoment } from '../shared/previewEmailLink.service'
import type { PreviewEmailSettings } from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'

const DEFAULT_LOCALE = 'pt-BR'

type PreviewEmailStatusProps = Readonly<{ settings: PreviewEmailSettings }>

/** "Sem endereço" × "ativo desde …": o endereço em si nunca aparece aqui — só o gerar o mostra, uma vez. */
export function PreviewEmailStatus({ settings }: PreviewEmailStatusProps): JSX.Element {
  const { i18n, t } = useTranslation('previewEmail')
  const { hasInboundToken, inboundTokenSetAt } = settings
  const moment = formatPreviewEmailMoment({
    locale: i18n.resolvedLanguage ?? DEFAULT_LOCALE,
    value: inboundTokenSetAt,
  })
  const label = !hasInboundToken
    ? t('status.none')
    : inboundTokenSetAt === null
      ? t('status.active')
      : t('status.activeSince', { moment })

  return (
    <div>
      <div className={previewStyles.status}>
        <span className={`${styles.badge} ${hasInboundToken ? styles.badgeOn : styles.badgeOff}`}>
          {hasInboundToken ? t('status.active') : t('status.none')}
        </span>
        <p className={previewStyles.statusText} role="status">
          {label}
        </p>
      </div>
      <p className={styles.hint}>
        {hasInboundToken ? t('status.activeHint') : t('status.noneHint')}
      </p>
    </div>
  )
}
