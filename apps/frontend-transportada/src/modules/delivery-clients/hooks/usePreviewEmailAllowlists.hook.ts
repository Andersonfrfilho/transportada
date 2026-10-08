/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useSavePreviewEmailAllowlistsMutation } from '../mutations/useSavePreviewEmailAllowlists.mutation'
import {
  validateAllowlistText,
  type AllowlistIssue,
} from '../shared/previewEmailAllowlist.validation'
import {
  PREVIEW_ALLOWLIST_FIELD,
  PREVIEW_ALLOWLIST_KIND,
  type PreviewAllowlistKind,
  type PreviewEmailSettings,
} from '../shared/previewEmail.types'
import { ContractorDirectoryRequestError } from '../shared/contractorDirectoryRequest.service'
import { describeFieldPaths, type RefusedField } from '../shared/receivingRefusal.service'

type Texts = Readonly<Record<PreviewAllowlistKind, string>>
type IssuesByKind = Readonly<Record<PreviewAllowlistKind, readonly AllowlistIssue[]>>

const KINDS = [PREVIEW_ALLOWLIST_KIND.forwarder, PREVIEW_ALLOWLIST_KIND.sender] as const
const NO_ISSUES: IssuesByKind = { forwarder: [], sender: [] }
const LIST_LINE_SEPARATOR = '\n'
const FIELD_PATH_SEPARATOR = '.'

export type PreviewEmailAllowlistsController = Readonly<{
  errorCode: string | undefined
  isSaved: boolean
  isSaving: boolean
  issues: IssuesByKind
  /** Quais listas a validação local ou a recusa do servidor apontaram, pelo rótulo impresso. */
  refusedFields: readonly RefusedField[]
  setText: (input: Readonly<{ kind: PreviewAllowlistKind; text: string }>) => void
  submit: () => void
  texts: Texts
}>

function toTexts(settings: PreviewEmailSettings): Texts {
  return {
    forwarder: settings.forwarderAllowlist.join(LIST_LINE_SEPARATOR),
    sender: settings.senderAllowlist.join(LIST_LINE_SEPARATOR),
  }
}

function serverRefusedKinds(error: unknown): readonly PreviewAllowlistKind[] {
  if (!(error instanceof ContractorDirectoryRequestError)) return []
  const roots = new Set(error.details.map((detail) => detail.field.split(FIELD_PATH_SEPARATOR)[0]))
  return KINDS.filter((kind) => roots.has(PREVIEW_ALLOWLIST_FIELD[kind]))
}

export function usePreviewEmailAllowlists(
  input: Readonly<{ contractorId: string; settings: PreviewEmailSettings }>,
): PreviewEmailAllowlistsController {
  const mutation = useSavePreviewEmailAllowlistsMutation(input.contractorId)
  const [texts, setTexts] = useState<Texts>(() => toTexts(input.settings))
  const [issues, setIssues] = useState<IssuesByKind>(NO_ISSUES)
  const [refused, setRefused] = useState<readonly PreviewAllowlistKind[]>([])

  const flagged = KINDS.filter((kind) => issues[kind].length > 0 || refused.includes(kind)).map(
    (kind) => PREVIEW_ALLOWLIST_FIELD[kind],
  )

  function setText(change: Readonly<{ kind: PreviewAllowlistKind; text: string }>): void {
    setTexts((current) => ({ ...current, [change.kind]: change.text }))
    setIssues((current) => ({ ...current, [change.kind]: [] }))
    setRefused((current) => current.filter((kind) => kind !== change.kind))
    mutation.reset()
  }

  function submit(): void {
    const checked = {
      forwarder: validateAllowlistText({ kind: 'forwarder', text: texts.forwarder }),
      sender: validateAllowlistText({ kind: 'sender', text: texts.sender }),
    }
    const found = { forwarder: checked.forwarder.issues, sender: checked.sender.issues }
    setIssues(found)
    setRefused([])
    if (found.forwarder.length > 0 || found.sender.length > 0) return
    mutation.mutate(
      { forwarderAllowlist: checked.forwarder.entries, senderAllowlist: checked.sender.entries },
      {
        onError: (error) => setRefused(serverRefusedKinds(error)),
        onSuccess: (saved) => setTexts(toTexts(saved)),
      },
    )
  }

  return {
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    isSaved: mutation.isSuccess,
    isSaving: mutation.isPending,
    issues,
    refusedFields: describeFieldPaths(flagged),
    setText,
    submit,
    texts,
  }
}
