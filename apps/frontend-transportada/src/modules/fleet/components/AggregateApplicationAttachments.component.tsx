/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'

import { useAggregateApplicationAttachments } from '../hooks/useAggregateApplicationAttachments.hook'
import {
  ATTACHMENT_FIELD_LABEL,
  listAttachmentDivergences,
} from '../shared/attachmentDivergence.service'
import type { AggregateApplication } from '../shared/aggregateApplicationClient.service'
import styles from '../styles/fleet.module.css'

type AggregateApplicationAttachmentsProps = Readonly<{ application: AggregateApplication }>

/**
 * Os anexos só são buscados quando o operador abre o painel: a lista de candidaturas traz dezenas de
 * linhas, e uma requisição por linha ao abrir a aba seria custo pago por quem nem vai revisar.
 */
export function AggregateApplicationAttachments({
  application,
}: AggregateApplicationAttachmentsProps): ReactNode {
  const { t } = useTranslation('fleet')
  const [isOpen, setIsOpen] = useState(false)
  const [rejecting, setRejecting] = useState<Readonly<{ id: string; reason: string }> | null>(null)
  const { openAttachment, query, reviewMutation } = useAggregateApplicationAttachments({
    applicationId: isOpen ? application.id : null,
  })

  const attachments = query.data ?? []

  return (
    <details onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>{t('applications.attachments.toggle')}</summary>
      {query.isLoading ? (
        /* Esqueleto com a forma do bloco real: parágrafo "Carregando…" faz a tela piscar na troca. */
        <div className={styles.applicationAttachment}>
          <Skeleton height="var(--space-4)" width="40%" />
          <Skeleton height="var(--space-4)" width="70%" />
        </div>
      ) : null}
      {!query.isLoading && attachments.length === 0 ? (
        <p>{t('applications.attachments.empty')}</p>
      ) : null}
      {attachments.map((attachment) => {
        const divergences = listAttachmentDivergences({ application, attachment })
        /**
         * Três estados, não dois: "não reconheci nada" e "descartei depois de revisar" chegam os
         * dois como `extractedFields: null`, e chamá-los pelo mesmo nome faria a tela dizer que
         * falhou em ler um documento que ela leu — o operador iria abrir o arquivo à toa.
         */
        const readingNotice =
          attachment.extractedFields !== null
            ? null
            : attachment.status === 'pending'
              ? t('applications.attachments.notRead')
              : t('applications.attachments.discarded')
        return (
          <div className={styles.applicationAttachment} key={attachment.id}>
            <p>
              <strong>{t(`applications.attachments.types.${attachment.type}`)}</strong>{' '}
              {t(`applications.attachments.status.${attachment.status}`)}
            </p>

            {readingNotice !== null ? (
              /* Estado próprio: sem leitura não há conferência, e isso **não** é "confere". */
              <p>{readingNotice}</p>
            ) : divergences.length === 0 ? (
              <p>{t('applications.attachments.matches')}</p>
            ) : (
              <ul>
                {divergences.map((divergence) => (
                  <li key={divergence.field}>
                    {ATTACHMENT_FIELD_LABEL[divergence.field] ?? divergence.field}:{' '}
                    {t('applications.attachments.declaredLabel')} {divergence.declared} ·{' '}
                    {t('applications.attachments.readLabel')} {divergence.read}
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={() => void openAttachment(attachment.id)}>
              {t('applications.attachments.openButton')}
            </button>

            {attachment.status === 'pending' ? (
              <>
                <button
                  disabled={reviewMutation.isPending}
                  type="button"
                  onClick={() =>
                    reviewMutation.mutate({
                      attachmentId: attachment.id,
                      decision: 'approved',
                      rejectionReason: '',
                    })
                  }
                >
                  {t('applications.attachments.approveButton')}
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting({ id: attachment.id, reason: '' })}
                >
                  {t('applications.attachments.rejectButton')}
                </button>
              </>
            ) : null}

            {rejecting?.id === attachment.id ? (
              <div>
                <label>
                  <span>{t('applications.attachments.reasonLabel')}</span>
                  <input
                    type="text"
                    value={rejecting.reason}
                    onChange={(event) =>
                      setRejecting({ id: attachment.id, reason: event.target.value })
                    }
                  />
                </label>
                <button
                  /* Recusa sem motivo deixa quem enviou sem saber o que corrigir — a API recusa
                     também, mas travar aqui poupa a ida e devolve o erro onde ele se conserta. */
                  disabled={rejecting.reason.trim() === '' || reviewMutation.isPending}
                  type="button"
                  onClick={() => {
                    reviewMutation.mutate({
                      attachmentId: attachment.id,
                      decision: 'rejected',
                      rejectionReason: rejecting.reason.trim(),
                    })
                    setRejecting(null)
                  }}
                >
                  {t('applications.attachments.confirmRejectButton')}
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </details>
  )
}
