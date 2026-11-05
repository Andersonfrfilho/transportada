/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T1: o grupo de WhatsApp do motorista, 1 para 1.
 */
export type DriverWhatsappGroup = {
  readonly groupJid: string
  readonly groupName: string
  readonly updatedAt: string
}

/** Quem já está com o grupo: a lista da tela mostra o motorista dono e desabilita a escolha. */
export type DriverWhatsappGroupAssignment = {
  readonly driverId: string
  readonly driverName: string
  readonly groupJid: string
}

export type DriverWhatsappGroupActor = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly driverId: string
}

export type DriverWhatsappGroupRepositoryPort = {
  find(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverWhatsappGroup | null>
  listAssignments(input: {
    readonly companyId: string
  }): Promise<readonly DriverWhatsappGroupAssignment[]>
  /** `true` quando havia vínculo. Audita na mesma transação. */
  remove(input: DriverWhatsappGroupActor): Promise<boolean>
  /**
   * Troca o grupo do motorista (um só por ficha). `FleetDriverNotFoundError` com a ficha de outra empresa
   * ou inexistente; `FleetDriverWhatsappGroupTakenError` com o grupo de outro motorista (sob concorrência também).
   */
  set(
    input: DriverWhatsappGroupActor & { readonly groupJid: string; readonly groupName: string },
  ): Promise<DriverWhatsappGroup>
}
