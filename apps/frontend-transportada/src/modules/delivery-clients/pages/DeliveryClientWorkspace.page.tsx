/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { ContractorContactsPanel } from '../components/ContractorContactsPanel.component'
import { ContractorMailSettingsRequestError } from '../shared/contractorMailSettingsClient.service'
import { ContractorMailSettingsPanel } from '../components/ContractorMailSettingsPanel.component'
import { ContractorMailTemplatesPanel } from '../components/ContractorMailTemplatesPanel.component'
import { DeliveryClientForm } from '../components/DeliveryClientForm.component'
import { DeliveryWindowEditor } from '../components/DeliveryWindowEditor.component'
import { MailSendReadinessSummary } from '../components/MailSendReadinessSummary.component'
import { useContractorMailSettings } from '../hooks/useContractorMailSettings.hook'
import { useDeliveryClients } from '../hooks/useDeliveryClients.hook'
import styles from '../styles/deliveryClients.module.css'

const CONTRACTOR_MAIL_SETTINGS_MANAGE_PERMISSION = 'settings.manage'

export type DeliveryClientTabId = 'clients' | 'mail'

const DELIVERY_CLIENT_TAB_IDS: readonly DeliveryClientTabId[] = ['clients', 'mail']

export function resolveDeliveryClientTab(id: string): DeliveryClientTabId {
  return DELIVERY_CLIENT_TAB_IDS.find((tab) => tab === id) ?? 'clients'
}

/**
 * Rodada de correção da Fase 4, item 12: mesmo mecanismo de `NfeWorkspace.page.tsx`
 * (`readTabFromLocation`) — os atalhos de `navigateToDeliveryClients` (T305/T405) escrevem
 * `?tab=mail` na URL antes de despachar o `popstate`, e é esta leitura, na montagem, que faz a
 * aba abrir direto em "E-mail" em vez de sempre cair em "Clientes". Valor desconhecido ou ausente
 * cai em `clients` — URL inventada não pode quebrar a tela.
 */
export function readDeliveryClientTabFromLocation(): DeliveryClientTabId {
  return resolveDeliveryClientTab(new URLSearchParams(window.location.search).get('tab') ?? '')
}

/** O cliente joga o código da API como mensagem do erro: é ele que a tela mostra ao operador. */
function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

/** Spec 150, correção Fase 4, item 11: `Retry-After` do `429` no envio de e-mail de teste. */
function toRetryAfterSeconds(error: unknown): number | undefined {
  return error instanceof ContractorMailSettingsRequestError ? error.retryAfterSeconds : undefined
}

/**
 * Spec 060: **a base já existe** — todo destinatário virou cadastro na importação da nota. O que
 * esta tela faz é achar aquele que tem hora ou preço e preencher a regra dele, que é a minoria.
 *
 * Por isso a lista não tem "novo cliente": criar à mão seria o caminho de quem ainda não mandou
 * nota, e esse caso se resolve pela API — não vale uma porta na tela que confunde o caminho normal.
 */
export function DeliveryClientWorkspacePage(): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const [activeTab, setActiveTab] = useState<DeliveryClientTabId>(readDeliveryClientTabFromLocation)
  const controller = useDeliveryClients({ permissions })
  const isReadOnly = !controller.canManageClients

  const canManageContractorMail = permissions.includes(CONTRACTOR_MAIL_SETTINGS_MANAGE_PERMISSION)
  const settingsScope = resolveSettingsDataScope('delivery-clients', activeTab)
  const contractorMail = useContractorMailSettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageContractorMail && settingsScope.contractorMailSettings,
  })

  const clientsTab: TabsItem = {
    id: 'clients',
    label: t('tabs.clients'),
    panel: <ClientsListPanel controller={controller} isReadOnly={isReadOnly} t={t} />,
  }

  const mailTab: TabsItem = {
    id: 'mail',
    label: t('tabs.mail'),
    panel: (
      <>
        <MailSendReadinessSummary
          companyId={companyId}
          enabled={canManageContractorMail && settingsScope.contractorMailSettings}
        />
        <ContractorMailSettingsPanel
          // Sem a chave que muda quando a consulta responde, o painel monta vazio e o operador
          // regrava por cima do que já estava salvo.
          key={`${contractorMail.settingsQuery.data?.id ?? 'none'}`}
          apiUrl={getIdentityEnvironment().apiBaseUrl}
          checks={contractorMail.checksQuery.data}
          checksLoading={contractorMail.checksQuery.isLoading}
          disabled={contractorMail.saveMutation.isPending}
          errorCode={toErrorCode(contractorMail.saveMutation.error)}
          loading={contractorMail.settingsQuery.isLoading}
          onRefreshChecks={contractorMail.refreshChecks}
          onSave={(body) => contractorMail.saveMutation.mutate(body)}
          onSendTestEmail={() => contractorMail.sendTestEmailMutation.mutate()}
          saved={contractorMail.saveMutation.isSuccess}
          summary={contractorMail.settingsQuery.data}
          testEmailErrorCode={toErrorCode(contractorMail.sendTestEmailMutation.error)}
          testEmailErrorRetryAfterSeconds={toRetryAfterSeconds(
            contractorMail.sendTestEmailMutation.error,
          )}
          testEmailPending={contractorMail.sendTestEmailMutation.isPending}
          testEmailSent={contractorMail.sendTestEmailMutation.isSuccess}
        />
        <ContractorMailTemplatesPanel isDisabled={!canManageContractorMail} />
        <ContractorContactsPanel isDisabled={!canManageContractorMail} />
      </>
    ),
  }

  const tabs: readonly TabsItem[] = [clientsTab, ...(canManageContractorMail ? [mailTab] : [])]
  const selectedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (tabs[0]?.id ?? 'clients')

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>

      {tabs.length > 1 ? (
        <Tabs
          ariaLabel={t('title')}
          items={tabs}
          onChange={(id) => setActiveTab(resolveDeliveryClientTab(id))}
          value={selectedTab}
        />
      ) : (
        clientsTab.panel
      )}
    </main>
  )
}

type ClientsListPanelProps = Readonly<{
  controller: ReturnType<typeof useDeliveryClients>
  isReadOnly: boolean
  t: ReturnType<typeof useTranslation>['t']
}>

function ClientsListPanel({ controller, isReadOnly, t }: ClientsListPanelProps): JSX.Element {
  return (
    <>
      <section className={styles.filters}>
        <label className={styles.field}>
          {t('filters.name')}
          <input
            onChange={(event) =>
              controller.setFilters({ ...controller.filters, nameContains: event.target.value })
            }
            placeholder={t('filters.namePlaceholder')}
            value={controller.filters.nameContains}
          />
        </label>

        <label className={styles.field}>
          {t('filters.status')}
          <Select
            ariaLabel={t('filters.status')}
            onChange={(value) =>
              controller.setFilters({
                ...controller.filters,
                status: value === '' ? null : value === 'inactive' ? 'inactive' : 'active',
              })
            }
            options={[
              { label: t('filters.statusAll'), value: '' },
              { label: t('form.statusActive'), value: 'active' },
              { label: t('form.statusInactive'), value: 'inactive' },
            ]}
            value={controller.filters.status ?? ''}
          />
        </label>

        <label className={styles.field}>
          {t('filters.scheduling')}
          <Select
            ariaLabel={t('filters.scheduling')}
            onChange={(value) =>
              controller.setFilters({
                ...controller.filters,
                requiresScheduling: value === '' ? null : value === 'true',
              })
            }
            options={[
              { label: t('filters.schedulingAll'), value: '' },
              { label: t('filters.schedulingOnly'), value: 'true' },
              { label: t('filters.schedulingNone'), value: 'false' },
            ]}
            value={
              controller.filters.requiresScheduling === null
                ? ''
                : String(controller.filters.requiresScheduling)
            }
          />
        </label>
      </section>

      {controller.isLoading ? (
        <SkeletonGroup label={t('table.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('table.name')}</th>
              <th scope="col">{t('table.taxId')}</th>
              <th scope="col">{t('table.scheduling')}</th>
              <th scope="col">{t('table.fee')}</th>
              <th scope="col">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(controller.clients ?? []).map((client) => (
              <tr key={client.id}>
                <td>{client.displayName === '' ? t('form.unnamed') : client.displayName}</td>
                <td className={styles.document}>{client.taxId}</td>
                <td>{client.requiresScheduling ? t('table.schedulingYes') : '—'}</td>
                <td>{client.deliveryFeeAmount ?? '—'}</td>
                <td>
                  <Button
                    onClick={() => controller.selectClient(client.id)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="edit" />
                    {t('table.open')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {controller.nextCursor === null ? null : (
        <Button
          onClick={() => controller.setCursor(controller.nextCursor)}
          type="button"
          variant="ghost"
        >
          <Icon name="page-next" />
          {t('table.more')}
        </Button>
      )}

      {controller.selectedClientId === null ? null : controller.selectedClient === undefined ? (
        <SkeletonGroup label={t('form.loading')}>
          <Skeleton height="12rem" />
        </SkeletonGroup>
      ) : (
        <section className={styles.panel}>
          <DeliveryClientForm
            client={controller.selectedClient}
            isDisabled={isReadOnly}
            onSave={(values) =>
              controller.updateClient({ id: controller.selectedClient?.id ?? '', values })
            }
          />
          <DeliveryWindowEditor
            isDisabled={isReadOnly}
            key={controller.selectedClient.id}
            onSave={(windows) =>
              controller.replaceWindows({ id: controller.selectedClient?.id ?? '', windows })
            }
            windows={controller.selectedClient.windows}
          />
        </section>
      )}
    </>
  )
}
