/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T008: "nenhum arquivo em `src/contractor-mail/**` serializa ou loga `apiKey`,
 * `webhookSigningSecret` ou `secretEnvelope`." Revisão do `architect`: a versão anterior deste
 * arquivo só reprovava um `logger`/`log` que **já** mencionasse um destes identificadores no mesmo
 * arquivo — um `console.log(secretEnvelope)` solto, sem nenhuma outra chamada de log por perto,
 * passava batido, porque o `if (!LOG_CALL_PATTERN.test(source)) return` saía cedo demais. A
 * invariante certa é mais forte e incondicional: **nenhuma chamada de `logger`/`log`/`console`
 * existe** em `src/contractor-mail/**`, ponto — Router e Exception Filter globais já logam o que
 * precisa ser logado (§7 do baseline), então o módulo não tem motivo nenhum para chamar log
 * nenhum. Quem quiser logar algo aqui um dia vai ter de vir revisar este teste primeiro, o que é a
 * intenção. A camada HTTP (`contractor-mail-settings.routes.ts`) nunca precisa nomear o **envelope
 * selado** — ela só repassa `apiKey`/`webhookSigningSecret` como texto opaco do corpo validado até
 * o caso de uso, que é quem sela. A garantia de que a resposta real nunca carrega os *valores* dos
 * segredos está no contrato funcional em `settings-routes.contract.ts` (`response.text()` sem o
 * segredo sintético, e a lista fechada de chaves do JSON).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

const CONTRACTOR_MAIL_SOURCE_ROOT = new URL('../../src/contractor-mail/', import.meta.url).pathname
const LOG_CALL_PATTERN =
  /\b(?:logger|log|console)\s*(?:\?\.)?\.\s*(?:debug|info|warn|error|log)\s*\(/u
const ROUTES_FILE = 'presentation/contractor-mail-settings.routes.ts'
const ENVELOPE_IDENTIFIERS = ['secretEnvelope', 'ciphertext'] as const

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((entry) => entry.endsWith('.ts'))
}

const sourceFiles = [...listSourceFiles(CONTRACTOR_MAIL_SOURCE_ROOT)].sort()

describe('contractor mail secrets never reach logs or the settings routes (spec 143, T008)', () => {
  it('the sweep covers the module', () => {
    expect(sourceFiles.length).toBeGreaterThan(5)
    expect(sourceFiles).toContain(ROUTES_FILE)
    expect(sourceFiles).toContain('application/contractor-mail-credential-secret.service.ts')
  })

  /**
   * Incondicional, não "se houver chamada de log, ela não pode conter X": o Router e o Exception
   * Filter globais já são quem loga (nunca este módulo), então zero chamadas é a invariante — não
   * "zero chamadas com segredo dentro".
   */
  for (const file of sourceFiles) {
    it(`src/contractor-mail/${file} never calls logger, log or console`, () => {
      const source = readFileSync(join(CONTRACTOR_MAIL_SOURCE_ROOT, file), 'utf8')
      expect(LOG_CALL_PATTERN.test(source)).toBe(false)
    })
  }

  /**
   * A rota de configuração repassa `apiKey`/`webhookSigningSecret` como texto opaco do corpo até o
   * caso de uso (que sela), e serializa uma lista fechada de campos não secretos na resposta — mas
   * nunca toca o **envelope**: isso é assunto do `application`/`infrastructure`. O nome do envelope
   * aparecendo aqui seria a camada HTTP decidindo algo sobre o segredo aberto.
   */
  it('the settings routes never name the sealed envelope', () => {
    const source = readFileSync(join(CONTRACTOR_MAIL_SOURCE_ROOT, ROUTES_FILE), 'utf8')

    for (const identifier of ENVELOPE_IDENTIFIERS) {
      expect(source).not.toContain(identifier)
    }
  })
})
