/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

import { OccurrenceTypeContractorTemplateSelect } from './OccurrenceTypeContractorTemplateSelect.component'
import { OccurrenceTypeRecipientsSelect } from './OccurrenceTypeRecipientsSelect.component'
import { OccurrenceTypeWatchersSelect } from './OccurrenceTypeWatchersSelect.component'

type OccurrenceTypeContractorMailProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 271 RF1: o bloco "E-mail à contratante" do tipo — o interruptor, o modelo, quem vai em cópia e os destinatários
 * gravam na hora; o texto mora no módulo de notificação, não no tipo.
 */
export function OccurrenceTypeContractorMail({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeContractorMailProps) {
  const { t } = useTranslation('companySettings')
  const selectedKey = type.contractorNotificationTemplateKey ?? null

  return (
    <section aria-label={t('occurrenceTypeCatalog.mail.title')} className={styles.mail}>
      <p className={itemStyles.blockTitle}>{t('occurrenceTypeCatalog.mail.title')}</p>
      <Checkbox
        checked={type.emailsContractor === true}
        disabled={disabled}
        label={t('occurrenceTypeCatalog.mail.switch')}
        onChange={(value) => onEdit({ emailsContractor: value })}
      />
      <OccurrenceTypeContractorTemplateSelect
        disabled={disabled}
        onSelect={(contractorNotificationTemplateKey) =>
          onEdit({ contractorNotificationTemplateKey })
        }
        selectedKey={selectedKey}
        shouldWarnMissing={
          type.emailsContractor === true && type.missingNotificationTemplate === true
        }
      />
      {/* Spec 271: API anterior ao bloco não manda as listas — sem os campos, nada que ela recusaria com `.strict()`. */}
      {type.contractorMailWatchers === undefined ? null : (
        <OccurrenceTypeWatchersSelect disabled={disabled} onEdit={onEdit} type={type} />
      )}
      {type.contractorMailRecipients === undefined ? null : (
        <OccurrenceTypeRecipientsSelect disabled={disabled} onEdit={onEdit} type={type} />
      )}
    </section>
  )
}
