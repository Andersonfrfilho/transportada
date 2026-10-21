/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { OccurrenceWatchersPanel } from '@/modules/occurrence-conversation/components/OccurrenceWatchersPanel.component'

import styles from '../styles/contractorDirectory.module.css'

type ContractorOccurrenceWatchersProps = Readonly<{ contractorId: string }>

/**
 * Spec 267 RF2: o atendente fixo desta contratante. Com algum ativo, a lista dela substitui a da empresa; sem nenhum,
 * vale a da empresa. O painel é do módulo da conversa (autocontido): aqui só se decide onde ele aparece.
 */
export function ContractorOccurrenceWatchers({
  contractorId,
}: ContractorOccurrenceWatchersProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className={styles.form}>
      <h4 id={titleId}>{t('watchers.title')}</h4>
      <p className={styles.hint}>{t('watchers.description')}</p>
      <OccurrenceWatchersPanel canManage scope={{ contractorId, kind: 'contractor' }} />
    </section>
  )
}
