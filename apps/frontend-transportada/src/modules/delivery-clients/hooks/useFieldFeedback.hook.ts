/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FormIssue, FormIssues } from '../shared/contractorFormIssue.types'
import { describeFieldPaths, type RefusedField } from '../shared/receivingRefusal.service'

const REFUSED_BY_SERVER: FormIssue = { code: 'refusedByServer' }

export type FieldFeedback = Readonly<{
  clearField: (field: string) => void
  issueFor: (field: string) => FormIssue | undefined
  markRefused: (fields: readonly string[]) => void
  setIssues: (issues: FormIssues) => void
  summary: readonly RefusedField[]
}>

/**
 * O erro de campo vem de dois lugares — a validação antes do envio e a recusa do servidor — e some do
 * mesmo jeito: editar o campo limpa o erro dele, e só o dele (`web.md` §11).
 */
export function useFieldFeedback(): FieldFeedback {
  const [issues, setIssues] = useState<FormIssues>({})
  const [refused, setRefused] = useState<readonly string[]>([])

  return {
    clearField: (field) => {
      setIssues((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)),
      )
      setRefused((current) => current.filter((key) => key !== field))
    },
    issueFor: (field) => issues[field] ?? (refused.includes(field) ? REFUSED_BY_SERVER : undefined),
    markRefused: setRefused,
    setIssues,
    summary: describeFieldPaths([...Object.keys(issues), ...refused]),
  }
}
