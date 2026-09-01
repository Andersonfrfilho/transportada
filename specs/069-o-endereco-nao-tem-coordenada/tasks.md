# Tasks

> 🤖 Modelo da fase: `sonnet`. T001 e T020 são 🧠 — validar com `opus`.

✅ **Sem `[NEEDS CLARIFICATION]` aberta.** D1: BrasilAPI como degrau primário e provedor pago como
escalada por marca humana (2026-09-01) — **inverte a ADR-0044 §3 e pede adendo**. D2: tabela semeada
dos 5.570 centroides.

A ordem das fases é a da escada: o degrau de graça primeiro, porque ele sozinho tira a otimização do
zero e é a rede que segura a operação se a chave do provedor pago faltar ou for suspensa. A Fase C
não precisa da chave para ser escrita e testada — só o deploy dela a espera.

## Fase 0 — O adendo, antes do código

> 🤖 `opus` 🧠

- [x] T001 🧠 ✅ Adendo na ADR-0044 §3 registrando a inversão da cascata: o CEP é primário, o provedor
      pago é escalada por marca, e a exceção de licença continua valendo sobre um número muito menor
      de linhas — `docs/adr/0044-*.md` — **aceite:** a próxima pessoa entende por que a ordem
      escrita na §3 não é a implementada

## Fase A — O fio e o degrau de graça

- [x] T002 🧠 ✅ Mover `geocode-address.use-case.ts` e `geocoding.port.ts` da API para o worker, e
      partir `geocoding-precision.policy.ts` por consumidor (`isFinerPrecision` fica na API;
      `toGeocodingPrecision`/`isOptimizablePrecision` vão para o worker) — **dependência:** T001 —
      **verificação:** `bun run typecheck` nas duas apps — **aceite:** nenhuma cópia por valor nova;
      a correção manual da API segue compilando
- [x] T003 [P] ✅ `drizzle-geocoded-address.repository.ts` no worker sobre `geocodedAddresses`, que
      `src/database/routing.schema.ts` já declara — **dependência:** T002
- [x] T004 ✅ Contrato do gateway de CEP **antes** do gateway: corpo real medido, `location` ausente,
      429, e **CEP geral virando `city` pelo `street` ausente** (RF9 — sem este caso a Fase A põe
      palpite de quilômetros dentro da rota) — `worker/test/routing/postal-code-geocoding.contract.ts`
      — **dependência:** T002 — **aceite:** teste vermelho pelo motivo certo
- [x] T005 ✅ `brasil-api-postal-code.gateway.ts` lendo `location.coordinates` do `/cep/v2` — o **mesmo
      endpoint** que `postal-code.gateway.ts` já chama e cujo campo é hoje descartado —
      **dependência:** T004 — **aceite:** grava `source: 'postal_code'`, `external_place_id` vazio
- [x] T006 [P] ✅ Migration da tabela de centroide de município, **sem `company_id`**, acrescentada ao
      contrato de tenant safety como **segunda exceção declarada** — **dependência:** T002 —
      **verificação:** `make migration-test` — **aceite:** exceção dita por escrito
- [x] T007 ✅ Seed dos 5.570 centroides pelos **use cases**, nunca `INSERT` bruto — **dependência:**
      T006 — **aceite:** reexecutar não duplica linha
- [x] T008 ✅ `municipality-centroid.gateway.ts` lendo a tabela — **dependência:** T007, T005 —
      **aceite:** grava `city`, e a parada sai marcada, fora da otimização
- [x] T009 ✅ O fio: a fábrica de portas monta a cascata e o handler a chama entre reservar a sugestão e
      pedir a matriz; `readStops` recebe o mapa resolvido — **dependência:** T003, T005, T008 —
      **verificação:** `bun run --cwd apps/worker-transportada test` — **aceite:** endereço novo vira
      linha durante a sugestão (RF2)
- [x] T010 [P] ✅ Log estruturado **separado por origem** e as causas dos que não resolveram —
      **dependência:** T009 — **aceite:** P6
- [x] T011 ✅ Contrato de varredura de log: nenhum campo de endereço em linha nenhuma —
      **dependência:** T010 — **aceite:** CA9
- [x] T012 ✅ Integração ponta a ponta com OSRM de fixture, provando parada **dentro** da otimização —
      **dependência:** T009 — **verificação:** `make routing-fixture && OSRM_DATASET=fixture make routing-up && make worker-integration`
      — **aceite:** CA10, hoje impossível

## Fase B — A população adiantada

- [x] T013 ✅ Contrato da rotina: só chave ausente, endereço repetido é uma chamada, reexecução não
      refaz nada — `worker/test/geocoding-backfill/routine.contract.ts` — **dependência:** T009
- [x] T014 ✅ `geocoding.backfill` em `worker/src/geocoding-backfill/`, registrada no
      `JobRoutineRegistry` e agendada em `job_schedules` — **dependência:** T013 — **aceite:** CA2
- [x] T015 [P] ✅ Lotes pequenos com intervalo e `AbortSignal` (RNF4) — a BrasilAPI é serviço público —
      **dependência:** T014
- [x] T016 [P] ✅ Contrato que trava a forma de `buildStopAddressKey` — mudá-la invalidaria a base
      inteira de uma vez, e precisa ser decisão, não `replace` — **dependência:** T014

## Fase C — A marca, e o degrau que custa

> Implementável e testável inteira **sem a chave** (fake de transporte). Só o deploy a espera.

- [ ] T017 [P] `GEOCODING_API_KEY` opcional no schema de env da API, com o gateway construído só
      quando existe — **dependência:** T009 — **aceite:** RF7, a app sobe sem a chave
- [ ] T018 Contrato do gateway pago **por fake de transporte, não por porta falsa** (CA5): os quatro
      `location_type`, `ZERO_RESULTS`, 429, `place_id` sempre persistido — **dependência:** T017 —
      **aceite:** nenhum teste passa com `GeocodingPort` substituída por objeto literal
- [ ] T019 `google-geocoding.gateway.ts` na API — o arquivo que a T006 da spec 058 listou e nunca
      escreveu — **dependência:** T018
- [ ] T020 🧠 `refine-address.use-case.ts` e a rota `POST
/route-suggestions/:id/stops/:stopId/refine-address` (`trip.manage`), com as **três** respostas
      — substituiu, não melhorou, sem chave — e **nunca `204` mudo** — **dependência:** T019 —
      **aceite:** CA7 e CA8; a linha em base fica intacta quando não melhorou
- [ ] T021 [P] Trilha da marca (RF10), append-only — **dependência:** T020
- [ ] T022 [P] Teto por janela (RF11) — sem tenant na tabela, a marca de uma empresa gasta por todas
      — **dependência:** T020
- [ ] T023 **CA6 — o contrato que guarda a decisão de custo:** uma sugestão inteira, com endereços
      novos e paradas colidindo na mesma coordenada, faz **zero** chamadas ao provedor pago —
      **dependência:** T020 — **aceite:** sem ele, alguém acrescenta escalada automática seis meses
      adiante e ninguém vê
- [ ] T024 Ação "endereço errado" no painel de sugestão, imprimindo a resposta da rota — inclusive o
      _"não melhorou — ajuste o ponto à mão"_, que oferece o degrau 3 — **dependência:** T020
- [ ] T025 [P] Atualizar o achado de endereço saindo para terceiro em `docs/SECURITY.md` — não
      repetir: o existente é o termo do Photon, e agora há dois fluxos novos — **dependência:** T019
- [ ] T026 [P] `.env.example`: o comentário de `GEOCODING_API_KEY` descreve hoje um comportamento que
      nenhum código implementa — **dependência:** T019

## Fase D — Fecho

- [ ] T027 `make check` verde e `evidence.md` das quatro fases — **aceite:** CA11

---

## Rastreabilidade

| requisito               | tasks                     |
| ----------------------- | ------------------------- |
| RF1 (população)         | T013, T014, T015          |
| RF2 (sob demanda)       | T009                      |
| RF3 (marca humana)      | T020, T023                |
| RF4 (substituição)      | T020                      |
| RF5 (não melhorou)      | T020, T024                |
| RF6 (`place_id`)        | T018, T019                |
| RF7 (sem chave)         | T017, T020                |
| RF8 (cascata de queda)  | T005, T008                |
| RF9 (CEP geral)         | T004, T005                |
| RF10 (trilha)           | T021                      |
| RF11 (permissão e teto) | T022                      |
| RNF1                    | T010, T011                |
| RNF2                    | T017                      |
| RNF3                    | T002 (a decisão de mover) |
| RNF4                    | T015                      |
| RNF5                    | T003, T006                |
