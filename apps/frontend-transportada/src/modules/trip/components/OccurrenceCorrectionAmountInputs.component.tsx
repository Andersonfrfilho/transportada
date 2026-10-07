/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import {
  CORRECTION_AMOUNT_SCOPE,
  type CorrectionAmountScope,
  type CorrectionAmountsDraft,
} from '../shared/occurrenceCorrectionAmounts.service'
import {
  maskRecordedAmount,
  type CorrectionRecordedAmounts,
} from '../shared/occurrenceRecordedAmounts.service'
import { maskAmountInput } from '../shared/occurrenceSettlementMoney.service'
import styles from '../styles/occurrenceCorrectionAmounts.module.css'
import { OccurrenceRecordedField } from './OccurrenceRecordedField.component'

export type OccurrenceCorrectionAmountInputsProps = Readonly<{
  /** O rótulo que o tipo escolheu; ausente é o genérico. */
  amountLabel: string | undefined
  codes: readonly string[]
  draft: CorrectionAmountsDraft
  isByLine: boolean
  /** A soma de cada linha, já formatada, para o rodapé do campo da linha. */
  lineSums: ReadonlyMap<string, string>
  onChange: (draft: CorrectionAmountsDraft) => void
  recorded: CorrectionRecordedAmounts
  scope: CorrectionAmountScope
}>

/** Onde se digita o valor pago: o nível (linhas ou ocorrência) e o campo de cada nível. */
export function OccurrenceCorrectionAmountInputs({
  amountLabel,
  codes,
  draft,
  isByLine,
  lineSums,
  onChange,
  recorded,
  scope,
}: OccurrenceCorrectionAmountInputsProps) {
  const { t } = useTranslation('trip')
  const otherLevelNotice = readOtherLevelNotice({ isByLine, recorded })
  const lineAmountLabel = amountLabel ?? t('occurrenceDetail.correction.amounts.amountLabel')

  function handleLineAmountChange(code: string, text: string) {
    onChange({ ...draft, lineAmounts: new Map(draft.lineAmounts).set(code, maskAmountInput(text)) })
  }

  return (
    <>
      {codes.length > 0 ? (
        <div className={styles.field}>
          <span aria-hidden="true" className={styles.fieldLabel}>
            {t('occurrenceDetail.correction.amounts.scopeTitle')}
          </span>
          <Select
            ariaLabel={t('occurrenceDetail.correction.amounts.scope')}
            onChange={(next) => onChange({ ...draft, scope: next as CorrectionAmountScope })}
            options={Object.values(CORRECTION_AMOUNT_SCOPE).map((option) => ({
              label: t(`occurrenceDetail.correction.amounts.scopes.${option}`),
              value: option,
            }))}
            value={scope}
          />
        </div>
      ) : null}
      {otherLevelNotice === null ? null : <p className={styles.notice}>{t(otherLevelNotice)}</p>}
      {isByLine ? (
        <div className={styles.lines}>
          {codes.map((code) => (
            <OccurrenceRecordedField
              hasRecorded={recorded.lineAmounts.has(code)}
              inputMode="decimal"
              isInvalid={false}
              key={code}
              label={`${code} — ${lineAmountLabel}`}
              onChange={(text) => handleLineAmountChange(code, text)}
              placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
              value={
                draft.lineAmounts.get(code) ?? maskRecordedAmount(recorded.lineAmounts.get(code))
              }
            >
              {lineSums.get(code) === undefined ? null : (
                <span className={styles.sum}>
                  {t('occurrenceDetail.correction.amounts.lineSum', {
                    amount: lineSums.get(code),
                  })}
                </span>
              )}
            </OccurrenceRecordedField>
          ))}
        </div>
      ) : (
        <OccurrenceRecordedField
          hasRecorded={recorded.declaredAmount !== null}
          inputMode="decimal"
          isInvalid={false}
          label={
            amountLabel === undefined
              ? t('occurrenceDetail.correction.amounts.occurrenceAmount')
              : t('occurrenceDetail.correction.amounts.occurrenceAmountTyped', {
                  label: amountLabel,
                })
          }
          onChange={(text) => onChange({ ...draft, occurrenceAmount: maskAmountInput(text) })}
          placeholder={t('occurrenceDetail.correction.amounts.placeholder')}
          value={draft.occurrenceAmount ?? maskRecordedAmount(recorded.declaredAmount)}
        />
      )}
    </>
  )
}

/** O valor gravado no nível que **não** está em uso: avisa que digitar aqui o apaga (só um nível vale por vez). */
function readOtherLevelNotice(
  input: Readonly<{ isByLine: boolean; recorded: CorrectionRecordedAmounts }>,
): null | string {
  const { isByLine, recorded } = input
  if (isByLine && recorded.declaredAmount !== null) {
    return 'occurrenceDetail.correction.amounts.noticeOccurrenceRecorded'
  }
  if (!isByLine && recorded.lineAmounts.size > 0) {
    return 'occurrenceDetail.correction.amounts.noticeLinesRecorded'
  }
  return null
}
