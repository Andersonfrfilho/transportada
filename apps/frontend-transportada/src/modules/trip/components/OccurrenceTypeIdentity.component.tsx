/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import type {
  OccurrenceRedeliveryPolicy,
  OccurrenceType,
  OccurrenceTypeFlow,
} from '@/modules/trip/shared/occurrence.constant'
import {
  OCCURRENCE_ITEMS_MODE,
  TRIP_OCCURRENCE_STAGE,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import { useOccurrenceTypeOptions } from '../hooks/useOccurrenceTypeOptions.hook'

const NAME_MAX_LENGTH = 60

type OccurrenceTypeIdentityProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/** Spec 246 T6.1: o primeiro bloco do tipo aberto, como no preview — nome, situação, devolução e fluxo juntos. */
export function OccurrenceTypeIdentity({ disabled, onEdit, type }: OccurrenceTypeIdentityProps) {
  const { t } = useTranslation('companySettings')
  const { flowOptions, redeliveryPolicyOptions } = useOccurrenceTypeOptions()
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery
  const hasItems = type.itemsMode !== OCCURRENCE_ITEMS_MODE.off

  function handleNameCommit(input: HTMLInputElement) {
    const name = input.value.trim()
    if (name === '' || name === type.name) {
      input.value = type.name
      return
    }
    onEdit({ name })
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.identity.title')} className={styles.identity}>
      <p className={styles.blockTitle}>{t('occurrenceTypeCatalog.identity.title')}</p>
      <div className={styles.identityGrid}>
        <label className={styles.identityField}>
          <span className={styles.fieldLabel}>{t('occurrenceTypeCatalog.identity.name')}</span>
          <input
            defaultValue={type.name}
            disabled={disabled}
            key={type.name}
            maxLength={NAME_MAX_LENGTH}
            onBlur={(event) => handleNameCommit(event.currentTarget)}
            onKeyDown={handleNameKeyDown}
            type="text"
          />
        </label>
        {hasItems ? (
          <div className={styles.identityField}>
            <span aria-hidden="true" className={styles.fieldLabel}>
              {t('occurrenceTypeCatalog.identity.redelivery')}
            </span>
            <Select
              ariaLabel={t('occurrenceTypeCatalog.redeliveryPolicy')}
              disabled={disabled}
              onChange={(value) =>
                onEdit({ redeliveryPolicy: value as OccurrenceRedeliveryPolicy })
              }
              options={redeliveryPolicyOptions}
              value={type.redeliveryPolicy}
            />
          </div>
        ) : null}
        {/* Spec 179 T401: só em tipo de rua — é o motorista quem tira a foto na hora. */}
        {isDelivery ? (
          <div className={styles.identityField}>
            <span aria-hidden="true" className={styles.fieldLabel}>
              {t('occurrenceTypeCatalog.identity.flow')}
            </span>
            <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.flowHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.flow')}
                disabled={disabled}
                onChange={(value) => onEdit({ flow: value as OccurrenceTypeFlow })}
                options={flowOptions}
                value={type.flow}
              />
            </Tooltip>
          </div>
        ) : null}
      </div>
      <div className={styles.identityChecks}>
        <Checkbox
          checked={type.active}
          disabled={disabled}
          label={t('occurrenceTypeCatalog.active')}
          onChange={(value) => onEdit({ active: value })}
        />
        {hasItems ? (
          <Checkbox
            checked={type.allowsMultipleItems}
            disabled={disabled}
            label={t('occurrenceTypeCatalog.allowsMultipleItems')}
            onChange={(value) => onEdit({ allowsMultipleItems: value })}
          />
        ) : null}
        {/* Spec 185 T6.1 (D2/RF6): só para tipos de separação — o CHECK do banco recusa em `delivery`. */}
        {type.stage === TRIP_OCCURRENCE_STAGE.separation ? (
          <Tooltip label={t('occurrenceTypeCatalog.leavesDocumentBehindHint')}>
            <Checkbox
              checked={type.leavesDocumentBehind}
              disabled={disabled}
              label={t('occurrenceTypeCatalog.leavesDocumentBehind')}
              onChange={(value) => onEdit({ leavesDocumentBehind: value })}
            />
          </Tooltip>
        ) : null}
      </div>
    </section>
  )
}
