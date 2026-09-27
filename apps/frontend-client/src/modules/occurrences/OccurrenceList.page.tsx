/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { useDecideOccurrence, useOccurrences } from '@/modules/deliveries/queries/portal.query'
import { DecisionForm } from './DecisionForm.component'
import { OccurrenceConversation } from './OccurrenceConversation.component'
import {
  decisionLabel,
  isDecidable,
  stageLabel,
  toOccurrenceView,
} from './shared/occurrenceStatus.service'
import { PortalRequestError } from '@/modules/shared/portalClient.service'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import type {
  Occurrence,
  OccurrenceAttachment,
  OccurrenceDecisionKind,
} from '@/modules/shared/portal.types'

const NOTE_REQUIRED_CODE = 'OCCURRENCE_CASE_NOTE_REQUIRED'
const DECISION_CONFLICT_CODE = 'OCCURRENCE_CASE_DECISION_CONFLICT'

type OccurrenceListPageProps = Readonly<{ client: PortalClient }>

export function OccurrenceListPage({ client }: OccurrenceListPageProps) {
  const occurrences = useOccurrences(client)

  if (occurrences.isLoading) {
    return (
      <section className="page">
        <h1 className="page__title">Ocorrências</h1>
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    )
  }

  if (occurrences.error !== null) {
    return (
      <section className="page">
        <h1 className="page__title">Ocorrências</h1>
        <p className="page__subtitle">Não foi possível carregar as ocorrências agora.</p>
        <button onClick={() => void occurrences.refetch()} type="button">
          Tentar de novo
        </button>
      </section>
    )
  }

  const items = occurrences.data ?? []

  return (
    <section className="page">
      <h1 className="page__title">Ocorrências</h1>
      <p className="page__subtitle">
        {items.length === 0
          ? 'Nenhuma ocorrência aberta nas suas notas.'
          : `${items.length} ocorrência(s) registrada(s).`}
      </p>
      {items.map((occurrence) => (
        <OccurrenceCard
          client={client}
          key={occurrence.occurrenceId}
          occurrence={occurrence}
          onRefreshPhotos={() => occurrences.refetch()}
        />
      ))}
    </section>
  )
}

type OccurrenceCardProps = Readonly<{
  client: PortalClient
  occurrence: Occurrence
  onRefreshPhotos: () => Promise<unknown>
}>

function OccurrenceCard({ client, occurrence, onRefreshPhotos }: OccurrenceCardProps) {
  const decide = useDecideOccurrence(client)
  const view = toOccurrenceView(occurrence)

  function submit(input: { readonly kind: OccurrenceDecisionKind; readonly note: string }): void {
    decide.mutate({
      kind: input.kind,
      occurrenceId: occurrence.occurrenceId,
      ...(input.note === '' ? {} : { note: input.note }),
    })
  }

  return (
    <article className="panel">
      <div className="panel__row">
        <div>
          <p className="panel__label">Tipo</p>
          <p className="panel__value">{occurrence.occurrenceTypeName}</p>
        </div>
        <span className={`badge badge--${view.badge}`}>{view.label}</span>
      </div>
      <div className="panel__row">
        <span className="panel__label">{stageLabel(occurrence.stage)}</span>
        <span className="panel__value">
          {new Date(occurrence.openedAt).toLocaleString('pt-BR')}
        </span>
      </div>
      {occurrence.decisionKind !== null && (
        <div className="panel__row">
          <span className="panel__label">Sua decisão</span>
          <span className="panel__value">{decisionLabel(occurrence.decisionKind)}</span>
        </div>
      )}
      {occurrence.attachments.length > 0 && (
        <div className="panel__row">
          {occurrence.attachments.map((attachment) => (
            <OccurrencePhoto
              attachment={attachment}
              key={attachment.id}
              onRetry={onRefreshPhotos}
            />
          ))}
        </div>
      )}
      {isDecidable(occurrence) && (
        <DecisionForm isSubmitting={decide.isPending} onSubmit={submit} />
      )}
      {decide.isError && (
        <p className="panel__label">
          {describeDecisionError(
            decide.error instanceof PortalRequestError ? decide.error.code : '',
          )}
        </p>
      )}
      {occurrence.conversationRef !== null && (
        <OccurrenceConversation
          client={client}
          conversationRef={occurrence.conversationRef}
          unreadCount={occurrence.conversationUnreadCount}
        />
      )}
    </article>
  )
}

function describeDecisionError(code: string): string {
  if (code === DECISION_CONFLICT_CODE) {
    return 'Esta ocorrência já foi decidida com outra opção — não é possível mudar agora.'
  }
  if (code === NOTE_REQUIRED_CODE) {
    return 'Para "Outra solução" é preciso escrever o motivo.'
  }

  return 'Não foi possível registrar sua decisão agora.'
}

type PhotoStatus = 'failed' | 'loaded' | 'loading'

type OccurrencePhotoProps = Readonly<{
  attachment: OccurrenceAttachment
  onRetry: () => Promise<unknown>
}>

/**
 * A URL assinada vence em 5 minutos. Uma falha de carregamento tenta buscar a lista de novo (o
 * `refetch` traz URL nova) **uma vez** antes de admitir falha de verdade — sem isso a miniatura
 * fica "não foi possível carregar" para sempre, como já mordeu no painel interno.
 */
function OccurrencePhoto({ attachment, onRetry }: OccurrencePhotoProps) {
  const [status, setStatus] = useState<PhotoStatus>('loading')
  const [hasAutoRetried, setHasAutoRetried] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setStatus('loading')
    setHasAutoRetried(false)
  }, [attachment.thumbnailUrl])

  if (attachment.expired) {
    return <p className="panel__label">Foto expirada</p>
  }

  if (attachment.thumbnailUrl === null) {
    return <p className="panel__label">Sem miniatura disponível</p>
  }

  function retry(): void {
    setHasAutoRetried(false)
    setStatus('loading')
    void onRetry()
  }

  function handleError(): void {
    if (hasAutoRetried) {
      setStatus('failed')
      return
    }
    setHasAutoRetried(true)
    void onRetry()
  }

  if (status === 'failed') {
    return (
      <div>
        <p className="panel__label">Não foi possível carregar a foto.</p>
        <button className="secondary" onClick={retry} type="button">
          Tentar de novo
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        aria-label={`Ver foto ${attachment.position} em tamanho original`}
        className="occurrence-photo-button"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <img
          alt={`Foto ${attachment.position} da ocorrência`}
          className="occurrence-photo"
          onError={handleError}
          onLoad={() => setStatus('loaded')}
          src={attachment.thumbnailUrl}
        />
      </button>
      {isOpen && (
        <OccurrenceOriginalPhoto
          attachment={attachment}
          onClose={() => setIsOpen(false)}
          onRetry={onRetry}
        />
      )}
    </div>
  )
}

type OccurrenceOriginalPhotoProps = Readonly<{
  attachment: OccurrenceAttachment
  onClose: () => void
  onRetry: () => Promise<unknown>
}>

function OccurrenceOriginalPhoto({ attachment, onClose, onRetry }: OccurrenceOriginalPhotoProps) {
  const [status, setStatus] = useState<PhotoStatus>('loading')
  const [hasAutoRetried, setHasAutoRetried] = useState(false)

  useEffect(() => {
    setStatus('loading')
    setHasAutoRetried(false)
  }, [attachment.downloadUrl])

  if (attachment.downloadUrl === null) {
    return <p className="panel__label">Foto original indisponível</p>
  }

  function handleError(): void {
    if (hasAutoRetried) {
      setStatus('failed')
      return
    }
    setHasAutoRetried(true)
    void onRetry()
  }

  return (
    <div className="panel">
      <div className="panel__row">
        <p className="panel__label">Foto original</p>
        <button className="secondary" onClick={onClose} type="button">
          Fechar
        </button>
      </div>
      {status === 'failed' ? (
        <div>
          <p className="panel__label">Não foi possível carregar a foto.</p>
          <button
            className="secondary"
            onClick={() => {
              setHasAutoRetried(false)
              setStatus('loading')
              void onRetry()
            }}
            type="button"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <img
          alt={`Foto original ${attachment.position} da ocorrência`}
          className="occurrence-photo occurrence-photo--large"
          onError={handleError}
          onLoad={() => setStatus('loaded')}
          src={attachment.downloadUrl}
        />
      )}
    </div>
  )
}
