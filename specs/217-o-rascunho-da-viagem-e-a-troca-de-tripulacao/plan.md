# Plano — 217, o rascunho da viagem e a troca de tripulação

> Lê-se depois de `spec.md`. Aqui está o desenho técnico, a ordem das mudanças e o que foi conferido
> no código antes de escrever a spec — para que a execução não precise redescobrir.

## O que já foi conferido no código (não reconferir)

| Fato                                                                                           | Onde                                                  | Consequência                                         |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `awaiting_crew` existe e é o primeiro de `TRIP_STATUS_ORDER`                                   | `trip-state.policy.ts:84`                             | Nada de migration de status                          |
| `defineCrew` e `PATCH /trips/:id/crew` existem e são testados                                  | `trip.routes.ts:1186`, `trip.use-case.ts:242`         | A spec estende, não cria                             |
| `createTripSchema` ainda exige os dois campos                                                  | `trip-request.schema.ts:34`                           | RF2 é a task bloqueante da Fase 1                    |
| `checkDefineCrew` promove para `draft` incondicionalmente                                      | `trip-state.policy.ts:295`                            | O defeito que D1 conserta                            |
| `checkPlanRoute` só aplica a partir de `draft`                                                 | `trip-state.policy.ts:374`                            | RF6 sai de D1, sem código novo de visibilidade       |
| `resolveTripAllowedActions` compõe a máquina de estados                                        | `trip-allowed-actions.policy.ts`                      | Não somar condição paralela aqui                     |
| A criação no painel planeja a rota no 4º passo                                                 | `quickCreateTrip.service.ts:31`                       | "Salvar rascunho" é a mesma sequência sem o 4º passo |
| `validateQuickCreate` empurra `driverRequired`/`vehicleRequired`                               | `tripQuickCreate.service.ts:166`                      | Os dois saem só no caminho do rascunho               |
| Vincular nota e reordenar parada já são liberados em `awaiting_crew`                           | `checkTripAcceptsLinkage`, `trip-state.policy.ts:139` | Nenhuma mudança de gate para RF1                     |
| A planta de carga é indexada por `input_hash` e não tem `stale`                                | `trip-cargo-layout.schema.ts:22`                      | D4 não escreve invalidação                           |
| `placement.unplaced` alimenta `trip_document_reviews`                                          | `trip-document-review.policy.ts`                      | D4 reaproveita a fila da 148                         |
| O motorista vê a viagem a partir de `route_planned`                                            | `drizzle-current-driver-trip.repository.ts:73`        | A troca acontece com a viagem no celular dele (D6)   |
| Fora da tripulação, `/me/*` responde 403 `TRIP_NOT_OF_DRIVER` ou 404 `TRIP_STOP_NOT_REACHABLE` | `trip.error.ts`, `field-trip-target.query.ts`         | São os códigos a traduzir em D7                      |
| A fila offline trata recusa como `rejected` e não retenta                                      | `offlineQueue.service.ts:175`                         | D7 não muda mecanismo, só texto                      |
| MDF-e só de `dispatched` em diante                                                             | `trip-manifest.policy.ts:54`                          | D8: fora da janela da troca                          |
| CT-e leva só RNTRC no modal rodoviário                                                         | `cte-payload.builder.ts:198`                          | D8: sem placa nem condutor                           |

⚠️ `DriverNotOnTripError` (422) **não** protege as rotas `/me/*` do próprio motorista — é do fluxo de
"baixa em nome do motorista" (156/ADR-0067). Quem protege `/me/*` é o 403 do dispatch por `tripId` e o
recorte silencioso por `EXISTS` em `trip_drivers` que faz o alvo sumir (→ 404). Citar o código certo.

## Desenho

### A composição da tripulação vira um valor

`checkDefineCrew` passa a receber a tripulação resultante em vez de só o status. A forma mais barata e
mais testável é um tipo pequeno no domínio:

```ts
type TripCrewComposition = { readonly hasDriver: boolean; readonly hasVehicle: boolean }
```

e uma função pura `resolveCrewStatus(composition): 'awaiting_crew' | 'draft'`. `checkDefineCrew` usa
essa função para decidir `applied`/`unchanged`, e o repositório grava o status que ela devolveu — hoje
ele grava `transition.nextStatus` ou mantém o anterior (`drizzle-trip.repository.ts:337`), e é essa
linha que carrega o defeito.

A mesma função serve à criação (RF2/RF3): `TripUseCase.create` deixa de lançar
`TripVehicleNotFoundError` com veículo nulo e passa a derivar o status do par.

### A regressão de `route_planned` para `draft`

É uma aresta nova na máquina de estados, e é a única parte desta spec que mexe em estado já
despachável — por isso é task 🧠. Regras:

- Só quando o `vehicleId` **mudou**. Igual ao atual: idempotente, nada apagado.
- Troca só de motorista em `route_planned`: `unchanged`, rota de pé.
- A limpeza dos campos congelados acontece **na mesma transação** de `updateCrew`, junto do
  `delete`/`insert` de `trip_drivers` e do `update` de `trips` que já existem ali. Uma escrita.
- As colunas por parada (`trip_stops.estimated_arrival_at`, `distance_from_previous_meters`,
  `duration_from_previous_seconds`) entram no mesmo `update`, filtradas por `companyId + tripId`.

⚠️ **Ler `plan-trip-route.use-case.ts` e `freezeTripPlannedRoute` inteiros antes de escrever a
limpeza.** A lista de colunas desta spec foi levantada do schema, não do congelador; se o congelador
gravar algo que não está na lista, a limpeza deixa número velho para trás — exatamente o defeito que
D3 existe para evitar. A verificação é mecânica: todo campo que `freezeTripPlannedRoute` escreve tem
de aparecer na limpeza.

### O bloqueio novo

`TRIP_TRANSITION_BLOCK.tripSeparationStarted = 'TRIP_SEPARATION_STARTED'` entra, e
`tripCrewAlreadyDefined` sai junto com o único uso. Como o código do erro é contrato HTTP, o teste de
contrato tem de prender a string — o frontend filtra por código (`getApiErrorCode()`).

### Frontend do painel

- **Botão "Salvar rascunho"** no diálogo de criação, ao lado do de criar. Chama a sequência da 178
  sem o `planTripRoute`: a função `runQuickCreateTrip` ganha um parâmetro para não planejar, em vez de
  uma segunda função copiada — o comentário dela já explica por que os passos não são atômicos e essa
  razão não muda.
- **`validateQuickCreate`** passa a devolver os problemas por caminho: o rascunho ignora
  `driverRequired`/`vehicleRequired`; o clique único continua exigindo os dois.
- **Tela de definir/trocar tripulação** no detalhe, consumindo `PATCH /trips/:id/crew`. É a T019
  pendente da 216.
- **"a definir" e selo de pendência** (T017/T018/T020 da 216): a lista de telas a ajustar está no
  `plan.md` da 216 e é copiada para as tasks daqui sem relevantamento.

### PWA do motorista

O servidor não precisa de campo novo: a viagem simplesmente deixa de vir em `GET /me/trips/current`.
O que a app precisa é **distinguir a ausência**. O snapshot local (`tripSnapshot.service.ts`) já
guarda a última resposta por conta; a app compara o snapshot com a resposta nova e, quando uma viagem
que estava lá não veio e não está concluída/cancelada, mostra o aviso — no molde de
`DriverForeignPendingNotice`. Não inventar estado no servidor para isso: a ausência já é o sinal, e um
campo novo no contrato seria uma segunda verdade sobre o mesmo fato.

⚠️ O aviso é por **ausência**, então ele acerta o caso da reatribuição e acerta também o caso da
viagem devolvida para `draft` por D3. Os dois têm a mesma causa do ponto de vista do motorista ("não é
mais sua agora"), e um texto só serve para os dois — não criar dois avisos.

## Ordem das fases, e por quê

1. **Domínio do status** (D1) — tudo depende de o status ser honesto, inclusive a visibilidade.
2. **Criação sem tripulação** (RF2) — destrava o "Salvar rascunho".
3. **O corte na separação e a regressão** (D2/D3) — a parte que mexe em estado despachável.
4. **Gaps de valoração e cubagem** — a Fase 3 pendente da 216, que agora tem usuário real.
5. **Frontend do painel** — botão, tela, "a definir", selo.
6. **PWA do motorista** — aviso e tradução da fila.
7. **Revisão de design e usabilidade** — fecha com print das telas novas.

A Fase 3 vem depois da 1 e 2 de propósito: é quando passa a existir viagem sem veículo criada pelo
painel, e é o primeiro momento em que um gap de valoração aparece para um operador de verdade.

## Perguntas que ficam para o design

Nenhuma bloqueante. Duas escolhas de apresentação, que a Fase 7 resolve com o dono do produto na
tela, não no texto:

- O rótulo do botão de rascunho ("Salvar rascunho" vs "Salvar sem tripulação"), dado que já existe um
  rascunho local com o mesmo nome.
- Se o selo de pendência da listagem diz "tripulação pendente" ou nomeia o que falta ("sem motorista",
  "sem veículo"), quando falta só um dos dois.
