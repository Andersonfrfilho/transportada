import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { NfseInvoiceBulkCancelDialog } from '../components/NfseInvoiceBulkCancelDialog.component'
import { NfseInvoiceCancelDialog } from '../components/NfseInvoiceCancelDialog.component'
import { NfseInvoiceDetailDialog } from '../components/NfseInvoiceDetailDialog.component'
import { NfseInvoiceTable } from '../components/NfseInvoiceTable.component'
import { useNfseInvoiceTable } from '../hooks/useNfseInvoiceTable.hook'
import { NFSE_READ_PERMISSION } from '../shared/nfseInvoice.constant'
import styles from '../styles/nfseInvoice.module.css'

function InvoiceListSkeleton({ label }: Readonly<{ label: string }>): JSX.Element {
  return (
    <SkeletonGroup className={styles.listSkeleton} label={label}>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="var(--space-10)" />
      ))}
    </SkeletonGroup>
  )
}

type NfseInvoiceWorkspacePageProps = Readonly<{
  openInvoiceId?: null | string
}>

export function NfseInvoiceWorkspacePage({
  openInvoiceId = null,
}: NfseInvoiceWorkspacePageProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const table = useNfseInvoiceTable({
    ...(companyId === undefined ? {} : { companyId }),
    openInvoiceId,
    permissions,
  })
  const canReadInvoices = permissions.includes(NFSE_READ_PERMISSION)

  return (
    <main className={styles.nfseInvoiceShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      {authQuery.isPending ? (
        <section className={styles.panel}>
          <InvoiceListSkeleton label={t('list.loading')} />
        </section>
      ) : canReadInvoices ? (
        <>
          <NfseInvoiceTable table={table} />
          <NfseInvoiceDetailDialog actions={table.rowActions} />
          <NfseInvoiceCancelDialog actions={table.rowActions} />
          <NfseInvoiceBulkCancelDialog bulkCancel={table.bulkCancel} />
        </>
      ) : (
        <section className={styles.panel}>
          <p className={styles.placeholder}>{t('feedback.readOnly')}</p>
        </section>
      )}
    </main>
  )
}
