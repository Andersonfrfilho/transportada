# ADR-0063 — A planta do baú é calculada no worker, não na API síncrona

- **Data:** 2026-09-13
- **Estado:** aceita
- **Contexto:** implementa spec 145 (T0–T13). Estende ADR-0044 §7. Não revoga nada.

## Contexto

A API síncrona (`GET /trips/:id`, `POST /trips/cargo-preview`) chamava `resolveCargoLayout(...)` para desenhar o baú, recalculando a cada requisição. Medido na viagem `5715dd82` (51 paradas, 993 caixas): **16,9 s de CPU em 18 s de parede**, bloqueando o event loop. Rotas vizinhas de valuation caíam em **503 `DATABASE_UNAVAILABLE (query_timeout)`** — não porque elas empacotavam, mas porque o empacotamento das rotas irmãs as matava.

## Decisão

**O empacotamento sai do caminho da requisição síncrona (ADR-0044 §7).** A planta do baú passa a ser:

- **Calculada no worker** (`apps/worker-transportada`), em `new Worker()` de thread com orçamento de tempo.
- **Guardada em tabela própria** (`trip_cargo_layouts`) com ciclo de vida independente, nunca coluna de `trips`.
- **Enfileirada pela API** quando a entrada muda (eager: nos use cases que tocam paradas/caixas) ou quando alguém lê uma viagem cujo hash não bate (lazy: em `readTripDetail`).
- **Lida pela API** quando já pronta (`ready`), com estado `pending`/`failed`/`unavailable` enquanto calcula.
- **Reaproveitada entre prévia e viagem** — se o hash de entrada é idêntico, uma viagem criada com os mesmos dados reutiliza a planta que a prévia já pediu.

### Gatilho eager — D7

`trip.use-case.ts:create`, `linkDocument`/`releaseDocument`/`linkDocumentsBatch`, `reorder-trip-stops.use-case.ts`, `override-delivery-address.use-case.ts`, `reconcile-trip-stops.use-case.ts` chamam `requestCargoLayoutForTrip(transaction, { companyId, tripId, correlationId? })` como último passo da transação que muda parada ou caixa, enfileirando a planta com hash recalculado.

### Gatilho lazy — D10

`readTripDetail` recalcula o hash com o dado já carregado (barato — está em memória) e compara com o guardado. Não bate? Enfileira em transação curta separada. A leitura em si nunca fica mais lenta; o enfileiramento é idempotente por hash.

### Orçamento de tempo — D9/D13

Worker roda o empacotador numa `new Worker()` de thread com prazo. Tentativa N tem orçamento `base × 2^(N−1)`: 120 s, 240 s, 480 s no padrão. Vencido o prazo, as caixas ainda não visitadas voltam em `unplaced` com `reason: 'time_budget'`. Na última tentativa, a planta é gravada `ready` como ficou; nas anteriores, o worker reenfileira para retry com mais tempo.

Teto de execução fora da thread: orçamento da maior tentativa (480 s) + 10 s de margem externa + 30 s de folga do lease (todo worker parado mais tempo que isso é assumido morto e sua linha reaberta). Padrão: **520 s** entre tentativas.

### Recuperação de `running` órfão — D14

O claim do worker também aceita `running` cujo `updated_at` é mais velho que o lease. Sem essa regra: worker bate no meio do cálculo, e a linha fica presa em `running` para sempre. Com ela: a API reabre a linha (gatilho lazy) e o worker a reclama na próxima volta.

### Sem capacidade, não enfileira — D15

Se o baú não tem capacidade declarada (nem ficha, nem tipo de carroceria), a API não pede cálculo. Estado da tela: `unavailable`, igual a hoje quando sem baú. Sem essa regra: entry inválida chegaria ao worker, que falharia, causando retry em laço sem teto.

### Nunca sem resposta — D16

Todo caminho termina em `ready`, `failed` ou `unavailable`. Esgotadas as tentativas ou vencido o teto de tempo da tela (10 min, soma das três escalas + retries), a tela mostra "não foi possível calcular agora" e para de perguntar. Worker parado? Outbox segura o pedido até ele voltar. Linha em `queued` sem ninguém calculando? O gatilho lazy da API reabre. Mensagem perdida ou decode inválido? Idem.

### Ordem de deploy — D17

O frontend recusa a resposta inteira quando aparece uma chave desconhecida (`TRIP_DETAIL_OPTIONAL_KEYS`). Por isso o frontend vai para o ar primeiro — commit próprio aceitando `cargoLayoutState`, antes de a API servir. Sem essa ordem: frontend novo quebra com API velha ou vice-versa.

### Falha espera antes de reabrir — D18

O upsert só reabre uma linha `failed`/`queued`/`running` quando o `updated_at` dela é mais velho que o lease (~520 s). Entrada com erro legítimo (inválida, exceção do empacotador) seria reaberta a cada 3 s pelo polling e recalculada em laço sem teto. Uma entrada editada gera hash novo e é calculada na hora.

## Consequências

- **A planta agora é derivada, não dado transiente.** Hash muda, planta recalcula. Quebra de capacidade, mesma planta. Mudar `policyVersion` do pacote invalida toda planta guardada de qualquer empresa — sem job de backfill, cada viagem recalcula quando lida ou modificada.
- **A topologia de outbox e relay duplica o padrão do anexo do agregado** (ADR-0053). Reivindicação atômica por hash, não por ID. Nula → confirma e descarta. Hash superado → confirma e descarta.
- **Índices adicionais em `nfe_volumes`/`nfe_products`/`nfe_package_boxes`.** Consulta de cubagem já não passava por FKs sem índice; agora passa mais rápido.
- **Pacote `@adatechnology/cargo-placement` nasce aqui, consumido por API e worker.** Versão `rc` em desenvolvimento (link local). Publicação em npm além do link é decisão fora desta spec.
- ⚠️ **Esquema da coluna `input` de `trip_cargo_layouts` deve acompanhar `StoredCargoLayoutInput` da API.** Campo novo na API, sem atualizar o worker, vira `failed` no decode Zod. Mitigação: schema estrito na coluna, teste de paridade.
- ⚠️ **Lease padrão de 520 s declarado nos construtores dos repositórios da API.** Não há env nova. Mudança exigiria audit de todos os callers.
- ⚠️ **Teste isolado do worker contra Postgres real para reivindicação por lease não existe.** Testado em `DrizzleCargoLayoutRepository` mas dentro de contrato de composição com fake de transação.

## Alternativas consideradas

**Revalidação automática em massa quando `policyVersion` muda.** Recusada: job novo, custo indefinido, nenhum contato com a mudança para decidir se é ou não impacto de verdade. Cada viagem recalcula quando lida (lazy) ou modificada (eager).

**Calcular na viagem nova só se a prévia ainda estiver `queued`.** Recusada: race condition obrigatória; o caminho seguro é um mesmo hash resolver a viagem quando ela nasce, prévia ou não.

**Guardar hash+layout como colunas de `trips` em vez de tabela separada.** Recusada: layout é derivado que o worker reescreve, tabela separada com ciclo de vida próprio segue o padrão de `aggregate_attachment`. Reescrita de coluna de `trips` via worker sincronizado é acoplamento maior.

**Parar de calcular quando o tempo acabou, sem retry com mais tempo.** Avaliado e recusado: vencido o orçamento com caixa sobrando em `unplaced`, a experiência é "planta incompleta sempre". Retry com degrau duplo dá ao solver mais tempo. Decisão do usuário (D13) sobre quantos degraus.

## O que reabriria esta decisão

- **Migração de toda planta guardada quando `policyVersion` muda** — aí é decisão por escrito, não automático. Hoje cada consulta recalcula sob demanda.
- **Publicação do `@adatechnology/cargo-placement` além do link de desenvolvimento** — fora desta spec; registrado como pendência.
- **Capacidade de baú desconhecida que hoje não enfileira** (D15) — spec separada sobre carroceria `00` e cavalo sem capacidade está em andamento. Reduz entrada inválida que o worker rejeitaria.
