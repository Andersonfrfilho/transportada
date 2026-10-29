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
import type {
  ClientChannel,
  ClientEmailSendMode,
  ClientEmailType,
  DuplicateRequestPolicy,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import identityStyles from '@/modules/trip/styles/occurrenceTypeIdentity.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import { useOccurrenceTypeOptions } from '../hooks/useOccurrenceTypeOptions.hook'
import { OccurrenceTypeHiddenFieldsHint } from './OccurrenceTypeHiddenFieldsHint.component'
import { OccurrenceTypeIconPicker } from './OccurrenceTypeIconPicker.component'

const NAME_MAX_LENGTH = 60
const DRIVER_LOCK_HOURS_OFF = 'off'
const DRIVER_LOCK_HOURS_CHOICES = [6, 12, 24, 48, 72] as const

type OccurrenceTypeIdentityProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/** Spec 246 T6.1: o primeiro bloco do tipo aberto, como no preview — nome, situação, devolução e fluxo juntos. */
export function OccurrenceTypeIdentity({ disabled, onEdit, type }: OccurrenceTypeIdentityProps) {
  const { t } = useTranslation('companySettings')
  const {
    clientChannelOptions,
    clientEmailSendModeOptions,
    clientEmailTypeOptions,
    duplicateRequestPolicyOptions,
    flowOptions,
    redeliveryPolicyOptions,
  } = useOccurrenceTypeOptions()
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery
  const hasItems = type.itemsMode !== OCCURRENCE_ITEMS_MODE.off
  const hasClientReturnMatrix = type.clientChannels !== undefined && type.clientChannels !== null

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
    <section
      aria-label={t('occurrenceTypeCatalog.identity.title')}
      className={identityStyles.identity}
    >
      <p className={styles.blockTitle}>{t('occurrenceTypeCatalog.identity.title')}</p>
      <div className={identityStyles.identityGrid}>
        <label className={identityStyles.identityField}>
          <span className={identityStyles.fieldLabel}>
            {t('occurrenceTypeCatalog.identity.name')}
          </span>
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
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
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
        {/* Spec 276 T4: só com a API que já manda o campo (a anterior recusaria o PUT). */}
        {type.duplicateRequestPolicy === undefined ? null : (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
              {t('occurrenceTypeCatalog.duplicateRequestPolicy')}
            </span>
            <Select
              ariaLabel={t('occurrenceTypeCatalog.duplicateRequestPolicy')}
              disabled={disabled}
              onChange={(value) =>
                onEdit({ duplicateRequestPolicy: value as DuplicateRequestPolicy })
              }
              options={duplicateRequestPolicyOptions}
              value={type.duplicateRequestPolicy}
            />
          </div>
        )}
        {/* Só com a API que já manda o campo (a anterior recusaria o PUT). O escritório nunca é travado. */}
        {type.driverLockHours === undefined ? null : (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
              {t('occurrenceTypeCatalog.driverLockHours')}
            </span>
            <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.driverLockHoursHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.driverLockHours')}
                disabled={disabled}
                onChange={(value) =>
                  onEdit({
                    driverLockHours: value === DRIVER_LOCK_HOURS_OFF ? null : Number(value),
                  })
                }
                options={[
                  {
                    label: t('occurrenceTypeCatalog.driverLockHoursOff'),
                    value: DRIVER_LOCK_HOURS_OFF,
                  },
                  ...[...new Set([...DRIVER_LOCK_HOURS_CHOICES, type.driverLockHours ?? 0])]
                    .filter((hours) => hours > 0)
                    .toSorted((left, right) => left - right)
                    .map((hours) => ({
                      label: t('occurrenceTypeCatalog.driverLockHoursOption', { count: hours }),
                      value: String(hours),
                    })),
                ]}
                value={
                  type.driverLockHours === null
                    ? DRIVER_LOCK_HOURS_OFF
                    : String(type.driverLockHours)
                }
              />
            </Tooltip>
          </div>
        )}
        {/* Spec 281 RF8: só com a API que já manda o campo (a anterior recusaria o PUT). Com a matriz (286) o canal vem das caixas do bloco "Retorno ao cliente". */}
        {type.clientChannel === undefined || hasClientReturnMatrix ? null : (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
              {t('occurrenceTypeCatalog.clientChannel')}
            </span>
            <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.clientChannelHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.clientChannel')}
                disabled={disabled}
                onChange={(value) => onEdit({ clientChannel: value as ClientChannel })}
                options={clientChannelOptions}
                value={type.clientChannel}
              />
            </Tooltip>
          </div>
        )}
        {/* Spec 279 RF9: só com a API que já manda o campo (a anterior recusaria o PUT). */}
        {type.clientEmailType === undefined ? null : (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
              {t('occurrenceTypeCatalog.clientEmailType')}
            </span>
            <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.clientEmailTypeHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.clientEmailType')}
                disabled={disabled}
                onChange={(value) => onEdit({ clientEmailType: value as ClientEmailType })}
                options={clientEmailTypeOptions}
                value={type.clientEmailType}
              />
            </Tooltip>
          </div>
        )}
        {/* Spec 279 RF10: só com o envio ao cliente ligado e a API que já manda o campo. */}
        {type.clientEmailSendMode === undefined ||
        type.clientEmailType === undefined ||
        type.clientEmailType === 'off' ||
        hasClientReturnMatrix ? null : (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
              {t('occurrenceTypeCatalog.clientEmailSendMode')}
            </span>
            <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.clientEmailSendModeHint')}>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.clientEmailSendMode')}
                disabled={disabled}
                onChange={(value) => onEdit({ clientEmailSendMode: value as ClientEmailSendMode })}
                options={clientEmailSendModeOptions}
                value={type.clientEmailSendMode}
              />
            </Tooltip>
          </div>
        )}
        {/* Spec 179 T401: só em tipo de rua — é o motorista quem tira a foto na hora. */}
        {isDelivery ? (
          <div className={identityStyles.identityField}>
            <span aria-hidden="true" className={identityStyles.fieldLabel}>
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
      <OccurrenceTypeIconPicker
        disabled={disabled}
        onChange={(iconName) => onEdit({ iconName })}
        value={type.iconName}
      />
      <div className={identityStyles.identityChecks}>
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
        {/* Spec 281 T8b: só com a API que já manda o campo; pede o contato do cliente ao motorista ao abrir. */}
        {type.asksClientContact === undefined || type.clientChannel === 'off' ? null : (
          <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.asksClientContactHint')}>
            <Checkbox
              checked={type.asksClientContact}
              disabled={disabled}
              label={t('occurrenceTypeCatalog.asksClientContact')}
              onChange={(value) => onEdit({ asksClientContact: value })}
            />
          </Tooltip>
        )}
        {/* O app do motorista oferece o campo opcional "nova data de vencimento" (pedido de prorrogação do boleto). */}
        {type.asksNewDueDate === undefined ? null : (
          <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.asksNewDueDateHint')}>
            <Checkbox
              checked={type.asksNewDueDate}
              disabled={disabled}
              label={t('occurrenceTypeCatalog.asksNewDueDate')}
              onChange={(value) => onEdit({ asksNewDueDate: value })}
            />
          </Tooltip>
        )}
      </div>
      <OccurrenceTypeHiddenFieldsHint isItemsOff={!hasItems} isSeparationOnlyHidden={isDelivery} />
    </section>
  )
}
