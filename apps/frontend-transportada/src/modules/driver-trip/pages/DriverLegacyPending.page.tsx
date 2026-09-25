/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { DriverShellHeader } from '../components/DriverShellHeader.component'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { DriverEventQueuePage } from './DriverEventQueue.page'
import styles from '../styles/driverTrip.module.css'

type DriverLegacyPendingPageProps = Readonly<{
  onGoToDriverApp: () => void
}>

/**
 * ADR-0075 §6, "descartar com ciência": com o interruptor ligado e a fila antiga ainda com
 * pendência, o painel mostra **só** isto — sem a viagem. A fila mora no IndexedDB desta origem e
 * só sai daqui: a tela drena o que sobe e oferece "Descartar" ao que o servidor recusou.
 *
 * A ida para a casa nova sai só do toque em "Ir para o app novo", com a fila vazia, ou da próxima
 * abertura — nunca sozinha no meio do que o motorista estiver fazendo.
 */
export function DriverLegacyPendingPage({ onGoToDriverApp }: DriverLegacyPendingPageProps) {
  const { t } = useTranslation('driverTrip')
  const driverTrip = useDriverTrip()
  const isQueueEmpty = driverTrip.pendingCounts?.total === 0

  return (
    <div className={styles.moduleShell}>
      <DriverShellHeader />
      <section className={styles.shell} aria-live="polite">
        <div className={styles.legacyNotice}>
          <p>{t(isQueueEmpty ? 'legacy.pending.done' : 'legacy.pending.intro')}</p>
          {isQueueEmpty ? (
            <Button className={styles.legacyGoButton} type="button" onClick={onGoToDriverApp}>
              <Icon name="link" />
              {t('legacy.pending.go')}
            </Button>
          ) : null}
        </div>
      </section>
      <DriverEventQueuePage
        isLoading={driverTrip.isQueueLoading}
        isSyncing={driverTrip.isSyncing}
        items={driverTrip.queueView}
        onDiscard={(idempotencyKey) => void driverTrip.discardRejected(idempotencyKey)}
        onSendAll={() => driverTrip.sendAllNow()}
        onSendOne={(idempotencyKey) => driverTrip.sendNow(idempotencyKey)}
      />
    </div>
  )
}
