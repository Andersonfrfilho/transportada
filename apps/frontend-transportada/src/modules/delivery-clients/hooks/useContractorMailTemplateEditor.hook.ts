/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import {
  insertMailTemplateVariable,
  isItemVariableEnabled,
} from '../shared/mailTemplateVariableInsertion.service'
import {
  validateMailTemplateContent,
  validateMailTemplateName,
  type MailTemplateFieldError,
  type MailTemplateValidationError,
} from '../shared/contractorMailTemplate.validation'
import type {
  ContractorMailTemplate,
  MailTemplateCatalogEntry,
  MailTemplateFieldName,
} from '../shared/contractorMailTemplates.types'

export type MailTemplateDraft = Readonly<{
  closing: string
  intro: string
  itemText: string
  name: string
  subject: string
}>

const EMPTY_DRAFT: MailTemplateDraft = {
  closing: '',
  intro: '',
  itemText: '',
  name: '',
  subject: '',
}

/** `seed` (o padrão sugerido, ou em branco) só vale para criação — editar sempre parte do modelo. */
function draftFromTemplate(
  input: Readonly<{ seed?: MailTemplateDraft; template?: ContractorMailTemplate }>,
): MailTemplateDraft {
  if (input.template !== undefined) {
    const { closing, intro, itemText, name, subject } = input.template
    return { closing, intro, itemText, name, subject }
  }
  return input.seed ?? EMPTY_DRAFT
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement

/**
 * Spec 150 T403: estado do editor de modelo — rascunho, foco por campo (para habilitar/desabilitar
 * a variável de item) e inserção na posição do cursor. `*.component.tsx` só lê o que este hook
 * expõe (`web.md` §4).
 */
export function useContractorMailTemplateEditor(
  input: Readonly<{
    catalogEntry: MailTemplateCatalogEntry
    seed?: MailTemplateDraft
    template?: ContractorMailTemplate
  }>,
) {
  const [draft, setDraft] = useState<MailTemplateDraft>(() => draftFromTemplate(input))
  const [focusedField, setFocusedField] = useState<MailTemplateFieldName | undefined>(undefined)
  const [submitted, setSubmitted] = useState(false)
  const fieldRefs = useRef<Partial<Record<MailTemplateFieldName, FieldElement | null>>>({})

  function registerField(field: MailTemplateFieldName) {
    return (element: FieldElement | null) => {
      fieldRefs.current[field] = element
    }
  }

  function updateField(field: keyof MailTemplateDraft, value: string): void {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  function resetDraft(template?: ContractorMailTemplate): void {
    setDraft(
      draftFromTemplate({
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        ...(template === undefined ? {} : { template }),
      }),
    )
    setSubmitted(false)
  }

  /** RF14: a variável de item só entra quando o foco está no "Texto de cada endereço". */
  function insertVariable(name: string): void {
    if (focusedField === undefined) return
    const element = fieldRefs.current[focusedField]
    const text = draft[focusedField]
    const selectionStart = element?.selectionStart ?? text.length
    const selectionEnd = element?.selectionEnd ?? text.length
    const insertion = insertMailTemplateVariable({ name, selectionEnd, selectionStart, text })
    updateField(focusedField, insertion.text)
    if (element !== null && element !== undefined) {
      requestAnimationFrame(() => {
        element.focus()
        element.setSelectionRange(insertion.cursorPosition, insertion.cursorPosition)
      })
    }
  }

  const nameError = validateMailTemplateName(draft.name)
  const contentErrors = validateMailTemplateContent({
    catalogEntry: input.catalogEntry,
    content: draft,
  })

  function fieldErrors(field: MailTemplateFieldName): readonly MailTemplateFieldError[] {
    return contentErrors.filter((error) => error.field === field)
  }

  const isValid = nameError === undefined && contentErrors.length === 0

  function attemptSubmit(): boolean {
    setSubmitted(true)
    return isValid
  }

  return {
    attemptSubmit,
    contentErrors,
    draft,
    fieldErrors,
    focusedField,
    insertVariable,
    isItemVariableEnabled: isItemVariableEnabled(focusedField),
    isValid,
    nameError,
    registerField,
    resetDraft,
    setFocusedField,
    showErrors: submitted,
    submitted,
    updateField,
  }
}

export type MailTemplateEditorState = ReturnType<typeof useContractorMailTemplateEditor>
export type { MailTemplateFieldError, MailTemplateValidationError }
