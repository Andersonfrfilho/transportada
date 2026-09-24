/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { OccurrenceDecisionKind } from '@/modules/shared/portal.types'

type DecisionOption = Readonly<{
  explanation: string
  kind: OccurrenceDecisionKind
  label: string
}>

const DECISION_OPTIONS: readonly DecisionOption[] = [
  {
    explanation: 'A transportadora agenda uma nova tentativa de entrega desta nota.',
    kind: 'redelivery_authorized',
    label: 'Autorizar reentrega',
  },
  {
    explanation: 'Você aceita ser cobrado pelos produtos, sem nova tentativa de entrega.',
    kind: 'goods_paid',
    label: 'Pagar os produtos',
  },
  {
    explanation: 'Outra solução combinada com a transportadora — descreva o motivo abaixo.',
    kind: 'other',
    label: 'Outra solução',
  },
]

type DecisionFormProps = Readonly<{
  isSubmitting: boolean
  onSubmit: (input: { readonly kind: OccurrenceDecisionKind; readonly note: string }) => void
}>

export function DecisionForm({ isSubmitting, onSubmit }: DecisionFormProps) {
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<OccurrenceDecisionKind | null>(null)

  const requiresNote = selected === 'other'
  const canSubmit = selected !== null && (!requiresNote || note.trim() !== '')
  const selectedOption = DECISION_OPTIONS.find((option) => option.kind === selected) ?? null

  function handleSubmit(): void {
    if (selected === null || !canSubmit) return
    onSubmit({ kind: selected, note: note.trim() })
  }

  return (
    <div className="panel">
      <p className="panel__label">O que você decide sobre esta ocorrência?</p>
      {DECISION_OPTIONS.map((option) => (
        <label className="panel__row" key={option.kind}>
          <span>
            <input
              checked={selected === option.kind}
              name="occurrence-decision"
              onChange={() => setSelected(option.kind)}
              type="radio"
              value={option.kind}
            />{' '}
            {option.label}
          </span>
        </label>
      ))}
      {selectedOption !== null && <p className="panel__label">{selectedOption.explanation}</p>}
      {requiresNote && (
        <label>
          <span className="panel__label">Motivo</span>
          <textarea
            aria-invalid={requiresNote && note.trim() === ''}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </label>
      )}
      <button disabled={!canSubmit || isSubmitting} onClick={handleSubmit} type="button">
        Enviar decisão
      </button>
    </div>
  )
}
