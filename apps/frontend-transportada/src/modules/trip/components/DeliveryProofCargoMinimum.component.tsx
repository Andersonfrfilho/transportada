/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import {
  DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE,
  type DeliveryProofFieldMode,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

const CARGO_MINIMUM_COUNT_OPTIONS = Array.from(
  {
    length:
      DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE.max -
      DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE.min +
      1,
  },
  (_, index) => {
    const count = String(DELIVERY_PROOF_CARGO_MINIMUM_COUNT_RANGE.min + index)
    return { label: count, value: count }
  },
)

type DeliveryProofCargoMinimumProps = Readonly<{
  isDisabled: boolean
  mode: DeliveryProofFieldMode
  onChange: (count: number) => void
  value: number
}>

/**
 * O mínimo é da mercadoria, que acumula (o canhoto aceita 1 e só 1). Some fora de `required`: com
 * `optional` ou `off` a API o ignora, e um controle ativo prometeria uma exigência que não existe.
 * A escolha é de 1 ao teto — não há valor fora da faixa para digitar.
 */
export function DeliveryProofCargoMinimum({
  isDisabled,
  mode,
  onChange,
  value,
}: DeliveryProofCargoMinimumProps) {
  const { t } = useTranslation('trip')

  if (mode !== 'required') return null
  return (
    <label>
      <span className={styles.hint}>{t('deliveryProofSettings.cargoMinimumCount.label')}</span>
      <Select
        ariaLabel={t('deliveryProofSettings.cargoMinimumCount.label')}
        disabled={isDisabled}
        onChange={(selected) => onChange(Number(selected))}
        options={CARGO_MINIMUM_COUNT_OPTIONS}
        value={String(value)}
      />
    </label>
  )
}
