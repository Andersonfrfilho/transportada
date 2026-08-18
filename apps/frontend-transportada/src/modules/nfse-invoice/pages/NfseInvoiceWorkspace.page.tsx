/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { NfseCredentialPanel } from '../components/NfseCredentialPanel.component'
import { NfseEmissionProfilePanel } from '../components/NfseEmissionProfilePanel.component'
import { NfseInvoiceBulkCancelDialog } from '../components/NfseInvoiceBulkCancelDialog.component'
import { NfseInvoiceCancelDialog } from '../components/NfseInvoiceCancelDialog.component'
import { NfseInvoiceDetailDialog } from '../components/NfseInvoiceDetailDialog.component'
import { NfseInvoiceDiscardDialog } from '../components/NfseInvoiceDiscardDialog.component'
import { NfseInvoiceReissueDialog } from '../components/NfseInvoiceReissueDialog.component'
import { NfseInvoiceTable } from '../components/NfseInvoiceTable.component'
import { useNfseInvoiceTable } from '../hooks/useNfseInvoiceTable.hook'
import { useNfseSettings } from '../hooks/useNfseSettings.hook'
import {
  NFSE_READ_PERMISSION,
  NFSE_SETTINGS_MANAGE_PERMISSION,
} from '../shared/nfseInvoice.constant'
import settingsStyles from '../styles/nfseSettings.module.css'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceTabId = 'invoices' | 'settings'

const NFSE_INVOICE_TAB_IDS: readonly NfseInvoiceTabId[] = ['invoices', 'settings']

function resolveNfseInvoiceTab(id: string): NfseInvoiceTabId {
  return NFSE_INVOICE_TAB_IDS.find((tab) => tab === id) ?? 'invoices'
}

/** O cliente joga o código da API como mensagem do erro: é ele que a tela mostra ao operador. */
function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

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
  const [activeTab, setActiveTab] = useState<NfseInvoiceTabId>('invoices')
  const table = useNfseInvoiceTable({
    ...(companyId === undefined ? {} : { companyId }),
    openInvoiceId,
    permissions,
  })
  const canReadInvoices = permissions.includes(NFSE_READ_PERMISSION)
  const canManageSettings = permissions.includes(NFSE_SETTINGS_MANAGE_PERMISSION)
  const settingsScope = resolveSettingsDataScope('nfse-invoice', activeTab)
  const settings = useNfseSettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.nfse,
  })
  const settingsLoading = settings.credentialQuery.isLoading || settings.profilesQuery.isLoading

  const settingsTab: TabsItem = {
    id: 'settings',
    label: t('tabs.settings'),
    panel: (
      <div className={settingsStyles.settingsDeck}>
        <NfseCredentialPanel
          // O rascunho lê o resumo na montagem. Sem a chave que muda quando a consulta responde, o
          // painel monta vazio e o operador regrava por cima do que já estava selado.
          key={`${settings.fiscalEnvironment}:${settings.credentialQuery.data?.id ?? 'none'}`}
          disabled={settings.credentialMutation.isPending}
          errorCode={toErrorCode(settings.credentialMutation.error)}
          fiscalEnvironment={settings.fiscalEnvironment}
          loading={settingsLoading}
          onEnvironmentChange={settings.setFiscalEnvironment}
          onSave={(body) => settings.credentialMutation.mutate(body)}
          saved={settings.credentialMutation.isSuccess}
          summary={settings.credentialQuery.data}
        />
        <NfseEmissionProfilePanel
          disabled={settings.profileMutation.isPending || settings.profileStatusMutation.isPending}
          errorCode={toErrorCode(
            settings.profileMutation.error ?? settings.profileStatusMutation.error,
          )}
          freightRules={settings.freightRulesQuery.data ?? []}
          loading={settingsLoading}
          onSave={(save) => settings.profileMutation.mutate(save)}
          onStatusChange={(toggle) => settings.profileStatusMutation.mutate(toggle)}
          profiles={settings.profilesQuery.data ?? []}
          saved={settings.profileMutation.isSuccess || settings.profileStatusMutation.isSuccess}
        />
      </div>
    ),
  }

  const invoicesTab: TabsItem = {
    id: 'invoices',
    label: t('tabs.invoices'),
    panel: (
      <>
        <NfseInvoiceTable table={table} />
        <NfseInvoiceDetailDialog actions={table.rowActions} />
        <NfseInvoiceCancelDialog actions={table.rowActions} />
        <NfseInvoiceReissueDialog actions={table.rowActions} />
        <NfseInvoiceDiscardDialog actions={table.rowActions} />
        <NfseInvoiceBulkCancelDialog bulkCancel={table.bulkCancel} />
      </>
    ),
  }

  const tabs: readonly TabsItem[] = [
    ...(canReadInvoices ? [invoicesTab] : []),
    ...(canManageSettings ? [settingsTab] : []),
  ]
  /** Aba que a permissão não abre não pode ficar selecionada — a tela abriria num painel ausente. */
  const selectedTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id

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
      ) : selectedTab !== undefined ? (
        <Tabs
          ariaLabel={t('title')}
          items={tabs}
          onChange={(id) => setActiveTab(resolveNfseInvoiceTab(id))}
          value={selectedTab}
        />
      ) : (
        <section className={styles.panel}>
          <p className={styles.placeholder}>{t('feedback.readOnly')}</p>
        </section>
      )}
    </main>
  )
}
