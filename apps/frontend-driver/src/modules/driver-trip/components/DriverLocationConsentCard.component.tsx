/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useLocationConsent } from '../hooks/useLocationConsent.hook'
import styles from '../styles/driverTrip.module.css'

/**
 * RF15 (ADR-0075 §8, ADR-0050 §5; LGPD art. 8º e 9º): o interruptor vem **desligado** até o
 * motorista ligar, e o texto diz antes do toque para quê, quem vê e por quanto tempo. Enquanto a
 * escolha não foi lida do servidor, ele não se mostra ligado.
 */
export function DriverLocationConsentCard() {
  const { t } = useTranslation('driverTrip')
  const consent = useLocationConsent()

  return (
    <section className={styles.profileCard}>
      <h2 className={styles.profileSectionTitle}>{t('locationSharing.title')}</h2>
      <p className={styles.profileMeta}>{t('locationSharing.purpose')}</p>
      <p className={styles.profileMeta}>{t('locationSharing.audience')}</p>
      <p className={styles.profileMeta}>{t('locationSharing.retention')}</p>
      <p className={styles.profileMeta}>{t('locationSharing.when')}</p>
      <Button
        aria-checked={consent.hasConsent}
        className={styles.eventQueueOpenButton}
        disabled={consent.isLoading || consent.isFailed || consent.isSaving}
        role="switch"
        type="button"
        variant={consent.hasConsent ? 'default' : 'secondary'}
        onClick={() => consent.setConsent(!consent.hasConsent)}
      >
        {t('locationSharing.switch')}
        <span className={styles.locationSwitchState}>
          {t(consent.hasConsent ? 'locationSharing.on' : 'locationSharing.off')}
        </span>
      </Button>
      {consent.isFailed ? (
        <p className={styles.profileMeta} role="alert">
          {t('locationSharing.loadFailed')}
        </p>
      ) : null}
      {consent.isSaveFailed ? (
        <p className={styles.profileMeta} role="alert">
          {t('locationSharing.saveFailed')}
        </p>
      ) : null}
    </section>
  )
}
