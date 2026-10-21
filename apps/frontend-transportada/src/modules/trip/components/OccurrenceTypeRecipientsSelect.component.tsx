/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/ui/multi-select'
import { useOccurrenceTypeRecipientCandidatesQuery } from '@/modules/occurrence-conversation/queries/occurrenceTypeMail.query'
import {
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import {
  buildRecipientOptions,
  readChosenRecipientIds,
} from '@/modules/trip/shared/occurrenceTypeMailChoices.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeRecipientsSelectProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 271 RF6: para quem o e-mail vai, **só** num tipo de contratantes (`listed`) — os contatos ativos que recebem
 * ocorrências das contratantes do tipo, agrupados por contratante. Vazio: vão os contatos da etapa. No tipo geral o
 * campo nem aparece: o `To` é sempre o automático.
 */
export function OccurrenceTypeRecipientsSelect({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeRecipientsSelectProps) {
  const { t } = useTranslation('companySettings')
  const isListed = type.contractorScope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
  const contractors = type.contractors ?? []
  const candidatesQuery = useOccurrenceTypeRecipientCandidatesQuery({
    contractorIds: contractors.map((contractor) => contractor.id),
    enabled: isListed,
  })
  if (!isListed) return null

  const options = buildRecipientOptions({
    candidates: candidatesQuery.data ?? [],
    chosen: type.contractorMailRecipients ?? [],
    contractors,
    labels: {
      inactive: t('occurrenceTypeCatalog.mail.recipients.inactive'),
      notEligible: t('occurrenceTypeCatalog.mail.recipients.notEligible'),
    },
  })

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{t('occurrenceTypeCatalog.mail.recipients.label')}</span>
      <MultiSelect
        ariaLabel={t('occurrenceTypeCatalog.mail.recipients.label')}
        clearAllLabel={t('occurrenceTypeCatalog.mail.recipients.clearAll')}
        disabled={disabled || candidatesQuery.isPending}
        emptyLabel={t('occurrenceTypeCatalog.mail.recipients.empty')}
        onChange={(values) => onEdit({ contractorMailRecipientContactIds: values })}
        options={options}
        placeholder={t('occurrenceTypeCatalog.mail.recipients.placeholder')}
        removeLabel={(optionLabel) =>
          t('occurrenceTypeCatalog.mail.recipients.remove', { name: optionLabel })
        }
        searchPlaceholder={t('occurrenceTypeCatalog.mail.recipients.search')}
        summaryLabel={(count) => t('occurrenceTypeCatalog.mail.recipients.summary', { count })}
        values={readChosenRecipientIds(type)}
      />
      <p className={styles.hint}>{t('occurrenceTypeCatalog.mail.recipients.hint')}</p>
      {candidatesQuery.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.mail.recipients.failed')}
        </p>
      ) : null}
    </div>
  )
}
