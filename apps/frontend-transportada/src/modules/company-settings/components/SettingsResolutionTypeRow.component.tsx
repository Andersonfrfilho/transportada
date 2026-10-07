/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  buildResolvedFields,
  type ResolvedFieldValue,
} from '@/modules/trip/shared/settingsResolutionFields.service'
import type { SettingsResolutionOccurrenceType } from '@/modules/trip/shared/settingsResolution.service'
import styles from '@/modules/trip/styles/settingsResolution.module.css'

type SettingsResolutionTypeRowProps = Readonly<{
  /** Sem contratante nem destinatário escolhido a configuração é a do próprio tipo. */
  generalLayer?: string
  type: SettingsResolutionOccurrenceType
}>

/** Um tipo com os seis campos efetivos e, em cada um, de que camada ele veio (RF12). */
export function SettingsResolutionTypeRow({ generalLayer, type }: SettingsResolutionTypeRowProps) {
  const { t } = useTranslation('companySettings')
  const fields = buildResolvedFields({
    type,
    ...(generalLayer === undefined ? {} : { generalLayer }),
  })

  function describeValue(value: ResolvedFieldValue): string {
    if (value.kind === 'mode') return t(`settingsResolution.modes.${value.mode}`)
    if (value.kind === 'allItems') return t('settingsResolution.itemsAll')
    if (value.kind === 'atLeast')
      return t('settingsResolution.itemsAtLeast', { count: value.count })
    if (value.kind === 'photoCount')
      return t('settingsResolution.photoCount', { count: value.count })
    return t('settingsResolution.notApplicable')
  }

  return (
    <article className={styles.type} data-testid="resolution-type">
      <h5 className={styles.typeName}>{type.name}</h5>
      <dl className={styles.fields}>
        {fields.map((field) => (
          <div className={styles.field} key={field.key}>
            <dt className={styles.fieldLabel}>{t(`settingsResolution.typeFields.${field.key}`)}</dt>
            <dd className={styles.fieldValue}>
              {describeValue(field.value)}
              {field.layer === undefined ? null : (
                <span className={styles.layer}>
                  {t(`settingsResolution.layers.${field.layer}`, { defaultValue: field.layer })}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
