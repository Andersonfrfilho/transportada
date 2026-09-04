# Plano

## Ordem

1. **Banco** — coluna `driver_id` em `route_suggestion_vehicles`, migration + rollback, cópia no
   worker. Sem ela nada mais tem onde pousar.
2. **API de leitura do vínculo** — `GET /fleet/driver-vehicles`, o par por empresa. É o que o
   diálogo consome; independente do resto, entra em paralelo.
3. **API da sugestão** — schema da rota, porta, caso de uso, repositório, composer, erro novo.
4. **Frontend** — cliente, serviço puro do pareamento, hook, diálogo.

## Decisões já tomadas

- `vehicleIds` **sai** do corpo, não convive com `vehicles`. Um cliente só consome esta rota, e o
  par de campos concorrentes obrigaria uma regra de precedência que ninguém iria querer explicar.
  Precedente: a resposta de `deliver` mudou nos dois lados na spec 056.
- O pareamento do diálogo é **serviço puro** (`multiVehiclePairing.service.ts`), porque o teste
  desta app não tem DOM: o comportamento se prova na função e a fiação por texto de fonte.
- A validação de motorista segue o desenho de `findUnavailableVehicleIds` — uma consulta, um
  vocabulário, o mesmo `409` com ids no `details`.

## Riscos

- **A cópia do schema no worker.** `route-optimization.effect.ts` lê `route_suggestion_vehicles`;
  coluna faltando na cópia é erro em tempo de consulta, não de compilação.
- **Sugestão antiga.** Toda linha existente fica com `driver_id` nulo; o contrato do aceite sem
  motorista é o que prova que elas continuam aceitáveis.
