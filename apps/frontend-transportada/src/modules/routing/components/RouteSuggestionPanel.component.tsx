/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { RouteSuggestion, RouteSuggestionStop } from '../shared/routeSuggestion.types'
import {
  canDecideSuggestion,
  collectRouteSuggestionWarnings,
  orderStopsForReview,
  type RouteSuggestionWarning,
} from '../shared/routeSuggestionWarnings.service'
import styles from '../styles/routing.module.css'
import { RouteSuggestionMap } from './RouteSuggestionMap.component'

type RouteSuggestionPanelProps = Readonly<{
  isDeciding?: boolean
  onAccept: () => void
  /**
   * O degrau 2 da escada (spec 069). Ausente, a ação não aparece — quem não pode marcar não vê um
   * botão que responderia 403.
   */
  onRefineAddress?: (addressKey: string) => Promise<RefineAddressResult>
  onReject: () => void
  suggestion: RouteSuggestion
}>

/** As três respostas da marca mais as duas falhas de transporte. Nenhuma delas é silêncio (RF5). */
export type RefineAddressFeedback =
  | 'refined'
  | 'not_improved'
  | 'provider_not_configured'
  | 'quota_exceeded'
  | 'failed'

/**
 * A precisão vem **da resposta**, nunca da parada em tela.
 *
 * ⚠️ Ler `stop.geocodingPrecision` aqui era o defeito: no caso mais comum de marcar — parada que
 * nunca teve coordenada — ela é `null`, e a mensagem saía com a chave crua `precision.null`. Quando
 * não era nula, ela era a precisão **anterior**, então "corrigido para CEP" aparecia justamente
 * quando o endereço tinha acabado de virar telhado.
 */
export type RefineAddressResult = Readonly<{
  outcome: RefineAddressFeedback
  precision?: string
}>

/**
 * ADR-0044 §5: a sugestão é **proposta**, e ela nunca escreve sozinha. Este painel é onde o
 * conferente vê o que o solver propôs, o que ele assumiu, e o que ficou violado — e só então aceita.
 *
 * Os avisos vêm antes da lista de propósito: quem rola até o botão já passou por eles.
 */
export function RouteSuggestionPanel({
  isDeciding = false,
  onAccept,
  onRefineAddress,
  onReject,
  suggestion,
}: RouteSuggestionPanelProps): JSX.Element {
  const { t } = useTranslation('routing')
  const warnings = collectRouteSuggestionWarnings(suggestion)
  const stops = orderStopsForReview(suggestion.stops)
  const decidable = canDecideSuggestion(suggestion)

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>{t('panel.title')}</h2>
        <p className={styles.status}>{t(`status.${suggestion.status}`)}</p>
      </header>

      {suggestion.status === 'failed' ? (
        <p className={styles.failure} role="alert">
          {t(`failure.${suggestion.errorCode}`, { defaultValue: t('failure.unknown') })}
        </p>
      ) : null}

      <dl className={styles.estimates}>
        <div>
          <dt>{t('panel.distance')}</dt>
          <dd>{formatKilometres(suggestion.estimatedDistanceMeters, t('panel.unknown'))}</dd>
        </div>
        <div>
          <dt>{t('panel.duration')}</dt>
          <dd>{formatDuration(suggestion.estimatedDurationSeconds, t('panel.unknown'))}</dd>
        </div>
        <div>
          <dt>{t('panel.cost')}</dt>
          <dd>{formatAmount(suggestion.estimatedCostAmount, t('panel.unknown'))}</dd>
        </div>
      </dl>

      {warnings.length > 0 ? (
        <ul className={styles.warnings} role="alert">
          {warnings.map((warning) => (
            <li className={styles.warning} key={warning.kind}>
              <Icon aria-hidden="true" name="alert" />
              {warningText({ t, warning })}
            </li>
          ))}
        </ul>
      ) : null}

      <RouteSuggestionMap stops={stops} />

      <ol className={styles.stops}>
        {stops.map((stop) => (
          <StopRow
            key={`${stop.sequence}-${stop.addressKey}`}
            {...(onRefineAddress === undefined ? {} : { onRefineAddress })}
            stop={stop}
          />
        ))}
      </ol>

      {/**
       * As premissas ficam visíveis, não escondidas atrás de um "detalhes": o tempo de serviço e a
       * origem dele são o que sustenta o ETA, e um ETA que ninguém sabe de onde veio é um ETA em que
       * ninguém confia (spec 058 D6).
       */}
      <p className={styles.assumptions}>
        {t(`assumptions.serviceTime.${suggestion.assumptions.serviceTimeSource}`, {
          seconds: suggestion.assumptions.serviceTimeSeconds,
        })}
      </p>

      <div className={styles.actions}>
        <Button disabled={!decidable || isDeciding} onClick={onAccept} type="button">
          <Icon aria-hidden="true" name="check" />
          {t('panel.accept')}
        </Button>
        <Button
          disabled={!decidable || isDeciding}
          onClick={onReject}
          type="button"
          variant="secondary"
        >
          {t('panel.reject')}
        </Button>
      </div>
    </section>
  )
}

function StopRow({
  onRefineAddress,
  stop,
}: Readonly<{
  onRefineAddress?: (addressKey: string) => Promise<RefineAddressResult>
  stop: RouteSuggestionStop
}>): JSX.Element {
  const { t } = useTranslation('routing')
  const [feedback, setFeedback] = useState<RefineAddressResult | null>(null)
  const [isRefining, setIsRefining] = useState(false)

  async function handleRefine(): Promise<void> {
    if (onRefineAddress === undefined || isRefining) return
    setIsRefining(true)
    setFeedback(null)
    try {
      setFeedback(await onRefineAddress(stop.addressKey))
    } finally {
      setIsRefining(false)
    }
  }

  return (
    <li className={styles.stop} data-excluded={stop.excludedFromOptimization}>
      <span className={styles.stopSequence}>{stop.sequence}</span>
      <span className={styles.stopLabel}>{stop.label}</span>
      {/**
       * A precisão fica visível por parada, não só no resumo: o conferente que olha uma linha
       * específica precisa saber se aquele ponto é um telhado ou um palpite de oito quilômetros.
       */}
      {stop.geocodingPrecision === null ? null : (
        <span className={styles.stopPrecision} data-precision={stop.geocodingPrecision}>
          {t(`precision.${stop.geocodingPrecision}`)}
        </span>
      )}
      {stop.weightEstimated ? (
        <span className={styles.stopFlag}>{t('stop.weightEstimated')}</span>
      ) : null}
      {stop.excludedFromOptimization ? (
        <span className={styles.stopFlag}>{t('stop.excluded')}</span>
      ) : null}
      {onRefineAddress === undefined ? null : (
        <Button
          disabled={isRefining}
          onClick={() => {
            void handleRefine()
          }}
          size="sm"
          variant="ghost"
        >
          <Icon name="alert" aria-hidden="true" />
          {isRefining ? t('refine.busy') : t('refine.action')}
        </Button>
      )}
      {/**
       * RF5: a resposta é impressa **sempre**. Marcar e ver a tela idêntica faria o conferente
       * concluir que a marca não funciona — e as respostas que não melhoraram nada oferecem o
       * degrau 3, o pino manual.
       */}
      {feedback === null ? null : (
        <span className={styles.stopFlag} data-refine-feedback={feedback.outcome} role="status">
          {t(REFINE_FEEDBACK_KEY[feedback.outcome], {
            precision:
              feedback.precision === undefined
                ? ''
                : t(`precision.${feedback.precision}`, { defaultValue: feedback.precision }),
          })}
        </span>
      )}
    </li>
  )
}

const REFINE_FEEDBACK_KEY: Readonly<Record<RefineAddressFeedback, string>> = {
  failed: 'refine.failed',
  not_improved: 'refine.notImproved',
  provider_not_configured: 'refine.notConfigured',
  quota_exceeded: 'refine.quotaExceeded',
  refined: 'refine.refined',
}

type Translate = ReturnType<typeof useTranslation>['t']

function warningText(input: {
  readonly t: Translate
  readonly warning: RouteSuggestionWarning
}): string {
  return input.t(`warning.${input.warning.kind}`, {
    count: input.warning.count,
    total: input.warning.total ?? 0,
  })
}

const METRES_PER_KILOMETRE = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

function formatKilometres(meters: number | null, unknown: string): string {
  if (meters === null) return unknown

  return `${(meters / METRES_PER_KILOMETRE).toFixed(1)} km`
}

function formatDuration(seconds: number | null, unknown: string): string {
  if (seconds === null) return unknown

  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR

  return hours === 0 ? `${minutes}min` : `${hours}h${String(minutes).padStart(2, '0')}`
}

function formatAmount(amount: string | null, unknown: string): string {
  if (amount === null) return unknown

  return new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' }).format(
    Number(amount),
  )
}
