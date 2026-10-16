/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { OccurrenceMissingTemplateLink } from '@/modules/trip/components/OccurrenceMissingTemplateLink.component'

import styles from '../styles/occurrenceConversation.module.css'

/** Spec 269 D4: sem modelo efetivo o envio não existe — o aviso diz por quê e leva ao editor do tipo. */
export function ContractorMailMissingTemplateNotice() {
  const { t } = useTranslation('occurrenceConversation')

  return (
    <div className={styles.error} role="alert">
      <p>{t('dialog.missingTemplate')}</p>
      <OccurrenceMissingTemplateLink />
    </div>
  )
}
