/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { getFleetClient } from '@/modules/fleet/hooks/useFleet.hook'
import type { FleetDriverAccessRow } from '@/modules/fleet/shared/fleet.types'

import styles from '../styles/userAdministration.module.css'

const ACCESS_REPORT_QUERY_KEY = 'fleet-driver-access-report'

const STATE_CLASS: Readonly<Record<FleetDriverAccessRow['state'], keyof typeof styles>> = {
  expired: 'statusSuspended',
  invited: 'statusInvited',
  'no-user': 'statusSuspended',
}

type DriverAccessReportPanelProps = Readonly<{
  /** Reenvia o código de um convite que já existe (vencido ou não entregue). */
  onResend: (userId: string) => Promise<void>
}>

/**
 * ⚠️ A conferência acima parte do usuário e por isso não enxerga a ficha de motorista que nunca ganhou
 * um: a candidatura aprovada antes do convite automático ficou meses assim. Este painel parte da ficha
 * ativa e mostra, com a ação ali mesmo, quem ainda não consegue entrar no app.
 */
export function DriverAccessReportPanel({ onResend }: DriverAccessReportPanelProps) {
  const { t } = useTranslation('identity')
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const report = useQuery({
    queryFn: () => getFleetClient().listDriverAccessReport(),
    queryKey: [ACCESS_REPORT_QUERY_KEY],
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: [ACCESS_REPORT_QUERY_KEY] })
  const act = useMutation({
    mutationFn: async (row: FleetDriverAccessRow) => {
      if (row.state === 'no-user') {
        const access = await getFleetClient().grantDriverAccess({ driverId: row.driverId })
        return t(`users.accessReport.result.${access}`, { name: row.name })
      }
      if (row.userId !== null) await onResend(row.userId)
      return t('users.accessReport.result.resent', { name: row.name })
    },
    onError: (_error, row) => setNotice(t('users.accessReport.result.error', { name: row.name })),
    onSuccess: (message) => {
      setNotice(message)
      void refresh()
    },
  })
  const rows = report.data ?? []

  return (
    <div>
      <h3>{t('users.accessReport.title')}</h3>
      <p className={styles.intro}>{t('users.accessReport.intro')}</p>
      {report.isLoading ? (
        <Skeleton height="4rem" variant="block" />
      ) : report.isError ? (
        <p className={styles.feedback} role="alert">
          {t('users.accessReport.loadError')}
        </p>
      ) : rows.length === 0 ? (
        <p className={`${styles.feedback ?? ''} ${styles.noticeReady ?? ''}`} role="status">
          {t('users.accessReport.allGood')}
        </p>
      ) : (
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>{t('users.accessReport.column.driver')}</th>
                <th>{t('users.accessReport.column.taxId')}</th>
                <th>{t('users.accessReport.column.contact')}</th>
                <th>{t('users.accessReport.column.status')}</th>
                <th>{t('users.accessReport.column.action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.driverId}>
                  <td>{row.name}</td>
                  <td>{row.taxId}</td>
                  <td>{row.contact || '—'}</td>
                  <td>
                    <span
                      className={`${styles.badge ?? ''} ${styles[STATE_CLASS[row.state]] ?? ''}`}
                    >
                      {t(`users.accessReport.state.${row.state}`)}
                    </span>
                  </td>
                  <td>
                    <Button
                      disabled={act.isPending}
                      onClick={() => act.mutate(row)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Icon name="send" />
                      {row.state === 'no-user'
                        ? t('users.accessReport.grant')
                        : t('users.accessReport.resend')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notice === null ? null : (
        <p className={styles.feedback} role="status">
          {notice}
        </p>
      )}
    </div>
  )
}
