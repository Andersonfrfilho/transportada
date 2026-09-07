/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

/**
 * O portão de serviço municipal é **escolha do perfil**, não premissa do produto: medido em
 * produção, das notas de mesmo município 0 de 920 tinham CT-e, e as 62 NFS-e emitidas eram todas
 * intermunicipais. Quem sabe se a regra vale naquela instalação é quem configura o perfil — e por
 * isso ela precisa de campo na tela, e o padrão precisa ser não bloquear.
 */
describe('a política de serviço municipal no perfil de emissão', () => {
  test('o campo nasce em allow no rascunho — nenhum perfil novo bloqueia sozinho', async () => {
    const source = await readSource('src/modules/cte-profiles/shared/cteProfilesDraft.service.ts')

    expect(source).toContain("municipalServicePolicy: 'allow'")
  })

  test('o campo viaja no corpo que vai para a API', async () => {
    const source = await readSource('src/modules/cte-profiles/shared/cteProfilesForm.service.ts')

    expect(source).toContain('municipalServicePolicy: settings.municipalServicePolicy')
    expect(source).toContain('municipalServicePolicy: state.municipalServicePolicy')
  })

  /** Resposta sem o campo é resposta que o cliente não entende — e não se inventa padrão aqui. */
  test('a validação da resposta exige o campo', async () => {
    const source = await readSource(
      'src/modules/cte-profiles/shared/cteProfilesResponse.validation.ts',
    )

    expect(source).toContain('municipalServicePolicy')
  })

  test('a tela oferece a escolha no bloco fiscal, que é onde a competência é decidida', async () => {
    const source = await readSource(
      'src/modules/cte-profiles/components/CteProfileFiscalFields.component.tsx',
    )

    expect(source).toContain('CTE_PROFILE_MUNICIPAL_SERVICE_POLICY')
    expect(source).toContain('municipalServicePolicy')
  })

  test('os dois valores têm rótulo nos dois idiomas', async () => {
    for (const file of [
      'src/modules/cte-profiles/locales/cteProfiles.locale.json',
      'src/modules/cte-profiles/locales/cteProfiles.en.locale.json',
    ]) {
      const locale = await readLocale(file)
      const options = locale.municipalServicePolicyOption as Record<string, string> | undefined

      expect(options?.allow).toBeString()
      expect(options?.block).toBeString()
      expect(locale.municipalServicePolicy).toBeString()
    }
  })
})
