/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  DRIVER_STOP_REMINDER_NUMBER_FIELDS,
  DRIVER_STOP_REMINDER_RANGE,
  type DriverStopReminderBody,
  type DriverStopReminderNumberField,
  type DriverStopReminderSettings,
} from '../shared/driverStopReminder.validation'
import {
  DRIVER_STOP_REMINDER_WEEKDAYS,
  addOperatingRange,
  buildDriverStopReminderSubmission,
  changeOperatingRange,
  findOperatingHoursIssues,
  isNumberFieldValid,
  removeOperatingRange,
  startDriverStopReminderDraft,
  typeDriverStopReminderNumber,
  type DriverStopReminderDraft,
} from '../shared/driverStopReminderForm.service'
import styles from '../styles/businessCalendar.module.css'

export type DriverStopReminderPanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  /** O resultado da última gravação deixa de descrever a tela no instante em que ela muda. */
  onEdit: () => void
  onSave: (body: DriverStopReminderBody) => void
  saved: boolean
  stored: DriverStopReminderSettings | undefined
}>

function DriverStopReminderSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('driverStopReminders.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

function NumberFields(
  props: Readonly<{
    disabled: boolean
    draft: DriverStopReminderDraft
    onChange: (field: DriverStopReminderNumberField, text: string) => void
  }>,
) {
  const { t } = useTranslation('companySettings')
  return (
    <div className={styles.fieldGrid}>
      {DRIVER_STOP_REMINDER_NUMBER_FIELDS.map((field) => {
        const id = `driver-stop-reminder-${field}`
        const valid = isNumberFieldValid(field, props.draft.numbers[field])
        const range = DRIVER_STOP_REMINDER_RANGE[field]
        return (
          <div className={styles.field} key={field}>
            <label className={styles.fieldLabel} htmlFor={id}>
              {t(`driverStopReminders.fields.${field}.label`)}
            </label>
            <input
              aria-describedby={`${id}-hint`}
              aria-invalid={valid ? undefined : true}
              className={styles.input}
              disabled={props.disabled}
              id={id}
              inputMode="numeric"
              maxLength={3}
              value={props.draft.numbers[field]}
              onChange={(event) => props.onChange(field, event.target.value)}
            />
            <p className={styles.hint} id={`${id}-hint`}>
              {t(`driverStopReminders.fields.${field}.hint`, { max: range.max, min: range.min })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function OperatingHours(
  props: Readonly<{
    disabled: boolean
    draft: DriverStopReminderDraft
    onChange: (operatingHours: DriverStopReminderDraft['operatingHours']) => void
  }>,
) {
  const { t } = useTranslation('companySettings')
  const ranges = props.draft.operatingHours
  const issues = findOperatingHoursIssues(ranges)
  return (
    <section aria-labelledby="driver-stop-reminder-hours-title" className={styles.block}>
      <h3 id="driver-stop-reminder-hours-title">{t('driverStopReminders.hours.title')}</h3>
      <p className={styles.hint}>
        {ranges.length === 0
          ? t('driverStopReminders.hours.alwaysOpen')
          : t('driverStopReminders.hours.hint')}
      </p>
      {DRIVER_STOP_REMINDER_WEEKDAYS.map((weekday) => {
        const weekdayName = t(`driverStopReminders.weekday.${weekday}`)
        const indexes = ranges.flatMap((range, index) => (range.weekday === weekday ? [index] : []))
        return (
          <div className={styles.field} key={weekday}>
            <span className={styles.fieldLabel}>{weekdayName}</span>
            {indexes.length === 0 ? (
              <p className={styles.hint}>{t('driverStopReminders.hours.closed')}</p>
            ) : null}
            {indexes.map((index) => {
              const range = ranges[index]
              if (range === undefined) return null
              const issue = issues.get(index)
              return (
                <div className={styles.rangeRow} key={index}>
                  <input
                    aria-invalid={issue === undefined ? undefined : true}
                    aria-label={t('driverStopReminders.hours.startLabel', { day: weekdayName })}
                    className={styles.input}
                    disabled={props.disabled}
                    type="time"
                    value={range.start}
                    onChange={(event) =>
                      props.onChange(
                        changeOperatingRange(ranges, index, { start: event.target.value }),
                      )
                    }
                  />
                  <input
                    aria-invalid={issue === undefined ? undefined : true}
                    aria-label={t('driverStopReminders.hours.endLabel', { day: weekdayName })}
                    className={styles.input}
                    disabled={props.disabled}
                    type="time"
                    value={range.end}
                    onChange={(event) =>
                      props.onChange(
                        changeOperatingRange(ranges, index, { end: event.target.value }),
                      )
                    }
                  />
                  <Button
                    aria-label={t('driverStopReminders.hours.remove', { day: weekdayName })}
                    disabled={props.disabled}
                    type="button"
                    variant="secondary"
                    onClick={() => props.onChange(removeOperatingRange(ranges, index))}
                  >
                    <Icon name="trash" />
                  </Button>
                  {issue === undefined ? null : (
                    <p className={`${styles.alert} ${styles.rangeIssue}`} role="alert">
                      {t(`driverStopReminders.hours.issue.${issue}`)}
                    </p>
                  )}
                </div>
              )
            })}
            <div className={styles.actions}>
              <Button
                disabled={props.disabled || indexes.length >= 3}
                type="button"
                variant="secondary"
                onClick={() => props.onChange(addOperatingRange(ranges, weekday))}
              >
                <Icon name="add" />
                {t('driverStopReminders.hours.add')}
              </Button>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Rascunho local: copia o gravado uma vez e remonta por `key` quando a gravação volta. */
function DriverStopReminderForm(props: DriverStopReminderPanelProps) {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<DriverStopReminderDraft>(() =>
    startDriverStopReminderDraft(props.stored),
  )
  const submission = buildDriverStopReminderSubmission(draft)

  function edit(patch: Partial<DriverStopReminderDraft>) {
    props.onEdit()
    setDraft((current) => ({ ...current, ...patch }))
  }

  return (
    <div className={styles.form}>
      <section aria-labelledby="driver-stop-reminder-rules-title" className={styles.block}>
        <h3 id="driver-stop-reminder-rules-title">{t('driverStopReminders.rules.title')}</h3>
        <Checkbox
          checked={draft.enabled}
          disabled={props.disabled}
          label={t('driverStopReminders.enabledLabel')}
          onChange={(enabled) => edit({ enabled })}
        />
        <p className={styles.hint}>
          {t(draft.enabled ? 'driverStopReminders.enabledOn' : 'driverStopReminders.enabledOff')}
        </p>
        <NumberFields
          disabled={props.disabled}
          draft={draft}
          onChange={(field, text) =>
            edit({
              numbers: { ...draft.numbers, [field]: typeDriverStopReminderNumber(text) },
            })
          }
        />
      </section>
      <OperatingHours
        disabled={props.disabled}
        draft={draft}
        onChange={(operatingHours) => edit({ operatingHours })}
      />
      <div className={styles.actions}>
        <Button
          disabled={props.disabled || submission === null}
          type="button"
          onClick={() => {
            if (submission !== null) props.onSave(submission)
          }}
        >
          <Icon name="save" />
          {t('driverStopReminders.save')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Spec 299 RF19: a cobrança do motorista pelo WhatsApp, por empresa. Sem linha gravada a API responde
 * desligada com os padrões (`origin: 'default'`). A chave global do ambiente vale por cima desta.
 */
export function DriverStopReminderPanel(props: DriverStopReminderPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section aria-labelledby="driver-stop-reminders-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <p className={styles.kicker}>{t('driverStopReminders.kicker')}</p>
        <h2 id="driver-stop-reminders-title">{t('driverStopReminders.title')}</h2>
        <p className={styles.hint}>{t('driverStopReminders.hint')}</p>
        {props.stored === undefined ? null : (
          <p className={styles.hint}>{t(`driverStopReminders.origin.${props.stored.origin}`)}</p>
        )}
      </div>
      {props.loading ? (
        <DriverStopReminderSkeleton />
      ) : (
        <DriverStopReminderForm key={props.stored?.updatedAt ?? 'default'} {...props} />
      )}
      {props.saved ? (
        <p className={styles.status} role="status">
          {t('driverStopReminders.saved')}
        </p>
      ) : null}
      {props.errorCode === undefined ? null : (
        <p className={styles.refusal} role="alert">
          {t('driverStopReminders.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
