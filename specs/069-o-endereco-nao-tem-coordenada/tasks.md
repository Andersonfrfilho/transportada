# Tasks

> 🤖 Modelo da fase: `sonnet`. T001 e T010 são 🧠 — validar com `opus`.

✅ **As duas dúvidas foram fechadas em 2026-09-01** — D1: Google, com a coordenada em base
permanentemente (a exceção de licença da ADR-0044 §3 confirmada); D2: tabela semeada dos 5.570
centroides. Nenhuma `[NEEDS CLARIFICATION]` aberta: pode começar.

⚠️ A Fase B **não está bloqueada por decisão, e sim por uma chave que ainda não existe**. Ela se
implementa e se testa inteira com fake de transporte; o que espera a chave é só a variável em staging.

A feature tem **duas metades que entregam em separado**, e a ordem não é a óbvia.

A metade barata vem primeiro **porque ela sozinha já tira a otimização do zero**: o centroide de CEP
grava precisão `postal_code`, e `postal_code` **passa** no portão de coordenada fina
(`precision !== 'city'`). Uma parada em centroide de CEP é uma parada boa o bastante para entrar na
rota — erra o número, não o quarteirão. Fazer o Google primeiro amarraria a entrega inteira a uma
chave que talvez não exista, por um ganho de precisão sobre uma base que hoje é vazia.

---

## Fase A — O fio, e a coordenada que não custa nada

> Destrava a otimização sem depender de chave paga. Bloqueada só por D2 (em T005).

- [ ] T001 🧠 Mover `geocode-address.use-case.ts` e `geocoding.port.ts` da API para
      `worker/src/routing/application/`, e partir `geocoding-precision.policy.ts` por consumidor
      (`isFinerPrecision` fica na API; `toGeocodingPrecision` e `isOptimizablePrecision` vão para
      `worker/src/routing/domain/`) — **dependência:** nenhuma — **verificação:**
      `bun run typecheck` nas duas apps — **aceite:** nenhuma cópia por valor nova; a correção manual
      da API segue compilando e com contrato verde
- [ ] T002 [P] `drizzle-geocoded-address.repository.ts` no worker sobre `geocodedAddresses` que
      `src/database/routing.schema.ts` já declara, com `on conflict (address_key)` —
      **dependência:** T001 — **verificação:** contrato do repositório
- [ ] T003 Contrato do gateway de centroide **antes** do gateway: CEP com coordenada, CEP sem
      coordenada, provedor fora do ar, CEP malformado, e **CEP geral de município virando `city`**
      (RF9 — sem este caso a Fase A põe palpite de quilômetros dentro da rota) — `worker/test/routing/centroid.contract.ts` —
      **dependência:** T001 — **aceite:** teste vermelho pelo motivo certo
- [ ] T004 `centroid.gateway.ts`, degrau do CEP pela BrasilAPI `/cep/v2` — o destino externo que a
      API **já** consulta em `postal-code.gateway.ts`, e por isso não abre origem nova —
      **dependência:** T003 — **verificação:** T003 verde — **aceite:** grava `source: 'postal_code'`,
      `precision: 'postal_code'`, `external_place_id` vazio (o CHECK só o exige para `google`)
- [ ] T005a Migration da tabela de centroide de município (código IBGE, lat, lon) — **sem
      `company_id`**, e acrescentada ao contrato de tenant safety como **segunda exceção declarada**
      ao lado de `fuel_price_references` — **dependência:** T001 — **verificação:**
      `make migration-test` — **aceite:** exceção dita por escrito no contrato, não implícita
- [ ] T005b Seed dos 5.570 centroides, pelos **use cases**, nunca por `INSERT` bruto —
      **dependência:** T005a — **aceite:** reexecutar não duplica linha
- [ ] T005c Degrau do município no `centroid.gateway.ts`, lendo a tabela — **dependência:** T005b,
      T004 — **aceite:** grava `source: 'city'`, `precision: 'city'`, e a parada sai marcada, fora da
      otimização
- [ ] T006 O fio: `route-optimization-ports.factory.ts` monta a geocodificação e o handler a chama
      entre reservar a sugestão e pedir a matriz; `readStops` passa a receber o mapa resolvido em vez
      de só o `leftJoin` — **dependência:** T002, T004 — **verificação:**
      `bun run --cwd apps/worker-transportada test` — **aceite:** endereço novo vira linha em
      `geocoded_addresses` durante a sugestão
- [ ] T007 [P] Log estruturado `route_optimization_geocoded` com `suggestionId` e contagem, e os três
      contadores de causa — **dependência:** T006 — **aceite:** RNF1, nenhum campo de endereço
- [ ] T008 Contrato de varredura de log: a suíte do gateway não emite nenhum campo de endereço em
      linha nenhuma — `worker/test/routing/geocoding-log-privacy.contract.ts` —
      **dependência:** T007 — **aceite:** CA5
- [ ] T009 Integração ponta a ponta com OSRM de fixture e transporte falso, provando parada
      **dentro** da otimização — `worker/test/integration/` — **dependência:** T006 —
      **verificação:** `make routing-fixture && OSRM_DATASET=fixture make routing-up && make worker-integration`
      — **aceite:** CA6, que hoje é impossível

## Fase B — O provedor pago, e a precisão de telhado

> Decidida. Entrega precisão `rooftop`/`street` sobre a base que a Fase A já fez andar. Implementável
> sem a chave (fake de transporte); só o deploy em staging a espera.

- [ ] T010 🧠 `GEOCODING_API_KEY` no schema de env do worker como **opcional**, com o gateway
      construído só quando ela existe e aviso estruturado uma vez no boot quando não —
      **dependência:** Fase A — **verificação:** `bun run typecheck` — **aceite:** RF5, a app sobe sem
      a chave
- [ ] T011 Contrato do gateway Google **por fake de transporte, não por porta falsa** (CA4): os
      quatro `location_type`, `ZERO_RESULTS`, 429, timeout, e `place_id` sempre persistido —
      `worker/test/routing/google-geocoding.contract.ts` — **dependência:** T010 — **aceite:** teste
      vermelho; e nenhum teste desta fase passa com `GeocodingPort` substituída por objeto literal
- [ ] T012 `google-geocoding.gateway.ts` — o arquivo que a T006 da spec 058 listou e nunca escreveu —
      com concorrência limitada e `AbortSignal` (RNF4) — **dependência:** T011 —
      **verificação:** T011 verde
- [ ] T013 [P] Atualizar o achado de endereço saindo para terceiro em `docs/SECURITY.md` — não
      repetir: o achado existente é o termo do Photon, e agora há um segundo fluxo com endereço
      estruturado de NF-e sob a exceção de licença da ADR-0044 §3 — **dependência:** T012
- [ ] T014 [P] `.env.example`: o comentário de `GEOCODING_API_KEY` passa a dizer o efeito real —
      hoje ele descreve um comportamento que nenhum código implementa — **dependência:** T012
- [ ] T015 Consulta de volume (RF8): novos por período e total em base, sobre
      `geocoded_addresses.geocoded_at`, que já tem índice — **dependência:** T012 — **aceite:** P4

## Fase C — Fecho

- [ ] T016 `make check` verde e `evidence.md` das duas fases — **dependência:** Fase A (e Fase B, se
      D1 destravar) — **aceite:** CA7

---

## Rastreabilidade

| requisito | tasks                                 |
| --------- | ------------------------------------- |
| RF1, RF2  | T011, T012                            |
| RF3       | T003, T004, T005                      |
| RF4       | T006                                  |
| RF5       | T010                                  |
| RF6       | já implementado; regressão em T006    |
| RF7       | regressão em T001                     |
| RF8       | T015                                  |
| RNF1      | T007, T008                            |
| RNF2      | T010                                  |
| RNF3      | T001 (a decisão de mover, não copiar) |
| RNF4      | T012                                  |
| RNF5      | T002                                  |
