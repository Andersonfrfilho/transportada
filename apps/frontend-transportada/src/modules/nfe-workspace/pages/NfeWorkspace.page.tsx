/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import { resolveSettingsDataScope } from '@/modules/company-settings/shared/companySettingsTabs.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { DistributionCursorPanel } from '../components/DistributionCursorPanel.component'
import { NfeDistributionControl } from '../components/NfeDistributionControl.component'
import { NfeScheduledDistribution } from '../components/NfeScheduledDistribution.component'
import { ScheduledDistributionPanel } from '../components/ScheduledDistributionPanel.component'
import { AddressReportPanel } from '../components/AddressReportPanel.component'
import { useAddressReport } from '../hooks/useAddressReport.hook'
import { useDistributionCursor } from '../hooks/useDistributionCursor.hook'
import { CargoWeightPanel } from '../components/CargoWeightPanel.component'
import { useCargoSettings } from '../hooks/useCargoSettings.hook'
import { useCargoVolumeFactor } from '../hooks/useCargoVolumeFactor.hook'
import { CargoVolumeFactorPanel } from '../components/CargoVolumeFactorPanel.component'
import { useScheduledDistribution } from '../hooks/useScheduledDistribution.hook'
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
import settingsStyles from '../styles/distributionSettings.module.css'
import styles from '../styles/nfeWorkspace.module.css'

/** O cliente joga o código da API como mensagem do erro: é ele que a tela mostra ao operador. */
function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

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

const NFE_IMPORT_STATUS_ORDER = [
  'queued',
  'pending',
  'processing',
  'completed',
  'partially_processed',
  'failed',
  'cancelled',
] as const

type NfeImportStatusFilter = '' | (typeof NFE_IMPORT_STATUS_ORDER)[number]

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

const DOCUMENT_TABLE_SKELETON_ROW_COUNT = 5

// Larguras relativas aproximam a coluna real (número/série curtos, emitente/destinatário longos).
const DOCUMENT_TABLE_SKELETON_COLUMN_WIDTHS: readonly string[] = [
  '55%',
  '45%',
  '65%',
  '80%',
  '70%',
  '80%',
  '70%',
  '60%',
  '55%',
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
  const [activeTab, setActiveTab] = useState<'addresses' | 'documents' | 'imports'>('documents')
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const canManageSettings = permissions.includes(SETTINGS_MANAGE_PERMISSION)
  const settingsScope = resolveSettingsDataScope('nfe-workspace', activeTab)
  const scheduledDistribution = useScheduledDistribution({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.scheduledDistribution,
  })
  const distributionCursor = useDistributionCursor({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.distributionCursor,
  })
  const cargoVolume = useCargoVolumeFactor({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.cargoVolumeFactors,
  })
  /**
   * O relatório mora aqui porque o endereço vem da nota e quem corrige é quem a emitiu (ADR-0057).
   * A consulta só sobe com a aba aberta **e** com a permissão — a rota exige `settings.manage`, e
   * pedi-la sem ela renderizaria um erro numa aba que a pessoa nem escolheu abrir.
   */
  const addressReport = useAddressReport({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && activeTab === 'addresses',
  })
  const cargoSettings = useCargoSettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canManageSettings && settingsScope.cargoSettings,
  })

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

      {viewModel.status === 'loading' ? (
        <SkeletonGroup
          className={styles.tableSkeletonGroup ?? ''}
          label={t('statusMessage.loading')}
        >
          <div className={styles.tabBar}>
            <Skeleton height="1.5rem" width="6rem" />
            <Skeleton height="1.5rem" width="6rem" />
          </div>
          <div className={styles.tableSkeletonTable}>
            <div className={styles.tableSkeletonRow}>
              {DOCUMENT_TABLE_SKELETON_COLUMN_WIDTHS.map((width, columnIndex) => (
                <Skeleton
                  height="0.7rem"
                  key={`header-${columnIndex}`}
                  variant="text"
                  width={width}
                />
              ))}
            </div>
            {Array.from({ length: DOCUMENT_TABLE_SKELETON_ROW_COUNT }, (_, rowIndex) => (
              <div className={styles.tableSkeletonRow} key={`row-${rowIndex}`}>
                {DOCUMENT_TABLE_SKELETON_COLUMN_WIDTHS.map((width, columnIndex) => (
                  <Skeleton
                    height="0.85rem"
                    key={`cell-${rowIndex}-${columnIndex}`}
                    variant="text"
                    width={width}
                  />
                ))}
              </div>
            ))}
          </div>
        </SkeletonGroup>
      ) : (
        <>
          <StatusMessage status={viewModel.status} />

          <Tabs
            ariaLabel={t('statusLabel')}
            items={[
              {
                badge: String(documentCount),
                id: 'documents',
                label: t('tabs.documents'),
                panel: (
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
                ),
              },
              {
                badge: String(importCount),
                id: 'imports',
                label: t('tabs.imports'),
                panel: (
                  <>
                    <div
                      className={styles.toolbar}
                      role="group"
                      aria-label={t('mechanism.section')}
                    >
                      {NFE_IMPORT_MECHANISM_ORDER.map((option) => (
                        <button
                          aria-pressed={mechanism === option}
                          className={
                            mechanism === option ? styles.toolbarButtonActive : styles.toolbarButton
                          }
                          key={option}
                          onClick={() => setMechanism(option)}
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
                      <>
                        {canManageSettings ? (
                          <div className={settingsStyles.settingsDeck}>
                            <CargoWeightPanel
                              defaultVolumeWeight={
                                cargoSettings.query.data?.defaultVolumeWeight ?? null
                              }
                              disabled={cargoSettings.saveMutation.isPending}
                              loading={cargoSettings.query.isLoading}
                              onSave={(weight) => cargoSettings.saveMutation.mutate(weight)}
                            />
                            <CargoVolumeFactorPanel
                              canManage={canManageSettings}
                              current={cargoVolume.current}
                              factors={cargoVolume.factors}
                              loading={cargoVolume.isLoading}
                              onClear={() => cargoVolume.clear.mutate()}
                              onSave={(volume) => cargoVolume.save.mutate(volume)}
                              saving={cargoVolume.save.isPending}
                            />
                            <ScheduledDistributionPanel
                              disabled={scheduledDistribution.toggleMutation.isPending}
                              loading={scheduledDistribution.query.isLoading}
                              onToggle={(next) => scheduledDistribution.toggleMutation.mutate(next)}
                              status={scheduledDistribution.query.data}
                              toggleErrorCode={toErrorCode(
                                scheduledDistribution.toggleMutation.error,
                              )}
                            />
                            <DistributionCursorPanel
                              adjusted={distributionCursor.adjustMutation.isSuccess}
                              cursor={distributionCursor.query.data}
                              disabled={distributionCursor.adjustMutation.isPending}
                              errorCode={toErrorCode(distributionCursor.adjustMutation.error)}
                              loading={distributionCursor.query.isLoading}
                              onAdjust={(ultNsu) =>
                                distributionCursor.adjustMutation.mutate(ultNsu)
                              }
                            />
                          </div>
                        ) : (
                          <NfeScheduledDistribution
                            loading={workspace.distributionStatusQuery.isLoading}
                            scheduled={workspace.distributionStatusQuery.data?.scheduled}
                          />
                        )}
                        <NfeDistributionControl
                          canImport={workspace.canImport}
                          lastRun={workspace.distributionStatusQuery.data?.lastRun}
                          onCooldownEnd={() => {
                            void workspace.distributionStatusQuery.refetch()
                          }}
                          onRequest={handleDistributionRequest}
                          pending={workspace.distributionMutation.isPending}
                          pullControl={pullControl}
                        />
                      </>
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
                            <Icon name="filter" />
                            {isFiltersOpen ? t('filters.toggleClose') : t('filters.toggle')}
                          </button>
                          {isFiltersOpen && (
                            <div className={styles.filterPanel}>
                              <label className={styles.fileField}>
                                <span>{t('filters.statusEq')}</span>
                                <Select
                                  ariaLabel={t('filters.statusEq')}
                                  clearable
                                  compact
                                  options={NFE_IMPORT_STATUS_ORDER.map((status) => ({
                                    label: t(`status.${status}`),
                                    value: status,
                                  }))}
                                  placeholder={t('filters.all')}
                                  value={statusEq}
                                  onChange={(value) => setStatusEq(value as NfeImportStatusFilter)}
                                />
                              </label>
                              <label className={styles.fileField}>
                                <span>{t('filters.statusNe')}</span>
                                <Select
                                  ariaLabel={t('filters.statusNe')}
                                  clearable
                                  compact
                                  options={NFE_IMPORT_STATUS_ORDER.map((status) => ({
                                    label: t(`status.${status}`),
                                    value: status,
                                  }))}
                                  placeholder={t('filters.none')}
                                  value={statusNe}
                                  onChange={(value) => setStatusNe(value as NfeImportStatusFilter)}
                                />
                              </label>
                              <label className={styles.fileField}>
                                <span>{t('filters.advancedKey')}</span>
                                <Select
                                  ariaLabel={t('filters.advancedKey')}
                                  clearable
                                  compact
                                  options={NFE_IMPORT_ADVANCED_FILTERS.map((filter) => ({
                                    label: filter,
                                    value: filter,
                                  }))}
                                  placeholder={t('filters.none')}
                                  value={advancedFilterKey}
                                  onChange={(value) =>
                                    setAdvancedFilterKey(value as keyof NfeImportFilters | '')
                                  }
                                />
                              </label>
                              <label className={styles.fileField}>
                                <span>{t('filters.advancedValue')}</span>
                                <input
                                  onChange={(event) => setAdvancedFilterValue(event.target.value)}
                                  type="text"
                                  value={advancedFilterValue}
                                />
                              </label>
                              <button
                                className={styles.ghostAction}
                                onClick={clearFilters}
                                type="button"
                              >
                                <Icon name="filter-clear" />
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
                ),
              },
              {
                ...(addressReport.data === undefined
                  ? {}
                  : { badge: String(addressReport.data.totals.needingAttention) }),
                id: 'addresses',
                label: t('tabs.addresses'),
                panel: (
                  <AddressReportPanel
                    denied={!canManageSettings}
                    failed={addressReport.isError}
                    loading={addressReport.isLoading}
                    report={addressReport.data}
                  />
                ),
              },
            ]}
            onChange={(id) => {
              if (id === 'imports' || id === 'addresses') setActiveTab(id)
              else setActiveTab('documents')
            }}
            value={activeTab}
          />
        </>
      )}
    </main>
  )
}
