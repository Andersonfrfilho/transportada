/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CertificateUploadForm } from '../components/CertificateUploadForm.component'
import { CompanySettingsHeader } from '../components/CompanySettingsHeader.component'
import { CompanySettingsForm } from '../components/CompanySettingsForm.component'
import { useCompanySettings } from '../hooks/useCompanySettings.hook'
import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import {
  createCompanySettingsViewModel,
  type CompanySettingsViewModel,
} from '../shared/companySettingsViewModel.service'
import styles from '../styles/companySettings.module.css'

function toUpdate(
  data: ReturnType<typeof useCompanySettings>['query']['data'],
): CompanySettingsUpdate | undefined {
  const settings = data?.data
  if (settings?.profile === null || settings?.cte === null || settings === undefined)
    return undefined
  const { version: profileVersion, ...profile } = settings.profile
  const cte = {
    environment: settings.cte.environment,
    nextNumber: settings.cte.nextNumber,
    series: settings.cte.series,
  }
  return { cte, expectedVersion: profileVersion, profile }
}

type SettingsBodyProps = Readonly<{
  canManageSettings: boolean
  certificatePending: boolean
  initialValue: CompanySettingsUpdate | undefined
  onCertificateSubmit: (body: FormData) => Promise<unknown>
  onSave: (input: CompanySettingsUpdate) => void
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

function SaveStatus({ state }: Readonly<{ state: SettingsBodyProps['settingsState'] }>) {
  const { t } = useTranslation('companySettings')
  if (state === 'idle') return null
  return (
    <p role={state === 'error' ? 'alert' : 'status'}>
      {t(state === 'error' ? 'saveError' : 'saved')}
    </p>
  )
}

function SettingsBody(props: SettingsBodyProps) {
  const { t } = useTranslation('companySettings')
  const editable = props.canManageSettings && ['empty', 'success'].includes(props.viewModel.status)
  return (
    <>
      <SettingsStatus status={props.viewModel.status} />
      {editable && (
        <>
          <section className={styles.settingsPanel} aria-labelledby="settings-title">
            <h2 id="settings-title">{t('settingsTitle')}</h2>
            <CompanySettingsForm
              key={props.initialValue?.expectedVersion ?? 'new'}
              disabled={props.settingsPending}
              initialValue={props.initialValue}
              onSave={props.onSave}
            />
          </section>
          <CertificateUploadForm
            disabled={props.certificatePending}
            onSubmit={props.onCertificateSubmit}
          />
        </>
      )}
      {!props.canManageSettings &&
        props.viewModel.status !== 'loading' &&
        props.viewModel.status !== 'error' && (
          <p className={styles.permissionBoundary}>{t('readOnly')}</p>
        )}
      {props.viewModel.activeCertificate !== undefined && (
        <CertificateMetadata certificate={props.viewModel.activeCertificate} />
      )}
      <SaveStatus state={props.settingsState} />
    </>
  )
}

export function CompanySettingsPage() {
  useTranslation('companySettings')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const { canManageSettings, certificateMutation, certificatesQuery, query, settingsMutation } =
    useCompanySettings({ ...(companyId === undefined ? {} : { companyId }), permissions })
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
        certificatePending={certificateMutation.isPending}
        initialValue={toUpdate(canManageSettings ? query.data : undefined)}
        onCertificateSubmit={(body) => certificateMutation.mutateAsync(body)}
        onSave={(input) => settingsMutation.mutate(input)}
        settingsPending={settingsMutation.isPending}
        settingsState={
          settingsMutation.isError ? 'error' : settingsMutation.isSuccess ? 'success' : 'idle'
        }
        viewModel={viewModel}
      />
    </main>
  )
}
