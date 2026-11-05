/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { OutOfOrderPrompt } from '../shared/outOfOrderPrompt.service'
import styles from '../styles/driverTrip.module.css'

type DriverOutOfOrderDialogProps = Readonly<{
  onConfirm: (idempotencyKey: string) => void
  onDiscard: (idempotencyKey: string) => void
  prompt: OutOfOrderPrompt
}>

/** Spec 294 RF25/RF27: a API recusou o toque por fora de ordem; só grava com a confirmação do motorista. */
export function DriverOutOfOrderDialog({
  onConfirm,
  onDiscard,
  prompt,
}: DriverOutOfOrderDialogProps) {
  const { t } = useTranslation('driverTrip')
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
    <section
      className={styles.rejectedBanner}
      role="alertdialog"
      aria-label={t('outOfOrder.title')}
    >
      <h3>{t('outOfOrder.title')}</h3>
      <p>{t(bodyKey, values)}</p>
      <div className={styles.actions}>
        <Button onClick={() => onConfirm(prompt.idempotencyKey)} type="button">
          <Icon name="check" />
          {t('outOfOrder.confirm')}
        </Button>
        <Button onClick={() => onDiscard(prompt.idempotencyKey)} type="button" variant="ghost">
          <Icon name="close" />
          {t('outOfOrder.discard')}
        </Button>
      </div>
    </section>
  )
}
