/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { HolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'
import businessCalendarStyles from '../styles/businessCalendar.module.css'
import styles from '../styles/holidayProviderSettings.module.css'

type HolidayProviderRemovalProps = Readonly<{ actions: HolidayProviderActions }>

/**
 * "Remover chave" com confirmação: a remoção para a busca de toda a instalação, então não sai num clique só. O texto
 * diz o que fica (o orçamento e os feriados já importados). Só aparece com uma chave configurada.
 */
export function HolidayProviderRemoval({ actions }: HolidayProviderRemovalProps) {
  const { t } = useTranslation('businessCalendar')

  if (!actions.isConfirmingRemoval) {
    return (
      <Button
        disabled={actions.isSaving}
        onClick={actions.askRemoval}
        type="button"
        variant="ghost"
      >
        <Icon name="trash" />
        {t('providerSettings.remove.action')}
      </Button>
    )
  }

  return (
    <div className={styles.confirm} role="group">
      <p>{t('providerSettings.remove.prompt')}</p>
      <div className={businessCalendarStyles.rowActions}>
        <Button
          disabled={actions.isRemoving}
          onClick={() => void actions.removeToken()}
          type="button"
          variant="secondary"
        >
          <Icon name="trash" />
          {actions.isRemoving
            ? t('providerSettings.remove.removing')
            : t('providerSettings.remove.confirm')}
        </Button>
        <Button
          disabled={actions.isRemoving}
          onClick={actions.cancelRemoval}
          type="button"
          variant="ghost"
        >
          {t('providerSettings.remove.cancel')}
        </Button>
      </div>
    </div>
  )
}
