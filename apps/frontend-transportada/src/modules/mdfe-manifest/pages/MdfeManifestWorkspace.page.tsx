/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFleet } from '@/modules/fleet/hooks/useFleet.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { MdfeManifestActionsPanel } from '../components/MdfeManifestActionsPanel.component'
import { MdfeManifestCreationPanel } from '../components/MdfeManifestCreationPanel.component'
import { MdfeManifestFilters } from '../components/MdfeManifestFilters.component'
import { MdfeManifestTable } from '../components/MdfeManifestTable.component'
import { useMdfeManifestActionForm } from '../hooks/useMdfeManifestActionForm.hook'
import { useMdfeManifestCreation } from '../hooks/useMdfeManifestCreation.hook'
import { useMdfeManifestTable } from '../hooks/useMdfeManifestTable.hook'
import { useMdfeManifests } from '../hooks/useMdfeManifests.hook'
import { MDFE_MANIFEST_FEEDBACK_KEY_BY_ERROR } from '../shared/mdfeManifest.constant'
import type { MdfeManifestSummary } from '../shared/mdfeManifest.types'
import {
  createManifestDraftFromPreview,
  type MdfeManifestDraft,
} from '../shared/mdfeManifestActions.service'
import { buildManifestCreateBody } from '../shared/mdfeManifestForm.service'
import styles from '../styles/mdfeManifest.module.css'

function resolveFeedbackKey(error: unknown): null | string {
  if (!(error instanceof Error)) return null
  return MDFE_MANIFEST_FEEDBACK_KEY_BY_ERROR[error.message] ?? 'requestFailed'
}

export function MdfeManifestWorkspacePage() {
  const { t } = useTranslation('mdfeManifest')
  const authQuery = useAuthMeQuery()
  const [preview, setPreview] = useState<MdfeManifestDraft | null>(null)

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const tenant = { ...(companyId === undefined ? {} : { companyId }), permissions }

  const workspace = useMdfeManifests(tenant)
  const table = useMdfeManifestTable({ manifests: workspace.manifests })
  const creation = useMdfeManifestCreation(tenant)
  const fleet = useFleet(tenant)
  const form = useMdfeManifestActionForm()

  const isForbidden = companyId === undefined || !workspace.controller.canReadManifests
  const feedbackKey =
    resolveFeedbackKey(workspace.createManifestMutation.error) ??
    resolveFeedbackKey(workspace.previewManifestMutation.error) ??
    resolveFeedbackKey(workspace.issueManifestMutation.error) ??
    resolveFeedbackKey(workspace.closeManifestMutation.error) ??
    resolveFeedbackKey(workspace.cancelManifestMutation.error) ??
    resolveFeedbackKey(workspace.discardManifestMutation.error)

  function handlePreview(): void {
    workspace.previewManifestMutation.mutate(
      { documentIds: creation.documentIds },
      { onSuccess: (result) => setPreview(createManifestDraftFromPreview(result)) },
    )
  }

  function handleCreate(): void {
    const body = buildManifestCreateBody({
      documentIds: creation.documentIds,
      draft: creation.draft,
    })
    workspace.createManifestMutation.mutate(body, {
      onSuccess: () => {
        creation.reset()
        setPreview(null)
      },
    })
  }

  function handleConfirmAction(): void {
    const pending = form.pendingAction
    if (pending === null) return
    const action = { idempotencyKey: crypto.randomUUID(), manifestId: pending.manifest.id }
    const settled = { onSuccess: form.dismiss }
    if (pending.kind === 'issue') workspace.issueManifestMutation.mutate(action, settled)
    if (pending.kind === 'discard') {
      workspace.discardManifestMutation.mutate({ manifestId: pending.manifest.id }, settled)
    }
    if (pending.kind === 'close') {
      workspace.closeManifestMutation.mutate(
        { ...action, closureCityCode: form.closureCityCode, closureState: form.closureState },
        settled,
      )
    }
    if (pending.kind === 'cancel') {
      workspace.cancelManifestMutation.mutate(
        { ...action, justification: form.justification },
        settled,
      )
    }
  }

  function openIssue(manifest: MdfeManifestSummary): void {
    form.openAction('issue', manifest)
  }

  function openClose(manifest: MdfeManifestSummary): void {
    form.openAction('close', manifest)
  }

  function openCancel(manifest: MdfeManifestSummary): void {
    form.openAction('cancel', manifest)
  }

  function openDiscard(manifest: MdfeManifestSummary): void {
    form.openAction('discard', manifest)
  }

  return (
    <main className={styles.manifestShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {authQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}

      {authQuery.isSuccess && isForbidden ? (
        <p className={styles.hint} role="alert">
          {t('forbidden')}
        </p>
      ) : null}

      {authQuery.isSuccess && !isForbidden ? (
        <div className={styles.deck}>
          {feedbackKey === null ? null : (
            <p className={styles.alert} role="alert">
              {t(`feedback.${feedbackKey}`)}
            </p>
          )}

          <MdfeManifestCreationPanel
            creation={creation}
            drivers={fleet.viewModel.drivers ?? []}
            isCreatePending={workspace.createManifestMutation.isPending}
            isPreviewPending={workspace.previewManifestMutation.isPending}
            isReadOnly={!workspace.controller.canManageManifests}
            onCreate={handleCreate}
            onPreview={handlePreview}
            preview={preview}
            vehicles={fleet.viewModel.vehicles ?? []}
          />

          <MdfeManifestFilters table={table} />

          {workspace.status === 'loading' ? <p className={styles.hint}>{t('loading')}</p> : null}
          {workspace.status === 'error' ? (
            <p className={styles.hint} role="alert">
              {t('error')}
            </p>
          ) : null}

          <MdfeManifestTable
            actions={{
              onCancel: openCancel,
              onClose: openClose,
              onDiscard: openDiscard,
              onIssue: openIssue,
            }}
            permissions={{
              canCancel: workspace.controller.canCancelManifests,
              canClose: workspace.controller.canCloseManifests,
              canDiscard: workspace.controller.canManageManifests,
              canIssue: workspace.controller.canIssueManifests,
            }}
            table={table}
          />

          <MdfeManifestActionsPanel
            form={form}
            isPending={
              workspace.issueManifestMutation.isPending ||
              workspace.closeManifestMutation.isPending ||
              workspace.cancelManifestMutation.isPending ||
              workspace.discardManifestMutation.isPending
            }
            onConfirm={handleConfirmAction}
          />
        </div>
      ) : null}
    </main>
  )
}
