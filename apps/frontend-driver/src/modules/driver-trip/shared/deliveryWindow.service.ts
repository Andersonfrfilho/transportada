/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * RF13: o que o cartão da parada diz sobre a janela de entrega. O texto fica com o locale; aqui só
 * se decide qual frase e com que horas — os dois lados, um lado só, ou nada.
 */
export type DeliveryWindowLabel =
  | Readonly<{ end: string; kind: 'between'; start: string }>
  | Readonly<{ kind: 'from'; start: string }>
  | Readonly<{ end: string; kind: 'until' }>

export type DescribeDeliveryWindowParams = Readonly<{
  end: string | null
  start: string | null
  /** Só o teste passa: na tela, vale o fuso do aparelho, como a hora marcada do agendamento. */
  timeZone?: string
}>

function formatTime(instant: string, timeZone: string | undefined): string {
  return new Date(instant).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  })
}

export function describeDeliveryWindow({
  end,
  start,
  timeZone,
}: DescribeDeliveryWindowParams): DeliveryWindowLabel | undefined {
  if (start !== null && end !== null) {
    return { end: formatTime(end, timeZone), kind: 'between', start: formatTime(start, timeZone) }
  }
  if (start !== null) return { kind: 'from', start: formatTime(start, timeZone) }
  if (end !== null) return { end: formatTime(end, timeZone), kind: 'until' }
  return undefined
}
