/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { formatDuration } from '../shared/assemblyLeg.service'
import { resolveRouteOptionSummaries } from '../shared/assemblyRouteOptions.service'
import type { RouteCostGap, RouteGeometryOption } from '../shared/routeGeometry.service'
import styles from '../styles/trip.module.css'

type RouteChoiceOptionsProps = Readonly<{
  /** Sem `trip.financials` nenhuma linha de dinheiro é impressa — nunca zero, nunca traço (D10). */
  canReadFinancials: boolean
  cheapestIndex: null | number
  costGap: null | RouteCostGap
  fastestIndex: null | number
  onSelect: (index: number) => void
  options: readonly RouteGeometryOption[]
  selectedIndex: number
}>

/**
 * O seletor de rota da montagem (spec 096 T3), com o switch explícito entre mais rápida e mais
 * barata que a spec 153 RF13 pede — as duas trocas trabalham sobre as mesmas opções já em mãos,
 * então nenhuma delas chama o roteirizador de novo.
 *
 * ⚠️ **Rota única não é escolha** (spec 096 D2), mas isso não é mais motivo para desenhar nada:
 * quando não há uma mais rápida e uma mais barata **distintas** para trocar, a tela avisa que não
 * há alternativa em vez de montar um switch que clica e não muda nada (RF13).
 */
export function RouteChoiceOptions({
  canReadFinancials,
  cheapestIndex,
  costGap,
  fastestIndex,
  onSelect,
  options,
  selectedIndex,
}: RouteChoiceOptionsProps) {
  const { t } = useTranslation('trip')

  if (options.length === 0) return null

  const summaries = resolveRouteOptionSummaries({ cheapestIndex, fastestIndex, options })
  /** As duas pontas do switch existem só quando são rotas **diferentes** — trocar entre elas muda o traço. */
  const canSwitch =
    costGap === null &&
    cheapestIndex !== null &&
    fastestIndex !== null &&
    cheapestIndex !== fastestIndex
  const tabsValue: 'cheapest' | 'fastest' = selectedIndex === fastestIndex ? 'fastest' : 'cheapest'
  const tabsItems: readonly TabsItem[] = [
    { id: 'cheapest', label: t('assemblyMap.routeOptions.cheapest'), panel: null },
    { id: 'fastest', label: t('assemblyMap.routeOptions.fastest'), panel: null },
  ]

  function handleTabsChange(id: string): void {
    const targetIndex = id === 'fastest' ? fastestIndex : cheapestIndex
    if (targetIndex !== null) onSelect(targetIndex)
  }

  return (
    <div className={styles.routeOptions}>
      {canSwitch ? (
        <Tabs
          ariaLabel={t('assemblyMap.routeOptions.switchLabel')}
          items={tabsItems}
          onChange={handleTabsChange}
          value={tabsValue}
        />
      ) : (
        <p className={styles.hint}>
          {/*
            ⚠️ Sem custo comparável a razão é `costGap` (spec 096 D1); com custo mas as duas pontas
            coincidindo, ou sem alternativa nenhuma, o aviso é genérico — as duas leituras têm a
            mesma consequência prática: não há troca a fazer (spec 153 RF13).
          */}
          {costGap === null
            ? t('assemblyMap.routeOptions.singleOption')
            : t(`assemblyMap.routeOptions.gap.${costGap}`)}
        </p>
      )}
      {options.length <= 1 ? null : (
        <>
          <p className={styles.hint}>{t('assemblyMap.routeOptions.title')}</p>
          <ul className={styles.routeOptionList}>
            {summaries.map((summary, index) => (
              <li key={index}>
                <Button
                  aria-pressed={index === selectedIndex}
                  className={styles.routeOption}
                  onClick={() => onSelect(index)}
                  type="button"
                  /*
                   * ⚠️ Sempre `secondary`: o cobre sólido do `default` apagava o texto e o selo. A
                   * escolha é marcada pelo `aria-pressed` no CSS, como os chips da planta de carga.
                   */
                  variant="secondary"
                >
                  <span className={styles.routeOptionHeader}>
                    {/* A escolhida leva o visto; as demais são oferta, ainda não escolha feita. */}
                    {index === selectedIndex ? <Icon name="check" /> : <Icon name="target" />}
                    {/*
                      ⚠️ Quando a mesma rota vence as duas contas isso é informação, não bug (caso
                      medido de Campinas) — uma marca só, nunca as duas empilhadas dizendo a mesma
                      coisa duas vezes.
                    */}
                    {summary.isBestOfBoth ? (
                      <span className={styles.routeOptionBadge}>
                        <Icon name="speed" size="sm" />
                        <Icon name="cost-down" size="sm" />
                        {t('assemblyMap.routeOptions.fastestAndCheapest')}
                      </span>
                    ) : (
                      <>
                        {summary.isFastest ? (
                          <span className={styles.routeOptionBadge}>
                            <Icon name="speed" size="sm" />
                            {t('assemblyMap.routeOptions.fastest')}
                          </span>
                        ) : null}
                        {summary.isCheapest ? (
                          <span className={styles.routeOptionBadge}>
                            <Icon name="cost-down" size="sm" />
                            {t('assemblyMap.routeOptions.cheapest')}
                          </span>
                        ) : null}
                      </>
                    )}
                    {/*
                      ⚠️ Spec 165: **acumula** com as marcas acima, nunca as substitui. Evitar
                      pedágio é de onde a rota veio (`exclude=toll`), não uma conta vencida — e a
                      rota que evita pedágio sendo também a mais barata é justamente quando o
                      operador mais precisa ver as duas coisas.
                    */}
                    {summary.isNoToll ? (
                      <span className={styles.routeOptionBadge}>
                        <Icon name="invoice" size="sm" />
                        {t('assemblyMap.routeOptions.noToll')}
                      </span>
                    ) : null}
                  </span>
                  {canReadFinancials && summary.totalCost !== null ? (
                    <span className={styles.routeOptionTotal}>
                      {t('assemblyMap.routeOptions.total', {
                        amount: formatAmount(summary.totalCost),
                      })}
                    </span>
                  ) : null}
                  <span className={styles.routeOptionFacts}>
                    {/*
                      ⚠️ Sem pedágio calculado a linha diz que **não sabe**, nunca "0 praças" —
                      zero ali seria uma afirmação, na linha em que a rota é escolhida.
                    */}
                    {t(
                      summary.boothCount === null
                        ? 'assemblyMap.routeOptions.optionWithoutToll'
                        : 'assemblyMap.routeOptions.option',
                      {
                        count: summary.boothCount ?? 0,
                        distance: summary.distanceKilometres.toFixed(1),
                        duration: formatDuration(summary.minutes),
                      },
                    )}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
