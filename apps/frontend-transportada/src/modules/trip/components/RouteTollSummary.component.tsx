/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { formatTariffMonth } from '../shared/assemblyToll.service'
import type { RouteGeometryToll, RouteGeometryTollBooth } from '../shared/routeGeometry.service'
import {
  createBrowserWorkspaceNavigator,
  navigateToFleetTollBoothAdjustment,
  resolveTollBoothAdjustmentSearch,
} from '../shared/tripNavigation.service'
import styles from '../styles/trip.module.css'

type RouteTollSummaryProps = Readonly<{
  /** RF7 (spec 154): só quem tem `settings.manage` vê o caminho até o ajuste da praça. */
  canAdjustTollBooth: boolean
  toll: null | RouteGeometryToll
}>

function handleAdjustBooth(booth: RouteGeometryTollBooth): void {
  navigateToFleetTollBoothAdjustment({
    navigator: createBrowserWorkspaceNavigator(),
    search: resolveTollBoothAdjustmentSearch(booth),
  })
}

/**
 * O pedágio do trajeto, praça a praça — o **mesmo** bloco na montagem e no detalhe da viagem. Duas
 * cópias divergiam caladas: o detalhe simplesmente não mostrava pedágio nenhum.
 *
 * Spec 090 T7/T8: `toll === null` é "não calculei" — sem veículo escolhido, ou o roteirizador não
 * anotou os nós — e o bloco inteiro fica de fora, nunca um zero inventado.
 *
 * Spec 154 RF7 (aceite 6): a praça sem tarifa conhecida (`effectiveChargePerAxle === null`) ganha
 * o botão que abre a aba de pedágio em Frota, com a busca já na praça — só quando `canAdjustTollBooth`
 * (`settings.manage`) é verdadeiro; sem a permissão o botão nem entra no DOM.
 */
export function RouteTollSummary({ canAdjustTollBooth, toll }: RouteTollSummaryProps) {
  const { t } = useTranslation('trip')

  return (
    <>
      {toll === null ? null : (
        <div className={styles.assemblyToll}>
          <p className={`${styles.hint} ${styles.assemblyTotalTime}`}>
            <Icon name="invoice" />
            <span>
              {t('assemblyMap.toll.summary', {
                boothCount: toll.booths.length,
                chargePerAxle: formatAmount(toll.chargePerAxle),
                multiplier: toll.multiplierLabel,
                total: formatAmount(toll.total),
              })}
              {toll.tariffObservedOn === null
                ? null
                : t('assemblyMap.toll.tariff', { month: formatTariffMonth(toll.tariffObservedOn) })}
              {/*
              ⚠️ A marca de estimativa não pode ficar atrás de segunda condição — é a mesma
              trava de `test/trip/occupancy.contract.ts`: um `&&` a mais é o caminho pelo qual
              ela some sem ninguém notar.
            */}
              {toll.axles.source === 'estimated' ? ` ${t('assemblyMap.toll.estimated')}` : null}
            </span>
          </p>
          {/*
          Spec 095 D3: a base (tag ou manual) e, quando com tag, quantas praças caíram para a
          manual por falta de tarifa automática — um total menor sem esse aviso seria a mentira
          que a 090 inteira combate (mesma trava do `boothsWithoutCharge` abaixo).
        */}
          <p className={styles.hint}>{t(`assemblyMap.toll.paymentMode.${toll.paymentMode}`)}</p>
          {/*
          O catálogo de praças reajusta uma vez por ano — sem esta marca a tela imprime uma
          tarifa velha com cara de hoje. `empty` já vira o aviso do bloco abaixo; aqui é só `stale`.
        */}
          {toll.catalog.status !== 'stale' || toll.catalog.observedOn === null ? null : (
            <p className={styles.warning}>
              {t('assemblyMap.toll.catalogStale', {
                month: formatTariffMonth(toll.catalog.observedOn),
              })}
            </p>
          )}
          {toll.paymentMode !== 'automatic' || toll.boothsFallenBackToManual === 0 ? null : (
            <p className={styles.hint}>
              {t('assemblyMap.toll.fallenBackToManual', { count: toll.boothsFallenBackToManual })}
            </p>
          )}
          {toll.boothsWithoutCharge === 0 ? null : (
            <p className={styles.hint}>
              {t('assemblyMap.toll.withoutCharge', { count: toll.boothsWithoutCharge })}
            </p>
          )}
          {/*
          Spec 090 T8: praça a praça, na ordem em que o caminhão passa — quem confere sabe por
          onde o custo entrou. Rota sem praça nunca é lista vazia: ela diz que não há pedágio,
          porque sumir é indistinguível de "ninguém calculou".
        */}
          {toll.booths.length === 0 ? (
            <p className={styles.hint}>
              {toll.catalog.status === 'empty'
                ? t('assemblyMap.toll.catalogEmpty')
                : t('assemblyMap.toll.none')}
            </p>
          ) : (
            <>
              {/*
              ⚠️ O título carrega a **contagem de eixos e de onde ela veio**, e não é enfeite: o
              mesmo trajeto custa metade num toco e o dobro numa carreta, e sem dizer com quantos
              eixos a conta foi feita o total não é conferível contra o comprovante da cancela.
            */}
              <p className={styles.hint}>
                {t('assemblyMap.toll.statementTitle', {
                  axleCount: toll.axles.count,
                  axleSource: t(`assemblyMap.toll.axleSource.${toll.axles.source}`),
                  multiplier: toll.multiplierLabel,
                })}
              </p>
              <ul className={styles.tollStatement}>
                {toll.booths.map((booth) => (
                  <li key={booth.osmNodeId}>
                    <span className={styles.tollStatementBooth}>
                      {t('assemblyMap.toll.booth', {
                        name: booth.name ?? t('assemblyMap.toll.boothUnnamed'),
                        operator: booth.operator ?? t('assemblyMap.toll.operatorUnknown'),
                      })}
                    </span>
                    <span className={styles.tollStatementCharge}>
                      {booth.effectiveChargePerAxle === null || booth.total === null
                        ? t('assemblyMap.toll.statementWithoutCharge')
                        : t('assemblyMap.toll.statementLine', {
                            charge: formatAmount(booth.effectiveChargePerAxle),
                            multiplier: toll.multiplierLabel,
                            total: formatAmount(booth.total),
                          })}
                    </span>
                    {booth.fellBackToManual ? (
                      <span className={styles.tollStatementNote}>
                        {t('assemblyMap.toll.statementFellBack')}
                      </span>
                    ) : null}
                    {booth.effectiveChargePerAxle !== null || !canAdjustTollBooth ? null : (
                      <Button
                        className={styles.tollStatementAction}
                        onClick={() => handleAdjustBooth(booth)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="edit" />
                        {t('assemblyMap.toll.adjustBooth')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  )
}
