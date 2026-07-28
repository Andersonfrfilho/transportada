/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { NfeDistributionControl } from '../components/NfeDistributionControl.component'
import { NfeDocumentTable } from '../components/NfeDocumentTable.component'
import { NfeImportQueue } from '../components/NfeImportQueue.component'
import { NfeUploadPanel } from '../components/NfeUploadPanel.component'
import { NfeWorkspaceHeader } from '../components/NfeWorkspaceHeader.component'
import { useNfeWorkspace } from '../hooks/useNfeWorkspace.hook'
import { createNfeDistributionPullControl } from '../shared/nfeDistributionPull.service'
import {
  DEFAULT_NFE_IMPORT_MECHANISM,
  type NfeImportMechanism,
  NFE_IMPORT_MECHANISM_ORDER,
  resolveNfeImportMechanismView,
} from '../shared/nfeImportMechanism.service'
import type { NfeDocumentListItem, NfeImportFilters } from '../shared/nfeWorkspaceClient.service'
import { createNfeWorkspaceViewModel } from '../shared/nfeWorkspaceViewModel.service'
import styles from '../styles/nfeWorkspace.module.css'

function saveBlobAsFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

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
  const [mechanism, setMechanism] = useState<NfeImportMechanism>(DEFAULT_NFE_IMPORT_MECHANISM)
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
  const mechanismView = resolveNfeImportMechanismView({ mechanism })
  const workspace = useNfeWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    importFilters: {
      sourceEq: mechanismView.sourceEq,
      ...(statusEq === '' ? {} : { statusEq }),
      ...(statusNe === '' ? {} : { statusNe }),
      ...advancedFilter({ key: advancedFilterKey, value: advancedFilterValue }),
    },
    permissions,
  })
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([])
  const [uploadFileStatuses, setUploadFileStatuses] = useState<
    Record<string, 'pending' | 'uploading' | 'uploaded' | 'failed'>
  >({})
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null)
  const [downloadErrorId, setDownloadErrorId] = useState<string | null>(null)
  const [reprocessTargetId, setReprocessTargetId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'documents' | 'imports'>('documents')
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)

  function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`
  }

  function handleFileSelection(files: readonly File[]): void {
    setSelectedFiles(files)
    setUploadFileStatuses(Object.fromEntries(files.map((file) => [fileKey(file), 'pending'])))
  }

  const clearFilters = (): void => {
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
    documents: workspace.documents,
    imports: workspace.imports,
    permissions,
    status,
  })

  function handleUploadSubmit(): void {
    void workspace.uploadMutation
      .mutateAsync({
        files: selectedFiles,
        idempotencyKey: workspace.newIdempotencyKey(),
        onBatchStarted: (files) => {
          setUploadFileStatuses((current) => ({
            ...current,
            ...Object.fromEntries(files.map((file) => [fileKey(file), 'uploading'])),
          }))
        },
        onBatchUploaded: (files) => {
          setUploadFileStatuses((current) => ({
            ...current,
            ...Object.fromEntries(files.map((file) => [fileKey(file), 'uploaded'])),
          }))
        },
        onBatchFailed: (files) => {
          setUploadFileStatuses((current) => ({
            ...current,
            ...Object.fromEntries(files.map((file) => [fileKey(file), 'failed'])),
          }))
        },
      })
      .then(() => {
        setSelectedFiles([])
        setUploadFileStatuses({})
        setFileInputVersion((current) => current + 1)
      })
      .catch(() => undefined)
  }

  function handleDistributionRequest(): void {
    void workspace.distributionMutation.mutate({
      idempotencyKey: workspace.newIdempotencyKey(),
    })
  }

  function handleReprocess(id: string): void {
    setReprocessTargetId(id)
    workspace.reprocessMutation.mutate({
      id,
      idempotencyKey: workspace.newIdempotencyKey(),
    })
  }

  async function handleDownloadXml(document: NfeDocumentListItem): Promise<void> {
    setDownloadingDocumentId(document.id)
    setDownloadErrorId(null)
    try {
      const blob = await workspace.downloadDocumentXml({ id: document.id })
      saveBlobAsFile(blob, `${document.accessKey}.xml`)
    } catch {
      setDownloadErrorId(document.id)
    } finally {
      setDownloadingDocumentId(null)
    }
  }

  const documentCount = (viewModel.documents ?? []).length
  const importCount = (viewModel.imports ?? []).length
  const pullControl = createNfeDistributionPullControl({
    now: new Date(),
    status: workspace.distributionStatus,
  })

  return (
    <main className={styles.workspaceShell}>
      <NfeWorkspaceHeader status={viewModel.status} />

      <StatusMessage status={viewModel.status} />

      <div className={styles.tabBar} role="tablist" aria-label={t('statusLabel')}>
        <button
          aria-selected={activeTab === 'documents'}
          className={activeTab === 'documents' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('documents')}
          role="tab"
          type="button"
        >
          {t('tabs.documents')}
          <span className={styles.tabCount}>{documentCount}</span>
        </button>
        <button
          aria-selected={activeTab === 'imports'}
          className={activeTab === 'imports' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('imports')}
          role="tab"
          type="button"
        >
          {t('tabs.imports')}
          <span className={styles.tabCount}>{importCount}</span>
        </button>
      </div>

      {activeTab === 'documents' ? (
        <NfeDocumentTable
          {...(companyId === undefined ? {} : { companyId })}
          documents={viewModel.documents ?? []}
          downloadErrorId={downloadErrorId}
          downloadingDocumentId={downloadingDocumentId}
          loading={workspace.isLoadingAllDocuments}
          onDownloadXml={(document) => {
            void handleDownloadXml(document)
          }}
          permissions={permissions}
        />
      ) : (
        <>
          <div className={styles.toolbar} role="tablist" aria-label={t('mechanism.section')}>
            {NFE_IMPORT_MECHANISM_ORDER.map((option) => (
              <button
                aria-selected={mechanism === option}
                className={mechanism === option ? styles.toolbarButtonActive : styles.toolbarButton}
                key={option}
                onClick={() => setMechanism(option)}
                role="tab"
                type="button"
              >
                {t(`mechanism.${option}`)}
              </button>
            ))}
          </div>

          {mechanismView.showsUpload && (
            <NfeUploadPanel
              canImport={workspace.canImport}
              fileInputKey={`nfe-file-input-${fileInputVersion}`}
              onFileSelection={handleFileSelection}
              onUploadSubmit={handleUploadSubmit}
              selectedFiles={selectedFiles}
              uploadFileStatuses={uploadFileStatuses}
              uploadFailed={workspace.uploadMutation.isError}
              uploadPending={workspace.uploadMutation.isPending}
              uploadSucceeded={workspace.uploadMutation.isSuccess}
            />
          )}

          {mechanismView.showsDistribution && (
            <NfeDistributionControl
              canImport={workspace.canImport}
              onCooldownEnd={() => {
                void workspace.distributionStatusQuery.refetch()
              }}
              onRequest={handleDistributionRequest}
              pending={workspace.distributionMutation.isPending}
              pullControl={pullControl}
            />
          )}

          <NfeImportQueue
            canImport={workspace.canImport}
            filterActions={
              <div className={styles.filterZone}>
                <button
                  aria-expanded={isFiltersOpen}
                  className={styles.ghostAction}
                  onClick={() => setIsFiltersOpen((open) => !open)}
                  type="button"
                >
                  <FilterIcon />
                  {isFiltersOpen ? t('filters.toggleClose') : t('filters.toggle')}
                </button>
                {isFiltersOpen && (
                  <div className={styles.filterPanel}>
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
                        <option value="partially_processed">
                          {t('status.partially_processed')}
                        </option>
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
                        <option value="partially_processed">
                          {t('status.partially_processed')}
                        </option>
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
                    <button className={styles.ghostAction} onClick={clearFilters} type="button">
                      <ClearFiltersIcon />
                      {t('filters.clear')}
                    </button>
                  </div>
                )}
              </div>
            }
            hasMore={workspace.hasMoreImports}
            imports={viewModel.imports ?? []}
            loadingMore={workspace.isFetchingMoreImports}
            onLoadMore={workspace.fetchMoreImports}
            onReprocess={handleReprocess}
            reprocessError={workspace.reprocessMutation.isError}
            reprocessPending={workspace.reprocessMutation.isPending}
            reprocessSuccess={workspace.reprocessMutation.isSuccess}
            reprocessTargetId={reprocessTargetId}
          />
        </>
      )}
    </main>
  )
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M4 5h16" />
      <path d="M7 10h10" />
      <path d="M10 15h4" />
    </svg>
  )
}

function ClearFiltersIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M4 5h16" />
      <path d="M7 5v4l3 3v7l4 2v-9l3-3V5" />
    </svg>
  )
}
