/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import { TRIP_OCCURRENCE_STAGE } from '../shared/occurrence.constant'
import type { OccurrenceNotificationEntry } from '../shared/occurrence.constant'
import styles from '../styles/trip.module.css'

type TripOccurrenceNotificationsProps = Readonly<{
  canManage: boolean
  entries: readonly OccurrenceNotificationEntry[]
  isSaving: boolean
  onToggle: (input: Readonly<{ notifies: boolean; type: string }>) => void
}>

/**
 * Spec 079: quais ocorrências viram aviso.
 *
 * **Configuração perto do efeito**: este painel mora na tela de viagens, que é onde a ocorrência é
 * registrada e onde ela aparece. Numa tela de configurações genérica, quem liga estaria longe do
 * efeito.
 *
 * ⚠️ **O padrão é o silêncio, e o texto diz isso** junto de para quem o aviso vai. Um aviso cujo
 * destino ninguém conhece é o que faz o operador desligar tudo na primeira dúvida.
 */
export function TripOccurrenceNotifications({
  canManage,
  entries,
  isSaving,
  onToggle,
}: TripOccurrenceNotificationsProps) {
  const { t } = useTranslation('trip')

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('occurrence.notificationsTitle')}</h3>
      <p className={styles.hint}>{t('occurrence.notificationsHint')}</p>
      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((stage) => (
        <fieldset className={styles.occurrenceStage} key={stage}>
          <legend className={styles.hint}>
            {stage === TRIP_OCCURRENCE_STAGE.separation
              ? t('occurrence.stageSeparation')
              : t('occurrence.stageDelivery')}
          </legend>
          {entries
            .filter((entry) => entry.stage === stage)
            .map((entry) => (
              <Checkbox
                checked={entry.notifies}
                disabled={!canManage || isSaving}
                key={entry.type}
                label={t(`occurrence.type.${entry.type}`)}
                onChange={(notifies) => onToggle({ notifies, type: entry.type })}
              />
            ))}
        </fieldset>
      ))}
    </section>
  )
}
