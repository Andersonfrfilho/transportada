/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import {
  CHANNEL_ICONS,
  CONVERSATION_PARTICIPANTS,
} from '../shared/conversationParticipant.constant'
import { OCCURRENCE_CONVERSATION_CHANNELS } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceThread.module.css'
import { ParticipantBadge } from './ParticipantBadge.component'

/** Mini-guia recolhível: quem é cada cor/ícone e por onde cada mensagem foi (ícone + palavra + dica). */
export function OccurrenceConversationLegend() {
  const { t } = useTranslation('occurrenceConversation')
  const [isOpen, setOpen] = useState(true)
  const bodyId = useId()

  return (
    <section aria-label={t('legend.title')} className={styles.legend}>
      <Button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        onClick={() => setOpen((open) => !open)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size="sm" />
        {isOpen ? t('legend.hide') : t('legend.show')}
      </Button>
      {isOpen ? (
        <div className={styles.legendBody} id={bodyId}>
          <ul aria-label={t('legend.participants')} className={styles.legendList}>
            {CONVERSATION_PARTICIPANTS.map((participant) => (
              <li key={participant}>
                <Tooltip label={participant === 'operator' ? t('legend.operatorHint') : ''}>
                  <ParticipantBadge participant={participant} />
                </Tooltip>
              </li>
            ))}
          </ul>
          <ul aria-label={t('legend.channels')} className={styles.legendList}>
            {OCCURRENCE_CONVERSATION_CHANNELS.map((channel) => (
              <li key={channel}>
                <Tooltip label={t(`legend.channelHint.${channel}`)}>
                  <span className={styles.channel}>
                    <Icon name={CHANNEL_ICONS[channel]} size="sm" />
                    {t(`channel.${channel}`)}
                  </span>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
