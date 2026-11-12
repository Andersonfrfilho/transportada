/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { navigateToTripOccurrence } from '@/modules/trip/shared/tripOccurrenceRoute.service'

import { useDeliveryClientReceivingChargeFlag } from '../hooks/useDeliveryClientReceivingChargeFlag.hook'
import styles from '../styles/deliveryClients.module.css'

type DeliveryClientReceivingChargeFlagProps = Readonly<{
  deliveryClientId: string
  /** Limpar é `fleet.manage`; sem ele o selo fica só para leitura. */
  isDisabled: boolean
}>

function formatFlaggedDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

/**
 * Spec 317 (E7, P2, T10): o selo "Possível cobrança na entrega" na ficha do cliente — data, link da ocorrência de
 * origem e a ação de limpar. Sem marca, o bloco não aparece. Só o escritório limpa.
 */
export function DeliveryClientReceivingChargeFlag({
  deliveryClientId,
  isDisabled,
}: DeliveryClientReceivingChargeFlagProps): JSX.Element | null {
  const { t } = useTranslation('deliveryClients')
  const { clearMutation, flagQuery } = useDeliveryClientReceivingChargeFlag({ deliveryClientId })
  const flag = flagQuery.data
  if (flag === undefined || flag.flaggedAt === null) return null

  return (
    <section aria-labelledby="client-charge-flag-title" className={styles.clientEmails}>
      <header className={styles.clientEmailsHead}>
        <div>
          <h3 id="client-charge-flag-title">
            <Badge variant="warning">{t('receivingChargeFlag.seal')}</Badge>
          </h3>
          <p className={styles.hint}>
            {t('receivingChargeFlag.hint', { date: formatFlaggedDate(flag.flaggedAt) })}
          </p>
        </div>
        <div className={styles.clientEmailActions}>
          {flag.sourceStopOccurrenceId === null ? null : (
            <Button
              onClick={() =>
                navigateToTripOccurrence({
                  navigator: createBrowserWorkspaceNavigator(),
                  occurrenceId: flag.sourceStopOccurrenceId ?? '',
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="edit" size="sm" />
              {t('receivingChargeFlag.openOccurrence')}
            </Button>
          )}
          {isDisabled ? null : (
            <Button
              disabled={clearMutation.isPending}
              onClick={() => clearMutation.mutate()}
              size="sm"
              type="button"
            >
              <Icon name="check" size="sm" />
              {t('receivingChargeFlag.clear')}
            </Button>
          )}
        </div>
      </header>
      {clearMutation.isError ? (
        <p className={styles.error} role="alert">
          {t('receivingChargeFlag.clearFailed')}
        </p>
      ) : null}
    </section>
  )
}
