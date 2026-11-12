/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMinWidth } from '@/modules/shared/useMinWidth.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/occurrenceDetails.module.css'
import { ClientEmailSendState } from './ClientEmailSendState.component'
import { ClientWhatsAppSendState } from './ClientWhatsAppSendState.component'
import { OccurrenceDetailsPanel } from './OccurrenceDetailsPanel.component'

type OccurrenceDetailsActionProps = Readonly<{
  companyId?: string
  occurrenceId: string
}>

function DetailsSurface({
  companyId,
  isSheet,
  occurrenceId,
  onClose,
}: OccurrenceDetailsActionProps & Readonly<{ isSheet: boolean; onClose: () => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  return (
    <>
      {isSheet ? <div aria-hidden="true" className={styles.backdrop} onClick={onClose} /> : null}
      <aside
        aria-labelledby={titleId}
        aria-modal={isSheet}
        className={isSheet ? styles.sheet : styles.side}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id={titleId}>{t('details.title')}</h2>
          <Button
            aria-label={t('details.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" size="sm" />
          </Button>
        </header>
        <div className={styles.scroll}>
          <OccurrenceDetailsPanel
            {...(companyId === undefined ? {} : { companyId })}
            occurrenceId={occurrenceId}
            sendState={
              <>
                <ClientEmailSendState occurrenceId={occurrenceId} />
                <ClientWhatsAppSendState occurrenceId={occurrenceId} />
              </>
            }
          />
        </div>
      </aside>
    </>
  )
}

/**
 * Spec 279 T6c (RF13): "Ver detalhes" no cabeçalho da conversa. No desktop o detalhe abre ao lado, e a conversa
 * segue usável; no celular (abaixo de 40rem) é uma folha por cima, que o Esc e o fundo fecham.
 */
export function OccurrenceDetailsAction({ companyId, occurrenceId }: OccurrenceDetailsActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const [isOpen, setOpen] = useState(false)
  const isWide = useMinWidth('40rem')

  return (
    <>
      <Button
        aria-expanded={isOpen}
        onClick={() => setOpen((current) => !current)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="document" size="sm" />
        {t('details.open')}
      </Button>
      {isOpen
        ? createPortal(
            <DetailsSurface
              {...(companyId === undefined ? {} : { companyId })}
              isSheet={!isWide}
              occurrenceId={occurrenceId}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  )
}
