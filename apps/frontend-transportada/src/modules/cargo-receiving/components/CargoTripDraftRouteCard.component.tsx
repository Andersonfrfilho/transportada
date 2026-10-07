/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { CARGO_PREVIEW_ITEM_STATES } from '../shared/cargoPreview.constant'
import type { CargoPreviewTripDraftRoute } from '../shared/cargoPreviewTripDraft.types'
import type { CargoTripDraftAction } from '../shared/cargoPreviewTripDraftView.service'
import {
  formatBrazilianReais,
  formatCubicMeters,
  formatKilograms,
  formatPlannedDate,
} from '../shared/cargoPreviewFormat.service'
import styles from '../styles/cargoTripDraft.module.css'
import { CargoPreviewItemStateBadge } from './CargoPreviewBadges.component'
import { CargoTripDraftCities } from './CargoTripDraftCities.component'

type CargoTripDraftRouteCardProps = Readonly<{
  action: CargoTripDraftAction
  isChosen: boolean
  locale: string
  onChoose: () => void
  onCreate: () => void
  route: CargoPreviewTripDraftRoute
}>

function RouteTotals({
  locale,
  route,
}: Readonly<{ locale: string; route: CargoPreviewTripDraftRoute }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { totals } = route
  return (
    <dl className={styles.totals}>
      <div>
        <dt>{t('preview.drafts.card.weight')}</dt>
        <dd>{formatKilograms({ locale, value: totals.weightKg })}</dd>
      </div>
      <div>
        <dt>{t('preview.drafts.card.value')}</dt>
        <dd>{formatBrazilianReais({ locale, value: totals.value })}</dd>
      </div>
      {totals.volumeM3 === null ? null : (
        <div>
          <dt>{t('preview.drafts.card.volume')}</dt>
          <dd>{formatCubicMeters({ locale, value: totals.volumeM3 })}</dd>
        </div>
      )}
    </dl>
  )
}

function RouteFacts({
  locale,
  route,
}: Readonly<{ locale: string; route: CargoPreviewTripDraftRoute }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const load =
    route.loadReference === null
      ? t('preview.route.noLoad')
      : t('preview.route.load', {
          origin: route.loadOrigin === null ? '' : t(`preview.route.origin.${route.loadOrigin}`),
          reference: route.loadReference,
        })
  return (
    <p className={styles.facts}>
      <span>{load}</span>
      <span>
        {t('preview.facts.plannedDate', {
          date: formatPlannedDate({ locale, value: route.plannedDate }),
        })}
      </span>
      <span>
        {t('preview.drafts.card.lines', {
          matched: route.counts.matched,
          total: route.counts.total,
        })}
      </span>
      <span>{t('preview.drafts.card.documents', { count: route.documents.length })}</span>
    </p>
  )
}

function RouteAlerts({ route }: Readonly<{ route: CargoPreviewTripDraftRoute }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const inLiveTrip = route.documents.filter((entry) => entry.isInLiveTrip).length
  return (
    <>
      {route.missingCount > 0 ? (
        <p className={styles.missing} data-tone="neutral" data-trip-draft-missing="">
          <Icon name="clock" />
          {t('preview.drafts.card.missing', { count: route.missingCount })}
        </p>
      ) : null}
      {inLiveTrip > 0 ? (
        <p className={styles.reason}>
          {t('preview.drafts.card.inLiveTrip', { count: inLiveTrip })}
        </p>
      ) : null}
    </>
  )
}

/** Um roteiro do contratante como rascunho de viagem; as ações só existem para quem monta viagem. */
export function CargoTripDraftRouteCard({
  action,
  isChosen,
  locale,
  onChoose,
  onCreate,
  route,
}: CargoTripDraftRouteCardProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const reasonId = useId()
  const title = route.routeName ?? t('preview.route.none')

  return (
    <li>
      <article
        className={isChosen ? `${styles.card} ${styles.cardChosen}` : styles.card}
        data-trip-draft-route={route.routeName ?? ''}
      >
        <header className={styles.cardHeader}>
          <h4>{title}</h4>
          <ul aria-label={t('preview.summary.label')} className={styles.stateList}>
            {CARGO_PREVIEW_ITEM_STATES.filter((state) => route.counts[state] > 0).map((state) => (
              <li className={styles.stateItem} key={state}>
                <CargoPreviewItemStateBadge state={state} />
                {route.counts[state]}
              </li>
            ))}
          </ul>
        </header>
        <RouteFacts locale={locale} route={route} />
        <RouteTotals locale={locale} route={route} />
        <CargoTripDraftCities cities={route.cities} />
        <RouteAlerts route={route} />
        {action.kind === 'hidden' ? null : (
          <div className={styles.cardActions}>
            <Button
              aria-describedby={action.kind === 'disabled' ? reasonId : undefined}
              disabled={action.kind === 'disabled'}
              onClick={onCreate}
              type="button"
            >
              <Icon name="truck" />
              {t('preview.drafts.card.create')}
            </Button>
            {action.kind === 'enabled' ? (
              <Button aria-pressed={isChosen} onClick={onChoose} type="button" variant="secondary">
                <Icon name="send" />
                {isChosen
                  ? t('preview.drafts.card.routeChosen')
                  : t('preview.drafts.card.chooseRoute')}
              </Button>
            ) : null}
          </div>
        )}
        {action.kind === 'disabled' ? (
          <p className={styles.reason} data-trip-draft-reason="" id={reasonId}>
            {t(`preview.drafts.card.reason.${action.reason}`)}
          </p>
        ) : null}
      </article>
    </li>
  )
}
