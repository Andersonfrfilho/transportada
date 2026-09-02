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
- [x] **T003** ✅ **Respondida em 2026-09-02: já existe inteira, e a animação também.**
      `TripCargoLayout.component.tsx` (spec 076) desenha o baú em escala, fatiado por parada, com
      seis tons distinguíveis; a transição é `flex-grow 240ms ease` e `@media (prefers-reduced-motion:
reduce)` já a desliga (`trip.module.css`). Nada a fazer.

                ⚠️ O desenho é **representação proporcional, não plano de estiva** — a NF-e não traz dimensão
                de volume, então não há como dizer onde cada caixa vai. Quem for mexer nele não deve fazê-lo
                sugerir posição de peça: a diferença entre "esta fatia é da parada 3" e "esta caixa vai neste
                canto" é a diferença entre ajudar e enganar.

                É o **sexto** item desta spec que pedia para criar algo existente. A conferência de existência
                antes de escrever arquivo novo deixou de ser recomendação e é o primeiro passo de toda task.

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

### P7 · P8 · P9 · P12 — a tela fala em nota, e a ocorrência ganha dono

- [ ] **T017** [P] Trocar identificador por **número da nota** na listagem de entregas e na prontidão
      fiscal, com valor e data. Contrato: **nenhuma listagem imprime UUID** (CA1). É a mesma família
      do rótulo da parada, que imprimia rua sem número.
- [ ] **T018** [P] Ícones de estado do CT-e na prontidão fiscal — emitido e transmitido. Contrato:
      ícone vem do primitivo (`components/ui/icon`), `<svg>` cru reprova.
- [ ] **T019** Expansível com **os produtos da nota** na entrega — `nfe_products` já persiste código,
      descrição e quantidade.
- [ ] **T020** 🧠 **Ocorrência por produto, com tipo.** Hoje a ocorrência é do **motorista**, por
      parada (`/me/current-trip/stops/:id/occurrences`), e **não existe por produto**. Esta task cria
      caminho novo: rota, migration e catálogo de tipos.

      **Antes de codar, decidir por escrito:** quais são os tipos (separação × entrega, e quais
      dentro de cada), quem pode registrar (o separador tem `trip.manage`, não `trip.report`), e o
      que a ocorrência faz com o estado da nota — bloqueia, marca, ou só anota.

      ⚠️ Tipo de ocorrência é catálogo: vai para `*.constant.ts` com CHECK no banco, e vira **cópia
      por valor** no frontend, com contrato de paridade — como `FUEL_TYPES` e `VEHICLE_TYPES`.

- [ ] **T021** [P] "Vincular nota" e "Ações da viagem" no topo do detalhe. Contrato de ordem por
      texto de fonte — a ordem é o que a task entrega, e ela se prova lendo o JSX.
- [ ] **T022** Contato do cliente e **contratante** na linha da entrega. ⚠️ Atrás da ADR do contato
      (ver o fim deste arquivo): o telefone do destinatário vem de XML fiscal.

## Fase 2 — Progresso e mapa

- [x] **T009** ✅ **Respondida em 2026-09-02: a coordenada chega, e a fase 2 está liberada.**
      Roteiro medido em staging com doze paradas reais: **51 813 m**, trechos de 34 893, 1 059, 2 920
      e 908 metros. `readStops` junta `geocoded_addresses` pela `address_key`, o OSRM responde, e as
      coordenadas são distintas.

      ⚠️ Dois achados que a T012 e a T013 herdam: `geocoding_precision` da parada da sugestão sai
      **`null`** (o `applyResolvedCoordinates` grava coordenada e não grava precisão), então o mapa
      **não pode** confiar nesse campo para distinguir rooftop de centroide — leia
      `geocoded_addresses`. E `trip_stops.latitude/longitude/geocoding_precision` **nunca são
      escritos**, apesar de o app do motorista lê-los.

- [ ] **T010** [P] `tripProgress.service.ts` — porcentagem e previsão derivadas do estado das notas.
      Contrato: viagem em `draft` não tem progresso nem previsão; previsão declara que é estimativa.
- [ ] **T011** ⚠️ **`TripProgressBar.component.tsx` JÁ EXISTE** e já está no detalhe da viagem
      (`TripDetail.component.tsx:319`), com segmento por estado — entregue, carregada, pendente,
      devolvida, separada — e porcentagem. **Não recriar.**

      O que falta é só o que P4 acrescenta: **animação da transição** com
      `prefers-reduced-motion` desligando, e a **previsão de término** ao lado. Contrato sobre o
      componente existente, não sobre um novo.

- [ ] **T012** `tripRouteMap.service.ts` — projeção das paradas. Contrato: **parada sem coordenada é
      nomeada fora do mapa**, nunca some (mesma regra da cidade sem polígono na aba Regiões).
- [ ] **T013** `TripRouteMap.component.tsx` — SVG com atendidas e próximas, cor pelos tokens.
      Contrato: `<svg>` cru é proibido fora de `components/ui/` — usar o primitivo.

### P10 · P11 · P13 — o ponto se corrige, a ordem se edita, o anexo se abre

- [ ] **T023** Correção **manual** do ponto e recálculo sem sair da tela. O port já prevê
      (`CorrectGeocodedAddressInput`); falta a tela e o recálculo. Contrato: corrigir grava com
      `source` próprio — **correção humana sempre vence** a cascata (ADR-0044 §3, degrau 1).
- [ ] **T024** 🧠 Reordenar as paradas **na proposta**, antes de aceitar. **Não** é o arraste de
      `TripStopList`, que reordena a viagem. **Decidir antes:** a distância recalcula junto, ou a
      proposta editada perde a distância? Publicar número velho ao lado de ordem nova seria mentira
      barata de cometer.
- [x] **T025** ✅ **Fechada junto com a T006 em 2026-09-02: são a mesma tela.** "Ver anexos da
      entrega" é abrir o comprovante, e duas telas para o mesmo canhoto seria divergência garantida.
      O painel abre pela linha da nota, só quando há entrega ou devolução para comprovar.
- [ ] **T026** ⛔ **Coordenada por estado (separar, carregar, entregar).** `trip_documents` tem os
      horários e **nenhuma coordenada**: exige migration.

      ⚠️ **Não começa sem decisão registrada.** O rastro da viagem se apaga no fechamento
      (`purgeByTrip`, ADR-0050 §5); este **não se apagaria** — fica no histórico da entrega. É rastro
      do trabalhador mais duradouro que o que ele consentiu, e muda a promessa feita a ele. Depende
      da feature de consentimento **e** de decidir a retenção.

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
