/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { OCCURRENCE_TYPE_ICON_NAMES } from '@/modules/trip/shared/occurrenceTypeIcon.constant'
import styles from '../styles/occurrenceTypeIconPicker.module.css'

type OccurrenceTypeIconPickerProps = Readonly<{
  disabled: boolean
  onChange: (iconName: null | string) => void
  /** Nulo ou ausente é sem ícone. */
  value: null | string | undefined
}>

export function OccurrenceTypeIconPicker({
  disabled,
  onChange,
  value,
}: OccurrenceTypeIconPickerProps) {
  const { t } = useTranslation('companySettings')
  const selected = value ?? null

  return (
    <div className={styles.picker}>
      <span aria-hidden="true" className={styles.label}>
        {t('occurrenceTypeCatalog.identity.icon.title')}
      </span>
      <div
        aria-label={t('occurrenceTypeCatalog.identity.icon.title')}
        className={styles.options}
        role="group"
      >
        {OCCURRENCE_TYPE_ICON_NAMES.map((iconName) => (
          <button
            aria-label={t(`occurrenceTypeCatalog.identity.icon.names.${iconName}`)}
            aria-pressed={selected === iconName}
            className={styles.option}
            disabled={disabled}
            key={iconName}
            onClick={() => onChange(iconName)}
            type="button"
          >
            <Icon name={iconName} />
          </button>
        ))}
        <button
          aria-label={t('occurrenceTypeCatalog.identity.icon.none')}
          aria-pressed={selected === null}
          className={styles.option}
          disabled={disabled}
          onClick={() => onChange(null)}
          type="button"
        >
          {t('occurrenceTypeCatalog.identity.icon.none')}
        </button>
      </div>
    </div>
  )
}
