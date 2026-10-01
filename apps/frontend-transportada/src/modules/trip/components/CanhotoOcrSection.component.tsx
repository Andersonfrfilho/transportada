/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DeliveryProofFieldSettings } from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

type CanhotoOcrSectionProps = Readonly<{
  canhotoOcrEnabled: boolean | undefined
  canManage: boolean
  effective: DeliveryProofFieldSettings
  isTogglingCanhotoOcr: boolean
  onToggleCanhotoOcr: (fieldSettings: DeliveryProofFieldSettings, nextEnabled: boolean) => void
}>

/**
 * Spec 156 T14, ADR-0069 §6: painel do interruptor, perto do efeito (`SETTINGS_PANEL_PLACEMENT`
 * — a leitura do canhoto acontece no assistente desta mesma tela). Molde de
 * `CameraMeasurementSettingsPanel` (spec 152 D14): selo "Experimental" ao lado do efeito e
 * estimativa de peso, desligado por padrão em toda instalação.
 */
export function CanhotoOcrSection({
  canhotoOcrEnabled,
  canManage,
  effective,
  isTogglingCanhotoOcr,
  onToggleCanhotoOcr,
}: CanhotoOcrSectionProps) {
  const { t } = useTranslation('trip')

  return (
    <section className={styles.panel} aria-labelledby="canhoto-ocr-title">
      <h3 className={styles.hint} id="canhoto-ocr-title">
        {t('deliveryProofSettings.canhotoOcr.title')}
      </h3>
      <p className={styles.hint}>{t('deliveryProofSettings.canhotoOcr.hint')}</p>
      <p className={styles.hint}>
        <Icon aria-hidden="true" name="camera" />{' '}
        {t('deliveryProofSettings.canhotoOcr.experimental')}
      </p>
      <p className={canhotoOcrEnabled === true ? styles.settingsStatusOn : styles.hint}>
        {t(
          canhotoOcrEnabled === true
            ? 'deliveryProofSettings.canhotoOcr.on'
            : 'deliveryProofSettings.canhotoOcr.off',
        )}
      </p>
      {canManage ? (
        /* T16: solto no grid do painel o botão esticava à largura toda — mesma faixa das ações. */
        <div className={styles.actionActions}>
          <Button
            disabled={isTogglingCanhotoOcr}
            onClick={() => onToggleCanhotoOcr(effective, canhotoOcrEnabled !== true)}
            size="sm"
            type="button"
            variant={canhotoOcrEnabled === true ? 'secondary' : 'default'}
          >
            <Icon name="power" />
            {t(
              canhotoOcrEnabled === true
                ? 'deliveryProofSettings.canhotoOcr.disable'
                : 'deliveryProofSettings.canhotoOcr.enable',
            )}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
