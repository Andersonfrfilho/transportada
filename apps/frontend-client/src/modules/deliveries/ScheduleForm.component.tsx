/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useScheduleDelivery } from './queries/portal.query'
import type { PortalClient } from '@/modules/shared/portalClient.service'

type ScheduleFormProps = Readonly<{ accessKey: string; client: PortalClient }>

/**
 * O portal **confirma ou recusa** — pedir é movimento da transportadora (ADR-0050 §6). O formulário
 * oferece só os dois, porque oferecer "pedir" deixaria o cliente escrever pendência em nome de quem
 * deveria resolvê-la.
 */
export function ScheduleForm({ accessKey, client }: ScheduleFormProps) {
  const schedule = useScheduleDelivery(client)
  const [scheduledAt, setScheduledAt] = useState('')
  const [protocol, setProtocol] = useState('')
  const [notes, setNotes] = useState('')

  function confirm(): void {
    if (scheduledAt === '') return
    schedule.mutate({
      accessKey,
      notes,
      protocol,
      /** O `datetime-local` devolve hora sem fuso; a API exige deslocamento explícito. */
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: 'confirmed',
    })
  }

  function refuse(): void {
    schedule.mutate({ accessKey, notes, scheduledAt: null, status: 'refused' })
  }

  if (schedule.isSuccess && schedule.data !== null) {
    return (
      <p className="panel__label">
        Agendamento {schedule.data.status === 'confirmed' ? 'confirmado' : 'recusado'}
        {schedule.data.protocol === '' ? '' : ` · protocolo ${schedule.data.protocol}`}
      </p>
    )
  }

  return (
    <div>
      <p className="panel__label">Agendar recebimento</p>
      <label>
        <span className="panel__label">Data e hora</span>
        <input
          onChange={(event) => setScheduledAt(event.target.value)}
          type="datetime-local"
          value={scheduledAt}
        />
      </label>
      <label>
        <span className="panel__label">Protocolo (opcional)</span>
        <input onChange={(event) => setProtocol(event.target.value)} value={protocol} />
      </label>
      <label>
        <span className="panel__label">Observação (opcional)</span>
        <input onChange={(event) => setNotes(event.target.value)} value={notes} />
      </label>
      <div className="nav">
        <button disabled={scheduledAt === '' || schedule.isPending} onClick={confirm} type="button">
          Confirmar
        </button>
        <button className="secondary" disabled={schedule.isPending} onClick={refuse} type="button">
          Recusar data
        </button>
      </div>
      {schedule.isError && <p className="panel__label">Não foi possível agendar agora.</p>}
    </div>
  )
}
