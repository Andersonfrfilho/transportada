/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@/components/ui/tooltip'

import type { TripDocumentDeliveryDeadline } from '../shared/trip.types'
import {
  formatDeliveryDeadlineDate,
  resolveDeliveryDeadlineView,
} from '../shared/tripDeliveryDeadlineView.service'
import styles from '../styles/tripDeliveryDeadline.module.css'

type TripDeliveryDeadlineBadgeProps = Readonly<{
  deadline: TripDocumentDeliveryDeadline
}>

/**
 * Spec 236 RF6: o prazo de entrega da nota, no mesmo lugar e no mesmo molde dos selos do comprovante. Só informa:
 * não é botão, não leva foco e não muda a ação de nenhuma nota. A data de vencimento vai na dica do design system
 * e, para o leitor de tela, no próprio selo.
 */
export function TripDeliveryDeadlineBadge({ deadline }: TripDeliveryDeadlineBadgeProps) {
  const { i18n, t } = useTranslation('trip')
  const view = resolveDeliveryDeadlineView(deadline)
  const date = formatDeliveryDeadlineDate({ language: i18n.language, value: view.dueOn })
  const hint = t('deliveryDeadline.dueOnHint', { date })
  const label =
    view.count === undefined ? t(view.labelKey) : t(view.labelKey, { count: view.count })

  return (
    <Tooltip label={hint}>
      <span
        className={styles.deadlineBadge}
        data-part="delivery-deadline"
        data-state={view.state}
        data-tone={view.tone}
      >
        <span data-part="delivery-deadline-label">{label}</span>
        <span className={styles.visuallyHidden} data-part="delivery-deadline-date">
          {`, ${hint}`}
        </span>
      </span>
    </Tooltip>
  )
}
