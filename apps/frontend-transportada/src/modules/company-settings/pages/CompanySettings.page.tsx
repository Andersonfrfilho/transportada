/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, type TabsItem } from '@/components/ui/tabs'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CertificateUploadForm } from '../components/CertificateUploadForm.component'
import { CompanyLogoUpload } from '../components/CompanyLogoUpload.component'
import { CompanySettingsHeader } from '../components/CompanySettingsHeader.component'
import { CompanySettingsForm } from '../components/CompanySettingsForm.component'
import { CompanySettingsSkeleton } from '../components/CompanySettingsSkeleton.component'
import type { CompanyContactSettings } from '../shared/companyContactsClient.service'
import { CompanyContactsPanel } from '../components/CompanyContactsPanel.component'
import { LandingSettingsPanel } from '../components/LandingSettingsPanel.component'
import { useCompanyContactsPanel } from '../hooks/useCompanyContactsPanel.hook'
import { useLandingSettingsPanel } from '../hooks/useLandingSettingsPanel.hook'
import type {
  LandingSettingsResponse,
  LandingSettingsUpdate,
} from '../shared/landingPanelClient.service'
import {
  CERTIFICATE_PURPOSE_LABEL_KEYS,
  EMPTY_BILLING_DEFAULTS,
  EMPTY_MDFE_DEFAULTS,
} from '../shared/companySettings.constant'
import { useCompanySettings } from '../hooks/useCompanySettings.hook'
import {
  CERTIFICATE_PURPOSES,
  type CertificatePurpose,
  type CompanyLogoImage,
  type CompanyLogoMetadata,
  type CompanyProfileLookup,
  type CompanySettingsUpdate,
  type SafeCertificate,
} from '../shared/companySettingsClient.service'
import {
  COMPANY_SETTINGS_TAB_IDS,
  resolveCompanySettingsTab,
  type CompanySettingsTabId,
} from '../shared/companySettingsTabs.service'
import {
  createCompanySettingsViewModel,
  type ActiveCertificatesByPurpose,
  type CompanySettingsViewModel,
} from '../shared/companySettingsViewModel.service'
import styles from '../styles/companySettings.module.css'

function toUpdate(
  data: ReturnType<typeof useCompanySettings>['query']['data'],
): CompanySettingsUpdate | undefined {
  const settings = data?.data
  if (
    settings === undefined ||
    settings.profile === null ||
    settings.cte === null ||
    settings.cteRetry === null
  )
    return undefined
  const { version: profileVersion, ...profile } = settings.profile
  const cte = {
    environment: settings.cte.environment,
    nextNumber: settings.cte.nextNumber,
    series: settings.cte.series,
  }
  return {
    billing: settings.billing ?? EMPTY_BILLING_DEFAULTS,
    cte,
    cteRetry: settings.cteRetry,
    expectedVersion: profileVersion,
    mdfe: settings.mdfe ?? EMPTY_MDFE_DEFAULTS,
    profile,
  }
}

type LogoSection = Readonly<{
  image: CompanyLogoImage | null
  onRemove: () => Promise<void>
  onSubmit: (file: File) => Promise<CompanyLogoMetadata>
  pending: boolean
}>

type LandingSection = Readonly<{
  data: LandingSettingsResponse | undefined
  disabled: boolean
  onSave: (input: LandingSettingsUpdate) => void
  saveState: 'error' | 'idle' | 'success'
}>

type ContactsSection = Readonly<{
  data: CompanyContactSettings | undefined
  disabled: boolean
  onSave: (settings: CompanyContactSettings) => void
  saveState: 'error' | 'idle' | 'saved' | 'saving'
}>

type SettingsBodyProps = Readonly<{
  activeTab: CompanySettingsTabId
  onTabChange: (tab: CompanySettingsTabId) => void
  canManageSettings: boolean
  certificates: ActiveCertificatesByPurpose
  certificatePending: boolean
  contacts: ContactsSection
  initialValue: CompanySettingsUpdate | undefined
  landing: LandingSection
  logo: LogoSection
  onCertificateSubmit: (body: FormData) => Promise<SafeCertificate>
  onCertificateDelete: (purpose: CertificatePurpose) => Promise<void>
  onLookupProfile: (cnpj: string) => Promise<CompanyProfileLookup | null>
  onSave: (input: CompanySettingsUpdate) => void
  settingsErrorCode: string | undefined
  settingsPending: boolean
  settingsState: 'error' | 'idle' | 'success'
  viewModel: CompanySettingsViewModel
}>

function SettingsStatus({ status }: Pick<CompanySettingsViewModel, 'status'>) {
  const { t } = useTranslation('companySettings')
  return (
    <>
      {status === 'error' && <p role="alert">{t('error')}</p>}
      {status === 'empty' && <p role="status">{t('empty')}</p>}
    </>
  )
}

function CertificateMetadata({ certificate }: Readonly<{ certificate: SafeCertificate }>) {
  const { i18n, t } = useTranslation('companySettings')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (
    <p className={styles.certificateMetadata}>
      {t('certificateStatus', {
        expiresAt: formatter.format(new Date(certificate.expiresAt)),
        status: t(certificate.status),
        validFrom: formatter.format(new Date(certificate.validFrom)),
        version: certificate.version,
      })}
    </p>
  )
}

function CertificateSignals({
  certificates,
}: Readonly<{ certificates: ActiveCertificatesByPurpose }>) {
  const { t } = useTranslation('companySettings')
  return (
    <>
      {CERTIFICATE_PURPOSES.map((purpose) => {
        const certificate = certificates[purpose]
        return (
          <div key={`certificate-signal-${purpose}`}>
            <p className={styles.sectionKicker}>{t(CERTIFICATE_PURPOSE_LABEL_KEYS[purpose])}</p>
            {certificate === undefined ? (
              <p className={styles.certificateMetadata}>{t('certificateMissingForPurpose')}</p>
            ) : (
              <CertificateMetadata certificate={certificate} />
            )}
          </div>
        )
      })}
    </>
  )
}

const PROFILE_CERTIFICATE_CNPJ_MISMATCH = 'FISCAL_PROFILE_CERTIFICATE_CNPJ_MISMATCH'

function resolveSaveErrorKey(code: string | undefined): 'saveError' | 'saveErrorCnpjMismatch' {
  return code === PROFILE_CERTIFICATE_CNPJ_MISMATCH ? 'saveErrorCnpjMismatch' : 'saveError'
}

function SaveStatus({
  code,
  state,
}: Readonly<{ code: string | undefined; state: SettingsBodyProps['settingsState'] }>) {
  const { t } = useTranslation('companySettings')
  if (state === 'idle') return null
  return (
    <p role={state === 'error' ? 'alert' : 'status'}>
      {t(state === 'error' ? resolveSaveErrorKey(code) : 'saved')}
    </p>
  )
}

function CompanyTabPanel(props: SettingsBodyProps) {
  const { t } = useTranslation('companySettings')
  return (
    <>
      <section className={styles.settingsPanel} aria-labelledby="settings-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>{t('profileStep')}</p>
          <h2 id="settings-title">{t('settingsTitle')}</h2>
        </div>
        <CompanySettingsForm
          key={props.initialValue?.expectedVersion ?? 'new'}
          disabled={props.settingsPending}
          initialValue={props.initialValue}
          onLookupProfile={props.onLookupProfile}
          onSave={props.onSave}
        />
      </section>
      <CompanyLogoUpload
        disabled={props.logo.pending}
        logo={props.logo.image}
        onRemove={props.logo.onRemove}
        onSubmit={props.logo.onSubmit}
      />
    </>
  )
}

/**
 * Cada aba monta só os painéis dela: quem entra para trocar a série do CT-e não paga pelas consultas
 * de combustível e de NFS-e, que moram em outras telas. A consulta da aba aberta é ligada em `CompanySettingsPage`, e os
 * painéis que copiam o que está gravado para um rascunho remontam por `key` quando o dado chega —
 * é isso que faz o campo abrir preenchido em vez de vazio sobre um cadastro existente.
 */
function renderTabPanel(tab: CompanySettingsTabId, props: SettingsBodyProps) {
  if (tab === 'company') return <CompanyTabPanel {...props} />
  if (tab === 'site') {
    return (
      <>
        <LandingSettingsPanel
          data={props.landing.data}
          disabled={props.landing.disabled}
          onSave={props.landing.onSave}
          saveState={props.landing.saveState}
        />
        {/*
         * `key` no dado carregado: o painel copia a lista para um rascunho local, e sem a remontagem
         * ele abriria vazio sobre um cadastro existente — a mesma razão dos outros painéis desta aba.
         */}
        <CompanyContactsPanel
          key={props.contacts.data === undefined ? 'contacts-loading' : 'contacts-loaded'}
          data={props.contacts.data ?? { contacts: [], socialLinks: [] }}
          disabled={props.contacts.disabled}
          onSave={props.contacts.onSave}
          saveState={props.contacts.saveState}
        />
      </>
    )
  }
  return (
    <CertificateUploadForm
      certificates={props.certificates}
      disabled={props.certificatePending}
      hasFiscalProfileSaved={props.viewModel.hasFiscalProfileSaved}
      onDelete={props.onCertificateDelete}
      onSubmit={props.onCertificateSubmit}
    />
  )
}

function SettingsBody(props: SettingsBodyProps) {
  const { t } = useTranslation('companySettings')
  if (props.viewModel.status === 'loading') return <CompanySettingsSkeleton />
  const editable = props.canManageSettings && ['empty', 'success'].includes(props.viewModel.status)
  const tabs: readonly TabsItem[] = COMPANY_SETTINGS_TAB_IDS.map((id) => ({
    id,
    label: t(`tabs.${id}`),
    panel: <div className={styles.primaryColumn}>{renderTabPanel(id, props)}</div>,
  }))
  return (
    <section className={styles.workspaceDeck}>
      <div className={styles.primaryColumn}>
        <SettingsStatus status={props.viewModel.status} />
        {editable && (
          <Tabs
            ariaLabel={t('title')}
            items={tabs}
            onChange={(id) => props.onTabChange(resolveCompanySettingsTab(id))}
            value={props.activeTab}
          />
        )}
        {!props.canManageSettings && props.viewModel.status !== 'error' && (
          <p className={styles.permissionBoundary}>{t('readOnly')}</p>
        )}
      </div>
      <aside className={styles.secondaryColumn}>
        <section className={styles.signalPanel}>
          <p className={styles.sectionKicker}>{t('environmentStep')}</p>
          <h2>{t('title')}</h2>
          <p className={styles.productionBoundary}>{t('productionBoundary')}</p>
          <CertificateSignals certificates={props.viewModel.activeCertificates} />
          <SaveStatus code={props.settingsErrorCode} state={props.settingsState} />
        </section>
      </aside>
    </section>
  )
}

export function CompanySettingsPage() {
  useTranslation('companySettings')
  const authQuery = useAuthMeQuery()
  const [activeTab, setActiveTab] = useState<CompanySettingsTabId>('company')
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const {
    canManageSettings,
    certificateRetireMutation,
    certificateMutation,
    certificatesQuery,
    logoMutation,
    logoQuery,
    logoRemoveMutation,
    lookupMutation,
    query,
    settingsMutation,
  } = useCompanySettings({ ...(companyId === undefined ? {} : { companyId }), permissions })
  const landingPanel = useLandingSettingsPanel({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && activeTab === 'site',
  })
  const contactsPanel = useCompanyContactsPanel({
    ...(companyId === undefined ? {} : { companyId }),
    /* Mesma porta do painel vizinho: a aba Site é o endereço declarado dos dois no registro. */
    enabled: canManageSettings && activeTab === 'site',
  })
  const status =
    authQuery.isError || query.isError || certificatesQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (canManageSettings && (query.isLoading || certificatesQuery.isLoading))
        ? 'loading'
        : 'success'
  const viewModel = createCompanySettingsViewModel({
    ...(canManageSettings && certificatesQuery.data !== undefined
      ? { certificates: certificatesQuery.data }
      : {}),
    ...(canManageSettings && query.data !== undefined ? { data: query.data } : {}),
    status,
  })
  return (
    <main className={styles.companySettingsShell}>
      <CompanySettingsHeader environment={viewModel.environment ?? 'homologation'} />
      <SettingsBody
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canManageSettings={canManageSettings}
        certificates={viewModel.activeCertificates}
        certificatePending={certificateMutation.isPending}
        initialValue={toUpdate(canManageSettings ? query.data : undefined)}
        contacts={{
          data: contactsPanel.query.data,
          disabled: !canManageSettings || contactsPanel.mutation.isPending,
          onSave: (settings) => contactsPanel.mutation.mutate(settings),
          saveState: contactsPanel.mutation.isError
            ? 'error'
            : contactsPanel.mutation.isPending
              ? 'saving'
              : contactsPanel.mutation.isSuccess
                ? 'saved'
                : 'idle',
        }}
        landing={{
          data: landingPanel.query.data,
          disabled: landingPanel.mutation.isPending,
          onSave: (input) => landingPanel.mutation.mutate(input),
          saveState: landingPanel.mutation.isError
            ? 'error'
            : landingPanel.mutation.isSuccess
              ? 'success'
              : 'idle',
        }}
        logo={{
          image: logoQuery.data ?? null,
          onRemove: () => logoRemoveMutation.mutateAsync(),
          onSubmit: (file) => logoMutation.mutateAsync(file),
          pending: logoMutation.isPending || logoRemoveMutation.isPending,
        }}
        onCertificateSubmit={(body) => certificateMutation.mutateAsync(body)}
        onCertificateDelete={(purpose) => certificateRetireMutation.mutateAsync(purpose)}
        onLookupProfile={(cnpj) => lookupMutation.mutateAsync(cnpj)}
        onSave={(input) => settingsMutation.mutate(input)}
        settingsErrorCode={
          settingsMutation.error instanceof Error ? settingsMutation.error.message : undefined
        }
        settingsPending={settingsMutation.isPending}
        settingsState={
          settingsMutation.isError ? 'error' : settingsMutation.isSuccess ? 'success' : 'idle'
        }
        viewModel={viewModel}
      />
    </main>
  )
}
