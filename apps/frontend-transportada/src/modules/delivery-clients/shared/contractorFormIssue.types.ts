/* Copyright (c) 2026 Ada Technology. MIT License. */

export type FormIssueCode =
  | 'controlCharacter'
  | 'duplicateColumn'
  | 'invalidEmail'
  | 'notAnInteger'
  | 'notANumber'
  | 'outOfRange'
  | 'refusedByServer'
  | 'required'
  | 'requiredForPreview'
  | 'tooLong'
  | 'tooManyDecimals'

/** `max`/`min` entram na frase: "Use de 1 a 168." diz a faixa em vez de só reprovar. */
export type FormIssue = Readonly<{
  code: FormIssueCode
  max?: number
  min?: number
}>

/** Chave = o caminho que a API usa para o mesmo campo, para o erro do servidor cair no mesmo lugar. */
export type FormIssues = Readonly<Record<string, FormIssue>>
