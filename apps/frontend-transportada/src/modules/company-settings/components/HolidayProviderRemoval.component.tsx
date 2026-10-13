/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { HolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'

type HolidayProviderRemovalProps = Readonly<{ actions: HolidayProviderActions }>

/**
 * "Remover chave": só pede a confirmação (o diálogo é `HolidayProviderRemovalDialog`). O texto dele diz o que fica (o
 * orçamento e os feriados já importados). Só aparece com uma chave configurada.
 */
export function HolidayProviderRemoval({ actions }: HolidayProviderRemovalProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <Button disabled={actions.isSaving} onClick={actions.askRemoval} type="button" variant="ghost">
      <Icon name="trash" />
      {t('providerSettings.remove.action')}
    </Button>
  )
}
