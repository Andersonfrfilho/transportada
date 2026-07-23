/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { NfeDocumentList } from '../components/NfeDocumentList.component'
import { NfeImportQueue } from '../components/NfeImportQueue.component'
import { NfeUploadPanel } from '../components/NfeUploadPanel.component'
import { NfeWorkspaceHeader } from '../components/NfeWorkspaceHeader.component'
import { useNfeWorkspace } from '../hooks/useNfeWorkspace.hook'
import type { NfeImportFilters } from '../shared/nfeWorkspaceClient.service'
import { createNfeWorkspaceViewModel } from '../shared/nfeWorkspaceViewModel.service'
import styles from '../styles/nfeWorkspace.module.css'

const NFE_IMPORT_ADVANCED_FILTERS: readonly (keyof NfeImportFilters)[] = [
  'idEq',
  'idNe',
  'requestedByUserIdEq',
  'requestedByUserIdNe',
  'correlationIdEq',
  'correlationIdNe',
  'receivedCountEq',
  'receivedCountNe',
  'receivedCountGt',
  'receivedCountGte',
  'receivedCountLt',
  'receivedCountLte',
  'processedCountEq',
  'processedCountNe',
  'processedCountGt',
  'processedCountGte',
  'processedCountLt',
  'processedCountLte',
  'importedCountEq',
  'importedCountNe',
  'importedCountGt',
  'importedCountGte',
  'importedCountLt',
  'importedCountLte',
  'duplicatedCountEq',
  'duplicatedCountNe',
  'duplicatedCountGt',
  'duplicatedCountGte',
  'duplicatedCountLt',
  'duplicatedCountLte',
  'invalidCountEq',
  'invalidCountNe',
  'invalidCountGt',
  'invalidCountGte',
  'invalidCountLt',
  'invalidCountLte',
  'rejectedCountEq',
  'rejectedCountNe',
  'rejectedCountGt',
  'rejectedCountGte',
  'rejectedCountLt',
  'rejectedCountLte',
  'failedCountEq',
  'failedCountNe',
  'failedCountGt',
  'failedCountGte',
  'failedCountLt',
  'failedCountLte',
  'versionEq',
  'versionNe',
  'versionGt',
  'versionGte',
  'versionLt',
  'versionLte',
  'createdFrom',
  'createdUntil',
  'updatedFrom',
  'updatedUntil',
]

function advancedFilter(
  input: Readonly<{ key: keyof NfeImportFilters | ''; value: string }>,
): Partial<NfeImportFilters> {
  if (input.key === '' || input.value.trim() === '') return {}
  return { [input.key]: input.value.trim() }
}

function StatusMessage(
  props: Readonly<{ status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready' | 'running' }>,
) {
  const { t } = useTranslation('nfeWorkspace')
  if (props.status === 'ready' || props.status === 'running') {
    return null
  }

  return (
    <p
      role={props.status === 'error' || props.status === 'forbidden' ? 'alert' : 'status'}
      className={styles.statusMessage}
    >
      {t(`statusMessage.${props.status}`)}
    </p>
  )
}

export function NfeWorkspacePage() {
  const { t } = useTranslation('nfeWorkspace')
  const authQuery = useAuthMeQuery()
  const [sourceEq, setSourceEq] = useState<'' | 'distribution' | 'upload'>('')
  const [sourceNe, setSourceNe] = useState<'' | 'distribution' | 'upload'>('')
  const [statusEq, setStatusEq] = useState<
    | ''
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'partially_processed'
    | 'pending'
    | 'processing'
    | 'queued'
  >('')
  const [statusNe, setStatusNe] = useState<
    | ''
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'partially_processed'
    | 'pending'
    | 'processing'
    | 'queued'
  >('')
  const [advancedFilterKey, setAdvancedFilterKey] = useState<keyof NfeImportFilters | ''>('')
  const [advancedFilterValue, setAdvancedFilterValue] = useState('')
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useNfeWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    importFilters: {
      ...(sourceEq === '' ? {} : { sourceEq }),
      ...(sourceNe === '' ? {} : { sourceNe }),
      ...(statusEq === '' ? {} : { statusEq }),
      ...(statusNe === '' ? {} : { statusNe }),
      ...advancedFilter({ key: advancedFilterKey, value: advancedFilterValue }),
    },
    permissions,
  })
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([])

  const clearFilters = (): void => {
    setSourceEq('')
    setSourceNe('')
    setStatusEq('')
    setStatusNe('')
    setAdvancedFilterKey('')
    setAdvancedFilterValue('')
  }

  const status =
    authQuery.isError || workspace.importsQuery.isError || workspace.documentsQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (workspace.canRead &&
            (workspace.importsQuery.isLoading || workspace.documentsQuery.isLoading))
        ? 'loading'
        : 'success'
  const viewModel = createNfeWorkspaceViewModel({
    documents: workspace.documentsQuery.data,
    imports: workspace.importsQuery.data,
    permissions,
    status,
  })

  function handleUploadSubmit(): void {
    void workspace.uploadMutation
      .mutateAsync({
        files: selectedFiles,
        idempotencyKey: workspace.newIdempotencyKey(),
      })
      .finally(() => {
        setSelectedFiles([])
        setFileInputVersion((current) => current + 1)
      })
  }

  function handleDistributionRequest(): void {
    void workspace.distributionMutation.mutate({
      idempotencyKey: workspace.newIdempotencyKey(),
    })
  }

  function handleReprocess(id: string): void {
    void workspace.reprocessMutation.mutate({
      id,
      idempotencyKey: workspace.newIdempotencyKey(),
    })
  }

  function handleDownloadXml(id: string): void {
    void workspace.downloadDocumentXml({ id })
  }

  return (
    <main className={styles.workspaceShell}>
      <NfeWorkspaceHeader status={viewModel.status} />
      <div className={styles.workspaceGrid}>
        <NfeUploadPanel
          canImport={workspace.canImport}
          distributionPending={workspace.distributionMutation.isPending}
          fileInputKey={`nfe-file-input-${fileInputVersion}`}
          onDistributionRequest={handleDistributionRequest}
          onFileSelection={setSelectedFiles}
          onUploadSubmit={handleUploadSubmit}
          selectedFiles={selectedFiles}
          uploadPending={workspace.uploadMutation.isPending}
        />
        <StatusMessage status={viewModel.status} />
        <NfeImportQueue
          canImport={workspace.canImport}
          filterActions={
            <div className={styles.filterPanel}>
              <label className={styles.fileField}>
                <span>{t('filters.sourceEq')}</span>
                <select
                  onChange={(event) =>
                    setSourceEq(event.target.value as '' | 'distribution' | 'upload')
                  }
                  value={sourceEq}
                >
                  <option value="">{t('filters.all')}</option>
                  <option value="upload">{t('filters.upload')}</option>
                  <option value="distribution">{t('filters.distribution')}</option>
                </select>
              </label>
              <label className={styles.fileField}>
                <span>{t('filters.sourceNe')}</span>
                <select
                  onChange={(event) =>
                    setSourceNe(event.target.value as '' | 'distribution' | 'upload')
                  }
                  value={sourceNe}
                >
                  <option value="">{t('filters.none')}</option>
                  <option value="upload">{t('filters.upload')}</option>
                  <option value="distribution">{t('filters.distribution')}</option>
                </select>
              </label>
              <label className={styles.fileField}>
                <span>{t('filters.statusEq')}</span>
                <select
                  onChange={(event) =>
                    setStatusEq(
                      event.target.value as
                        | ''
                        | 'cancelled'
                        | 'completed'
                        | 'failed'
                        | 'partially_processed'
                        | 'pending'
                        | 'processing'
                        | 'queued',
                    )
                  }
                  value={statusEq}
                >
                  <option value="">{t('filters.all')}</option>
                  <option value="queued">{t('status.queued')}</option>
                  <option value="pending">{t('status.pending')}</option>
                  <option value="processing">{t('status.processing')}</option>
                  <option value="completed">{t('status.completed')}</option>
                  <option value="partially_processed">{t('status.partially_processed')}</option>
                  <option value="failed">{t('status.failed')}</option>
                  <option value="cancelled">{t('status.cancelled')}</option>
                </select>
              </label>
              <label className={styles.fileField}>
                <span>{t('filters.statusNe')}</span>
                <select
                  onChange={(event) =>
                    setStatusNe(
                      event.target.value as
                        | ''
                        | 'cancelled'
                        | 'completed'
                        | 'failed'
                        | 'partially_processed'
                        | 'pending'
                        | 'processing'
                        | 'queued',
                    )
                  }
                  value={statusNe}
                >
                  <option value="">{t('filters.none')}</option>
                  <option value="queued">{t('status.queued')}</option>
                  <option value="pending">{t('status.pending')}</option>
                  <option value="processing">{t('status.processing')}</option>
                  <option value="completed">{t('status.completed')}</option>
                  <option value="partially_processed">{t('status.partially_processed')}</option>
                  <option value="failed">{t('status.failed')}</option>
                  <option value="cancelled">{t('status.cancelled')}</option>
                </select>
              </label>
              <label className={styles.fileField}>
                <span>{t('filters.advancedKey')}</span>
                <select
                  onChange={(event) =>
                    setAdvancedFilterKey(event.target.value as keyof NfeImportFilters | '')
                  }
                  value={advancedFilterKey}
                >
                  <option value="">{t('filters.none')}</option>
                  {NFE_IMPORT_ADVANCED_FILTERS.map((filter) => (
                    <option key={filter} value={filter}>
                      {filter}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.fileField}>
                <span>{t('filters.advancedValue')}</span>
                <input
                  onChange={(event) => setAdvancedFilterValue(event.target.value)}
                  type="text"
                  value={advancedFilterValue}
                />
              </label>
              <button onClick={clearFilters} type="button">
                {t('filters.clear')}
              </button>
            </div>
          }
          imports={viewModel.imports ?? []}
          onReprocess={handleReprocess}
          reprocessPending={workspace.reprocessMutation.isPending}
        />
        <NfeDocumentList documents={viewModel.documents ?? []} onDownloadXml={handleDownloadXml} />
      </div>
    </main>
  )
}
