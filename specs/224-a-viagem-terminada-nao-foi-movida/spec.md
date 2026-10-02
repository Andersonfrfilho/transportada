# Feature 224 — A viagem terminada não foi movida

## Problema e resultado

O motorista termina a viagem e o app diz que **a viagem foi movida para outro motorista**. Ninguém
moveu nada. O aviso é o da spec 217 (RF8/D6), que existe para o caso real de troca de tripulação —
e ele dispara em **toda** viagem concluída, não em algumas.

O relato veio do usuário em 02/10, de produção, com a frase na tela depois de concluir normalmente.

**A causa são dois conjuntos que não se cruzam.** A 217 decidiu detectar a troca pela ausência, sem
campo novo no contrato: a cada leitura de `GET /me/trips/current`, compara a lista anterior com a
nova; viagem que estava lá, não veio agora e **não estava concluída** virou aviso. A ressalva é o que
deveria separar "terminei" de "me tiraram". Só que ela lê o status da cópia local, e essa cópia nunca
pode dizer `completed`:

| conjunto                                                  | valores                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| o que o endpoint devolve (`CURRENT_DRIVER_TRIP_STATUSES`) | `route_planned`, `dispatched`, `in_transit`, `on_delivery_route` |
| o que conta como concluída (`CONCLUDED_TRIP_STATUSES`)    | `completed`, `cancelled`                                         |

A interseção é vazia. A consulta filtra a viagem para fora no instante em que ela vira `completed`
(`drizzle-current-driver-trip.repository.ts:94`), então a última cópia que o app guardou ainda diz
`on_delivery_route`. O ramo "concluída é caminho normal" de `hasReassignedTrip` é **código morto**
contra este endpoint, e a 217 até nomeou a distinção que ele não alcança: "sem distinguir
'reatribuída' de 'concluída'" (D6).

Sequência medida, lendo o código:

1. cópia local: a viagem, `on_delivery_route`
2. o motorista conclui a última parada → a API marca `completed` → ela sai da resposta
3. leitura nova: a viagem não está lá; a cópia local diz `on_delivery_route` → "não concluída"
4. aviso na tela, e ele só sai se o motorista tocar para dispensar
   (`useDriverTrip.hook.ts:892` é o único lugar que o desliga)

**Resultado desejado:** concluir a viagem não produz aviso nenhum. Troca de tripulação e devolução a
`draft` continuam avisando, como a 217 quis.

### O teste ficou verde sobre um estado que o ambiente não produz

`test/driver-trip/trip-reassignment.contract.ts` tem o caso "viagem concluída some pelo caminho
normal — não é aviso", e ele **passa**. Ele monta a lista anterior já com `status: 'completed'` — um
estado que o endpoint não consegue entregar ao app. O teste afirma uma situação inalcançável, então
ficou verde enquanto o caminho real falha sempre.

Isto é parte do escopo, não nota de rodapé: sem trocar esse caso por um que parta de
`on_delivery_route`, o conserto não tem como ser provado, e o próximo a mexer aqui reencontra o
mesmo verde enganoso.

## Fora do escopo

- Mudar o aviso de troca de tripulação em si (texto, lugar, molde) — a 217 decidiu e está certo.
- Notificação por push ou sino para reatribuição (a 217 §269 já registrou que ficou fora).
- Rever o que conclui a viagem no servidor. Quem conclui é a API, como consequência da última
  parada; isto não muda.
- A conclusão por **cancelamento** (`cancelled`) não é relatada como defeito e segue o mesmo
  caminho que o conserto abrir — sem tratamento próprio.

## Histórias priorizadas

### P1 — Concluir a viagem não acusa reatribuição

**Given** o motorista com uma viagem em `on_delivery_route` no celular
**When** ele conclui a última parada e o app relê a viagem
**Then** nenhum aviso de "movida para outro motorista" aparece, e a tela cai no estado de sem viagem

### P2 — A troca de tripulação continua avisando

**Given** o motorista com uma viagem em `in_transit` no celular
**When** o escritório troca o motorista da viagem e o app relê
**Then** o aviso de reatribuição aparece, como hoje

### P3 — A baixa feita pelo escritório também não acusa

**Given** uma viagem que o escritório conclui pelo motorista (spec 156)
**When** o app relê a viagem
**Then** nenhum aviso de reatribuição aparece — a viagem terminou, mesmo sem ação do motorista

## Requisitos funcionais

- **RF1** — `GET /me/trips/current` passa a devolver a viagem **recém-concluída** junto das ativas,
  com o status real (`completed`/`cancelled`), por uma janela curta depois da conclusão. Fora da
  janela ela desaparece como hoje.
- **RF2** — A escolha da viagem exibida **ignora viagem concluída**: `resolveSelectedTrip` não elege
  concluída nem como padrão em rota nem como `trips[0]`. Motorista cuja única viagem terminou cai no
  estado de sem viagem, não na viagem terminada.
- **RF3** — `hasReassignedTrip` não muda de regra: com RF1, a cópia local passa a registrar
  `completed` antes de a viagem sair, e o ramo existente deixa de ser inalcançável.
- **RF4** — O caso de teste "concluída não é aviso" passa a partir de `on_delivery_route` — a
  sequência real —, não de `completed` montado à mão.

## Requisitos não funcionais

- A janela de RF1 não acrescenta consulta: é predicado na consulta que já existe.
- Nenhum campo novo no contrato de `GET /me/trips/current`. A 217 evitou isso de propósito, e o
  conserto não precisa: o que faltava era o status chegar, não um campo novo para explicá-lo.
- `companyId` continua vindo do contexto autenticado; o recorte de tripulação não muda.

## Casos extremos e falhas

- **Viagem concluída há muito tempo** (fora da janela): some sem aviso. A cópia local também já foi
  descartada por `hasOnlyConcludedTrips`/24 h, então não há comparação a fazer.
- **App que ficou dias sem abrir**: a cópia local vencida é descartada no boot, e lista anterior
  vazia nunca gera aviso (caso já coberto no contrato).
- **Duas viagens, uma concluída e outra em rota**: a concluída entra na resposta por RF1, e RF2 faz o
  seletor eleger a que está em rota. A concluída não deve aparecer como opção escolhível.
- **Reatribuição logo após a conclusão**: se a viagem concluída for reatribuída dentro da janela, o
  status lido é `completed` e não há aviso. É o comportamento correto — ela terminou; quem a recebeu
  não vai dirigir nada.
- **Troca de veículo que devolve a `draft`**: continua avisando. `draft` não é concluída e não entra
  na janela de RF1.

## Critérios de aceite

- **CA1** — Integração contra Postgres: viagem concluída agora aparece em `GET /me/trips/current`
  dentro da janela, com `status: 'completed'`, e não aparece fora dela.
- **CA2** — Contrato: `resolveSelectedTrip` não devolve viagem concluída em nenhum dos três caminhos
  (escolhida, padrão em rota, `trips[0]`).
- **CA3** — Contrato: a sequência real não avisa — lista anterior com `on_delivery_route`, leitura
  nova com a mesma viagem em `completed`, depois ausente; nenhum aviso nas duas leituras.
- **CA4** — Contrato: troca de tripulação continua avisando (lista anterior `in_transit`, viagem
  ausente sem passar por `completed`).
- **CA5** — Prova por mutação: desfazer RF2 faz CA2 falhar; desfazer RF1 faz CA3 falhar.
- **CA6** — Revisão de design: print da tela do motorista ao concluir a última viagem, mostrando o
  estado de sem viagem e **sem** o aviso, nos três tamanhos (375, 768, 1280).

## Dúvidas

- **A janela de RF1** — proposta: **15 minutos** desde `updatedAt`. Cobre com folga o intervalo de
  releitura do app e o celular que ficou um tempo na mão do motorista depois da última entrega, sem
  manter viagem velha na resposta. Não é bloqueante: qualquer valor entre 5 e 60 minutos satisfaz as
  histórias, e o número fica registrado como constante nomeada, não espalhado na consulta.

## Decisão: por que a janela no servidor, e não memória no app

A alternativa considerada foi o app lembrar que **ele** concluiu: a drenagem já devolve `sentKeys`
(`useDriverTrip.hook.ts:381`), as chaves que o servidor aceitou, dentro do mesmo hook onde a
comparação acontece. Daria para marcar a viagem como "concluída por mim" e tirá-la da comparação,
sem tocar na API.

Foi recusada por **cobrir menos**: ela só sabe da conclusão que passou pelo aparelho. A baixa que o
escritório dá pelo motorista (spec 156) conclui a viagem sem ação dele, e o aviso falso
continuaria — o mesmo defeito, por outra porta, encontrado depois pelo usuário em vez de agora.

A janela no servidor custa um filtro a mais (RF2) que a memória no app não custaria. É um custo
conhecido e contido, contra um buraco que ficaria aberto.

E ela não inventa caminho novo: **o app já foi escrito esperando viagem concluída na lista.**
`hasOnlyConcludedTrips` existe, decide se a cópia local ainda serve e é usada em três lugares de
`tripSnapshot.service.ts`. Essa função só tem sentido se `completed` puder chegar ao app. O filtro do
endpoint é o que deixou esse ramo — e o da reatribuição — sem como acontecer.

## Emenda à spec 217

A 217 D6 decidiu que "a ausência já é o sinal", sem campo novo no contrato. **Isso continua
valendo** — e continua sem campo novo. O que esta spec corrige é que a ausência, sozinha, não
distingue conclusão de reatribuição, porque o status que faria a distinção nunca chegava ao app. A
217 nomeou a distinção; faltava o dado para fazê-la.
