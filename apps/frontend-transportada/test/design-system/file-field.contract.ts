/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * O `<input type="file">` cru desenha o botão do **navegador**: altura, fonte e cor vêm do sistema
 * operacional, e a caixa destoa da fileira de campos ao lado. O componente esconde o botão nativo
 * sem tirar o input do fluxo de foco — que é a parte fácil de errar, porque `display: none` deixa a
 * tela igualzinha e some com o campo para quem navega por teclado.
 */
describe('FileField', () => {
  test('takes height, padding and body text from the field tokens', async () => {
    const css = await readApplicationFile('src/components/ui/file-field.module.css')

    const control = /\.control\s*\{([^}]*)\}/u.exec(css)?.[1] ?? ''

    expect(control).toContain('min-height: var(--control-height)')
    expect(control).toContain('padding: var(--field-padding)')
    expect(control).toContain('font-size: var(--field-font-size)')
    /**
     * Nenhuma medida literal **na caixa** — ela acompanha o campo de texto vizinho ou a fileira
     * desalinha. O `1px` do input escondido é outra coisa e fica de fora de propósito: ali o número
     * não é medida de layout, é o tamanho que o truque de esconder exige.
     */
    expect(control).not.toMatch(/(?:min-height|height|padding):\s*[\d.]+(?:px|rem)/u)
  })

  test('hides the native button without removing the input from the focus order', async () => {
    const css = await readApplicationFile('src/components/ui/file-field.module.css')

    expect(css).toContain('clip-path: inset(50%)')
    /** `display: none` e `visibility: hidden` tiram o campo da tabulação — é o defeito silencioso. */
    expect(css).not.toMatch(/\.input\s*\{[^}]*display:\s*none/u)
    expect(css).not.toMatch(/\.input\s*\{[^}]*visibility:\s*hidden/u)
    /** Sem anel visível no input escondido, o foco por teclado fica invisível: a caixa o mostra. */
    expect(css).toContain('.field:has(.input:focus-visible) .control')
  })

  test('names the input once, instead of concatenating both labels', async () => {
    const source = await readApplicationFile('src/components/ui/file-field.tsx')

    expect(source).toContain('aria-label={label}')
    /** O ícone acompanha o rótulo, então não se anuncia duas vezes — `web.md` §9. */
    expect(source).toContain('aria-hidden="true"')
  })

  test('the vehicle document intake uses the component, not a raw input', async () => {
    const source = await readApplicationFile(
      'src/modules/document-intake/components/DocumentIntakeDropZone.component.tsx',
    )

    expect(source).toContain('<FileField')
    expect(source).not.toContain('type="file"')
  })

  /**
   * A lista existe para **encolher**: migrar um é tirá-lo daqui, e campo novo que nascer cru reprova
   * neste teste em vez de passar despercebido.
   */
  test('every remaining raw file input is a declared exception', async () => {
    const pending = [
      /**
       * Estes três **não** têm o defeito que o componente resolve: o input já está fora de vista e
       * quem dispara o seletor é um botão do design system. Migrá-los trocaria uma caixa correta
       * por outra e mexeria em telas que ninguém pediu — ficam como exceção declarada, não como
       * dívida. O que se cobra deles é só que o input siga escondido sem sair da tabulação.
       */
      'src/modules/company-settings/components/CertificateUploadForm.component.tsx',
      'src/modules/company-settings/components/CompanyLogoUpload.component.tsx',
      'src/modules/identity/components/CompanyUserPictureField.component.tsx',
    ]

    const found = new Set<string>()
    const glob = new Bun.Glob('src/modules/**/*.tsx')
    for await (const relativePath of glob.scan({ cwd: new URL('.', APPLICATION_ROOT).pathname })) {
      const source = await readApplicationFile(relativePath)
      if (source.includes('type="file"')) found.add(relativePath)
    }

    expect([...found].sort()).toEqual([...pending].sort())
  })

  /**
   * `display: none` esconde **e** tira da tabulação: a tela fica idêntica e o campo some para quem
   * navega por teclado. Era assim que a foto do usuário estava, e é o defeito que nenhuma
   * conferência visual pega.
   */
  test('the hidden inputs that stay native are still reachable by keyboard', async () => {
    const css = await readApplicationFile(
      'src/modules/identity/styles/userAdministration.module.css',
    )
    const settings = await readApplicationFile(
      'src/modules/company-settings/styles/companySettings.module.css',
    )

    expect(css).not.toMatch(/\.hiddenInput\s*\{[^}]*display:\s*none/u)
    expect(css).toMatch(/\.hiddenInput\s*\{[^}]*clip-path/u)
    expect(settings).toMatch(/\.fileUploadInput\s*\{[^}]*clip:/u)
  })
})
