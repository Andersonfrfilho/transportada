# Evidência — spec 224

## T1.1 — Qual coluna marca a conclusão

Lido em `apps/api-transportada/src/database/trip.schema.ts`. A tabela `trips` tem três candidatas:

| coluna                          | linha | quem escreve                                                                                                                          |
| ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `closedAt`                      | 280   | **só** o encerramento do escritório (spec 156/ADR-0067), junto de `closedByUserId` e `closeReason` — `drizzle-trip.repository.ts:224` |
| `updatedAt`                     | 299   | toda escrita na linha, inclusive a transição de status do motorista                                                                   |
| `trip_status_events.occurredAt` | 487   | `recordTripStatusChange`, chamado nos dois caminhos                                                                                   |

**Escolha: `updatedAt`.**

- `closedAt` **não serve**: é `null` quando o motorista conclui pelo app. O caminho do motorista
  (`drizzle-current-driver-trip.repository.ts:218`) faz `.set({ status, updatedAt: sql'now()' })` e
  não toca `closedAt` — ele nasce com `closedByUserId`, que pressupõe ator do escritório. Usar
  `closedAt` cobriria só a baixa do escritório, que é justamente o caso que a decisão da spec quis
  **não** deixar de fora.
- `trip_status_events.occurredAt` é o dado **exato** (a hora da transição, por qualquer caminho), e
  foi recusado por custo: obrigaria subconsulta num endpoint que cada motorista chama a cada 30 s,
  para ganhar precisão que não muda nada visível.
- `updatedAt` tem uma imprecisão conhecida: edição posterior numa viagem já concluída recoloca a
  linha na janela. **Com RF2 a consequência é invisível** — a viagem reaparece na lista, não é
  eleita, e `hasReassignedTrip` vê uma viagem _aparecendo_ (nunca sumindo), que não gera aviso. Fica
  registrado para não ser redescoberto como defeito.

**Janela: 15 minutos**, como a spec propôs, em constante nomeada.

## T1.2 — Quem consome `GET /me/trips/current`

Varredura em `apps/*/src/`:

| chamador                                                  | o que faz com a lista                     |
| --------------------------------------------------------- | ----------------------------------------- |
| `apps/frontend-driver`                                    | `resolveSelectedTrip` (RF2 conserta aqui) |
| `apps/frontend-transportada` → `src/modules/driver-trip/` | ⚠️ **`snapshot?.trips[0]` cru**           |

⚠️ **Achado que amplia o escopo.** O painel ainda tem o módulo `driver-trip` (o caminho de transição
da ADR-0075 §6, drenado mas não removido — remoção é a Fase 10 da 189, sob aprovação humana) e ele
pega a viagem **sem seletor e sem filtro**, em dois lugares:

- `apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx:140`
- `apps/frontend-transportada/src/modules/driver-trip/pages/DriverProfile.page.tsx:43`

Com RF1 e sem conserto aqui, um motorista servido pelo painel veria **a viagem concluída como
ativa** por 15 minutos. Não está exposto em staging nem em produção (`VITE_DRIVER_APP_URL` está
definida nos dois, `.railway/railway.ts:679-680`, então o painel redireciona), mas o interruptor
pode ser desligado e o código continua lá.

Entra como **T1.11**, duas linhas, mesmo filtro. Não é a remoção do módulo — essa segue pendente de
aprovação.
