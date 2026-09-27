/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useQuickRepliesQuery, useQuickReplyMutations } from '../queries/quickReplies.query'
import type { QuickReply, QuickReplyAudience } from '../shared/occurrenceConversation.types'
import {
  moveQuickReply,
  QUICK_REPLY_MAX_LENGTH,
  quickRepliesOf,
  validateQuickReplyDraft,
} from '../shared/quickReplies.service'
import styles from '../styles/occurrenceConversation.module.css'

const AUDIENCES: readonly QuickReplyAudience[] = ['contractor', 'driver']

type Mutations = ReturnType<typeof useQuickReplyMutations>

function QuickReplyRow({
  isFirst,
  isLast,
  mutations,
  onMove,
  reply,
}: Readonly<{
  isFirst: boolean
  isLast: boolean
  mutations: Mutations
  onMove: (direction: 'down' | 'up') => void
  reply: QuickReply
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [draft, setDraft] = useState<null | string>(null)
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)

  function save(): void {
    const validated = validateQuickReplyDraft(draft ?? '')
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    mutations.update.mutate(
      { id: reply.id, text: validated.text },
      { onSuccess: () => setDraft(null) },
    )
  }

  return (
    <li className={[styles.quickReplyRow, reply.active ? '' : styles.quickReplyInactive].join(' ')}>
      {draft === null ? (
        <p className={styles.quickReplyText}>{reply.text}</p>
      ) : (
        <label className={styles.field}>
          <span>{t('quickReplies.text')}</span>
          <textarea
            maxLength={QUICK_REPLY_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            value={draft}
          />
          {error === null ? null : (
            <span className={styles.error}>{t(`quickReplies.error.${error}`)}</span>
          )}
        </label>
      )}
      <div className={styles.quickReplyActions}>
        <Checkbox
          checked={reply.active}
          disabled={mutations.update.isPending}
          label={t('quickReplies.active')}
          onChange={(active) => mutations.update.mutate({ active, id: reply.id })}
        />
        <Button
          aria-label={t('quickReplies.moveUp')}
          disabled={isFirst || mutations.reorder.isPending}
          onClick={() => onMove('up')}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="arrow-up" />
        </Button>
        <Button
          aria-label={t('quickReplies.moveDown')}
          disabled={isLast || mutations.reorder.isPending}
          onClick={() => onMove('down')}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="arrow-down" />
        </Button>
        {draft === null ? (
          <Button onClick={() => setDraft(reply.text)} size="sm" type="button" variant="secondary">
            {t('quickReplies.edit')}
          </Button>
        ) : (
          <>
            <Button disabled={mutations.update.isPending} onClick={save} size="sm" type="button">
              {t('quickReplies.save')}
            </Button>
            <Button onClick={() => setDraft(null)} size="sm" type="button" variant="ghost">
              {t('quickReplies.cancel')}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

function AudienceSection({
  audience,
  mutations,
  replies,
}: Readonly<{
  audience: QuickReplyAudience
  mutations: Mutations
  replies: readonly QuickReply[]
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  const ids = replies.map((reply) => reply.id)

  function add(): void {
    const validated = validateQuickReplyDraft(draft)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    mutations.create.mutate({ audience, text: validated.text }, { onSuccess: () => setDraft('') })
  }

  return (
    <section className={styles.panel} aria-label={t(`quickReplies.audience.${audience}`)}>
      <div className={styles.panelHead}>
        <h3>{t(`quickReplies.audience.${audience}`)}</h3>
      </div>
      {replies.length === 0 ? (
        <p className={styles.hint}>{t('quickReplies.empty')}</p>
      ) : (
        <ol className={styles.quickReplyList}>
          {replies.map((reply, index) => (
            <QuickReplyRow
              isFirst={index === 0}
              isLast={index === replies.length - 1}
              key={reply.id}
              mutations={mutations}
              onMove={(direction) =>
                mutations.reorder.mutate({
                  audience,
                  ids: [...moveQuickReply(ids, reply.id, direction)],
                })
              }
              reply={reply}
            />
          ))}
        </ol>
      )}
      <form
        className={styles.panel}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <label className={styles.field}>
          <span>{t(`quickReplies.new.${audience}`)}</span>
          <textarea
            disabled={mutations.create.isPending}
            maxLength={QUICK_REPLY_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            value={draft}
          />
          {error === null ? (
            <span className={styles.hint}>{t('quickReplies.limit')}</span>
          ) : (
            <span className={styles.error}>{t(`quickReplies.error.${error}`)}</span>
          )}
        </label>
        <div className={styles.footer}>
          <Button disabled={mutations.create.isPending} type="submit">
            {t('quickReplies.add')}
          </Button>
        </div>
      </form>
    </section>
  )
}

/**
 * Spec 183 T701 (RF12): o cadastro das respostas rápidas, autocontido — a tela de Configurações só
 * decide quando mostrá-lo (padrão `NfseEmissionAction`). Uma lista por público, na ordem em que o
 * compositor da aba as oferece; desativar tira do compositor sem apagar.
 */
export function QuickRepliesSettingsPanel({ enabled }: Readonly<{ enabled: boolean }>) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useQuickRepliesQuery({ enabled })
  const mutations = useQuickReplyMutations()
  const failed = mutations.create.isError || mutations.update.isError || mutations.reorder.isError

  if (query.isLoading) {
    return (
      <SkeletonGroup label={t('quickReplies.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="8rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (query.isError) {
    return (
      <p className={styles.hint} role="alert">
        {t('quickReplies.loadError')}
      </p>
    )
  }

  const replies = query.data ?? []
  return (
    <div className={styles.panel}>
      <p className={styles.hint}>{t('quickReplies.description')}</p>
      {failed ? (
        <p className={styles.error} role="alert">
          {t('quickReplies.error.save')}
        </p>
      ) : null}
      {AUDIENCES.map((audience) => (
        <AudienceSection
          audience={audience}
          key={audience}
          mutations={mutations}
          replies={quickRepliesOf(replies, audience)}
        />
      ))}
    </div>
  )
}
