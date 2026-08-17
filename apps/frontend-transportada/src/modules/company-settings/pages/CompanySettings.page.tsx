/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, type TabsItem } from '@/components/ui/tabs'
import type { FreightRuleSummary } from '@/modules/freight/shared/freightClient.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import type { NfseCredentialBody } from '@/modules/nfse-invoice/shared/nfseCredentialForm.service'
import type {
  NfseEmissionProfile,
  NfseFiscalEnvironment,
  NfseProviderCredentialSummary,
} from '@/modules/nfse-invoice/shared/nfseSettings.types'

import { CertificateUploadForm } from '../components/CertificateUploadForm.component'
import { CompanyLogoUpload } from '../components/CompanyLogoUpload.component'
import { CompanySettingsHeader } from '../components/CompanySettingsHeader.component'
import { CompanySettingsForm } from '../components/CompanySettingsForm.component'
import { CompanySettingsSkeleton } from '../components/CompanySettingsSkeleton.component'
import { DistributionCursorPanel } from '../components/DistributionCursorPanel.component'
import { NfseCredentialPanel } from '../components/NfseCredentialPanel.component'
import { NfseEmissionProfilePanel } from '../components/NfseEmissionProfilePanel.component'
import { ScheduledDistributionPanel } from '../components/ScheduledDistributionPanel.component'
import {
  CERTIFICATE_PURPOSE_LABEL_KEYS,
  EMPTY_BILLING_DEFAULTS,
  EMPTY_MDFE_DEFAULTS,
} from '../shared/companySettings.constant'
import { useCompanySettings } from '../hooks/useCompanySettings.hook'
import { useDistributionCursor } from '../hooks/useDistributionCursor.hook'
import {
  useNfseSettings,
  type NfseProfileSave,
  type NfseProfileStatusToggle,
} from '../hooks/useNfseSettings.hook'
import { useScheduledDistribution } from '../hooks/useScheduledDistribution.hook'
import {
  CERTIFICATE_PURPOSES,
  type CertificatePurpose,
  type CompanyLogoImage,
  type CompanyLogoMetadata,
  type CompanyProfileLookup,
  type CompanySettingsUpdate,
  type DistributionCursor,
  type SafeCertificate,
  type ScheduledDistributionStatus,
} from '../shared/companySettingsClient.service'
import {
  COMPANY_SETTINGS_TAB_IDS,
  resolveCompanySettingsDataScope,
  resolveCompanySettingsTab,
  type CompanySettingsTabId,
} from '../shared/companySettingsTabs.service'
import {
  createCompanySettingsViewModel,
  type ActiveCertificatesByPurpose,
  type CompanySettingsViewModel,
} from '../shared/companySettingsViewModel.service'
import styles from '../styles/companySettings.module.css'

/** O cliente joga o código da API como mensagem do erro: é ele que a tela mostra ao operador. */
function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

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

type ScheduledDistributionSection = Readonly<{
  loading: boolean
  onToggle: (nextEnabled: boolean) => void
  pending: boolean
  status: ScheduledDistributionStatus | undefined
  toggleErrorCode: string | undefined
}>

type DistributionCursorSection = Readonly<{
  adjusted: boolean
  cursor: DistributionCursor | undefined
  errorCode: string | undefined
  loading: boolean
  onAdjust: (ultNsu: string) => void
  pending: boolean
}>

type NfseSettingsSection = Readonly<{
  credential: NfseProviderCredentialSummary | null | undefined
  credentialErrorCode: string | undefined
  credentialPending: boolean
  credentialSaved: boolean
  fiscalEnvironment: NfseFiscalEnvironment
  freightRules: readonly FreightRuleSummary[]
  loading: boolean
  onCredentialSave: (body: NfseCredentialBody) => void
  onEnvironmentChange: (environment: NfseFiscalEnvironment) => void
  onProfileSave: (save: NfseProfileSave) => void
  onProfileStatusChange: (toggle: NfseProfileStatusToggle) => void
  profileErrorCode: string | undefined
  profilePending: boolean
  profileSaved: boolean
  profiles: readonly NfseEmissionProfile[]
}>

type SettingsBodyProps = Readonly<{
  activeTab: CompanySettingsTabId
  onTabChange: (tab: CompanySettingsTabId) => void
  canManageSettings: boolean
  certificates: ActiveCertificatesByPurpose
  certificatePending: boolean
  distributionCursor: DistributionCursorSection
  initialValue: CompanySettingsUpdate | undefined
  logo: LogoSection
  nfse: NfseSettingsSection
  onCertificateSubmit: (body: FormData) => Promise<SafeCertificate>
  onCertificateDelete: (purpose: CertificatePurpose) => Promise<void>
  onLookupProfile: (cnpj: string) => Promise<CompanyProfileLookup | null>
  onSave: (input: CompanySettingsUpdate) => void
  scheduledDistribution: ScheduledDistributionSection
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

function DistributionTabPanel(props: SettingsBodyProps) {
  return (
    <>
      <ScheduledDistributionPanel
        disabled={props.scheduledDistribution.pending}
        loading={props.scheduledDistribution.loading}
        onToggle={props.scheduledDistribution.onToggle}
        status={props.scheduledDistribution.status}
        toggleErrorCode={props.scheduledDistribution.toggleErrorCode}
      />
      <DistributionCursorPanel
        adjusted={props.distributionCursor.adjusted}
        cursor={props.distributionCursor.cursor}
        disabled={props.distributionCursor.pending}
        errorCode={props.distributionCursor.errorCode}
        loading={props.distributionCursor.loading}
        onAdjust={props.distributionCursor.onAdjust}
      />
    </>
  )
}

function NfseTabPanel(props: SettingsBodyProps) {
  return (
    <>
      <NfseCredentialPanel
        // O rascunho lê o resumo na montagem. Com a chave só no ambiente, a montagem caía
        // enquanto a consulta ainda carregava e o que estava gravado nunca chegava ao campo.
        key={`${props.nfse.fiscalEnvironment}:${props.nfse.credential?.id ?? 'none'}`}
        disabled={props.nfse.credentialPending}
        errorCode={props.nfse.credentialErrorCode}
        fiscalEnvironment={props.nfse.fiscalEnvironment}
        loading={props.nfse.loading}
        onEnvironmentChange={props.nfse.onEnvironmentChange}
        onSave={props.nfse.onCredentialSave}
        saved={props.nfse.credentialSaved}
        summary={props.nfse.credential}
      />
      <NfseEmissionProfilePanel
        disabled={props.nfse.profilePending}
        errorCode={props.nfse.profileErrorCode}
        freightRules={props.nfse.freightRules}
        loading={props.nfse.loading}
        onSave={props.nfse.onProfileSave}
        onStatusChange={props.nfse.onProfileStatusChange}
        profiles={props.nfse.profiles}
        saved={props.nfse.profileSaved}
      />
    </>
  )
}

/**
 * Cada aba monta só os painéis dela: quem entra para trocar a série do CT-e não paga pelas consultas
 * de combustível e de NFS-e. A consulta da aba aberta é ligada em `CompanySettingsPage`, e os
 * painéis que copiam o que está gravado para um rascunho remontam por `key` quando o dado chega —
 * é isso que faz o campo abrir preenchido em vez de vazio sobre um cadastro existente.
 */
function renderTabPanel(tab: CompanySettingsTabId, props: SettingsBodyProps) {
  if (tab === 'company') return <CompanyTabPanel {...props} />
  if (tab === 'certificates')
    return (
      <CertificateUploadForm
        certificates={props.certificates}
        disabled={props.certificatePending}
        hasFiscalProfileSaved={props.viewModel.hasFiscalProfileSaved}
        onDelete={props.onCertificateDelete}
        onSubmit={props.onCertificateSubmit}
      />
    )
  if (tab === 'distribution') return <DistributionTabPanel {...props} />
  return <NfseTabPanel {...props} />
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
  const scope = resolveCompanySettingsDataScope(activeTab)
  const scheduledDistribution = useScheduledDistribution({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && scope.scheduledDistribution,
  })
  const distributionCursor = useDistributionCursor({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && scope.distributionCursor,
  })
  const nfseSettings = useNfseSettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && scope.nfse,
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
        distributionCursor={{
          adjusted: distributionCursor.adjustMutation.isSuccess,
          cursor: distributionCursor.query.data,
          errorCode:
            distributionCursor.adjustMutation.error instanceof Error
              ? distributionCursor.adjustMutation.error.message
              : undefined,
          loading: distributionCursor.query.isLoading,
          onAdjust: (ultNsu) => distributionCursor.adjustMutation.mutate(ultNsu),
          pending: distributionCursor.adjustMutation.isPending,
        }}
        initialValue={toUpdate(canManageSettings ? query.data : undefined)}
        logo={{
          image: logoQuery.data ?? null,
          onRemove: () => logoRemoveMutation.mutateAsync(),
          onSubmit: (file) => logoMutation.mutateAsync(file),
          pending: logoMutation.isPending || logoRemoveMutation.isPending,
        }}
        nfse={{
          credential: nfseSettings.credentialQuery.data,
          credentialErrorCode: toErrorCode(nfseSettings.credentialMutation.error),
          credentialPending: nfseSettings.credentialMutation.isPending,
          credentialSaved: nfseSettings.credentialMutation.isSuccess,
          fiscalEnvironment: nfseSettings.fiscalEnvironment,
          freightRules: nfseSettings.freightRulesQuery.data ?? [],
          loading: nfseSettings.credentialQuery.isLoading || nfseSettings.profilesQuery.isLoading,
          onCredentialSave: (body) => nfseSettings.credentialMutation.mutate(body),
          onEnvironmentChange: nfseSettings.setFiscalEnvironment,
          onProfileSave: (save) => nfseSettings.profileMutation.mutate(save),
          onProfileStatusChange: (toggle) => nfseSettings.profileStatusMutation.mutate(toggle),
          profileErrorCode: toErrorCode(
            nfseSettings.profileMutation.error ?? nfseSettings.profileStatusMutation.error,
          ),
          profilePending:
            nfseSettings.profileMutation.isPending || nfseSettings.profileStatusMutation.isPending,
          profileSaved:
            nfseSettings.profileMutation.isSuccess || nfseSettings.profileStatusMutation.isSuccess,
          profiles: nfseSettings.profilesQuery.data ?? [],
        }}
        onCertificateSubmit={(body) => certificateMutation.mutateAsync(body)}
        onCertificateDelete={(purpose) => certificateRetireMutation.mutateAsync(purpose)}
        onLookupProfile={(cnpj) => lookupMutation.mutateAsync(cnpj)}
        onSave={(input) => settingsMutation.mutate(input)}
        scheduledDistribution={{
          loading: scheduledDistribution.query.isLoading,
          onToggle: (nextEnabled) => scheduledDistribution.toggleMutation.mutate(nextEnabled),
          pending: scheduledDistribution.toggleMutation.isPending,
          status: scheduledDistribution.query.data,
          toggleErrorCode:
            scheduledDistribution.toggleMutation.error instanceof Error
              ? scheduledDistribution.toggleMutation.error.message
              : undefined,
        }}
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
