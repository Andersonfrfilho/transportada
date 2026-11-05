# Feature 297 — Viagem com coletas

> Nasce de um pedido de Anderson (05/11/2026): _"um módulo de viagem que necessita coletas"_. **Esta é
> uma proposta de desenho** — o que está marcado `[NEEDS CLARIFICATION]` precisa dele antes de
> implementar. O módulo de contas recorrentes e adicionais é outra spec, independente desta.

## Problema e resultado

Hoje toda viagem **só entrega**. O caminhão sai do barracão carregado (`separating → loading →
dispatched`), e cada `trip_stops` é um destino: a nota (`trip_documents`) entra na viagem **antes** da
saída, é separada e carregada no barracão, e termina em `delivered` ou `returned`. Não existe, em
nenhuma tabela, o conceito de **ir buscar carga em outro endereço**:

```
$ rg -n -i 'pickup|coleta' apps/api-transportada/src/trips apps/api-transportada/src/database/trip.schema.ts
(só a "devolução/retirada" do CT-e: pickup_indicator em cte_emission_profiles)
```

O motorista que precisa passar no fornecedor, recolher a carga e só então entregar hoje depende de
combinar por fora: a coleta não aparece na rota, não entra na capacidade do baú, não tem prova, não
tem horário, e a nota dessa carga ainda nem existe na viagem.

**Resultado:** uma viagem pode ter **paradas de coleta** além das de entrega. O operador planeja a
coleta (endereço, janela, o que será recolhido), a rota respeita "coletar antes de entregar", o
motorista registra a coleta no campo (app ou grupo do WhatsApp) com prova, e a carga recolhida passa a
ser carga da viagem, entregue numa parada de entrega ou devolvida ao barracão.

## Fora do escopo

- **Viagem só de coleta com nota de transporte própria** (a transportadora cobra a coleta como
  serviço): depende da resposta P1 abaixo e, se for o caso, é fase posterior.
- **Emissão fiscal da coleta** (CT-e com `pickup_indicator`, MDF-e com carregamento em mais de um
  município): só a leitura de que o gate fiscal não quebra. Mudar regra de emissão é outra spec.
- **Coleta recorrente / agendada** (toda terça no fornecedor X). Pode vir depois como gerador de
  coletas planejadas.
- **Cobrança da coleta no frete** (preço de coleta na tabela de frete).
- **Reordenar a rota por otimização com precedência** na primeira entrega: a primeira versão aceita a
  ordem manual com validação; o solver do worker ganha a restrição na Fase 5.

## Desenho proposto (resumo)

A parada **continua sendo a mesma tabela** (`trip_stops`) e ganha um **tipo**. A carga ganha um
**segundo ponto de contato**: onde foi recolhida. Nada de tabela paralela de "viagem de coleta".

```
trip_stops.kind              'delivery' (padrão, todo o legado) | 'pickup'
trip_documents.pickup_stop_id  parada onde a carga foi recolhida (nulo = saiu do barracão, como hoje)
trip_documents.separation_status  + 'collected' entre 'pending' e 'loaded' para carga de coleta
trip_pickup_items            o que se espera recolher numa parada de coleta (descrição, volumes, peso,
                             nota esperada), antes de a nota existir
```

Fluxo da carga recolhida: `pending` (esperada) → `collected` (motorista recolheu e conferiu) →
`delivered` | `returned` (devolvida ao barracão). Para carga que **já tem nota**, o vínculo
`trip_documents` já existe e apenas ganha `pickup_stop_id`. Para carga **sem nota ainda**, nasce um
`trip_pickup_items` e o vínculo da nota é criado quando a nota chegar (importação de NF-e, spec 005).

## Histórias priorizadas

### P1 — O operador planeja uma coleta dentro da viagem

**Given** uma viagem em `awaiting_crew`, `draft` ou `route_planned` **When** o operador adiciona uma
parada de coleta informando endereço, janela opcional e o que será recolhido **Then** a parada
aparece no roteiro com o selo "Coleta", entra no cálculo de distância/ETA/pedágio e na capacidade
prevista do baú, e a viagem **não** perde nenhuma regra atual de entrega.

### P2 — A rota não entrega o que ainda não foi coletado

**Given** uma nota que será coletada na parada 2 e entregue na parada 4 **When** o operador tenta
colocar a entrega antes da coleta **Then** a tela e a API recusam com erro de precedência, dizendo
qual coleta falta.

### P3 — O motorista registra a coleta

**Given** uma viagem `on_delivery_route` e o motorista na parada de coleta **When** ele registra
"coletei" (app ou grupo do WhatsApp) com foto da nota/canhoto de coleta e a conferência de volumes
**Then** a parada fecha com hora e posição (carimbo de local, ADR-0081), a carga vira `collected` e
passa a contar no baú, e o escritório vê o que foi recolhido contra o que era esperado.

### P4 — A coleta tem ocorrência

**Given** uma parada de coleta **When** o motorista não consegue coletar (cliente ausente, carga não
está pronta, volume divergente) **Then** ele registra uma ocorrência de coleta, a carga esperada
continua `pending` e a viagem segue; o escritório decide reagendar (nova coleta em outra viagem) ou
cancelar a coleta.

### P5 — A carga recolhida é entregue ou devolvida

**Given** carga `collected` **When** a viagem chega à parada de entrega dela **Then** vale o fluxo de
entrega de hoje (canhoto, ocorrência, devolução). Se a viagem encerra com carga `collected` ainda a
bordo, o encerramento é recusado até cada item ser entregue ou devolvido ao barracão.

### P6 — O escritório vê a viagem inteira

**Given** uma viagem com coletas **When** o operador abre a viagem **Then** vê a linha do tempo
única (coletas e entregas na ordem do roteiro), a ocupação do baú **ao longo do trajeto** (sobe na
coleta, desce na entrega) e o aviso quando o pico ultrapassa a capacidade.

## Requisitos funcionais

- RF1. `trip_stops.kind` (`delivery` | `pickup`), `NOT NULL DEFAULT 'delivery'`, com `CHECK`. Toda
  linha existente fica `delivery` — migration aditiva, rollback documentado.
- RF2. Parada de coleta aceita: endereço (mesma `address_key`/geocodificação das paradas), janela
  (`delivery_window_*` vale como janela de coleta), contato no local e observação. Reaproveita
  `arrived_at`, `completed_at`, `en_route_since`, ETA e distância já existentes.
- RF3. `trip_pickup_items`: `company_id`, `trip_id`, `stop_id` (parada de coleta), descrição, volumes,
  peso, `nfe_document_id` opcional, `status` (`expected | collected | not_collected`), quantidade
  coletada. Isolada por tenant.
- RF4. `trip_documents.pickup_stop_id` (FK composta com `company_id`, `RESTRICT`), nulo para o
  legado. Uma nota coletada precisa ter `stop_id` (entrega) **depois** do `pickup_stop_id` na
  sequência, ou ser marcada como "volta ao barracão".
- RF5. Ações permitidas por status (`trip-allowed-actions.policy.ts`): coleta pode ser acrescentada
  até `route_planned` pelo escritório; **durante a rota** só pelo escritório, com o mesmo cuidado da
  spec 257 (acrescentar nota a viagem que já saiu) e registro em evento.
- RF6. Registro de coleta pelo motorista: novo tipo em `trip_stop_events` (`pickup_completed`),
  mesmo carimbo de local do toque de entrega; prova = foto(s); sem canhoto assinado obrigatório.
- RF7. Ocorrência de coleta: reaproveita `trip_stop_occurrences` com tipos próprios do catálogo de
  ocorrências (escopo "coleta"), sem criar um segundo sistema de ocorrências.
- RF8. Capacidade/peso: `trip-occupancy`, `trip-cargo-weight` e o `cargo layout` passam a calcular
  ocupação **por trecho do roteiro**; carga de coleta só conta a partir da parada de coleta.
- RF9. Encerramento (`trip-close.policy.ts`) recusa viagem com item `collected` sem destino final.
- RF10. Rota: o plano valida precedência (coleta antes da entrega da mesma carga). O solver do worker
  ganha a restrição de precedência (par coleta→entrega) na Fase 5.
- RF11. WhatsApp (specs 292/293): "coletei" no grupo vira o mesmo evento do app; o roteiro de
  perguntas segue o `whatsapp-occurrence-draft` já existente.
- RF12. Notificação ao cliente: mensagem "carga coletada" pelo módulo de notificações (286); nenhum
  modelo fixo no código.

## Requisitos não funcionais

- `company_id` do contexto autenticado; contrato de isolamento de tenant para as tabelas novas.
- Migrations **aditivas**; `kind` com default preserva leitura de toda viagem existente. Nada destrutivo.
- Compatibilidade com app antigo do motorista: parada `pickup` que o app antigo não conhece não pode
  travar a viagem — a API do app (`/me/trips/current`) devolve o tipo e o app antigo cai no fluxo de
  "parada genérica" (precisa ser verificado na Fase 0).
- Espelho de regra API ↔ worker (como `depot-origin`): contrato de paridade para a precedência.
- Testes de contrato **antes** da implementação, listados no `package.json` da app (regra da casa).

## Casos extremos e falhas

| Caso                                                              | Comportamento esperado                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Coleta sem nota ainda no momento de coletar                       | Registra o item (`trip_pickup_items`); nota entra depois; entrega só com nota |
| Coletou volumes a menos/mais que o esperado                       | Conferência registra o divergente; o escritório vê divergência, não bloqueia |
| Baú estoura capacidade no pico                                    | Aviso na montagem (não bloqueia — igual ao aviso atual de peso)             |
| Coleta cancelada com a viagem já na rua                           | Parada vira `cancelled` por evento; carga esperada volta a `pending` solta   |
| Motorista chega e a carga não está pronta                         | Ocorrência de coleta; viagem continua; coleta pode ser reagendada            |
| Viagem cancelada com carga já `collected`                         | Recusa até a carga ser devolvida/registrada (carga de terceiro não some)     |
| Coleta e entrega no mesmo endereço                                | Duas paradas distintas com a mesma `address_key` (tipos diferentes)          |
| Mudança de tripulação (transferCrew) depois de coletar            | Carga `collected` acompanha a viagem; nada muda por causa da troca           |

## Critérios de aceite

- Viagem existente continua idêntica (todas as paradas `delivery`, nenhum teste atual muda).
- Viagem com uma coleta e duas entregas: planeja, despacha, coleta, entrega e encerra sem erro.
- Entrega antes da coleta correspondente é recusada na API (contrato) e na tela.
- Encerrar com carga `collected` a bordo é recusado com código próprio.
- Ocupação do baú por trecho mostra o pico correto num caso de teste conhecido.
- O app antigo do motorista não quebra numa viagem com parada de coleta.

## Dúvidas

`[NEEDS CLARIFICATION]` — só o Anderson responde (recomendação entre parênteses):

1. **O que é a coleta no negócio?** (a) buscar carga do **contratante/fornecedor** para trazer ao
   barracão ou levar a um destino, dentro de uma viagem que também entrega; (b) viagem **só** de
   coleta, cobrada como serviço; (c) os dois. _(Recomendo (a) agora; (b) como fase posterior.)_
2. **A carga coletada tem nota fiscal no momento da coleta?** Sempre / às vezes / nunca (a nota é
   emitida pela transportadora depois). _(Define se `trip_pickup_items` é obrigatório ou exceção.)_
3. **Destino da carga coletada:** entregue na mesma viagem, levada ao barracão, ou ambos conforme o
   caso? _(Recomendo permitir os dois, por item.)_
4. **Quem cria a coleta:** só o escritório, ou o motorista também pode acrescentar uma coleta na
   rua? _(Recomendo só o escritório na v1.)_
5. **Prova da coleta:** foto basta, ou precisa de assinatura/nome de quem entregou a carga?
   _(Recomendo foto + nome de quem entregou, igual ao "recebido por".)_
6. **Cobrança:** a coleta entra no cálculo de frete/custo da viagem agora, ou só passa a existir
   como parada operacional? _(Recomendo só operacional; custo da viagem já cobre o km rodado.)_
7. **Fiscal:** hoje existe CT-e com "retira" (`pickup_indicator`). A coleta que você imagina é essa
   retirada, ou outra coisa? Vai exigir MDF-e com mais de um município de carregamento?
