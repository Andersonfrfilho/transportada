/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { AllowlistIssue } from '../shared/previewEmailAllowlist.validation'
import {
  PREVIEW_ALLOWLIST_FIELD,
  PREVIEW_EMAIL_ALLOWLIST_LIMITS as LIMITS,
  type PreviewAllowlistKind,
} from '../shared/previewEmail.types'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'

const NOT_VISIBLE_ASCII = /[^\x21-\x7e]/gu

/** A entrada recusada pode ter bidi ou zero-width: ela nunca é desenhada crua, para não embaralhar a própria mensagem. */
function printableEntry(entry: string): string {
  return entry.replace(NOT_VISIBLE_ASCII, '?')
}

type PreviewEmailListFieldProps = Readonly<{
  isDisabled: boolean
  issues: readonly AllowlistIssue[]
  kind: PreviewAllowlistKind
  onChange: (text: string) => void
  value: string
}>

/**
 * Uma lista por campo, uma entrada por linha. Cada entrada inválida vira uma linha de erro que a nomeia
 * (`aria-invalid` + `aria-describedby`, `web.md` §11); o `data-field` é o atalho do aviso de recusa.
 */
export function PreviewEmailListField({
  isDisabled,
  issues,
  kind,
  onChange,
  value,
}: PreviewEmailListFieldProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const baseId = useId()
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`
  const hasIssues = issues.length > 0

  return (
    <div className={styles.fieldGroup}>
      <label className={`${styles.field} ${previewStyles.listField}`}>
        {t(`lists.${kind}.label`)}
        <textarea
          aria-describedby={hasIssues ? `${hintId} ${errorId}` : hintId}
          aria-invalid={hasIssues ? true : undefined}
          autoCapitalize="off"
          autoComplete="off"
          data-field={PREVIEW_ALLOWLIST_FIELD[kind]}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          rows={5}
          spellCheck={false}
          value={value}
        />
      </label>
      <p className={styles.hint} id={hintId}>
        {t(`lists.${kind}.hint`)}
      </p>
      {hasIssues ? (
        <ul className={`${styles.error} ${previewStyles.issueList}`} id={errorId} role="alert">
          {issues.map((issue) => (
            <li key={`${issue.code}:${issue.entry}`}>
              {t(`issues.${issue.code}`, {
                entry: printableEntry(issue.entry),
                max: issue.code === 'tooMany' ? LIMITS.maxEntries : LIMITS.entryMaxLength,
                min: LIMITS.entryMinLength,
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
