/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState, type JSX } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useContractorOccurrenceChannel,
  useOccurrenceChannelGroups,
} from '../hooks/useContractorOccurrenceChannel.hook'
import { ContractorOccurrenceChannelRequestError } from '../shared/contractorOccurrenceChannelClient.service'
import {
  OCCURRENCE_CHANNEL_KINDS,
  type ContractorOccurrenceChannel,
  type ContractorOccurrenceChannelGroup,
  type OccurrenceChannelKind,
} from '../shared/contractorOccurrenceChannel.types'
import { isOccurrenceMentionPhoneValid } from '../shared/contractorOccurrenceChannel.validation'
import styles from '../styles/contractorDirectory.module.css'

type ContractorOccurrenceChannelPanelProps = Readonly<{ contractorId: string }>

type Draft = Readonly<{
  channel: OccurrenceChannelKind
  emailFallback: boolean
  groupJid: string
  mentionPhone: string
}>

function toDraft(channel: ContractorOccurrenceChannel): Draft {
  return {
    channel: channel.channel,
    emailFallback: channel.emailFallback,
    groupJid: channel.groupJid ?? '',
    mentionPhone: channel.mentionPhone ?? '',
  }
}

function isDirty(saved: ContractorOccurrenceChannel, draft: Draft): boolean {
  const base = toDraft(saved)
  if (draft.channel !== base.channel || draft.emailFallback !== base.emailFallback) return true
  return (
    draft.channel === 'whatsapp_group' &&
    (draft.groupJid !== base.groupJid || draft.mentionPhone !== base.mentionPhone)
  )
}

/** Grupos livres, ou já desta contratante: quem tem outro dono (motorista ou contratante) não é oferecido. */
export function pickChoosableOccurrenceGroups(
  groups: readonly ContractorOccurrenceChannelGroup[],
  contractorId: string,
): readonly ContractorOccurrenceChannelGroup[] {
  return groups.filter(
    (group) =>
      group.owner === null ||
      (group.owner.kind === 'contractor' && group.owner.id === contractorId),
  )
}

/**
 * Spec 318 T8: por onde o aviso automático da ocorrência chega a esta contratante — e-mail (padrão) ou grupo de
 * WhatsApp, com o número a marcar e o e-mail de reserva. Só `settings.manage` chega aqui (a ficha decide).
 */
export function ContractorOccurrenceChannelPanel({
  contractorId,
}: ContractorOccurrenceChannelPanelProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const titleId = useId()
  const { channelQuery, saveMutation, testMutation } = useContractorOccurrenceChannel({
    contractorId,
  })

  return (
    <section aria-labelledby={titleId} className={styles.form}>
      <header>
        <h4 id={titleId}>{t('occurrenceChannel.title')}</h4>
        <p className={styles.hint}>{t('occurrenceChannel.description')}</p>
      </header>
      {channelQuery.isPending ? (
        <SkeletonGroup label={t('occurrenceChannel.loading')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      ) : channelQuery.isError ? (
        <p className={styles.error} role="alert">
          {t('occurrenceChannel.loadError', { code: channelQuery.error.message })}
        </p>
      ) : (
        <ChannelForm
          channel={channelQuery.data}
          contractorId={contractorId}
          key={channelQuery.data.updatedAt ?? 'unsaved'}
          saveMutation={saveMutation}
          testMutation={testMutation}
        />
      )}
    </section>
  )
}

type ChannelFormProps = Readonly<{
  channel: ContractorOccurrenceChannel
  contractorId: string
  saveMutation: ReturnType<typeof useContractorOccurrenceChannel>['saveMutation']
  testMutation: ReturnType<typeof useContractorOccurrenceChannel>['testMutation']
}>

function errorText(t: TFunction<'contractorDirectory'>, error: unknown): string {
  if (!(error instanceof ContractorOccurrenceChannelRequestError)) {
    return t('occurrenceChannel.errors.default')
  }
  const key = `occurrenceChannel.errors.${error.message}`
  const text = t(key, { defaultValue: '', reason: error.reason ?? '' })
  return text === '' ? t('occurrenceChannel.errors.default') : text
}

function ChannelForm({
  channel,
  contractorId,
  saveMutation,
  testMutation,
}: ChannelFormProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const [draft, setDraft] = useState<Draft>(() => toDraft(channel))
  const [phoneTouched, setPhoneTouched] = useState(false)
  const phoneHintId = useId()
  const isGroup = draft.channel === 'whatsapp_group'
  const groupsQuery = useOccurrenceChannelGroups({ enabled: isGroup })
  const dirty = isDirty(channel, draft)
  const phoneInvalid = isGroup && !isOccurrenceMentionPhoneValid(draft.mentionPhone)
  const groupMissing = isGroup && draft.groupJid === ''
  const canSave = dirty && !phoneInvalid && !groupMissing && !saveMutation.isPending
  const canTest =
    channel.channel === 'whatsapp_group' &&
    !dirty &&
    !testMutation.isPending &&
    !saveMutation.isPending

  const allGroups = groupsQuery.data ?? []
  const choosable = pickChoosableOccurrenceGroups(allGroups, contractorId)
  const hiddenCount = allGroups.length - choosable.length
  const options = choosable.map((group) => ({ label: group.name, value: group.groupJid }))
  if (draft.groupJid !== '' && !options.some((option) => option.value === draft.groupJid)) {
    options.unshift({
      label: channel.groupName === '' ? t('occurrenceChannel.currentGroup') : channel.groupName,
      value: draft.groupJid,
    })
  }
  const selectedGroupName =
    allGroups.find((group) => group.groupJid === draft.groupJid)?.name ?? channel.groupName

  function update(patch: Partial<Draft>): void {
    saveMutation.reset()
    testMutation.reset()
    setDraft((current) => ({ ...current, ...patch }))
  }

  function submit(): void {
    if (!canSave) return
    saveMutation.mutate(
      isGroup
        ? {
            channel: 'whatsapp_group',
            emailFallback: draft.emailFallback,
            groupJid: draft.groupJid,
            groupName: selectedGroupName,
            mentionPhone: draft.mentionPhone.trim(),
          }
        : { channel: 'email', emailFallback: true },
    )
  }

  return (
    <form
      className={styles.channelForm}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className={styles.field}>
        {t('occurrenceChannel.channel')}
        <Select
          ariaLabel={t('occurrenceChannel.channel')}
          onChange={(value) => {
            if ((OCCURRENCE_CHANNEL_KINDS as readonly string[]).includes(value)) {
              update({ channel: value as OccurrenceChannelKind })
            }
          }}
          options={OCCURRENCE_CHANNEL_KINDS.map((kind) => ({
            label: t(`occurrenceChannel.kinds.${kind}`),
            value: kind,
          }))}
          value={draft.channel}
        />
      </label>
      <p className={styles.hint}>
        {t(isGroup ? 'occurrenceChannel.groupHint' : 'occurrenceChannel.emailHint')}
      </p>

      {isGroup ? (
        <>
          <label className={styles.field}>
            {t('occurrenceChannel.group')}
            {groupsQuery.isPending ? (
              <SkeletonGroup label={t('occurrenceChannel.loadingGroups')}>
                <Skeleton height="var(--field-height)" width="100%" />
              </SkeletonGroup>
            ) : (
              <Select
                ariaLabel={t('occurrenceChannel.group')}
                emptyLabel={t('occurrenceChannel.noGroups')}
                onChange={(value) => update({ groupJid: value })}
                options={options}
                placeholder={t('occurrenceChannel.groupPlaceholder')}
                searchPlaceholder={t('occurrenceChannel.groupSearch')}
                value={draft.groupJid}
              />
            )}
          </label>
          {groupsQuery.isError ? (
            <p className={styles.error} role="alert">
              {errorText(t, groupsQuery.error)}
            </p>
          ) : hiddenCount > 0 ? (
            <p className={styles.hint}>
              {t('occurrenceChannel.hiddenTaken', { count: hiddenCount })}
            </p>
          ) : null}

          <label className={styles.field}>
            {t('occurrenceChannel.phone')}
            <input
              aria-describedby={`${phoneHintId}-phone-hint`}
              aria-invalid={phoneTouched && phoneInvalid ? true : undefined}
              autoComplete="off"
              inputMode="tel"
              onBlur={() => setPhoneTouched(true)}
              onChange={(event) => update({ mentionPhone: event.target.value })}
              placeholder={t('occurrenceChannel.phonePlaceholder')}
              type="text"
              value={draft.mentionPhone}
            />
          </label>
          <p
            className={phoneTouched && phoneInvalid ? styles.error : styles.hint}
            id={`${phoneHintId}-phone-hint`}
          >
            {t(
              phoneTouched && phoneInvalid
                ? 'occurrenceChannel.phoneInvalid'
                : 'occurrenceChannel.phoneHint',
            )}
          </p>

          <Checkbox
            checked={draft.emailFallback}
            label={t('occurrenceChannel.emailFallback')}
            onChange={(checked) => update({ emailFallback: checked })}
          />
          <p className={styles.hint}>{t('occurrenceChannel.emailFallbackHint')}</p>
        </>
      ) : null}

      <div className={styles.actions}>
        <Button disabled={!canSave} type="submit">
          <Icon name="save" />
          {saveMutation.isPending ? t('occurrenceChannel.saving') : t('occurrenceChannel.save')}
        </Button>
        {channel.channel === 'whatsapp_group' ? (
          <Button
            disabled={!canTest}
            onClick={() => testMutation.mutate()}
            type="button"
            variant="ghost"
          >
            <Icon name="send" />
            {testMutation.isPending ? t('occurrenceChannel.testing') : t('occurrenceChannel.test')}
          </Button>
        ) : null}
        {saveMutation.isSuccess && !dirty ? (
          <p className={styles.saved}>{t('occurrenceChannel.saved')}</p>
        ) : null}
        {testMutation.isSuccess ? (
          <p className={styles.saved}>{t('occurrenceChannel.testSent')}</p>
        ) : null}
        {saveMutation.isError ? (
          <p className={styles.error} role="alert">
            {errorText(t, saveMutation.error)}
          </p>
        ) : null}
        {testMutation.isError ? (
          <p className={styles.error} role="alert">
            {errorText(t, testMutation.error)}
          </p>
        ) : null}
      </div>
      {channel.channel === 'whatsapp_group' && dirty ? (
        <p className={styles.hint}>{t('occurrenceChannel.saveBeforeTest')}</p>
      ) : null}
    </form>
  )
}
