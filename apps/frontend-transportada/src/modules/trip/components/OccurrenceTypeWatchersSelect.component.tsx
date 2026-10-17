/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/ui/multi-select'
import { useOccurrenceWatchersQuery } from '@/modules/occurrence-conversation/queries/occurrenceWatchers.query'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  buildWatcherOptions,
  isWatcherSelectionAllowed,
  OCCURRENCE_TYPE_MAIL_WATCHERS_MAX,
  readChosenWatcherIds,
} from '@/modules/trip/shared/occurrenceTypeMailChoices.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeWatchersSelectProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 271 RF5: quem vai em cópia no e-mail à contratante deste tipo, escolhido entre os responsáveis da empresa (267).
 * Vazio: vale a lista da contratante da nota e, sem ela, a da empresa. Inativo, sem permissão ou sem e-mail continua à
 * vista, marcado, e não recebe.
 */
export function OccurrenceTypeWatchersSelect({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeWatchersSelectProps) {
  const { t } = useTranslation('companySettings')
  const watchersQuery = useOccurrenceWatchersQuery({ enabled: true, scope: { kind: 'company' } })
  const chosenIds = readChosenWatcherIds(type)
  const options = buildWatcherOptions({
    chosen: type.contractorMailWatchers ?? [],
    companyWatchers: watchersQuery.data?.watchers ?? [],
    labels: {
      inactive: t('occurrenceTypeCatalog.mail.watchers.inactive'),
      notEligible: t('occurrenceTypeCatalog.mail.watchers.notEligible'),
    },
  })

  function handleChange(values: readonly string[]) {
    if (!isWatcherSelectionAllowed(chosenIds, values)) return
    onEdit({ contractorMailWatcherUserIds: values })
  }

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{t('occurrenceTypeCatalog.mail.watchers.label')}</span>
      <MultiSelect
        ariaLabel={t('occurrenceTypeCatalog.mail.watchers.label')}
        clearAllLabel={t('occurrenceTypeCatalog.mail.watchers.clearAll')}
        disabled={disabled || watchersQuery.isPending}
        emptyLabel={t('occurrenceTypeCatalog.mail.watchers.empty')}
        onChange={handleChange}
        options={options}
        placeholder={t('occurrenceTypeCatalog.mail.watchers.placeholder')}
        removeLabel={(optionLabel) =>
          t('occurrenceTypeCatalog.mail.watchers.remove', { name: optionLabel })
        }
        searchPlaceholder={t('occurrenceTypeCatalog.mail.watchers.search')}
        summaryLabel={(count) => t('occurrenceTypeCatalog.mail.watchers.summary', { count })}
        values={chosenIds}
      />
      <p className={styles.hint}>
        {t('occurrenceTypeCatalog.mail.watchers.hint', { max: OCCURRENCE_TYPE_MAIL_WATCHERS_MAX })}
      </p>
      {watchersQuery.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.mail.watchers.failed')}
        </p>
      ) : null}
    </div>
  )
}
