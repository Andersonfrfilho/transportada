/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TripRouteAssemblyOutcome } from '../hooks/useTripRouteAssembly.hook'
import styles from '../styles/trip.module.css'

type TripRouteAssemblyLeftoversProps = Readonly<{ outcome: TripRouteAssemblyOutcome }>

/**
 * Spec 107: **o que não entrou em viagem nenhuma.**
 *
 * ⚠️ Sugestão que devolve quarenta paradas e cala sobre doze **parece completa** — o operador aceita
 * e descobre a carga esquecida no dia seguinte. A frase resume; o expandido permite agir.
 *
 * ⚠️ E o resumo não substitui a lista: "56 notas" sem quais manda o operador procurar numa tela de
 * 345, que é exatamente o passo em que ele errou o filtro e despachou 345 achando que eram 21
 * (spec 103).
 */
export function TripRouteAssemblyLeftovers({ outcome }: TripRouteAssemblyLeftoversProps) {
  const { t } = useTranslation('trip')
  const [isExpanded, setIsExpanded] = useState(false)

  const notCovered = outcome.leftoverStops.filter((stop) => !stop.excludedFromOptimization)
  const imprecise = outcome.leftoverStops.filter((stop) => stop.excludedFromOptimization)
  const total = outcome.leftoverStops.length + outcome.skippedDocuments.length

  if (total === 0) return null

  return (
    <section className={styles.leftovers} aria-label={t('routeAssembly.leftovers.title')}>
      <div className={styles.leftoversHead}>
        <p role="status">{t('routeAssembly.leftovers.summary', { count: total })}</p>
        <Button
          onClick={() => setIsExpanded((current) => !current)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={isExpanded ? 'remove' : 'add'} />
          {t(isExpanded ? 'routeAssembly.leftovers.hide' : 'routeAssembly.leftovers.show')}
        </Button>
      </div>

      {isExpanded ? (
        <dl className={styles.leftoversDetail}>
          {notCovered.length === 0 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.notCovered', { count: notCovered.length })}</dt>
              <dd>{notCovered.map((stop) => stop.label).join(' · ')}</dd>
            </div>
          )}
          {imprecise.length === 0 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.imprecise', { count: imprecise.length })}</dt>
              <dd>{imprecise.map((stop) => stop.label).join(' · ')}</dd>
            </div>
          )}
          {outcome.skippedDocuments.length === 0 ? null : (
            <div>
              <dt>
                {t('routeAssembly.leftovers.alreadyLinked', {
                  count: outcome.skippedDocuments.length,
                })}
              </dt>
              <dd>{outcome.skippedDocuments.map((entry) => entry.nfeDocumentId).join(' · ')}</dd>
            </div>
          )}
        </dl>
      ) : null}
    </section>
  )
}
