/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

/**
 * Spec 155 (D7, G009, T3.3): o botão rápido só PREENCHE o formulário — nunca grava sozinho. Sem DOM
 * nos testes desta app (mesmo padrão do resto da suíte), o contrato é por texto de fonte: garante
 * que o botão é `type="button"` (fora do fluxo de submit do `<form>`) e que o preenchimento usa os
 * `set*` de estado local, nunca `onSubmit`.
 */
describe('botão "usar a medida de {rótulo}" (spec 155 D7, G009)', () => {
  it('o formulário busca a irmã medida da família sob demanda e só preenche, nunca grava', async () => {
    const form = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementForm.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(form).toContain('usePackageBoxSiblings')
    expect(form).toContain('canQuickFillFromFamily')
    expect(form).toContain('packageBoxes.quickFill.useMeasurementOf')

    /** O preenchimento troca só o estado local (`set*`) — nunca chama `onSubmit` nem grava sozinho. */
    const quickFillSection = form.slice(form.indexOf('canQuickFillFromFamily'))
    const buttonBlock = quickFillSection.slice(
      quickFillSection.indexOf('useMeasurementOf'),
      quickFillSection.indexOf('useMeasurementOf') + 700,
    )
    expect(buttonBlock).not.toContain('onSubmit(')

    /** Nasce fora do fluxo de gravação do `<form>`: sem isso Enter/click disparava `handleSubmit`. */
    expect(form).toContain('type="button"')
  })

  it('a fila deriva a elegibilidade do botão pronto da API, sem somar de novo', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('canQuickFillFromFamily')
    expect(panel).toContain('box.familyMeasuredCount > 0')
  })
})
