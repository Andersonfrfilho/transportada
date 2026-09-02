# Tasks — 079

> 🤖 Modelo: `sonnet`. T009 e T012 são 🧠 — a primeira decide se a spec continua, a segunda mexe em
> política de peso já registrada em ADR.

**P2 e P3 não estão aqui.** Elas dependem da ADR do contato do destinatário e da feature de
consentimento do motorista, e entram quando essas existirem. Ver a seção final.

## Fase 1 — O que não depende de nada

### P1 — o caminhão e a carga

- [ ] **T001** [P] `cargoWeightOrigin.service.ts` — resolve a origem do peso na ordem decidida
      (`pesoB` → itens, só se a nota inteira declara → `qVol` × médio → ausência) e devolve **valor +
      origem**. Contrato antes: nota parcial cai em volume, zero é recusado, ausência é ausência.
- [ ] **T002** Ocupação do veículo com a origem impressa — `TripVehiclePanel.component.tsx`.
      Contrato: nenhum número aparece sem a origem ao lado (CA2).
- [ ] **T003** 🧠 Desenho SVG do veículo com ocupação. **Antes de codar, escrever no comentário do
      componente o que a animação comunica além da barra.** Se não houver resposta, a animação não
      entra. Contrato: `prefers-reduced-motion` desliga o movimento.

### P5 — a prova da entrega

- [ ] **T004** [P] `GET /trips/:id/documents/:documentId/proof` — URL assinada, `fleet.read`, escopo
      `company`. Contratos: isolamento por tenant, e **nenhum link permanente no corpo**.
- [ ] **T005** `deliveryProof.service.ts` — o que a entrega concluída expõe: horário real,
      ocorrência, número da nota, cliente, endereço, CEP. Contrato: entrega **sem** comprovante diz
      "sem comprovante", nunca se confunde com "não entregue".
- [ ] **T006** `TripDeliveryProof.component.tsx` — foto e assinatura quando houver, e o resto sempre.
      Contrato de render por texto de fonte.

### P6 — o peso que vem dos itens

- [x] **T007** ✅ **Respondida em 2026-09-02: `nfe_products` não tem coluna de peso.** As treze
      colunas são código, descrição, NCM, CFOP, quantidade, unidade e valores. A NF-e não obriga peso
      por item, e o schema seguiu o que a nota traz.
- [x] **T008** ⛔ **Cancelada pela T007.** Sem peso persistido não há o que somar, e criar a coluna
      exigiria reprocessar os XMLs para descobrir que a maioria não declara. O peso segue por volume,
      como a ADR-0052 decidiu.

## Fase 2 — Progresso e mapa

- [x] **T009** ⛔ **Respondida em 2026-09-02: a coordenada não chega, e a fase 2 para aqui.**
      `trip_stops` guarda `latitude`, `longitude` e `geocoding_precision` próprios, e **nada os
      preenche**: nas doze paradas estão nulos, enquanto `geocoded_addresses` tem a coordenada pela
      mesma `address_key` — inclusive `rooftop` nas nove refinadas. A junção casa; o que falta é a
      cópia. Defeito da spec 073, registrado em `specs/073-*/evidence.md`. **T010–T013 ficam atrás dele.**
- [ ] **T010** [P] `tripProgress.service.ts` — porcentagem e previsão derivadas do estado das notas.
      Contrato: viagem em `draft` não tem progresso nem previsão; previsão declara que é estimativa.
- [ ] **T011** `TripProgressBar.component.tsx` — barra animada com porcentagem.
      Contrato: `prefers-reduced-motion` desliga a animação.
- [ ] **T012** `tripRouteMap.service.ts` — projeção das paradas. Contrato: **parada sem coordenada é
      nomeada fora do mapa**, nunca some (mesma regra da cidade sem polígono na aba Regiões).
- [ ] **T013** `TripRouteMap.component.tsx` — SVG com atendidas e próximas, cor pelos tokens.
      Contrato: `<svg>` cru é proibido fora de `components/ui/` — usar o primitivo.

## Fase 3 — Fechamento

- [ ] **T014** Smoke em 375px do detalhe com painel, progresso e mapa — sem rolagem horizontal (CA4).
- [ ] **T015** Contrato de privacidade: a tela **não** referencia `birthDate`, `phone` nem
      `licenseNumber` (CA5). Provar por mutação — acrescentar o campo e ver reprovar.
- [ ] **T016** `evidence.md` com o que entrou, o que ficou de fora e por quê.

## O que entra depois, e atrás de quê

| história         | depende de                            | o que falta                                                                                                                                    |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2** — contato | ADR do contato do destinatário        | telefone de XML fiscal usado para contato é finalidade nova sob a LGPD; a ADR escreve por que é compatível, quem revela e o que fica na trilha |
| **P3** — rastro  | feature de consentimento do motorista | tela de primeiro acesso com termos, aceite versionado, caminho de retirada, e a decisão de **não** bloquear quem não aceita                    |

## Gates de toda task

`bun run lint`, `bun run typecheck`, `bun test` e `bun run build` do app tocado; commit isolado por
task; `evidence.md` só depois da verificação executada, com o que ficou de fora escrito nele.

Contrato novo se prova por **mutação**: quebrar a regra, ver reprovar, restaurar. Contrato que nunca
viu o defeito é decoração.
