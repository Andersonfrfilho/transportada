/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { formatDuration } from '../shared/assemblyLeg.service'
import type { RouteChoiceCriterion, RouteGeometry } from '../shared/routeGeometry.service'
import styles from '../styles/trip.module.css'

const METERS_PER_KILOMETER = 1000
const SECONDS_PER_MINUTE = 60

type TripRouteCostSummaryProps = Readonly<{
  /** Sem `trip.financials` combustível/pedágio/total somem — nunca traço, nunca zero (spec 153 D10). */
  canReadFinancials: boolean
  geometry: null | RouteGeometry
}>

/** O critério gravado (spec 153 D2) usa os mesmos rótulos do seletor de rotas (T402) — sem duplicar texto. */
function criterionLabelKey(criterion: RouteChoiceCriterion): string {
  if (criterion === 'no_toll') return 'noToll'
  if (criterion === 'alternative') return 'alternative'
  return criterion
}

/**
 * Spec 153 T405: km, volta ao barracão e tempo da rota **da viagem** (D9, sempre presentes),
 * combustível/pedágio/custo total só com `trip.financials` (D10), o critério gravado (D2) e o
 * aviso de escolha não reproduzida (D3) — extraído de `TripRouteMap` pelo mesmo motivo de
 * `RouteChoiceOptions`/`RouteTollSummary` em T402: manter o arquivo que monta o mapa abaixo do
 * limite de 200 linhas do padrão de código.
 */
export function TripRouteCostSummary({ canReadFinancials, geometry }: TripRouteCostSummaryProps) {
  const { t } = useTranslation('trip')
  /** A rota que a viagem usa (spec 153) — a congelada no planejamento, não sempre a principal. */
  const route = geometry?.options?.[geometry.selectedIndex ?? 0] ?? null
  /**
   * Sem `trip.financials` a chave sai da resposta (spec 153 D10) — `?? null` trata a ausência com o
   * mesmo "não calculado" que o `null` sempre teve, sem inventar zero.
   */
  const fuelTotal = route?.fuelTotal ?? null
  const totalCost = route?.totalCost ?? null
  /**
   * Spec 153 D9: km, volta ao barracão e tempo saem da rota da **viagem** (`geometry`), não da
   * opção crua — são os mesmos números que o congelamento gravou, e aparecem para todo mundo,
   * nunca dinheiro. `null` é "não calculado" (D5); nunca zero.
   */
  const distanceMeters = geometry?.distanceMeters ?? null
  const durationSeconds = geometry?.durationSeconds ?? null
  const returnDistanceMeters = geometry?.returnDistanceMeters ?? null

  return (
    <>
      {/*
        ⚠️ Custo sem valor **diz que não foi calculado**, nunca zero: zero ali seria a afirmação de que
        a rota não gasta combustível ou não passa por praça nenhuma.
      */}
      {distanceMeters === null ? null : (
        <dl className={styles.routeCost}>
          <div>
            <dt>{t('routeMap.cost.distance')}</dt>
            <dd>
              {t('routeMap.cost.kilometers', {
                distance: (distanceMeters / METERS_PER_KILOMETER).toFixed(1),
              })}
            </dd>
          </div>
          {/* D9: tempo e volta ao barracão aparecem para todo mundo — não são dinheiro. */}
          {durationSeconds === null ? null : (
            <div>
              <dt>{t('routeMap.cost.duration')}</dt>
              <dd>{formatDuration(Math.round(durationSeconds / SECONDS_PER_MINUTE))}</dd>
            </div>
          )}
          {returnDistanceMeters === null ? null : (
            <div>
              <dt>{t('routeMap.cost.returnDistance')}</dt>
              <dd>
                {t('routeMap.cost.kilometers', {
                  distance: (returnDistanceMeters / METERS_PER_KILOMETER).toFixed(1),
                })}
              </dd>
            </div>
          )}
          {/* D10: sem `trip.financials` a linha inteira some — nunca traço, nunca zero. */}
          {!canReadFinancials ? null : (
            <div>
              <dt>{t('routeMap.cost.fuel')}</dt>
              <dd className={styles.routeCostExpense}>
                {fuelTotal === null ? t('routeMap.cost.notCalculated') : formatAmount(fuelTotal)}
              </dd>
            </div>
          )}
          {!canReadFinancials ? null : (
            <div>
              <dt>{t('routeMap.cost.toll')}</dt>
              <dd className={styles.routeCostExpense}>
                {route?.toll === null || route?.toll.total === undefined
                  ? t('routeMap.cost.notCalculated')
                  : formatAmount(route.toll.total)}
              </dd>
            </div>
          )}
          {!canReadFinancials ? null : (
            <div>
              <dt>{t('routeMap.cost.total')}</dt>
              <dd className={styles.routeCostExpense}>
                {totalCost === null ? t('routeMap.cost.notCalculated') : formatAmount(totalCost)}
              </dd>
            </div>
          )}
        </dl>
      )}
      {route === null ||
      totalCost !== null ||
      geometry?.costGap === undefined ||
      geometry.costGap === null ? null : (
        <p className={styles.hint}>{t(`assemblyMap.routeOptions.gap.${geometry.costGap}`)}</p>
      )}
      {/* Spec 153 D2: o critério da rota gravada — só existe na rota congelada da viagem (T203). */}
      {geometry?.frozen !== true ||
      geometry.criterion === null ||
      geometry.criterion === undefined ? null : (
        <p className={styles.hint}>
          {t('routeMap.criterion', {
            criterion: t(`assemblyMap.routeOptions.${criterionLabelKey(geometry.criterion)}`),
          })}
        </p>
      )}
      {/*
        ⚠️ Spec 153 D3: `choiceReproduced` só avisa quando é **`false`** de verdade — a assinatura
        gravada não bateu com nenhuma rota que o OSRM devolveu hoje. `undefined` (fora do contexto
        de uma viagem) nunca dispara este aviso — essa distinção é a própria armadilha que a T401
        deixou e a T405 corrige (ver `tripResponse.validation.ts`).
      */}
      {geometry?.frozen !== true || geometry.choiceReproduced !== false ? null : (
        <p className={styles.warning}>{t('routeMap.choiceNotReproduced')}</p>
      )}
    </>
  )
}
