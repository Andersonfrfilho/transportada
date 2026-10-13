/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { useResendContractorReplyRequestMutation } from '../queries/contractorReply.query'
import {
  createResendRequestIdempotencyKey,
  describeResendAction,
  resolveResendErrorKey,
} from '../shared/contractorReply.service'
import type { ContractorReplyView } from '../shared/contractorReply.types'
import styles from '../styles/occurrenceConversation.module.css'

type ContractorReplyResendActionProps = Readonly<{
  occurrenceId: string
  reply: Pick<ContractorReplyView, 'resend' | 'status'>
}>

function newKey(): string {
  return createResendRequestIdempotencyKey(() => crypto.randomUUID())
}

/**
 * Spec 248 RF6: "Reenviar o pedido à contratante". Só nos estados que permitem; fora do intervalo do alarme o botão
 * fica desabilitado com o motivo e a hora em que volta. A chave da tentativa só muda depois de um envio que deu
 * certo: tocar de novo após uma falha de rede reaproveita a chave, e a API devolve o que já gravou.
 */
export function ContractorReplyResendAction({
  occurrenceId,
  reply,
}: ContractorReplyResendActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()
  const mutation = useResendContractorReplyRequestMutation(occurrenceId)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const action = describeResendAction(reply)

  if (action.kind === 'hidden') return null

  const isDisabled = action.kind === 'disabled' || mutation.isPending
  const reasonId = `contractor-reply-resend-reason-${occurrenceId}`
  const failureCode = mutation.error instanceof Error ? mutation.error.message : null

  return (
    <>
      <Button
        aria-describedby={action.kind === 'disabled' ? reasonId : undefined}
        disabled={isDisabled}
        onClick={() =>
          mutation.mutate(idempotencyKey, { onSuccess: () => setIdempotencyKey(newKey()) })
        }
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="send" size="sm" />
        {mutation.isPending
          ? t('contractorReply.resend.sending')
          : t('contractorReply.resend.open')}
      </Button>
      {action.kind === 'disabled' ? (
        <span className={styles.hint} id={reasonId}>
          {action.availableAt === null
            ? t(action.reasonKey)
            : t('contractorReply.resend.tooSoonAt', { moment: formatMoment(action.availableAt) })}
        </span>
      ) : null}
      {mutation.isSuccess ? (
        <span className={styles.hint} role="status">
          {t('contractorReply.resend.sent', { count: mutation.data.recipientCount })}
        </span>
      ) : null}
      {mutation.isError ? (
        <span className={styles.error} role="alert">
          {t(resolveResendErrorKey(failureCode))}
        </span>
      ) : null}
    </>
  )
}
