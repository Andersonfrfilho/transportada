/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { OutOfOrderPrompt } from '../shared/outOfOrderPrompt.service'
import styles from '../styles/driverTrip.module.css'

type DriverOutOfOrderDialogProps = Readonly<{
  onConfirm: (idempotencyKey: string) => void
  onDiscard: (idempotencyKey: string) => void
  prompt: OutOfOrderPrompt
}>

/** O Esc não decide por ele: a pergunta só fecha com uma das duas respostas. */
function keepOpen(): void {}

/**
 * Spec 294 RF25/RF27: o toque não segue a ordem sugerida; só grava com a confirmação do motorista.
 * Pedido do dono (06/11): é sugestão, não recusa — modal em cobre, que abre na hora para ele já responder.
 */
export function DriverOutOfOrderDialog({
  onConfirm,
  onDiscard,
  prompt,
}: DriverOutOfOrderDialogProps) {
  const { t } = useTranslation('driverTrip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: keepOpen })
  const values = {
    current: prompt.currentSequence,
    kind: t(`outOfOrder.kind.${prompt.kind}`),
    next: prompt.nextSequence,
    requested: prompt.requestedSequence,
  }
  const bodyKey =
    prompt.currentSequence !== undefined
      ? 'outOfOrder.withCurrent'
      : prompt.nextSequence !== undefined
        ? 'outOfOrder.withNext'
        : 'outOfOrder.generic'

  return (
    <div className={styles.outOfOrderBackdrop}>
      <section
        aria-label={t('outOfOrder.title')}
        aria-modal="true"
        className={styles.outOfOrderModal}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h3>
          <Icon aria-hidden="true" name="alert" size="sm" />
          {t('outOfOrder.title')}
        </h3>
        <p>{t(bodyKey, values)}</p>
        <div className={styles.outOfOrderActions}>
          <Button onClick={() => onConfirm(prompt.idempotencyKey)} type="button">
            <Icon name="check" />
            {t('outOfOrder.confirm', values)}
          </Button>
          <Button onClick={() => onDiscard(prompt.idempotencyKey)} type="button" variant="ghost">
            <Icon name="close" />
            {t('outOfOrder.discard')}
          </Button>
        </div>
      </section>
    </div>
  )
}
