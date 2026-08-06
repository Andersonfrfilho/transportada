/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const LOCAL_APP_ENV = 'local'

// A saída legível do logger imprime só a mensagem e descarta o `meta`; fora do
// terminal de quem desenvolve, o `meta` é a informação que se vai ler depois.
export function shouldPrettyPrintLogs(appEnv: string): boolean {
  return appEnv === LOCAL_APP_ENV
}
