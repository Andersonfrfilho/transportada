# Feature 199 — A parada do motorista tem coordenada

## Problema e resultado

`GET /me/trips/current` devolve `latitude`/`longitude` de cada parada lendo
`trip_stops.latitude/longitude`. Essas colunas **nunca são escritas**: a coordenada viva mora em
`geocoded_addresses`, casada pela `address_key` (spec 079 T009, 2026-09-02;
`trip-stop-coordinates.support.ts`; `trip.port.ts`). A resposta sai sempre com coordenada nula, e a
distância até a parada no app do motorista (spec 082 D2, `driverStopDistance.service.ts`) nunca
aparece — nem na app própria (`apps/frontend-driver`, ADR-0075), nem no `/minha-viagem` do painel.

O achado estava registrado desde a 079 ("apesar de o app do motorista os ler") e foi lembrado de
novo pela 195 (§ Fora do escopo). Nenhuma das duas o corrigiu.

Resultado: a parada cujo endereço está geocodificado chega ao motorista com a coordenada de
`geocoded_addresses`; a parada sem pino continua chegando com `null`, e a tela continua sem
distância para ela.

## Fora do escopo

- **A pontualidade da foto de entrega** (spec 159, ADR-0070 §5-6).
  `DrizzleDeliveryProofRepository.findDeliveryContext` lê as mesmas colunas mortas, e por isso
  `delivery-proof-punctuality.policy.ts` sempre cai para a posição do evento de entrega como
  referência. Trocar a referência para o pino do endereço **muda a nota do motorista** — é decisão de
  regra, não conserto de leitura, e fica para uma spec própria.
- **Apagar `trip_stops.latitude/longitude/geocoding_precision`.** Migration destrutiva exige plano de
  rollback e aprovação; nada aqui depende disso.
- **Mudar o formato da resposta.** O campo continua `string | null` (numeric em texto), como já
  declaram a API e o `driverTripResponse.validation.ts` da app.
- **Isolar `geocoded_addresses` por empresa** (ADR-0044, 084 T1d).

## Histórias priorizadas

### P1 — O motorista vê a que distância está da parada

**Given** uma viagem do motorista com uma parada cujo endereço tem pino em `geocoded_addresses` e
outra sem pino, **When** a app lê `GET /me/trips/current`, **Then** a primeira parada vem com a
latitude e a longitude do pino, a segunda com `null` nas duas, e as paradas continuam as mesmas, na
mesma ordem.

## Requisitos funcionais

- **RF1** — `listStops` do `DrizzleCurrentDriverTripRepository` lê a coordenada por `left join` com
  `geocoded_addresses` em `address_key`, na mesma consulta que já lê as paradas (sem N+1).
- **RF2** — O recorte de tenant continua no `where` de `trip_stops` (`company_id` do contexto).
  `geocoded_addresses` não tem tenant de propósito (ADR-0044), e `address_key` é a PK dela: o join
  não multiplica parada.

## Requisitos não funcionais

- Coordenada é dado de endereço do destinatário: não entra em log, em nenhum nível.

## Casos extremos e falhas

| Caso                                     | Resultado                                           |
| ---------------------------------------- | --------------------------------------------------- |
| Endereço sem pino                        | `latitude`/`longitude` `null`; a tela não mostra km |
| Pino corrigido à mão (`source = manual`) | sai a coordenada corrigida, como qualquer outra     |
| Duas empresas com a mesma `address_key`  | cada uma lê o mesmo pino; a parada é só da própria  |

## Critérios de aceite

- **CA1** — Integração (Postgres): `test/integration/me-trip.integration.ts` "a parada geocodificada
  chega com coordenada, e a sem pino chega vazia" — reprova antes da correção, passa depois.
- **CA2** — As demais suítes de `me-trip.integration.ts` (incluindo "a viagem de uma empresa não
  alcança o motorista de outra") e os contratos `tenant-safety` seguem verdes.
- **CA3** — A distância aparece no cartão da parada na app do motorista, vista no preview local antes
  de subir.

## Dúvidas

Nenhuma.
