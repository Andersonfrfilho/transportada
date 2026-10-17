/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

import { OccurrenceTypeMailTemplateSelect } from './OccurrenceTypeMailTemplateSelect.component'

type OccurrenceTypeContractorMailProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 269 RF1: o e-mail que a contratante da nota recebe ao registrar. O interruptor e o modelo gravam na
 * hora; o texto mora no cadastro de modelos, não no tipo.
 */
export function OccurrenceTypeContractorMail({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeContractorMailProps) {
  const { t } = useTranslation('companySettings')
  const selectedTemplateId = type.contractorMailTemplateId ?? null

  return (
    <section aria-label={t('occurrenceTypeCatalog.mail.title')} className={styles.mail}>
      <p className={itemStyles.blockTitle}>{t('occurrenceTypeCatalog.mail.title')}</p>
      <Checkbox
        checked={type.emailsContractor === true}
        disabled={disabled}
        label={t('occurrenceTypeCatalog.mail.switch')}
        onChange={(value) => onEdit({ emailsContractor: value })}
      />
      <OccurrenceTypeMailTemplateSelect
        disabled={disabled}
        onSelect={(contractorMailTemplateId) => onEdit({ contractorMailTemplateId })}
        selectedTemplateId={selectedTemplateId}
        shouldWarnMissing={type.emailsContractor === true && selectedTemplateId === null}
      />
    </section>
  )
}
