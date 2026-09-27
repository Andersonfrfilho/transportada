/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useLocationConsent } from '../hooks/useLocationConsent.hook'
import styles from '../styles/driverTrip.module.css'

/**
 * RF15 (ADR-0075 §8, ADR-0050 §5; LGPD art. 8º e 9º): o interruptor vem **desligado** até o
 * motorista ligar, e o texto diz antes do toque para quê, quem vê e por quanto tempo. Enquanto a
 * escolha não foi lida do servidor, ele não se mostra ligado.
 *
 * Code M4/M5, Segurança L3 (spec 189 T9.2): "desligar" nunca fica desabilitado — é a ação de
 * privacidade, e travá-la atrás de `isSaving`/`isFailed` prenderia o motorista compartilhando
 * posição contra a vontade dele por causa de uma consulta lenta. Só **ligar** pode esperar.
 */
export function DriverLocationConsentCard() {
  const { t } = useTranslation('driverTrip')
  const consent = useLocationConsent()
  const isTurningOn = !consent.hasConsent
  const isSwitchDisabled =
    isTurningOn && (consent.isLoading || consent.isFailed || consent.isSaving)

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
        disabled={isSwitchDisabled}
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
      {/*
       * A retirada falhou: o interruptor já mostra desligado (`hasConsent` acima ignora o servidor
       * enquanto `isRevokeFailed`), mas tocá-lo de novo tentaria LIGAR — o toggle normal não serve
       * de nova tentativa aqui. Este botão manda o mesmo `false` de novo.
       */}
      {consent.isRevokeFailed ? (
        <Button
          className={styles.eventQueueOpenButton}
          type="button"
          variant="secondary"
          onClick={() => consent.setConsent(false)}
        >
          <Icon name="refresh" />
          {t('locationSharing.retry')}
        </Button>
      ) : null}
    </section>
  )
}
