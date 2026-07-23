/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { NfeDocumentList } from '../components/NfeDocumentList.component'
import { NfeImportQueue } from '../components/NfeImportQueue.component'
import { NfeUploadPanel } from '../components/NfeUploadPanel.component'
import { NfeWorkspaceHeader } from '../components/NfeWorkspaceHeader.component'
import { useNfeWorkspace } from '../hooks/useNfeWorkspace.hook'
import { createNfeWorkspaceViewModel } from '../shared/nfeWorkspaceViewModel.service'
import styles from '../styles/nfeWorkspace.module.css'

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
  useTranslation('nfeWorkspace')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useNfeWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([])
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
          imports={viewModel.imports ?? []}
          onReprocess={handleReprocess}
          reprocessPending={workspace.reprocessMutation.isPending}
        />
        <NfeDocumentList documents={viewModel.documents ?? []} onDownloadXml={handleDownloadXml} />
      </div>
    </main>
  )
}
