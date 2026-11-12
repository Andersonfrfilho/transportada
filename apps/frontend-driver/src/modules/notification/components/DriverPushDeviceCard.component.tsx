/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import styles from '../../driver-trip/styles/driverTrip.module.css'
import { useDriverPushDevice } from '../hooks/useDriverPushDevice.hook'

/**
 * Liga e desliga o aviso no celular deste aparelho. O texto diz o estado real (lido do navegador) e, quando a
 * ativação falha, o motivo — nunca um botão que só gira.
 */
export function DriverPushDeviceCard() {
  const { t } = useTranslation('driverTrip')
  const push = useDriverPushDevice()
  if (push.state === null) return null

  return (
    <section className={styles.profileCard}>
      <h2 className={styles.profileSectionTitle}>{t('pushDevice.title')}</h2>
      <p className={styles.profileMeta}>{t(`pushDevice.state.${push.state}`)}</p>
      {push.state === 'off' ? (
        <Button
          className={styles.eventQueueOpenButton}
          disabled={push.isWorking}
          type="button"
          onClick={() => void push.enable()}
        >
          {push.isWorking ? t('pushDevice.enabling') : t('pushDevice.enable')}
        </Button>
      ) : null}
      {push.state === 'on' ? (
        <Button
          className={styles.eventQueueOpenButton}
          disabled={push.isWorking}
          type="button"
          variant="secondary"
          onClick={() => void push.disable()}
        >
          {push.isWorking ? t('pushDevice.disabling') : t('pushDevice.disable')}
        </Button>
      ) : null}
      {push.failure === null ? null : (
        <p className={styles.profileMeta} role="alert">
          {t(`pushDevice.failure.${push.failure}`)}
        </p>
      )}
    </section>
  )
}
