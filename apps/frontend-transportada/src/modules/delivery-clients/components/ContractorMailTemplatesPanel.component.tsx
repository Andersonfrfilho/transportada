/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useContractorMailTemplates } from '../hooks/useContractorMailTemplates.hook'
import { ContractorMailTemplateEditor } from './ContractorMailTemplateEditor.component'
import { contractorMailTemplateErrorLocaleKey } from '../shared/contractorMailTemplateErrors.service'
import type { MailTemplateDraft } from '../hooks/useContractorMailTemplateEditor.hook'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateType,
  MailTemplateCatalogEntry,
} from '../shared/contractorMailTemplates.types'
import styles from '../styles/contractorMailSettings.module.css'

const EMPTY_DRAFT: MailTemplateDraft = {
  closing: '',
  intro: '',
  itemText: '',
  name: '',
  subject: '',
}

type EditorMode =
  | Readonly<{ kind: 'blank' }>
  | Readonly<{ kind: 'default' }>
  | Readonly<{ kind: 'edit'; templateId: string }>

type ContractorMailTemplatesPanelProps = Readonly<{ isDisabled: boolean }>

function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

function toErrorDetails(error: unknown): ReadonlyMap<string, string> {
  return error !== null && typeof error === 'object' && 'details' in error
    ? (error as { details: ReadonlyMap<string, string> }).details
    : new Map()
}

/**
 * Spec 150 T403: a seção "Modelos" da página "E-mail com contratantes". O seletor de tipo vem do
 * catálogo (T402) — sem texto fixo de tipo aqui além do rótulo em pt-BR que a API já devolve.
 */
export function ContractorMailTemplatesPanel({
  isDisabled,
}: ContractorMailTemplatesPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [mailType, setMailType] = useState<ContractorMailTemplateType | undefined>(undefined)
  const [editorMode, setEditorMode] = useState<EditorMode | undefined>(undefined)
  const [archiveTarget, setArchiveTarget] = useState<ContractorMailTemplate | undefined>(undefined)

  /**
   * `mailType` só existe no estado depois que o operador escolhe outro tipo no seletor — antes
   * disso o tipo efetivo é derivado do catálogo a cada render, sem `setState` durante o render.
   */
  const catalogOnlyHook = useContractorMailTemplates({ enabled: true, mailType: undefined })
  const catalog = catalogOnlyHook.catalogQuery.data ?? []
  const effectiveMailType = mailType ?? catalog[0]?.mailType
  const catalogEntry: MailTemplateCatalogEntry | undefined = catalog.find(
    (entry) => entry.mailType === effectiveMailType,
  )
  const templatesHook = useContractorMailTemplates({ enabled: true, mailType: effectiveMailType })

  const templates = templatesHook.templatesQuery.data ?? []
  const editingTemplate =
    editorMode?.kind === 'edit'
      ? templates.find((item) => item.id === editorMode.templateId)
      : undefined

  function closeEditor(): void {
    setEditorMode(undefined)
    templatesHook.previewMutation.reset()
  }

  function handleArchiveConfirm(): void {
    if (archiveTarget === undefined) return
    templatesHook.updateMutation.mutate(
      {
        body: { status: 'archived', version: archiveTarget.version },
        templateId: archiveTarget.id,
      },
      { onSuccess: () => setArchiveTarget(undefined) },
    )
  }

  const isLoading = templatesHook.catalogQuery.isLoading || templatesHook.templatesQuery.isLoading

  return (
    <section
      aria-labelledby="contractor-mail-templates-title"
      className={styles.settingsPanel}
      id="contractor-mail-templates-section"
    >
      <h2 id="contractor-mail-templates-title">{t('mailTemplates.title')}</h2>
      <p className={styles.fieldHint}>{t('mailTemplates.hint')}</p>

      {catalog.length > 1 && (
        <label className={styles.templateTypeField}>
          <span>{t('mailTemplates.typeLabel')}</span>
          <Select
            ariaLabel={t('mailTemplates.typeLabel')}
            onChange={(value) => {
              setMailType(value as ContractorMailTemplateType)
              setEditorMode(undefined)
            }}
            options={catalog.map((entry) => ({ label: entry.label, value: entry.mailType }))}
            value={mailType ?? ''}
          />
        </label>
      )}

      {isLoading ? (
        <SkeletonGroup label={t('mailTemplates.loading')}>
          <Skeleton height="2.5rem" width="100%" />
          <Skeleton height="2.5rem" width="100%" />
        </SkeletonGroup>
      ) : catalogEntry === undefined ? null : (
        <>
          <ul className={styles.templateList}>
            {templates.map((template) => (
              <li className={styles.templateItem} key={template.id}>
                <span className={styles.templateName}>{template.name}</span>
                {template.isDefault && (
                  <span className={`${styles.badge} ${styles.badgeDefault}`}>
                    {t('mailTemplates.default')}
                  </span>
                )}
                {template.status === 'archived' && (
                  <span className={`${styles.badge} ${styles.badgeArchived}`}>
                    {t('mailTemplates.archived')}
                  </span>
                )}
                <div className={styles.templateActions}>
                  <Button
                    disabled={isDisabled}
                    onClick={() => setEditorMode({ kind: 'edit', templateId: template.id })}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="edit" />
                    {t('mailTemplates.edit')}
                  </Button>
                </div>
              </li>
            ))}
            {templates.length === 0 && <li>{t('mailTemplates.empty')}</li>}
          </ul>

          {editorMode === undefined && (
            <div className={styles.actionsRow}>
              <Button
                disabled={isDisabled}
                onClick={() => setEditorMode({ kind: 'default' })}
                type="button"
                variant="secondary"
              >
                <Icon name="add" />
                {t('mailTemplates.createFromDefault')}
              </Button>
              <Button
                disabled={isDisabled}
                onClick={() => setEditorMode({ kind: 'blank' })}
                type="button"
                variant="secondary"
              >
                <Icon name="add" />
                {t('mailTemplates.createBlank')}
              </Button>
            </div>
          )}

          {editorMode !== undefined &&
            (editorMode.kind !== 'edit' || editingTemplate !== undefined) && (
              <ContractorMailTemplateEditor
                catalogEntry={catalogEntry}
                onArchive={() => {
                  if (editingTemplate !== undefined) setArchiveTarget(editingTemplate)
                }}
                onClose={closeEditor}
                onCreate={(body) =>
                  templatesHook.createMutation.mutate(body, { onSuccess: closeEditor })
                }
                onPreview={(content) =>
                  templatesHook.previewMutation.mutate({
                    ...content,
                    mailType: catalogEntry.mailType,
                  })
                }
                onSetDefault={() => {
                  if (editingTemplate !== undefined) {
                    templatesHook.setDefaultMutation.mutate({
                      templateId: editingTemplate.id,
                      version: editingTemplate.version,
                    })
                  }
                }}
                onUpdate={(input) => templatesHook.updateMutation.mutate(input)}
                preview={templatesHook.previewMutation.data}
                previewErrorCode={toErrorCode(templatesHook.previewMutation.error)}
                previewPending={templatesHook.previewMutation.isPending}
                saveErrorCode={toErrorCode(
                  editorMode.kind === 'edit'
                    ? templatesHook.updateMutation.error
                    : templatesHook.createMutation.error,
                )}
                saveErrorDetails={toErrorDetails(
                  editorMode.kind === 'edit'
                    ? templatesHook.updateMutation.error
                    : templatesHook.createMutation.error,
                )}
                savePending={
                  templatesHook.createMutation.isPending || templatesHook.updateMutation.isPending
                }
                seed={
                  editorMode.kind === 'default'
                    ? { ...catalogEntry.suggestedTemplate }
                    : EMPTY_DRAFT
                }
                template={editingTemplate}
              />
            )}
        </>
      )}

      <ArchiveTemplateDialog
        errorCode={toErrorCode(templatesHook.updateMutation.error)}
        isPending={templatesHook.updateMutation.isPending}
        onClose={() => setArchiveTarget(undefined)}
        onConfirm={handleArchiveConfirm}
        template={archiveTarget}
      />
    </section>
  )
}

type ArchiveTemplateDialogProps = Readonly<{
  errorCode: string | undefined
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
  template: ContractorMailTemplate | undefined
}>

function ArchiveTemplateDialog({
  errorCode,
  isPending,
  onClose,
  onConfirm,
  template,
}: ArchiveTemplateDialogProps): JSX.Element | null {
  const { t } = useTranslation('deliveryClients')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: template !== undefined, onClose })

  if (template === undefined) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="mail-template-archive-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="mail-template-archive-title">{t('mailTemplates.archiveDialogTitle')}</h2>
        <p>{t('mailTemplates.archiveDialogWarning', { name: template.name })}</p>
        {errorCode !== undefined && (
          <p className={styles.formStatusError} role="alert">
            {t(contractorMailTemplateErrorLocaleKey(errorCode), { code: errorCode })}
          </p>
        )}
        <footer className={styles.dialogFooter}>
          <Button onClick={onClose} type="button" variant="ghost">
            {t('mailTemplates.archiveDialogCancel')}
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button">
            <Icon name="trash" />
            {t('mailTemplates.archiveDialogConfirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
