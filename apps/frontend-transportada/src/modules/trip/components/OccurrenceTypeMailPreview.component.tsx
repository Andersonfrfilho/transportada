/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { useOccurrenceTypeEmailPreview } from '@/modules/trip/queries/useOccurrenceTypeEmailPreview.query'
import type {
  OccurrenceMailDraft,
  OccurrenceMailProblems,
} from '@/modules/trip/shared/occurrenceMailDraft.service'
import { hasOccurrenceMailProblems } from '@/modules/trip/shared/occurrenceMailDraft.service'
import { OCCURRENCE_ITEM_LINES_MARKER } from '@/modules/trip/shared/occurrenceMailTemplate.constant'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeMailPreviewProps = Readonly<{
  draft: OccurrenceMailDraft
  hasItems: boolean
  isAutomatic: boolean
  problems: OccurrenceMailProblems
}>

/**
 * Spec 247 RF4: a prévia é a resposta do servidor — nada de segunda implementação aqui. Enquanto o texto
 * novo não chega fica o anterior; falha diz que a prévia não saiu e deixa o que foi digitado intocado.
 */
export function OccurrenceTypeMailPreview({
  draft,
  hasItems,
  isAutomatic,
  problems,
}: OccurrenceTypeMailPreviewProps) {
  const { t } = useTranslation('companySettings')
  const hasProblems = hasOccurrenceMailProblems(problems)
  const preview = useOccurrenceTypeEmailPreview({ draft, isEnabled: !hasProblems })
  const isLinesWithoutItems =
    !hasItems && draft.emailBody.includes(`{{${OCCURRENCE_ITEM_LINES_MARKER}}}`)

  function renderStatus() {
    if (hasProblems) return t('occurrenceTypeCatalog.mail.preview.blocked')
    if (preview.isError) return t('occurrenceTypeCatalog.mail.preview.failed')
    if (preview.isPending) return t('occurrenceTypeCatalog.mail.preview.loading')
    return null
  }

  const status = renderStatus()

  return (
    <aside aria-label={t('occurrenceTypeCatalog.mail.preview.title')} className={styles.preview}>
      <p className={styles.fieldLabel}>{t('occurrenceTypeCatalog.mail.preview.title')}</p>
      <div className={styles.mailCard}>
        <span className={styles.mailMeta}>{t('occurrenceTypeCatalog.mail.preview.recipient')}</span>
        <p className={styles.mailSubject}>{preview.data?.subject ?? ''}</p>
        <pre className={styles.mailBody}>{preview.data?.body ?? ''}</pre>
      </div>
      {status === null ? null : (
        <p aria-live="polite" className={styles.hint} role="status">
          {status}
        </p>
      )}
      <p className={styles.hint}>
        {t(
          isAutomatic
            ? 'occurrenceTypeCatalog.mail.preview.automatic'
            : 'occurrenceTypeCatalog.mail.preview.manual',
        )}
      </p>
      {isAutomatic && draft.emailSubject.trim() === '' ? (
        <p className={styles.hint}>{t('occurrenceTypeCatalog.mail.preview.noSubject')}</p>
      ) : null}
      {isLinesWithoutItems ? (
        <p className={styles.hint}>
          {t('occurrenceTypeCatalog.mail.preview.linesWithoutItems', {
            marker: `{{${OCCURRENCE_ITEM_LINES_MARKER}}}`,
          })}
        </p>
      ) : null}
    </aside>
  )
}
