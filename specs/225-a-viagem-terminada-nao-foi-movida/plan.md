# Plano técnico

## Contexto e premissas

Tudo abaixo foi lido no código em 02/10, não suposto:

- `CURRENT_DRIVER_TRIP_STATUSES = ['route_planned', ...TRIP_ON_ROAD_STATUSES]`
  (`apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:94`), e
  `TRIP_ON_ROAD_STATUSES = ['dispatched', 'in_transit', 'on_delivery_route']`
  (`src/trips/domain/trip-state.policy.ts:136`). `completed` não está em nenhum dos dois.
- `CONCLUDED_TRIP_STATUSES = new Set(['completed', 'cancelled'])`
  (`apps/frontend-driver/src/modules/driver-trip/shared/tripSnapshot.service.ts:17`).
- A comparação roda no render, guardada por `dataUpdatedAt`
  (`apps/frontend-driver/src/modules/driver-trip/hooks/useDriverTrip.hook.ts:347-355`), e o aviso só
  é desligado pelo toque em dispensar (`:892`).
- `resolveSelectedTrip` não conhece status concluído: o fallback é
  `trips.find(em rota) ?? trips[0]`
  (`apps/frontend-driver/src/modules/driver-trip/shared/driverTripSelection.service.ts`).
- O app do motorista **não tem** chamada de "concluir viagem": o cliente só expõe `arrive`,
  `depart`, `deliver`, `return` e `occurrences` (`driverTripClient.service.ts:219-229`). Quem conclui
  é a API.

Premissa que o plano assume e a T1 confirma: a viagem concluída tem `updatedAt` tocado na transição
para `completed`, e é esse relógio que a janela usa. Se não for, a janela passa a usar a coluna que
marca a conclusão — a T1 decide com o schema na mão, não aqui.

## Arquitetura e arquivos afetados

**API** (`apps/api-transportada`)

- `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` — a consulta passa a aceitar
  os status ativos **ou** concluído dentro da janela. A constante da janela nasce nomeada
  (`RECENTLY_CONCLUDED_TRIP_WINDOW_MINUTES`), ao lado de `CURRENT_DRIVER_TRIP_STATUSES`. O `gte` já
  está importado no arquivo.
- Nenhuma mudança em caso de uso, rota, schema de resposta ou permissão. O recorte de empresa e de
  tripulação é o mesmo — a viagem concluída é a **mesma viagem** daquele motorista.

**App do motorista** (`apps/frontend-driver`)

- `src/modules/driver-trip/shared/driverTripSelection.service.ts` — `resolveSelectedTrip` descarta
  concluída nos três caminhos. É o único lugar que elege viagem; `resolveTripSwitch` opera sobre o
  resultado dele e não muda.
- `src/modules/driver-trip/shared/tripReassignment.service.ts` — **não muda**. O comentário dela
  ganha uma linha dizendo que o status concluído agora chega de verdade, e por quê.

## Contratos/API/eventos

Sem campo novo. `GET /me/trips/current` passa a poder trazer um item com
`status: 'completed' | 'cancelled'` — valores que o validador do app já aceita (`status: string`, e
`CONCLUDED_TRIP_STATUSES` já os nomeia). Nenhum consumidor novo.

Quem mais lê este endpoint: só o app do motorista (o painel tem as rotas de `/trips`). Verificar na
T2 que nenhum outro cliente depende de "a lista só traz viagem ativa".

## Dados, migration e rollback

Nenhuma migration. Nenhuma coluna nova. O conserto é predicado de consulta e filtro de seleção.

## Segurança e tenant

- `companyId` continua do contexto autenticado; a cláusula não é tocada.
- O recorte de tripulação (`tripDrivers`) não muda: a viagem concluída que passa a aparecer é a que
  **já era** daquele motorista. Não abre leitura de viagem de terceiro.
- Nada de novo é logado. A viagem concluída não carrega campo que a ativa já não carregasse.

## Idempotência e concorrência

A comparação é pura e guardada por `dataUpdatedAt`, então releitura repetida não duplica aviso. A
janela é relativa ao relógio do banco (`now()`), não ao do aparelho — celular com hora errada não
muda o que a API devolve.

Corrida que importa: a viagem conclui **entre** duas leituras do app. Com a janela, a leitura
seguinte traz `completed` e a cópia local passa a registrá-lo; a leitura depois dela vê a ausência
com a cópia já concluída. É exatamente o caminho que RF3 precisa.

Corrida que a janela não cobre: o app ficar sem ler durante toda a janela (app fechado por mais de
15 min no exato momento da conclusão). Aí a viagem desaparece sem nunca ter sido lida como
`completed`. Mas nesse caso a cópia local também está vencida ou foi descartada — e lista anterior
vazia nunca gera aviso. Registrado como caso extremo na spec, coberto por teste.

## Observabilidade

Nada novo. Se a janela precisar de ajuste, ela é uma constante nomeada num arquivo — não há
métrica a criar para isso.

## Estratégia de testes

Teste antes da implementação, como manda a casa:

- **Contrato do app** (`apps/frontend-driver/test/driver-trip/`): a sequência real da conclusão
  (CA3), a troca que continua avisando (CA4), e o seletor ignorando concluída (CA2). O caso
  inalcançável de hoje é **substituído**, não acrescentado.
- **Integração da API** (`apps/api-transportada/test/integration/`): viagem concluída dentro e fora
  da janela, contra Postgres de verdade. Dublê não serve aqui: o que está em jogo é o predicado da
  consulta, e dublê passaria com qualquer predicado.
- **Mutação** (CA5): desfazer cada metade e ver o teste certo falhar. Sem isso, "verde" não prova
  que o teste está prendendo a regra — foi assim que o caso atual ficou verde sobre estado
  impossível.

Comandos (⚠️ os dois da API são listas diferentes; nenhum cobre o outro):

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
cd apps/api-transportada && bun --env-file=../../.env.test run test:integration
cd apps/frontend-driver && bun run check
```

## Riscos

| risco                                                         | mitigação                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Viagem concluída exibida como ativa na tela                   | RF2 é a mitigação, e CA2 + mutação a provam. É o risco principal desta spec.    |
| Outro consumidor do endpoint supondo lista só ativa           | T2 varre os chamadores antes de mexer na consulta                               |
| `updatedAt` não marcar a conclusão                            | T1 confirma no schema e escolhe a coluna; a janela não vai ao ar sobre premissa |
| A janela esconder reatribuição legítima logo após a conclusão | Decidido na spec: viagem terminada é terminada, ninguém vai dirigi-la           |
