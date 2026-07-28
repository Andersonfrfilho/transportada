/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CertificateUploadForm } from '../components/CertificateUploadForm.component'
import { CompanySettingsHeader } from '../components/CompanySettingsHeader.component'
import { CompanySettingsForm } from '../components/CompanySettingsForm.component'
import { EMPTY_MDFE_DEFAULTS } from '../shared/companySettings.constant'
import { useCompanySettings } from '../hooks/useCompanySettings.hook'
import type {
  CompanyProfileLookup,
  CompanySettingsUpdate,
  SafeCertificate,
} from '../shared/companySettingsClient.service'
import {
  createCompanySettingsViewModel,
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
    cte,
    cteRetry: settings.cteRetry,
    expectedVersion: profileVersion,
    mdfe: settings.mdfe ?? EMPTY_MDFE_DEFAULTS,
    profile,
  }
}

type SettingsBodyProps = Readonly<{
  canManageSettings: boolean
  certificate: SafeCertificate | undefined
  certificatePending: boolean
  initialValue: CompanySettingsUpdate | undefined
  onCertificateSubmit: (body: FormData) => Promise<SafeCertificate>
  onCertificateDelete: () => Promise<void>
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
      {status === 'loading' && <p role="status">{t('loading')}</p>}
      {status === 'error' && <p role="alert">{t('error')}</p>}
      {status === 'empty' && <p role="status">{t('empty')}</p>}
    </>
  )
}

function CertificateMetadata({
  certificate,
}: Readonly<{ certificate: NonNullable<CompanySettingsViewModel['activeCertificate']> }>) {
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

function SettingsBody(props: SettingsBodyProps) {
  const { t } = useTranslation('companySettings')
  const editable = props.canManageSettings && ['empty', 'success'].includes(props.viewModel.status)
  return (
    <section className={styles.workspaceDeck}>
      <div className={styles.primaryColumn}>
        <SettingsStatus status={props.viewModel.status} />
        {editable && (
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
            <CertificateUploadForm
              certificate={props.certificate}
              disabled={props.certificatePending}
              onDelete={props.onCertificateDelete}
              onSubmit={props.onCertificateSubmit}
            />
          </>
        )}
        {!props.canManageSettings &&
          props.viewModel.status !== 'loading' &&
          props.viewModel.status !== 'error' && (
            <p className={styles.permissionBoundary}>{t('readOnly')}</p>
          )}
      </div>
      <aside className={styles.secondaryColumn}>
        <section className={styles.signalPanel}>
          <p className={styles.sectionKicker}>{t('environmentStep')}</p>
          <h2>{t('title')}</h2>
          <p className={styles.productionBoundary}>{t('productionBoundary')}</p>
          {props.viewModel.activeCertificate !== undefined ? (
            <CertificateMetadata certificate={props.viewModel.activeCertificate} />
          ) : (
            <p className={styles.certificateMetadata}>{t('empty')}</p>
          )}
          <SaveStatus code={props.settingsErrorCode} state={props.settingsState} />
        </section>
      </aside>
    </section>
  )
}

export function CompanySettingsPage() {
  useTranslation('companySettings')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const {
    canManageSettings,
    certificateRetireMutation,
    certificateMutation,
    certificatesQuery,
    lookupMutation,
    query,
    settingsMutation,
  } = useCompanySettings({ ...(companyId === undefined ? {} : { companyId }), permissions })
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
        canManageSettings={canManageSettings}
        certificate={viewModel.activeCertificate}
        certificatePending={certificateMutation.isPending}
        initialValue={toUpdate(canManageSettings ? query.data : undefined)}
        onCertificateSubmit={(body) => certificateMutation.mutateAsync(body)}
        onCertificateDelete={() => certificateRetireMutation.mutateAsync()}
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
