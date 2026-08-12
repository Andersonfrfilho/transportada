import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useNfseInvoices } from '../hooks/useNfseInvoices.hook'
import { NFSE_READ_PERMISSION } from '../shared/nfseInvoice.constant'
import styles from '../styles/nfseInvoice.module.css'

function InvoiceListSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <SkeletonGroup className={styles.listSkeleton} label={label}>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="var(--space-10)" />
      ))}
    </SkeletonGroup>
  )
}

export function NfseInvoiceWorkspacePage() {
  const { t } = useTranslation('nfseInvoice')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useNfseInvoices({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const canReadInvoices = permissions.includes(NFSE_READ_PERMISSION)
  const isWaiting = authQuery.isPending || (canReadInvoices && workspace.status === 'loading')

  return (
    <main className={styles.nfseInvoiceShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <section className={styles.panel}>
        {isWaiting ? (
          <InvoiceListSkeleton label={t('list.loading')} />
        ) : canReadInvoices ? (
          <p className={styles.placeholder}>
            {workspace.invoices.length === 0
              ? t('list.empty')
              : t('list.total', { total: workspace.invoices.length })}
          </p>
        ) : (
          <p className={styles.placeholder}>{t('feedback.readOnly')}</p>
        )}
      </section>
    </main>
  )
}
