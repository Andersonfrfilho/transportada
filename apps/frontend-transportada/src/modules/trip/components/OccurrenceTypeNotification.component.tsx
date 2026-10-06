/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  OCCURRENCE_TEMPLATE_NONE,
  type OccurrenceEmailTemplatesState,
} from '@/modules/trip/shared/occurrenceTemplate.service'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import type { OccurrenceTypeEdit } from '../shared/occurrenceTypeUpdate.service'

const DESCRIPTION_MAX_LENGTH = 90

type OccurrenceTypeNotificationProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  templates: OccurrenceEmailTemplatesState
  type: OccurrenceType
}>

function shorten(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length > DESCRIPTION_MAX_LENGTH ? `${flat.slice(0, DESCRIPTION_MAX_LENGTH)}…` : flat
}

/** Spec 246 RF1e: o aviso mora no cadastro do tipo — o interruptor, o modelo com o texto à vista e o porquê de cada estado. */
export function OccurrenceTypeNotification({
  disabled,
  onEdit,
  templates,
  type,
}: OccurrenceTypeNotificationProps) {
  const { t } = useTranslation('companySettings')
  const reasonId = useId()
  const selected = templates.options.find((option) => option.key === type.emailTemplateKey)
  const hasLegacyText = type.emailTemplateKey === null && type.emailSubject !== ''
  const isMissing =
    type.emailTemplateKey !== null && templates.status === 'ready' && selected === undefined

  const options = [
    { label: t('occurrenceTypeCatalog.emailTemplateNone'), value: OCCURRENCE_TEMPLATE_NONE },
    ...(type.emailTemplateKey !== null && selected === undefined
      ? [{ label: type.emailTemplateKey, value: type.emailTemplateKey }]
      : []),
    ...templates.options.map((option) => ({
      description: shorten(option.body),
      label: option.label,
      value: option.key,
    })),
  ]

  function renderStatus() {
    if (!type.notifies) return null
    if (templates.status === 'loading') return t('occurrenceTypeCatalog.notification.loading')
    if (templates.status === 'error') return t('occurrenceTypeCatalog.notification.failed')
    if (isMissing) {
      return t('occurrenceTypeCatalog.notification.missing', { key: type.emailTemplateKey })
    }
    return null
  }

  function renderPreview() {
    if (!type.notifies) return null
    if (selected !== undefined || hasLegacyText) {
      const subject = selected?.subject ?? type.emailSubject
      const body = selected?.body ?? type.emailBody
      return (
        <>
          {hasLegacyText ? (
            <p className={styles.templateNote}>
              {t('occurrenceTypeCatalog.legacyTemplate', { subject: type.emailSubject })}
            </p>
          ) : null}
          <p className={styles.templatePreview}>
            <strong>{t('occurrenceTypeCatalog.notification.subject')}</strong> {subject}
            {'\n'}
            {body}
          </p>
        </>
      )
    }
    if (type.emailTemplateKey === null) {
      return <p className={styles.templateNote}>{t('occurrenceTypeCatalog.withoutTemplate')}</p>
    }
    return null
  }

  const statusText = renderStatus()

  return (
    <div className={styles.notification}>
      <p className={styles.blockTitle}>{t('occurrenceTypeCatalog.notification.title')}</p>
      <Checkbox
        checked={type.notifies}
        disabled={disabled}
        label={t('occurrenceTypeCatalog.notifies')}
        onChange={(value) => onEdit({ notifies: value })}
      />
      <div aria-describedby={type.notifies ? undefined : reasonId} role="group">
        <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.notification.templateHint')}>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.notification.template')}
            disabled={disabled || !type.notifies}
            onChange={(value) =>
              onEdit({ emailTemplateKey: value === OCCURRENCE_TEMPLATE_NONE ? null : value })
            }
            options={options}
            value={type.emailTemplateKey ?? OCCURRENCE_TEMPLATE_NONE}
          />
        </Tooltip>
      </div>
      {type.notifies ? null : (
        <p className={styles.templateNote} id={reasonId}>
          {t('occurrenceTypeCatalog.notification.disabledReason')}
        </p>
      )}
      {statusText === null ? null : <p className={styles.templateNote}>{statusText}</p>}
      {renderPreview()}
    </div>
  )
}
