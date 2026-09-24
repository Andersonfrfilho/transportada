/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Medido em staging 19/09/2026: o `preDeployCommand` imprimiu `migrated: true` com 22 migrations da
 * imagem sem aplicar (193 de 215 no banco) — o passo sabia dizer "migrei", nunca "não sobrou nada".
 * Este erro é o que falta: lançado pelo pre-deploy quando a pasta enviada e o journal do banco
 * divergem, para o deploy ficar vermelho em vez de verde com o banco atrasado.
 */
const MAX_REPORTED_NAMES = 10

type MigrationsPendingErrorParams = {
  readonly pendingNames: readonly string[]
}

export class MigrationsPendingError extends Error {
  public override readonly name = 'MigrationsPendingError'
  public readonly pendingCount: number
  public readonly reportedNames: readonly string[]

  public constructor({ pendingNames }: MigrationsPendingErrorParams) {
    const reportedNames = pendingNames.slice(0, MAX_REPORTED_NAMES)
    super(
      `${pendingNames.length} shipped migration(s) were not applied to the database: ${reportedNames.join(', ')}${
        pendingNames.length > reportedNames.length ? ', …' : ''
      }`,
    )
    this.pendingCount = pendingNames.length
    this.reportedNames = reportedNames
  }
}
