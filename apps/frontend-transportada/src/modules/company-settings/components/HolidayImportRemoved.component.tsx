/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useHolidayImportRemoved } from '../hooks/useHolidayImportRemoved.hook'
import { formatCivilDate } from '../shared/holidayImportFormat.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'
import styles from '../styles/holidayImport.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

type HolidayImportRemovedProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Removidos pelo fornecedor" (ADR-0100 §4.5): a data da PRÓPRIA empresa que o fornecedor deixou de listar fica no
 * calendário, sinalizada, até o operador decidir — manter (editar a adota) ou desligar. Nada some em silêncio.
 */
export function HolidayImportRemoved({ companyId, enabled }: HolidayImportRemovedProps) {
  const { i18n, t } = useTranslation('businessCalendar')
  const removed = useHolidayImportRemoved({ companyId, enabled })

  return (
    <section aria-labelledby="holiday-removed-title" className={businessCalendarStyles.block}>
      <h3 id="holiday-removed-title">{t('import.removed.title')}</h3>
      <p className={businessCalendarStyles.hint}>{t('import.removed.hint')}</p>
      {removed.isLoaded && removed.items.length === 0 ? (
        <p className={businessCalendarStyles.hint}>{t('import.removed.empty')}</p>
      ) : null}
      {removed.items.length === 0 ? null : (
        <ul className={styles.removedList}>
          {removed.items.map((item) => (
            <li className={styles.removedItem} key={item.holidayId}>
              <div className={styles.removedBody}>
                <strong>{item.name}</strong>
                <span>
                  {formatCivilDate({ language: i18n.language, value: item.holidayOn })}
                  {' · '}
                  {removed.labelOf(item)}
                  {' · '}
                  {t(`import.removed.scope.${item.scope}`)}
                </span>
              </div>
              {removed.askedId === item.holidayId ? (
                <div className={styles.confirm}>
                  <p>{t('import.removed.confirmPrompt', { name: item.name })}</p>
                  <div className={businessCalendarStyles.rowActions}>
                    <Button
                      disabled={removed.isDisabling}
                      onClick={() => void removed.confirm(item)}
                      type="button"
                      variant="secondary"
                    >
                      <Icon name="eye-off" />
                      {removed.isDisabling
                        ? t('import.removed.disabling')
                        : t('import.removed.confirm')}
                    </Button>
                    <Button
                      disabled={removed.isDisabling}
                      onClick={removed.cancel}
                      type="button"
                      variant="ghost"
                    >
                      {t('import.removed.cancel')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {removed.askedId !== item.holidayId && removed.canDisable(item) ? (
                <Button
                  aria-label={t('import.removed.disableAria', { name: item.name })}
                  onClick={() => removed.ask(item.holidayId)}
                  type="button"
                  variant="ghost"
                >
                  <Icon name="eye-off" />
                  {t('import.removed.disable')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {removed.truncated ? (
        <p className={businessCalendarStyles.hint}>{t('import.removed.truncated')}</p>
      ) : null}
      {removed.refusal === undefined ? null : <HolidayRefusal refusal={removed.refusal} />}
    </section>
  )
}
