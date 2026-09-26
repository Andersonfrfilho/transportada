/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702d (P7): o botão "Anexar à ocorrência" sobre a foto que o motorista mandou pela
 * conversa. É a ação autocontida que o módulo `trip` oferece à conversa (padrão da fronteira entre
 * módulos): ele decide o que faz e diz o resultado; a conversa só decide onde ele aparece.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { OccurrenceConversationAttachment } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import {
  TRIP_OCCURRENCE_ATTACHMENTS_QUERY_KEY,
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
} from '../queries/tripOccurrenceFeed.query'
import {
  attachConversationPhotoToOccurrence,
  isConversationPhotoAlreadyAttached,
} from '../shared/conversationPhotoToOccurrence.service'
import { buildOccurrencePhotoAttachment } from '../shared/occurrencePhotoImage.service'
import styles from '../styles/trip.module.css'

async function download(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('CONVERSATION_PHOTO_DOWNLOAD_FAILED')
  return response.blob()
}

export function ConversationPhotoToOccurrenceAction({
  attachment,
  occurrenceId,
  tripDocumentId,
  tripId,
}: Readonly<{
  attachment: OccurrenceConversationAttachment
  occurrenceId: string
  tripDocumentId: string
  tripId: string
}>) {
  const { t } = useTranslation('trip')
  const queryClient = useQueryClient()
  const attach = useMutation({
    mutationFn: () =>
      attachConversationPhotoToOccurrence({
        attach: (input) => getTripClient().attachOccurrencePhoto(input),
        attachment,
        build: buildOccurrencePhotoAttachment,
        download,
        occurrence: { occurrenceId, tripDocumentId, tripId },
      }),
    /**
     * A foto nova aparece no resumo, na linha do tempo e nas fotos da ocorrência — só isso é relido
     * (T903, F9: antes, a invalidação sem chave relia a aplicação inteira).
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
      void queryClient.invalidateQueries({
        queryKey: [TRIP_OCCURRENCE_ATTACHMENTS_QUERY_KEY, occurrenceId],
      })
    },
  })

  /** Spec 183 T903 (F4): a chave é do anexo — já usada é "já anexada", não erro. */
  if (attach.isSuccess || isConversationPhotoAlreadyAttached(attach.error)) {
    return <span className={styles.hint}>{t('occurrenceDetail.conversationPhoto.attached')}</span>
  }
  return (
    <>
      <Button
        disabled={attach.isPending}
        onClick={() => attach.mutate()}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="image" size="sm" />
        {attach.isPending
          ? t('occurrenceDetail.conversationPhoto.attaching')
          : t('occurrenceDetail.conversationPhoto.attach')}
      </Button>
      {attach.isError ? (
        <span className={styles.conversationPhotoError} role="alert">
          {t('occurrenceDetail.conversationPhoto.error')}
        </span>
      ) : null}
    </>
  )
}
