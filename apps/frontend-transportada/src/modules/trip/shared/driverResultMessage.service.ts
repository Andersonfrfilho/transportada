/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 343: a mensagem do resultado já preenchida com a decisão da contratante e a observação dela, quando há. */
export function buildDriverResultText(input: {
  lead: string
  note: string
  noteLabel: string
}): string {
  const note = input.note.trim()
  return note.length === 0 ? input.lead : `${input.lead}\n${input.noteLabel}: ${note}`
}
