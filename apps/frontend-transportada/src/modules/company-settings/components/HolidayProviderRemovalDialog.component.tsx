/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { HolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'
import styles from '../styles/businessCalendar.module.css'

const DIALOG_TITLE_ID = 'holiday-provider-removal-title'
const DIALOG_BODY_ID = 'holiday-provider-removal-body'

type HolidayProviderRemovalDialogProps = Readonly<{ actions: HolidayProviderActions }>

/**
 * Confirmação de "Remover chave": a remoção para a busca de toda a instalação, então não sai num clique só. É um diálogo
 * modal rotulado pela pergunta (foco dentro, Esc fecha, o foco volta ao botão), como o de excluir feriado. Mora acima do
 * formulário de propósito: o formulário remonta quando a versão muda, e o diálogo precisa atravessar essa remontagem.
 */
export function HolidayProviderRemovalDialog({ actions }: HolidayProviderRemovalDialogProps) {
  const { t } = useTranslation('businessCalendar')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: actions.isConfirmingRemoval,
    onClose: actions.cancelRemoval,
  })
  if (!actions.isConfirmingRemoval) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-describedby={DIALOG_BODY_ID}
        aria-labelledby={DIALOG_TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id={DIALOG_TITLE_ID}>{t('providerSettings.remove.title')}</h2>
        </header>
        <div id={DIALOG_BODY_ID}>
          <p>{t('providerSettings.remove.body')}</p>
        </div>
        <footer className={styles.dialogFooter}>
          <Button
            disabled={actions.isRemoving}
            onClick={actions.cancelRemoval}
            type="button"
            variant="ghost"
          >
            {t('providerSettings.remove.cancel')}
          </Button>
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
        </footer>
      </div>
    </div>,
    document.body,
  )
}
