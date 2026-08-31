/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const script = await Bun.file(
  new URL('../../scripts/fetch-background-removal.ts', import.meta.url),
).text()
const manifest = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
  devDependencies: Record<string, string>
  scripts: Record<string, string>
}
const rootIgnore = await Bun.file(new URL('../../../../.gitignore', import.meta.url)).text()

/**
 * O modelo e o runtime do recorte são 16 MB de artefato de terceiro. Eles **não vivem no
 * repositório**: binário grande no Git é peso que entra e nunca sai, e todo clone pagaria por
 * sempre. Ficam marcados aqui, e o ambiente os põe no lugar na primeira vez que precisa deles.
 */
describe('os artefatos do recorte de fundo', () => {
  test('ficam fora do Git', () => {
    expect(rootIgnore).toContain('apps/frontend-transportada/public/background-removal/')
  })

  /** Sem o gancho, o primeiro build de um ambiente novo publica um botão que aponta para 404. */
  test('são postos antes do build e antes do servidor de dev', () => {
    expect(manifest.scripts.prebuild).toContain('assets:background-removal')
    expect(manifest.scripts.predev).toContain('assets:background-removal')
  })

  /**
   * A integridade do runtime é do lockfile, não de um download nosso: quem já resolve isso é o
   * gerenciador de pacotes, e repetir à mão seria um segundo caminho pior para o mesmo problema.
   */
  test('o runtime vem de dependência fixada, não de URL', () => {
    expect(manifest.devDependencies['onnxruntime-web']).toBe('1.23.2')
    expect(script).toContain("Bun.resolveSync('onnxruntime-web/package.json'")
  })

  /** Artefato baixado sem conferência é como um binário trocado entra num domínio confiável. */
  test('o modelo baixado é conferido por sha256', () => {
    expect(script).toContain('sha256:')
    expect(script).toContain('309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8')
    expect(script).toContain('sha256 inesperado')
  })

  /**
   * Recorte de fundo é conveniência: amarrar o deploy do produto à disponibilidade de uma release
   * de terceiro trocaria uma degradação pequena por uma parada grande.
   */
  test('a indisponibilidade do download não derruba o build', () => {
    expect(script).toContain('console.warn')
    expect(script).toContain('fica fora deste build')
  })
})
