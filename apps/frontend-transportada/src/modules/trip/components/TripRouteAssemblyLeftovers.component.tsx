/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  collectRetryableDocumentIds,
  LEFTOVER_REASON,
} from '@/modules/routing/shared/suggestionLeftover.service'
import { resolveFreeingVehicles } from '@/modules/routing/shared/suggestionSecondWave.service'

import type { TripRouteAssemblyOutcome } from '../hooks/useTripRouteAssembly.hook'
import styles from '../styles/trip.module.css'

type TripRouteAssemblyLeftoversProps = Readonly<{
  /**
   * Spec 107 D3: reabre a montagem já com as notas que sobraram selecionadas. ⚠️ Sem isto o operador
   * fecha a tela e refaz o filtro à mão — que é exatamente onde a seleção deu errado e 345 notas
   * viraram sete viagens (spec 103).
   */
  onRetry: (nfeDocumentIds: readonly string[]) => void
  outcome: TripRouteAssemblyOutcome
  /**
   * Spec 107 D3: a placa de quem fica livre. ⚠️ Frota ainda carregando é mapa vazio, e a linha sai
   * sem placa em vez de sumir — a hora é a informação, e ela existe sem o nome do caminhão.
   */
  plateByVehicleId: ReadonlyMap<string, string>
}>

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
export function TripRouteAssemblyLeftovers({
  onRetry,
  outcome,
  plateByVehicleId,
}: TripRouteAssemblyLeftoversProps) {
  const { t } = useTranslation('trip')
  const [isExpanded, setIsExpanded] = useState(false)

  /**
   * ⚠️ **A razão vem da sobra, não de `excludedFromOptimization`.** Derivar do sinalizador só
   * funcionava com duas causas; com a terceira — carga acima do teto do caminhão — ele rotularia
   * tonelagem como falta de cobertura, e mandaria o operador cadastrar região para resolver peso.
   */
  const notCovered = outcome.leftoverStops.filter(
    (stop) => stop.reason === LEFTOVER_REASON.notCovered,
  )
  const imprecise = outcome.leftoverStops.filter(
    (stop) => stop.reason === LEFTOVER_REASON.imprecise,
  )
  const overCapacity = outcome.leftoverStops.filter(
    (stop) => stop.reason === LEFTOVER_REASON.overCapacity,
  )
  const total = outcome.leftoverStops.length + outcome.skippedDocuments.length
  const retryable = collectRetryableDocumentIds(outcome.leftoverStops)
  /**
   * Spec 107 D3: **a segunda onda.** O primeiro a ficar livre é o que interessa — a ordem em que as
   * viagens nasceram é a dos veículos ofertados, e não tem relação com quem termina antes.
   */
  const freeing = resolveFreeingVehicles({ plateByVehicleId, trips: outcome.trips })
  const first = freeing[0]

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
        {/*
          ⚠️ Só aparece com nota que **vale** tentar de novo: a parada de endereço impreciso não
          fica melhor numa segunda montagem, e oferecer o botão ali seria convidar o operador a
          repetir o mesmo pedido esperando resultado diferente.
        */}
        {retryable.length === 0 ? null : (
          <Button onClick={() => onRetry(retryable)} size="sm" type="button" variant="secondary">
            <Icon name="refresh" />
            {t('routeAssembly.leftovers.retry', { count: retryable.length })}
          </Button>
        )}
      </div>

      {/*
        ⚠️ **A hora é estimativa do planejamento, e a frase diz isso.** Ela foi calculada no aceite,
        a partir do ETA das paradas, e envelhece — número plausível sem aviso é o modo de falha da
        ADR-0044 §1. ⚠️ Falta a outra metade da frase da spec ("e cobre 40 delas"): a cobertura por
        região das paradas descartadas não é publicada pelo solver, e estimá-la aqui seria adivinhar.
      */}
      {first === undefined ? null : (
        <p className={styles.leftoversSecondWave}>
          {t(
            first.plate === null
              ? 'routeAssembly.leftovers.secondWaveUnknownPlate'
              : 'routeAssembly.leftovers.secondWave',
            { plate: first.plate ?? '', time: formatTime(first.estimatedFinishAt) },
          )}
        </p>
      )}

      {isExpanded ? (
        <dl className={styles.leftoversDetail}>
          {notCovered.length === 0 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.notCovered', { count: notCovered.length })}</dt>
              <dd>{notCovered.map((stop) => stop.label).join(' · ')}</dd>
            </div>
          )}
          {overCapacity.length === 0 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.overCapacity', { count: overCapacity.length })}</dt>
              <dd>{overCapacity.map((stop) => stop.label).join(' · ')}</dd>
            </div>
          )}
          {imprecise.length === 0 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.imprecise', { count: imprecise.length })}</dt>
              <dd>{imprecise.map((stop) => stop.label).join(' · ')}</dd>
            </div>
          )}
          {freeing.length < 2 ? null : (
            <div>
              <dt>{t('routeAssembly.leftovers.freeing', { count: freeing.length })}</dt>
              <dd>
                {freeing
                  .map(
                    (entry) =>
                      `${entry.plate ?? t('routeAssembly.leftovers.unknownPlate')} · ${formatTime(
                        entry.estimatedFinishAt,
                      )}`,
                  )
                  .join(' · ')}
              </dd>
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

/** A hora local de quem lê — o mesmo molde da lista de paradas da viagem. */
function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
