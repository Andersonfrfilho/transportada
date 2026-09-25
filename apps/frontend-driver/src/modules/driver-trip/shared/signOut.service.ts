/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * "Sair" (ADR-0075 §8, revisto na spec 189 T9.2 M9): a viagem guardada sai **antes** do logout —
 * falha ao apagar não segura a saída; o snapshot ainda vence em 24 h. Sem rede o logout do Keycloak
 * rejeita (no boot sem rede ele nem foi inicializado), e a tela ficava parada com o botão tocado:
 * recarregar leva o boot à tela "sem viagem salva", porque o snapshot já saiu.
 */
export async function signOutDriver(input: {
  readonly discardSnapshots: () => Promise<void>
  readonly logout: () => Promise<void>
  readonly reload: () => void
}): Promise<void> {
  await input.discardSnapshots().catch(() => undefined)
  try {
    await input.logout()
  } catch {
    input.reload()
  }
}
