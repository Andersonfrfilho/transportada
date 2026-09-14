# Spec 115 — Plano

> 🤖 Modelo: `opus`

Tudo em `apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`, mais a passagem do
`laneCount` em `cargo-layout.policy.ts`.

1. `createSupportMap.seat` recebe `accept`: a recusa (comprimento, esbeltez, sombra) desliza a corrida
   uma célula em vez de abandonar a fileira.
2. `isStandingUp` substitui a conta "livre do piso ou presa na base": o limiar de contenção é
   `min(base, topo − 3 × base menor)`, conferido por `isConfined`, que já trata a porta como aberta.
3. `freezeLater`/`isShadowed`: o maior topo das paradas já carregadas entre cada célula e a face
   aberta, congelado a cada troca de parada no bloco por ordem de entrega.
4. `gridOrDepth` percorre `resolveGridLanes({ maxLanes })` de K decrescente; `laneCount` viaja na
   decisão e em `resolveCargoPlacement`.
5. `placeCargo` empacota sem teto; `resolveCargoPlacement` apara o desenho em `trimForDrawing`.

Contrato antes do código: `test/cargo-placement/real-mixed-cargo.contract.ts` sobre as duas cargas
reais anonimizadas em `test/fixtures/real-mixed-cargo.fixture.ts` (só números). Contratos antigos que
afirmavam regra revertida foram reescritos com a razão no teste.
