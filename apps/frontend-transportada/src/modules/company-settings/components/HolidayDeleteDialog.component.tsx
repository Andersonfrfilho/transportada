/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { HolidayDeleteController } from '../hooks/useHolidayDelete.hook'
import styles from '../styles/businessCalendar.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

const DIALOG_TITLE_ID = 'business-calendar-delete-title'

type HolidayDeleteDialogProps = Readonly<{ controller: HolidayDeleteController }>

/**
 * Excluir é irreversível: o botão diz o verbo e o objeto ("Excluir regra"), nunca "OK", e a regra avisa quantas
 * datas digitadas no mesmo dia continuam valendo — o `DELETE` responde 204 sem corpo, então o número vem da leitura.
 */
export function HolidayDeleteDialog({ controller }: HolidayDeleteDialogProps) {
  const { t } = useTranslation('businessCalendar')
  const { target } = controller
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: target !== undefined,
    onClose: controller.cancel,
  })
  if (target === undefined) return null
  const variant = target.origin
  const kept = target.typedHolidaysKept ?? 0

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-describedby="business-calendar-delete-body"
        aria-labelledby={DIALOG_TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id={DIALOG_TITLE_ID}>{t(`dialog.${variant}.title`, { name: target.name })}</h2>
          <button
            aria-label={t('dialog.close')}
            className={styles.iconAction}
            onClick={controller.cancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <div id="business-calendar-delete-body">
          <p>{t(`dialog.${variant}.body`, { year: target.materializedThroughYear })}</p>
          {variant === 'rule' && kept > 0 ? <p>{t('dialog.typedKept', { count: kept })}</p> : null}
        </div>
        {controller.refusal === undefined ? null : <HolidayRefusal refusal={controller.refusal} />}
        <footer className={styles.dialogFooter}>
          <Button
            disabled={controller.isDeleting}
            onClick={controller.cancel}
            type="button"
            variant="ghost"
          >
            {t('dialog.cancel')}
          </Button>
          <Button
            disabled={controller.isDeleting}
            onClick={() => void controller.confirm()}
            type="button"
            variant="secondary"
          >
            <Icon name="trash" />
            {controller.isDeleting ? t('dialog.deleting') : t(`dialog.${variant}.confirm`)}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
