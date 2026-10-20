/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useComposerQuickRepliesQuery } from '@/modules/occurrence-conversation/queries/quickReplies.query'
import { buildAcknowledgementOptions } from '@/modules/trip/shared/occurrenceContractorReplyDraft.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeAcknowledgementSelectProps = Readonly<{
  disabled: boolean
  onChange: (quickReplyId: string) => void
  value: string
}>

/**
 * Spec 276 T5: a resposta automática à contratante sai das respostas rápidas da aba Contratante. Vai uma vez por
 * conversa, só quando o documento é confirmado e entregue ao motorista sem passar pela operação.
 */
export function OccurrenceTypeAcknowledgementSelect({
  disabled,
  onChange,
  value,
}: OccurrenceTypeAcknowledgementSelectProps) {
  const { t } = useTranslation('companySettings')
  const query = useComposerQuickRepliesQuery('contractor')
  const label = t('occurrenceTypeCatalog.contractorReply.fields.acknowledgement')
  const options = buildAcknowledgementOptions({
    quickReplies: query.data ?? [],
    selectedId: value,
  }).map((option) => ({
    label:
      option.kind === 'quickReply'
        ? option.label
        : t(`occurrenceTypeCatalog.contractorReply.acknowledgement.${option.kind}`),
    value: option.value,
  }))
  const isEmpty = query.isSuccess && options.length === 1

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        <Icon name="message" size="sm" />
        {label}
      </span>
      <Select
        ariaLabel={label}
        disabled={disabled || query.isPending}
        onChange={onChange}
        options={options}
        value={value}
      />
      <p className={styles.hint}>
        {t(
          isEmpty
            ? 'occurrenceTypeCatalog.contractorReply.acknowledgement.empty'
            : 'occurrenceTypeCatalog.contractorReply.acknowledgement.hint',
        )}
      </p>
    </div>
  )
}
