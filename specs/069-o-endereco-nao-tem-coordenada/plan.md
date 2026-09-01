# Plano técnico

## Contexto e premissas

A ADR-0044 já decidiu o caro: cascata de precisão, parada em centroide fora da otimização (§5),
otimização no worker (§7), `place_id` como saída de licença (§3). O que existe e não se toca:
`geocoding.schema.ts`, `geocoding-precision.policy.ts`, `geocoding.port.ts`,
`geocode-address.use-case.ts`, `drizzle-geocoded-address.repository.ts`,
`geocoded-address-correction.use-case.ts`.

**O que esta spec muda em relação à ADR: a ordem dos provedores.** O CEP passa a ser o degrau
primário e o provedor pago vira escalada por marca humana (D1). Pede adendo na ADR.

## Arquitetura e arquivos afetados

### Duas apps, necessidades diferentes — e por isso nenhuma cópia por valor

A escada de três degraus não roda toda no mesmo lugar, e é isso que resolve a questão de onde a
geocodificação mora:

| degrau                         | onde       | por quê                                                         |
| ------------------------------ | ---------- | --------------------------------------------------------------- |
| 1 — CEP, em lote e sob demanda | **worker** | é trabalho assíncrono, e `readStops` é onde a coordenada falta  |
| 2 — provedor pago, por marca   | **API**    | é ação humana síncrona: alguém clicou e está esperando resposta |
| 3 — pino manual                | **API**    | já existe (`geocoded-address-correction.use-case.ts`)           |

As duas apps precisam de **coisas diferentes**, então não há regra duplicada:

- o **worker** leva a cascata (`geocodeAddresses`), a `GeocodingPort`, o gateway de CEP, o de
  centroide e `toGeocodingPrecision`;
- a **API** leva só uma use case nova e estreita — _reconsultar este endereço no provedor fino e
  substituir se for mais fino_ —, que é vizinha da correção manual que já mora lá, e usa
  `isFinerPrecision`, que também já está lá.

`geocode-address.use-case.ts` e `geocoding.port.ts` **se movem** para o worker: hoje não têm chamador
em app nenhuma, e a API não passa a precisar deles. `geocoding-precision.policy.ts` se **parte por
consumidor** — `isFinerPrecision` fica na API (reconciliação), `toGeocodingPrecision` e
`isOptimizablePrecision` vão para o worker (leitura de provedor). Partir por consumidor evita a
paridade que duplicar o arquivo criaria.

⚠️ **A marca chamar o provedor de dentro do request não contraria o RNF3.** Aquele requisito proíbe
rede de terceiro no caminho de **vincular nota** — o separador que bipa etiqueta não pode esperar. A
marca é o oposto: é uma pessoa pedindo explicitamente que se conserte um endereço, e ela precisa da
resposta para saber se deu certo (RF5). Uma chamada, iniciada por humano, com humano esperando.

### Arquivos

| arquivo                                                                      | ação                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `worker/src/routing/application/geocode-address.use-case.ts`                 | **movido** da API                            |
| `worker/src/routing/application/geocoding.port.ts`                           | **movido** da API                            |
| `worker/src/routing/domain/geocoding-precision.policy.ts`                    | **novo** — metade de leitura                 |
| `worker/src/routing/infrastructure/brasil-api-postal-code.gateway.ts`        | **novo** — degrau 1                          |
| `worker/src/routing/infrastructure/municipality-centroid.gateway.ts`         | **novo** — queda do degrau 1                 |
| `worker/src/routing/infrastructure/drizzle-geocoded-address.repository.ts`   | **novo**                                     |
| `worker/src/geocoding-backfill/`                                             | **novo** — a rotina de população             |
| `worker/src/routing/infrastructure/drizzle-route-optimization.repository.ts` | `readStops` recebe o mapa resolvido          |
| `worker/src/routing/infrastructure/route-optimization-ports.factory.ts`      | fiação                                       |
| `api/src/routing/application/refine-address.use-case.ts`                     | **novo** — a marca                           |
| `api/src/routing/infrastructure/google-geocoding.gateway.ts`                 | **novo** — degrau 2                          |
| `api/src/routing/presentation/*.routes.ts`                                   | rota da marca                                |
| `api/src/routing/domain/geocoding-precision.policy.ts`                       | fica só `isFinerPrecision`                   |
| `api/src/config/`                                                            | `GEOCODING_API_KEY` opcional                 |
| `frontend/src/modules/trip/`                                                 | ação "endereço errado" no painel de sugestão |

## Contratos/API/eventos

**Uma rota nova e uma rotina nova. Nenhuma fila nova.**

- `POST /route-suggestions/:id/stops/:stopId/refine-address` — `trip.manage`, escopo `company`.
  Responde com o que aconteceu: substituiu (com a precisão nova), **não melhorou**, ou provedor não
  configurado. Nunca `204` mudo: o conferente marcou porque quer saber (RF5).
- `geocoding.backfill` — rotina em `job_schedules`, ao lado de `nfe.distribution.pull`. Recebe a
  janela, resolve um lote e sai. Sem rotina registrada, a janela pousa em `job_run_routine_missing`,
  como as demais.

A resolução sob demanda dentro da sugestão acontece no consumo de `route-optimization.v1` que já
existe, entre reservar a sugestão e pedir a matriz — não é trilho novo. Um trilho próprio adiaria a
coordenada para depois do pedido, e a primeira sugestão de uma viagem nova sairia sem paradas: o
defeito de hoje, com outro nome.

## Dados, migration e rollback

- `geocoded_addresses` **já existe** com todos os CHECKs (T002 da 058). Passa a receber linha — é
  uso, não mudança de forma.
- **Uma tabela nova:** centroide de município (código IBGE, lat, lon), **sem `company_id`**,
  acrescentada ao contrato de tenant safety como **segunda exceção declarada**, ao lado de
  `fuel_price_references`. Exceção que se acrescenta sem ser dita vira precedente para a terceira.
- **Uma tabela nova de trilha:** a marca (RF10) — quem marcou, endereço, resposta do provedor, se
  substituiu. Append-only, mesmo padrão de `audit_logs`.
- Seed dos 5.570 centroides **pelos use cases**, nunca `INSERT` bruto.
- Rollback é reverter código; o que já foi geocodificado continua servindo.

## Segurança e tenant

- **Endereço é PII e sai para terceiro.** Já há achado datado em `docs/SECURITY.md` (o termo do
  Photon); esta feature acrescenta dois fluxos e o achado é **atualizado**, não repetido.
- **RNF1 é bloqueante e fácil de violar sem querer:** a resposta de erro do provedor ecoa o endereço
  enviado. Gateway loga código e `addressKey`, nunca corpo.
- **A marca gasta dinheiro numa tabela sem tenant** (RF11): permissão `trip.manage` e teto por
  janela. Sem o teto, um laço de tela chama o provedor pago em série.
- A chave é opcional no schema de env; ausente, o gateway não é construído e a marca responde
  indisponível.

## Idempotência e concorrência

- Escrita `insert ... on conflict (address_key)`; `shouldReplaceStored` decide se sobrescreve.
- Rotina reexecutada não duplica trabalho: ela seleciona por ausência em `geocoded_addresses`.
- Duas sugestões concorrentes com o mesmo endereço novo podem resolver duas vezes. Aceito — o degrau
  1 é de graça, e um lock por endereço custa mais que a chamada que ele economiza.
- Marca repetida no mesmo endereço: a segunda encontra a coordenada já fina e responde "não
  melhorou" sem chamar o provedor.

## Observabilidade

- `geocodedCount` já é devolvido pela use case e ninguém o lê. Vira log estruturado, **separado por
  origem** — é isso que responde P6: quantos saíram de graça e quantos foram ao provedor pago.
- A rotina registra tamanho do lote, resolvidos e causa dos que não resolveram.
- A trilha da marca (RF10) é o dado que diz se comprar precisão fina valeu a pena.
- Nunca endereço em nenhuma dessas linhas.

## Estratégia de testes

**O aceite não pode injetar `GeocodingPort`.** Foi assim que a T006 da 058 ficou verde sem adaptador
nenhum. O fake é de **transporte** — o `fetch` injetado no gateway —, e o teste exercita o adaptador
real por cima dele (CA5).

- **Domínio** — `toGeocodingPrecision` com `location_type` desconhecido; RF9 pelo `street` ausente.
- **Adaptador de CEP** — corpo real medido, `location` ausente, 429, CEP geral.
- **Adaptador pago** — os quatro `location_type`, `ZERO_RESULTS`, 429, `place_id` sempre persistido.
- **A marca** — as três respostas (substituiu, não melhorou, sem chave), e a recusa de escrita
  quando a precisão não é mais fina (CA7).
- **CA6 é o contrato que guarda a decisão de custo:** uma sugestão inteira faz zero chamadas ao
  provedor pago. Sem ele, alguém acrescenta escalada automática seis meses adiante e ninguém vê.
- **Log** — varredura por campo de endereço nas linhas emitidas.
- **Integração** — sugestão ponta a ponta com OSRM de fixture, provando parada dentro da otimização.

## Riscos

| risco                                                             | mitigação                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| precisão de CEP não bastar para ordenar numa operação concentrada | a marca é o instrumento de medida: se for muito usada, é sinal de que o degrau 1 não basta |
| a marca virar hábito e o custo subir sem ninguém ver              | teto por janela (RF11) + trilha (RF10)                                                     |
| mudar `buildStopAddressKey` invalidar a base inteira de uma vez   | contrato que trave a forma da chave — mudá-la passa a ser decisão, não `replace`           |
| BrasilAPI bloquear por volume                                     | lotes pequenos com intervalo (RNF4); queda desce a cascata                                 |
| endereço vazando em log de erro                                   | contrato de varredura, não disciplina                                                      |
| a rotina nunca alcançar o backlog                                 | a resolução sob demanda cobre a lacuna por desenho (RF2)                                   |
