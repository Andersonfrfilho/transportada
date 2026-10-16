/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { ContractorMailTemplateUsage } from '../shared/contractorMailTemplatesClient.service'
import styles from '../styles/contractorMailSettings.module.css'

type ContractorMailTemplateUsageListProps = Readonly<{ usage: ContractorMailTemplateUsage }>

/** Spec 269 RF7: o 409 de arquivar diz quais tipos e quais exceções por contratante ainda escolhem o modelo. */
export function ContractorMailTemplateUsageList({
  usage,
}: ContractorMailTemplateUsageListProps): JSX.Element | null {
  const { t } = useTranslation('deliveryClients')
  if (usage.occurrenceTypes.length === 0 && usage.contractorExceptions.length === 0) return null

  return (
    <div className={styles.usageList}>
      {usage.occurrenceTypes.length === 0 ? null : (
        <>
          <p>{t('mailTemplates.usage.occurrenceTypes')}</p>
          <ul>
            {usage.occurrenceTypes.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
      {usage.contractorExceptions.length === 0 ? null : (
        <>
          <p>{t('mailTemplates.usage.contractorExceptions')}</p>
          <ul>
            {usage.contractorExceptions.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
