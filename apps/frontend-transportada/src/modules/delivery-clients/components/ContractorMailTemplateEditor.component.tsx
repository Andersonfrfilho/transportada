/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { focusFieldByLabel } from '@/modules/shared/focusFieldByLabel.service'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useContractorMailTemplateEditor } from '../hooks/useContractorMailTemplateEditor.hook'
import { contractorMailTemplateErrorLocaleKey } from '../shared/contractorMailTemplateErrors.service'
import type { MailTemplateDraft } from '../hooks/useContractorMailTemplateEditor.hook'
import type {
  ContractorMailTemplateCreateBody,
  ContractorMailTemplateUpdateBody,
} from '../shared/contractorMailTemplatesClient.service'
import type {
  ContractorMailTemplate,
  MailTemplateCatalogEntry,
  MailTemplateFieldName,
  MailTemplatePreviewResult,
} from '../shared/contractorMailTemplates.types'
import styles from '../styles/contractorMailSettings.module.css'

const FIELD_LABEL_KEY: Readonly<Record<MailTemplateFieldName, string>> = {
  closing: 'mailTemplates.field.closing',
  intro: 'mailTemplates.field.intro',
  itemText: 'mailTemplates.field.itemText',
  subject: 'mailTemplates.field.subject',
}

type ContractorMailTemplateEditorProps = Readonly<{
  catalogEntry: MailTemplateCatalogEntry
  onArchive: () => void
  onClose: () => void
  onCreate: (body: ContractorMailTemplateCreateBody) => void
  onPreview: (content: MailTemplateDraft) => void
  onSetDefault: () => void
  onUpdate: (
    input: Readonly<{ body: ContractorMailTemplateUpdateBody; templateId: string }>,
  ) => void
  preview: MailTemplatePreviewResult | undefined
  previewErrorCode: string | undefined
  previewPending: boolean
  savePending: boolean
  saveErrorCode: string | undefined
  saveErrorDetails: ReadonlyMap<string, string>
  seed: MailTemplateDraft
  template: ContractorMailTemplate | undefined
}>

/**
 * Spec 150 T403: editor de um modelo — nome, campos de texto com variáveis, prévia e as ações de
 * salvar, tornar padrão e arquivar. `seed` é o ponto de partida ("a partir do padrão" ou "em
 * branco"); `template` presente é edição, ausente é criação.
 */
export function ContractorMailTemplateEditor(
  props: ContractorMailTemplateEditorProps,
): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const editor = useContractorMailTemplateEditor({
    catalogEntry: props.catalogEntry,
    seed: props.seed,
    ...(props.template === undefined ? {} : { template: props.template }),
  })
  const { panelRef } = useRevealedPanel<HTMLDivElement>()
  const isArchived = props.template?.status === 'archived'
  const isDisabled = isArchived || props.savePending
  const draft = editor.draft

  function handleSubmit(): void {
    if (!editor.attemptSubmit()) return
    if (props.template === undefined) {
      props.onCreate({ ...draft, mailType: props.catalogEntry.mailType })
      return
    }
    props.onUpdate({
      body: { ...draft, version: props.template.version },
      templateId: props.template.id,
    })
  }

  const serverFieldLabels = [...props.saveErrorDetails.keys()].map((field) =>
    field in FIELD_LABEL_KEY || field === 'name'
      ? t(
          field === 'name'
            ? 'mailTemplates.field.name'
            : FIELD_LABEL_KEY[field as MailTemplateFieldName],
        )
      : field,
  )

  return (
    <div className={styles.settingsPanel} ref={panelRef}>
      <h3>
        {props.template === undefined ? t('mailTemplates.newTitle') : t('mailTemplates.editTitle')}
      </h3>

      <div className={styles.editorLayout}>
        <div className={styles.editorGrid}>
          <label>
            <span>{t('mailTemplates.field.name')}</span>
            <input
              disabled={isDisabled}
              onChange={(event) => editor.updateField('name', event.target.value)}
              value={draft.name}
            />
            {(editor.showErrors && editor.nameError !== undefined) ||
            props.saveErrorDetails.has('name') ? (
              <p className={styles.formStatusError} role="alert">
                {t(
                  editor.nameError !== undefined
                    ? `mailTemplates.validation.${editor.nameError}`
                    : 'mailTemplates.field.name',
                )}
              </p>
            ) : null}
          </label>

          {(['subject', 'intro', 'itemText', 'closing'] as const).map((field) => (
            <label key={field}>
              <span>{t(FIELD_LABEL_KEY[field])}</span>
              <textarea
                disabled={isDisabled}
                onBlur={() => editor.setFocusedField(undefined)}
                onChange={(event) => editor.updateField(field, event.target.value)}
                onFocus={() => editor.setFocusedField(field)}
                ref={editor.registerField(field)}
                rows={field === 'subject' ? 2 : 5}
                value={draft[field]}
              />
              {field === 'itemText' && (
                <p className={styles.fieldHint}>{t('mailTemplates.itemTextHint')}</p>
              )}
              {editor.showErrors &&
                editor.fieldErrors(field).map((error) => (
                  <p className={styles.formStatusError} key={error.message} role="alert">
                    {t(`mailTemplates.validation.${error.message}`)}
                  </p>
                ))}
            </label>
          ))}
        </div>

        <aside className={styles.variablesPanel} aria-labelledby="mail-template-variables-title">
          <h4 id="mail-template-variables-title">{t('mailTemplates.variablesTitle')}</h4>

          <div className={styles.variablesGroup}>
            <p className={styles.fieldHint}>{t('mailTemplates.mailVariablesTitle')}</p>
            {props.catalogEntry.mailVariables.map((variable) => (
              <VariableRow
                disabled={editor.focusedField === undefined || isDisabled}
                key={variable.name}
                onInsert={() => editor.insertVariable(variable.name)}
                variable={variable}
              />
            ))}
          </div>

          <div className={styles.variablesGroup}>
            <p className={styles.fieldHint}>{t('mailTemplates.itemVariablesTitle')}</p>
            {!editor.isItemVariableEnabled && (
              <p className={styles.fieldHint}>{t('mailTemplates.itemVariablesDisabledHint')}</p>
            )}
            {props.catalogEntry.itemVariables.map((variable) => (
              <VariableRow
                disabled={!editor.isItemVariableEnabled || isDisabled}
                key={variable.name}
                onInsert={() => editor.insertVariable(variable.name)}
                variable={variable}
              />
            ))}
          </div>
        </aside>
      </div>

      {serverFieldLabels.length > 0 && (
        <p className={styles.formStatusError} role="alert">
          {`${t('mailTemplates.invalidFieldsLead')} `}
          {serverFieldLabels.map((label, index) => (
            <Fragment key={label}>
              {index === 0 ? null : ', '}
              <button
                className={styles.invalidField}
                onClick={() => focusFieldByLabel({ label, panel: panelRef.current })}
                type="button"
              >
                {label}
              </button>
            </Fragment>
          ))}
        </p>
      )}
      {props.saveErrorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t(contractorMailTemplateErrorLocaleKey(props.saveErrorCode), {
            code: props.saveErrorCode,
          })}
        </p>
      )}

      <MailTemplatePreview
        content={draft}
        onPreview={() => props.onPreview(draft)}
        preview={props.preview}
        previewErrorCode={props.previewErrorCode}
        previewPending={props.previewPending}
      />

      <div className={styles.actionsRow}>
        <Button disabled={isDisabled} onClick={handleSubmit} type="button">
          <Icon name="save" />
          {t('mailTemplates.save')}
        </Button>
        {props.template !== undefined && !isArchived && !props.template.isDefault && (
          <Button onClick={props.onSetDefault} type="button" variant="secondary">
            <Icon name="check" />
            {t('mailTemplates.setDefault')}
          </Button>
        )}
        {props.template !== undefined && !isArchived && (
          <Button onClick={props.onArchive} type="button" variant="secondary">
            <Icon name="trash" />
            {t('mailTemplates.archive')}
          </Button>
        )}
        <Button onClick={props.onClose} type="button" variant="ghost">
          <Icon name="close" />
          {t('mailTemplates.cancel')}
        </Button>
      </div>
    </div>
  )
}

type VariableRowProps = Readonly<{
  disabled: boolean
  onInsert: () => void
  variable: Readonly<{ description: string; name: string }>
}>

function VariableRow({ disabled, onInsert, variable }: VariableRowProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  return (
    <div className={styles.variableRow}>
      <Tooltip label={variable.description}>
        <span className={styles.variableName}>{`{${variable.name}}`}</span>
      </Tooltip>
      <Button disabled={disabled} onClick={onInsert} size="sm" type="button" variant="ghost">
        <Icon name="add" />
        {t('mailTemplates.insert')}
      </Button>
    </div>
  )
}

type MailTemplatePreviewProps = Readonly<{
  content: MailTemplateDraft
  onPreview: () => void
  preview: MailTemplatePreviewResult | undefined
  previewErrorCode: string | undefined
  previewPending: boolean
}>

function MailTemplatePreview(props: MailTemplatePreviewProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')

  return (
    <section aria-labelledby="mail-template-preview-title">
      <h4 id="mail-template-preview-title">{t('mailTemplates.previewTitle')}</h4>
      <Button
        disabled={props.previewPending}
        onClick={props.onPreview}
        type="button"
        variant="secondary"
      >
        <Icon name="eye" />
        {t('mailTemplates.preview')}
      </Button>
      {props.previewErrorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t(contractorMailTemplateErrorLocaleKey(props.previewErrorCode), {
            code: props.previewErrorCode,
          })}
        </p>
      )}
      {props.preview !== undefined && (
        <>
          <p>
            <strong>{t('mailTemplates.previewSubjectLabel')}</strong> {props.preview.subject}
          </p>
          <iframe
            className={styles.previewFrame}
            sandbox=""
            srcDoc={props.preview.html}
            title={t('mailTemplates.previewFrameTitle')}
          />
          <p className={styles.previewText}>{props.preview.text}</p>
        </>
      )}
    </section>
  )
}
