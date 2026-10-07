/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useCargoCasePanelForm } from '../hooks/useCargoCasePanelForm.hook'
import type { CargoCasePanelKind } from '../hooks/useCargoCaseItem.hook'
import { CARGO_CASE_NOTE_MAX_LENGTH } from '../shared/cargoOccurrenceCase.constant'
import { isCaseNoteRequired } from '../shared/cargoOccurrenceCase.service'
import type {
  CargoCaseDecisionKind,
  ChangeCargoCaseInput,
} from '../shared/cargoOccurrenceCase.types'
import styles from '../styles/cargoOccurrence.module.css'

type CargoCasePanelProps = Readonly<{
  decisionKinds: readonly CargoCaseDecisionKind[]
  isPending: boolean
  kind: CargoCasePanelKind
  onCancel: () => void
  onConfirm: (change: Omit<ChangeCargoCaseInput, 'occurrenceId'>) => void
}>

const PANEL_KEY: Readonly<Record<CargoCasePanelKind, string>> = {
  cancel: 'cancel',
  close: 'close',
  decide: 'decide',
  submit: 'submit',
  'warehouse-return': 'warehouseReturn',
}

function DecisionKindField(
  props: Readonly<{
    kind: CargoCaseDecisionKind
    kinds: readonly CargoCaseDecisionKind[]
    onChange: (kind: CargoCaseDecisionKind) => void
  }>,
): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const key = 'occurrence.caseActions.panel.decide'
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldTitle}>{t(`${key}.kindLabel`)}</span>
      <Select
        ariaLabel={t(`${key}.kindLabel`)}
        onChange={(value) => props.onChange(value as CargoCaseDecisionKind)}
        options={props.kinds.map((kind) => ({ label: t(`${key}.kind.${kind}`), value: kind }))}
        value={props.kind}
      />
    </div>
  )
}

/**
 * O painel de uma ação que não se desfaz: diz o que acontece e, onde a API exige, pede o motivo. O botão de confirmar
 * só envia com o motivo escrito (e nunca com espaços). Só confirma quem clica: nada sai ao abrir.
 */
export function CargoCasePanel(props: CargoCasePanelProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { panelRef } = useRevealedPanel<HTMLDivElement>()
  const form = useCargoCasePanelForm(props.kind)
  const titleId = useId()
  const key = `occurrence.caseActions.panel.${PANEL_KEY[props.kind]}`

  return (
    <div
      aria-labelledby={titleId}
      className={styles.markPanel}
      data-case-panel={props.kind}
      ref={panelRef}
      role="group"
    >
      <p className={styles.fieldTitle} id={titleId}>
        {t(`${key}.title`)}
      </p>
      <p className={styles.noteHint}>{t(`${key}.body`)}</p>
      {props.kind === 'decide' ? (
        <DecisionKindField
          kind={form.decisionKind}
          kinds={props.decisionKinds}
          onChange={form.setDecisionKind}
        />
      ) : null}
      {isCaseNoteRequired(props.kind) ? (
        <label>
          {t(`${key}.noteLabel`)}
          <textarea
            maxLength={CARGO_CASE_NOTE_MAX_LENGTH}
            onChange={(event) => form.setNote(event.target.value)}
            value={form.note}
          />
        </label>
      ) : null}
      <div className={styles.panelActions}>
        <Button
          className={styles.noteAction}
          data-case-confirm=""
          disabled={props.isPending || form.isNoteMissing}
          onClick={() => props.onConfirm(form.buildChange())}
          type="button"
        >
          <Icon name="check" />
          {props.isPending ? t('occurrence.caseActions.working') : t(`${key}.confirm`)}
        </Button>
        <Button
          className={styles.noteAction}
          data-case-dismiss=""
          disabled={props.isPending}
          onClick={props.onCancel}
          type="button"
          variant="ghost"
        >
          {t('occurrence.caseActions.dismiss')}
        </Button>
      </div>
    </div>
  )
}
