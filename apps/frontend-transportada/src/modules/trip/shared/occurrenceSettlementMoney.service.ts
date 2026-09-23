/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 164 T23 (RF22): dinheiro do acerto é `numeric(14,4)` no banco — a soma na tela nunca passa
 * por `number`/float binário. `BigInt` escalado por 10 000 (quatro casas) faz a conta inteira em
 * inteiro, e só volta a texto decimal no fim.
 */
const SCALE = 10_000n

function toScaled(amount: string): bigint {
  const trimmed = amount.trim()
  if (trimmed.length === 0 || !/^\d+(\.\d{1,4})?$/u.test(trimmed)) return 0n
  const parts = trimmed.split('.')
  const whole = parts[0] ?? '0'
  const fraction = (parts[1] ?? '').padEnd(4, '0')
  return BigInt(whole) * SCALE + BigInt(fraction)
}

function fromScaled(scaled: bigint): string {
  const whole = scaled / SCALE
  const fraction = (scaled % SCALE).toString().padStart(4, '0')
  return `${whole}.${fraction}`
}

/** Item sem valor digitado (string vazia ou inválida) conta como zero na soma da tela. */
export function sumOccurrenceSettlementAmounts(amounts: readonly string[]): string {
  const total = amounts.reduce((accumulator, amount) => accumulator + toScaled(amount), 0n)
  return fromScaled(total)
}

export function isPositiveDecimalAmount(amount: string): boolean {
  return toScaled(amount) > 0n
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

/**
 * Formatação pt-BR a partir do decimal escalado — a soma e a validação nunca passam por `number`;
 * só aqui, na borda de exibição, o valor já somado em `BigInt` vira double para o `Intl.NumberFormat`
 * (que não aceita `BigInt`) — nunca `parseFloat` sobre o texto digitado.
 */
export function formatOccurrenceSettlementAmount(amount: string): string {
  const scaled = toScaled(amount)
  return BRL_FORMATTER.format(Number(scaled) / Number(SCALE))
}
