/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'

import {
  CONTRACTOR_REPLY_STAGE,
  listContractorReplyStages,
  type ContractorReplyStage,
} from '../shared/driverContractorReply.service'
import type { DriverRegisteredOccurrence } from '../shared/driverTrip.types'
import styles from '../styles/contractorReplyStatus.module.css'

type DriverContractorReplyStatusProps = Readonly<{
  occurrences: readonly DriverRegisteredOccurrence[] | undefined
}>

const ICON_BY_STAGE: Readonly<Record<ContractorReplyStage, IconName>> = {
  [CONTRACTOR_REPLY_STAGE.DELIVERED]: 'check',
  [CONTRACTOR_REPLY_STAGE.RECEIVED]: 'document',
  [CONTRACTOR_REPLY_STAGE.WAITING]: 'clock',
}

/**
 * Spec 248 T5.4 (RF13): "Pedido enviado à contratante" e o estado simples, na nota que registrou a ocorrência.
 * Só texto e ícone, sem toque: a conversa com o boleto já mora na aba Conversas. Sem dado da API (versão
 * anterior ou nota sem retorno), não renderiza nada.
 */
export function DriverContractorReplyStatus({ occurrences }: DriverContractorReplyStatusProps) {
  const { t } = useTranslation('driverTrip')
  const stages = listContractorReplyStages(occurrences)
  if (stages.length === 0) return null

  return (
    <section aria-label={t('contractorReply.label')} className={styles.contractorReply}>
      <p className={styles.contractorReplyTitle}>{t('contractorReply.sent')}</p>
      <ul className={styles.contractorReplyList}>
        {stages.map((stage) => (
          <li className={styles.contractorReplyStage} key={stage}>
            <Icon aria-hidden="true" name={ICON_BY_STAGE[stage]} size="sm" />
            <span>{t(`contractorReply.stage.${stage}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
