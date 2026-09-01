/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DeliveryWindow } from '../shared/deliveryClients.types'
import { WEEKDAYS } from '../shared/deliveryClients.types'
import {
  addWindow,
  changeWindow,
  findInvalidWindow,
  removeWindow,
  toTimeInputValue,
  windowsOfWeekday,
} from '../shared/deliveryWindow.service'
import styles from '../styles/deliveryClients.module.css'

type DeliveryWindowEditorProps = Readonly<{
  isDisabled: boolean
  onSave: (windows: readonly DeliveryWindow[]) => Promise<void>
  windows: readonly DeliveryWindow[]
}>

/**
 * Spec 060 D2: a semana inteira é salva de uma vez — janela é conjunto, e editar linha a linha
 * deixaria horário órfão de uma versão anterior no roteiro do dia seguinte.
 */
export function DeliveryWindowEditor({ isDisabled, onSave, windows }: DeliveryWindowEditorProps) {
  const { t } = useTranslation('deliveryClients')
  const [draft, setDraft] = useState<readonly DeliveryWindow[]>(windows)
  const [isSaving, setIsSaving] = useState(false)
  const invalid = findInvalidWindow(draft)

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    try {
      await onSave(draft)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className={styles.windowEditor}>
      <header className={styles.panelHeader}>
        <h3>{t('windows.title')}</h3>
        <p className={styles.hint}>{t('windows.hint')}</p>
      </header>

      <ul className={styles.weekdayList}>
        {WEEKDAYS.map((weekday) => (
          <li className={styles.weekday} key={weekday}>
            <div className={styles.weekdayHeader}>
              <strong>{t(`windows.weekday.${weekday}`)}</strong>
              <Button
                disabled={isDisabled}
                onClick={() => setDraft(addWindow(draft, weekday))}
                type="button"
                variant="ghost"
              >
                <Icon name="add" />
                {t('windows.add')}
              </Button>
            </div>

            {windowsOfWeekday(draft, weekday).length === 0 ? (
              <p className={styles.hint}>{t('windows.closed')}</p>
            ) : (
              windowsOfWeekday(draft, weekday).map((window, index) => (
                <div className={styles.windowRow} key={`${weekday}-${index}`}>
                  <label>
                    {t('windows.opensAt')}
                    <input
                      disabled={isDisabled}
                      onChange={(event) =>
                        setDraft(
                          changeWindow(draft, {
                            field: 'opensAt',
                            target: window,
                            value: event.target.value,
                          }),
                        )
                      }
                      type="time"
                      value={toTimeInputValue(window.opensAt)}
                    />
                  </label>
                  <label>
                    {t('windows.closesAt')}
                    <input
                      disabled={isDisabled}
                      onChange={(event) =>
                        setDraft(
                          changeWindow(draft, {
                            field: 'closesAt',
                            target: window,
                            value: event.target.value,
                          }),
                        )
                      }
                      type="time"
                      value={toTimeInputValue(window.closesAt)}
                    />
                  </label>
                  <Button
                    aria-label={t('windows.remove')}
                    disabled={isDisabled}
                    onClick={() => setDraft(removeWindow(draft, window))}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="trash" />
                  </Button>
                </div>
              ))
            )}
          </li>
        ))}
      </ul>

      {invalid === undefined ? null : (
        <p className={styles.error} role="alert">
          {t('windows.invalid')}
        </p>
      )}

      <Button
        disabled={isDisabled || isSaving || invalid !== undefined}
        onClick={() => void handleSave()}
        type="button"
      >
        <Icon name="save" />
        {isSaving ? t('windows.saving') : t('windows.save')}
      </Button>
    </section>
  )
}
