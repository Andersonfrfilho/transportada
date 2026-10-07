/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/businessCalendar.module.css'

type HolidayFormActionsProps = Readonly<{
  createLabel: string
  isEditing: boolean
  isSaving: boolean
  /** Na edição, "Salvar alterações" espera uma mudança: sem ela não há pedido a mandar. */
  isUnchanged: boolean
  onCancelEdit: () => void
}>

/** O primário leva ícone; o secundário ("Cancelar edição") fica limpo (`web.md` §9). */
export function HolidayFormActions({
  createLabel,
  isEditing,
  isSaving,
  isUnchanged,
  onCancelEdit,
}: HolidayFormActionsProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <div className={styles.actions}>
      <Button disabled={isSaving || isUnchanged} type="submit">
        <Icon name={isEditing ? 'save' : 'add'} />
        {isSaving ? t('form.saving') : isEditing ? t('form.submitEdit') : createLabel}
      </Button>
      {isEditing ? (
        <Button disabled={isSaving} onClick={onCancelEdit} type="button" variant="ghost">
          {t('form.cancelEdit')}
        </Button>
      ) : null}
    </div>
  )
}
