# Plano técnico

## Contexto e premissas

A ADR-0044 já decidiu tudo o que é caro: provedor (§3), exceção de licença com `place_id` como saída
(§3), cascata de precisão (§3, §5), parada em centroide fora da otimização (§5), otimização no worker
(§7). **Esta spec não decide arquitetura; ela executa a que já está escrita.**

O que existe e não se toca: `geocoding.schema.ts`, `geocoding-precision.policy.ts`,
`geocoding.port.ts`, `geocode-address.use-case.ts`, `drizzle-geocoded-address.repository.ts`,
`geocoded-address-correction.use-case.ts`.

O que falta são **duas pontas e um fio**: o adaptador do provedor, o adaptador de centroide, e a
chamada no caminho real.

## Arquitetura e arquivos afetados

### A geocodificação muda de app, e não vira cópia

Hoje `geocodeAddresses` mora na API e **não tem chamador em app nenhuma**. Quem precisa dela é o
worker: `readStops` é onde a coordenada falta, e é o único lugar que sabe quais endereços a sugestão
vai usar.

Duas saídas, e a diferença entre elas é o custo permanente:

- **copiar** para o worker — a quarta cópia por valor do repositório, com contrato de paridade e a
  obrigação eterna de mudar dos dois lados;
- **mover** — a API perde uma use case que ela nunca chamou.

Move. A cópia por valor se justifica quando as duas apps de fato usam a regra (`FUEL_TYPES`,
`pool-address-key`); aqui a API não usa e não vai usar, porque geocodificar em request de vincular
nota é rede de terceiro no caminho do separador (RNF3).

**O que fica na API:** o repositório Drizzle e a correção manual — que é rota HTTP e pertence ali —
mais `isFinerPrecision`, que a correção usa.
**O que vai para o worker:** `geocode-address.use-case.ts`, `geocoding.port.ts`,
`toGeocodingPrecision`, `isOptimizablePrecision`, e o repositório equivalente sobre a cópia de schema
que o worker já tem (`src/database/routing.schema.ts` já declara `geocodedAddresses`).

⚠️ `geocoding-precision.policy.ts` se **divide**, e isso é intencional: `isFinerPrecision` é regra de
reconciliação (API, correção manual) e `toGeocodingPrecision`/`isOptimizablePrecision` são regra de
leitura do provedor (worker). Dividir por consumidor evita a paridade; duplicar o arquivo inteiro a
criaria.

### Arquivos

| arquivo                                                                      | ação                                         |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `worker/src/routing/infrastructure/google-geocoding.gateway.ts`              | **novo** — adaptador de `GeocodingPort`      |
| `worker/src/routing/infrastructure/centroid.gateway.ts`                      | **novo** — `CentroidPort`, dois degraus      |
| `worker/src/routing/infrastructure/drizzle-geocoded-address.repository.ts`   | **novo**                                     |
| `worker/src/routing/application/geocode-address.use-case.ts`                 | **movido** da API                            |
| `worker/src/routing/application/geocoding.port.ts`                           | **movido** da API                            |
| `worker/src/routing/domain/geocoding-precision.policy.ts`                    | **novo**, com a metade de leitura            |
| `worker/src/routing/infrastructure/drizzle-route-optimization.repository.ts` | `readStops` passa a receber o mapa resolvido |
| `worker/src/routing/infrastructure/route-optimization-ports.factory.ts`      | fiação                                       |
| `worker/src/config/environment.schema.ts`                                    | `GEOCODING_API_KEY` opcional                 |
| `api/src/routing/domain/geocoding-precision.policy.ts`                       | fica só `isFinerPrecision`                   |
| `.env.example`                                                               | comentário do efeito real da chave vazia     |

## Contratos/API/eventos

**Nenhuma rota nova, nenhum envelope novo, nenhuma fila nova.** A geocodificação acontece dentro do
consumo de `route-optimization.v1` que já existe, entre reservar a sugestão e pedir a matriz. Isso é
deliberado: um trilho próprio de geocodificação adiaria a coordenada para depois do pedido, e a
primeira sugestão de uma viagem nova sairia sem paradas — que é exatamente o defeito de hoje.

O contrato externo com o provedor é HTTP e vive só no gateway. O uso de `fetch` com `AbortSignal` e
concorrência limitada é do adaptador, não da use case — ela recebe a porta e não sabe de rede.

## Dados, migration e rollback

**Nenhuma migration.** `geocoded_addresses` está criada, com todos os CHECKs, desde a T002 da 058. A
tabela está vazia e passa a receber linha — é uso, não mudança de forma.

Rollback é reverter código: sem o gateway, a cascata volta a descer para lugar nenhum e as paradas
voltam a ficar fora da otimização. Nenhum dado gravado fica órfão, e o que já foi geocodificado
continua servindo.

## Segurança e tenant

- **`geocoded_addresses` não tem `company_id`, por decisão registrada no schema.** O contrato de
  tenant safety que a lista como exceção declarada não muda — e se ela sumir da lista, o contrato
  passa a cobrar o tenant, que é a proteção certa contra alguém acrescentar coluna sem pensar.
- **Endereço é PII e sai para terceiro.** Isto já é achado datado em `docs/SECURITY.md` (o termo de
  busca do Photon indo ao navegador); esta feature acrescenta um segundo fluxo e o achado precisa ser
  **atualizado**, não repetido — agora com o endereço estruturado de NF-e indo ao Google, sob a
  exceção de licença que a ADR-0044 §3 assumiu por escrito.
- **RNF1 é bloqueante e é fácil de violar sem querer:** a resposta de erro do provedor ecoa o
  endereço enviado. O gateway loga código e `addressKey`, nunca corpo.
- A chave entra pelo schema de env como opcional; ausente, o gateway não é construído e a porta
  devolve `null` sempre.

## Idempotência e concorrência

- A gravação é `insert ... on conflict (address_key)` — o repositório já faz isso.
- Duas sugestões concorrentes com o mesmo endereço novo podem geocodificar duas vezes. **Aceito**:
  o custo é uma chamada, e um lock por endereço para economizá-la é complexidade cara contra ganho
  pequeno. `shouldReplaceStored` garante que a segunda escrita não piora a primeira.
- Reentrega de mensagem repete a geocodificação? Não: o primeiro ciclo já gravou, e o segundo lê de
  base. A idempotência vem da tabela, não do broker.

## Observabilidade

- `geocodedCount` já é devolvido pela use case e hoje ninguém o lê. Passa a virar log estruturado por
  sugestão (`route_optimization_geocoded`, com `suggestionId` e contagem — nunca endereço).
- A métrica de volume da ADR-0044 §3 (mitigação 3) sai de `geocoded_addresses.geocoded_at`, que já
  tem índice: novos por período e total em base, por consulta.
- Falha do provedor vira contador de causa (`provider_error`, `zero_results`, `not_configured`), não
  linha por endereço.

## Estratégia de testes

O ponto que decide se esta spec conserta o defeito ou o repete:

**O aceite não pode injetar `GeocodingPort`.** Foi assim que a T006 da 058 ficou verde sem adaptador.
Aqui o fake é de **transporte** — o `fetch` injetado no gateway —, e o teste exercita o adaptador
real por cima dele. `CA4` cobra isto por texto de fonte se preciso.

Camadas:

- **Domínio** — `toGeocodingPrecision` já tem contrato; acrescenta-se o `location_type` desconhecido.
- **Adaptador** — resposta real do provedor (fixture de corpo), os quatro `location_type`,
  `ZERO_RESULTS`, 429, timeout, e a asserção de que `place_id` sempre é persistido.
- **Log** — varredura das linhas emitidas pela suíte do adaptador por qualquer campo de endereço.
- **Integração** — sugestão ponta a ponta com OSRM de fixture e transporte de geocodificação falso,
  provando `CA6`: parada **dentro** da otimização.

## Riscos

| risco                                                                 | mitigação                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| a chave não existe (D1) e a feature entrega encanamento sem resultado | entregar a cascata de centroide primeiro, que já tira parada de zero, e o gateway atrás de chave |
| gasto inesperado com provedor pago                                    | a métrica de volume é requisito (RF8), não enfeite                                               |
| endereço vazando em log de erro                                       | contrato de varredura, não disciplina                                                            |
| mover a use case entre apps quebrar a correção manual                 | a correção não usa a use case movida; `isFinerPrecision` fica onde está                          |
| a suspensão de chave por padrão de uso atípico (ADR-0044 §3)          | fora do nosso alcance; `place_id` guardado é a saída já decidida                                 |
