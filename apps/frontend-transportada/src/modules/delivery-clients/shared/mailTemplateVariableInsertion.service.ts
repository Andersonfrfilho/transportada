/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { MailTemplateFieldName } from './contractorMailTemplates.types'

/** Só o "Texto de cada endereço" se repete por item — RF14: variável de item, só ali. */
const ITEM_FIELD: MailTemplateFieldName = 'itemText'

export type MailTemplateVariableInsertion = Readonly<{ cursorPosition: number; text: string }>

/**
 * Insere `{nome}` na posição do cursor, sem depender do DOM — a função é pura para poder ser
 * testada isolada; o componente lê `selectionStart`/`selectionEnd` do campo com foco e repassa.
 * Com seleção ativa, o texto selecionado é substituído (o padrão de "inserir sobre a seleção").
 */
export function insertMailTemplateVariable(
  input: Readonly<{ name: string; selectionEnd: number; selectionStart: number; text: string }>,
): MailTemplateVariableInsertion {
  const { name, selectionEnd, selectionStart, text } = input
  const start = Math.max(0, Math.min(selectionStart, text.length))
  const end = Math.max(start, Math.min(selectionEnd, text.length))
  const token = `{${name}}`
  const nextText = `${text.slice(0, start)}${token}${text.slice(end)}`
  return { cursorPosition: start + token.length, text: nextText }
}

/** RF14: a variável de item só habilita quando o foco está no texto de cada item. */
export function isItemVariableEnabled(focusedField: MailTemplateFieldName | undefined): boolean {
  return focusedField === ITEM_FIELD
}
