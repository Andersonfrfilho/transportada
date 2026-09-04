# ADR-0058 — O motorista abre a porta do despacho

- **Data:** 2026-09-03
- **Estado:** aceita
- **Revisa:** quem pode chamar `dispatch` (spec 056 deu a ação a `trip.manage`)
- **Spec:** 082

## Contexto

O `dispatch` é a porta de não-retorno: congela o roteiro em `trip_dispatch_snapshots` e bloqueia
vínculo, desvínculo e reordenação. A spec 056 o deixou com o escritório (`trip.manage`). Na
operação real, quem sabe que o caminhão saiu é quem está nele — o escritório despachando por
telefone é o retrabalho que o app veio tirar.

## Decisão

1. **`POST /me/trips/current/dispatch`**: o motorista vinculado (`trip_drivers`) despacha a própria
   viagem quando ela está em `route_planned`. Sem permissão nova — o recorte é o vínculo, como em
   todo `/me/trips/current/*` (ADR-0045 §2).
2. **A máquina não muda.** Mesma transição, mesmo snapshot, mesma idempotência (`unchanged` na
   repetição). Viagem de outro vínculo é 403; fora de `route_planned` é 409.
3. **O escritório continua podendo.** A rota de `trip.manage` permanece — dois caminhos para a
   mesma transição idempotente não conflitam.
4. **"Finalizar viagem" não vira ação.** `completed` segue derivado do estado das notas; o botão do
   mockup é estado, não comando.

## Consequências

- O congelamento do roteiro passa a acontecer na hora em que o caminhão sai, não quando o
  escritório lembra.
- `test/separator-role.contract.test.ts` não muda: a rota nova não é alcançável por papel, é por
  vínculo.
