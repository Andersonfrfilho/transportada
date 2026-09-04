/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { TripDocumentDetail } from '../shared/trip.types'
import { buildTripProcessFlow, type TripProcessStage } from '../shared/tripProcessFlow.service'
import type { TripProgress } from '../shared/tripProgress.service'
import styles from '../styles/trip.module.css'

const STAGE_ICON: Readonly<Record<TripProcessStage, 'check' | 'columns' | 'send' | 'truck'>> = {
  delivered: 'check',
  loaded: 'truck',
  pending: 'columns',
  separated: 'send',
}

type TripProcessFlowProps = Readonly<{
  documents: readonly TripDocumentDetail[]
  /** Spec 079 T011: `null` quando não há ritmo medido — e aí a tela **diz** que não há previsão. */
  progress: null | TripProgress
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * O andamento como **processo**, não como porcentagem por status: uma fila de fases, cada uma com
 * quantas notas já passaram por ela e a barra da fase avançando. A porcentagem por status dizia
 * `Carregada 75% · Pendente 25%` — quatro números que somam cem sem dizer onde a viagem está.
 *
 * A fase alcançada acende; a atual pulsa. Quem pediu menos movimento não recebe nenhum, e a
 * informação continua inteira sem a animação — ela é reforço, nunca o canal.
 */
export function TripProcessFlow({ documents, progress: tripProgress }: TripProcessFlowProps) {
  const { t } = useTranslation('trip')
  const flow = buildTripProcessFlow(documents)

  if (flow === null) return null

  return (
    <div className={styles.progressWrapper}>
      <ol
        aria-label={t('stops.progressLabel')}
        className={styles.processFlow}
        data-current={flow.currentStage}
      >
        {flow.stages.map((stage) => {
          const isCurrent = stage.stage === flow.currentStage
          const isReached = stage.reached > 0

          return (
            <li
              className={styles.processStage}
              data-current={isCurrent ? 'true' : undefined}
              data-reached={isReached ? 'true' : undefined}
              key={stage.stage}
            >
              <span className={styles.processStageHead}>
                <Icon name={STAGE_ICON[stage.stage]} />
                {t(`separationStatus.${stage.stage}`)}
              </span>
              <span className={styles.processStageCount}>
                {t('stops.processCount', { reached: stage.reached, total: flow.total })}
              </span>
              {/* A barra da fase é a fração que a alcançou: é ela que anda quando a nota avança. */}
              <span className={styles.processStageTrack}>
                <span
                  className={styles.processStageFill}
                  style={{ transform: `scaleX(${stage.ratio})` }}
                />
              </span>
            </li>
          )
        })}
      </ol>

      {/* A devolvida sai do fluxo, e some quando não há — linha zerada é ruído. */}
      {flow.returned === 0 ? null : (
        <p className={styles.processReturned}>
          <Icon name="arrow-up" />
          {t('stops.processReturned', { count: flow.returned })}
        </p>
      )}

      {tripProgress === null ? null : (
        <p className={styles.hint}>
          {tripProgress.estimatedCompletionAt === null
            ? t('stops.withoutEstimate')
            : t('stops.estimatedCompletion', {
                moment: momentFormatter.format(new Date(tripProgress.estimatedCompletionAt)),
              })}
        </p>
      )}
    </div>
  )
}
