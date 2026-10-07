/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoFormIssue } from '../shared/cargoArrivalForm.validation'

const REFUSED_BY_SERVER: CargoFormIssue = { code: 'refusedByServer' }

type FieldIssues = Readonly<Record<string, CargoFormIssue | undefined>>

export type CargoFieldFeedback = Readonly<{
  clearField: (field: string) => void
  issueFor: (field: string) => CargoFormIssue | undefined
  markRefused: (fields: readonly string[]) => void
  setIssues: (issues: FieldIssues) => void
}>

/**
 * O erro de campo vem de dois lugares — a validação antes do envio e a recusa do servidor — e some do
 * mesmo jeito: editar o campo limpa o erro dele, e só o dele (`web.md` §11).
 */
export function useCargoFieldFeedback(): CargoFieldFeedback {
  const [issues, setIssues] = useState<FieldIssues>({})
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
  }
}
