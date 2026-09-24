# Feature 182 — A ocorrência não espera a viagem sair

## Problema e resultado

Na linha da nota, durante o carregamento, o operador vê só **Separar**, **Desvincular** e **Desviar
entrega**. Não há como registrar ocorrência nem marcar entrega dali.

A causa está em `trip-allowed-actions.policy.ts:154`:

```ts
if (!canReportInField(input) || !isTripOnRoad(input.trip.status)) return []
```

`TRIP_ON_ROAD_STATUSES` é `dispatched`, `in_transit`, `on_delivery_route`. Viagem em `loading` fica
de fora, e a API devolve **lista vazia** de ações — o frontend não tem o que mostrar.

A regra faz sentido para chegada em parada: não se chega a um cliente sem ter saído. Mas **ocorrência
não é isso**. A avaria aparece no carregamento, a caixa vem faltando do estoque, o produto chega
trocado — tudo isso acontece com a viagem parada no barracão, e hoje o operador não tem onde
registrar sem sair da tela.

Resultado: ocorrência e baixa de entrega passam a ser possíveis a partir da linha da nota também
durante o carregamento, com foto e detalhes, no mesmo formulário que já existe.

## Fora do escopo

- **Registrar chegada em parada** antes de a viagem sair: continua exigindo viagem na estrada. Não
  se chega aonde não se foi.
- O formulário de ocorrência em si (specs 164, 166, 167), que não muda — só passa a ser alcançável
  de mais um estado.
- A exigência de foto por tipo (spec 179), que continua valendo igual.

## Histórias priorizadas

### P1 — Registrar o que aconteceu no barracão

**Given** uma viagem em carregamento
**When** o conferente acha a caixa violada
**Then** ele registra a ocorrência na linha daquela nota, com foto e observação.

### P2 — Dar baixa sem esperar o despacho

**Given** uma nota que já foi entregue por outro caminho
**When** o operador precisa registrar isso
**Then** consegue marcar a entrega a partir da linha da nota.

### P3 — A chegada continua onde faz sentido

**Given** uma viagem que ainda não saiu
**When** o operador olha a parada
**Then** não há "registrar chegada" — não se chega a um cliente sem ter saído.

## Requisitos funcionais

- **RF1** `resolveStopActions` deixa de exigir `isTripOnRoad` para a **ocorrência**; a chegada
  continua exigindo. Hoje as duas caem no mesmo `return []`.
- **RF2** `resolveFieldDocumentActions` libera `fieldOccurrence` também durante o carregamento —
  hoje ela exige `isTripDispatched`.
- **RF3** A baixa de entrega (`fieldDelivery`) fica disponível a partir da linha da nota nos estados
  em que a transição de entrega é aplicável, sem exigir que a viagem tenha saído.
  ⚠️ **Isto contraria a leitura física do estado**: marcar entregue uma carga que não saiu do
  barracão só faz sentido para corrigir registro ou para entrega feita por fora da viagem. Decisão do
  usuário em 24/09 — registrada aqui para que a próxima pessoa saiba que é deliberado.
- **RF4** A permissão `trip.report-on-behalf` continua governando quem vê essas ações. Nada aqui
  afrouxa autorização — só estado.
- **RF5** A ocorrência registrada dali aceita **foto e detalhes**, pelo mesmo caminho da spec 179
  (upload assinado, conferência do servidor, exigência por tipo).
- **RF6** A autoria continua marcada como do escritório em nome do motorista, como a spec 156
  definiu. O canal não muda por causa do estado.
- **RF7** Textos em pt-BR e en.

## Requisitos não funcionais

- Sem consulta nova: a mudança é de condição, não de dado.
- Os testes de contrato de `trip-allowed-actions.policy.ts` precisam cobrir cada estado
  explicitamente — é uma máquina de estados, e a regressão aqui é silenciosa.

## Casos extremos e falhas

- **Viagem em rascunho**: sem nota vinculada não há linha, e a questão não se coloca. Com nota
  vinculada, a ocorrência já faz sentido (a nota existe e algo pode ter acontecido com ela).
- **Viagem cancelada ou concluída**: continua sem ações — o que terminou não recebe registro novo.
- **Nota já entregue**: não oferece marcar entregue de novo; a política de transição já cuida disso.
- **Nota devolvida**: idem.

## Critérios de aceite

- **CA01** Viagem em carregamento oferece ocorrência na linha da nota.
- **CA02** Viagem em carregamento **não** oferece registrar chegada em parada.
- **CA03** A baixa de entrega aparece nos estados em que a transição é aplicável.
- **CA04** Sem `trip.report-on-behalf`, nada disso aparece.
- **CA05** A ocorrência registrada dali aceita foto e observação.
- **CA06** Viagem cancelada ou concluída não oferece nenhuma das duas.
- **CA07** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — decisão do usuário em 24/09, ciente de que a baixa de entrega antes do despacho contraria
a leitura física do estado (RF3).
