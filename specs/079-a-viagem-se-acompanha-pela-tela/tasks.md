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
      seis tons distinguíveis; a transição é `flex-grow 240ms ease` e
      `@media (prefers-reduced-motion: reduce)` já a desliga (`trip.module.css`). Nada a fazer.

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
- [x] **T020** 🧠 **Ocorrência por produto, com tipo.** Decisões registradas em 2026-09-02, antes do
      código:

      **Os tipos são sete, em dois grupos.** Separação: `item_faltante`, `item_avariado`,
      `divergencia_quantidade`. Entrega: `recusa_total`, `recusa_parcial`, `avaria_transporte`,
      `destinatario_ausente`. O grupo não é enfeite — é ele que decide a permissão.

      **Quem registra sai do grupo, não do papel.** Ocorrência de separação é `trip.manage` (o
      galpão, onde o separador trabalha); de entrega é `trip.report` (a rua, que é do motorista). O
      separador tem `trip.manage` e **não** tem `trip.report`, e essa é exatamente a linha que a
      ADR-0043 já traçou entre barracão e rua — repeti-la aqui mantém as duas coerentes em vez de
      criar um segundo critério ao lado.

      **Ela só anota.** Não bloqueia transição, não muda `separation_status`. Bloquear misturaria
      dois eixos — o estado da nota e o que houve com ela — e deixaria o operador sem saída, porque
      não existe tela de resolução de ocorrência. Quando existir, é decisão nova, por escrito.

      ⚠️ Tipo de ocorrência é catálogo: `*.constant.ts` + CHECK no banco + **cópia por valor** no
      frontend com contrato de paridade, como `FUEL_TYPES` e `VEHICLE_TYPES`.

      **O que entrou e o que ficou de fora, em 2026-09-02:** a ocorrência de **separação** está
      inteira — migration, catálogo com CHECK, política de permissão, rota, tela. A de **entrega**
      não: ela é `trip.report`, e uma rota do escritório com essa permissão deixaria o motorista
      alcançar **qualquer** viagem da empresa. Quem pegou foi
      `test/driver-trip/me-routes.contract.ts`, que afirma que nenhuma rota do escritório é
      alcançável pelo papel `driver`. Ela precisa da árvore `/me/current-trip`, que resolve o
      motorista e escopa pela viagem ativa dele — task própria.

      ⚠️ **A migration não foi verificada contra Postgres**: o Docker não estava no ar nesta sessão,
      e `make migration-test` não rodou. O CHECK dos sete tipos é conferido por leitura do SQL
      (`test/trip-occurrence/catalog.contract.ts`), o que pega tipo esquecido mas **não** pega erro
      de sintaxe nem de constraint. Rodar `make migration-test` antes de publicar em produção.

      **O que entrou e o que ficou de fora, em 2026-09-02:** a ocorrência de **separação** está
      inteira — migration, catálogo com CHECK, política de permissão, rota, tela. A de **entrega**
      não: ela é `trip.report`, e uma rota do escritório com essa permissão deixaria o motorista
      alcançar **qualquer** viagem da empresa. Quem pegou foi `test/driver-trip/me-routes.contract.ts`,
      que afirma que nenhuma rota do escritório é alcançável pelo papel `driver`. Ela precisa da
      árvore `/me/current-trip`, que resolve o motorista e escopa pela viagem ativa dele — task
      própria.

      ⚠️ **A migration não foi verificada contra Postgres**: o Docker não estava no ar nesta
      sessão, e `make migration-test` não rodou. O CHECK dos sete tipos é conferido por leitura do
      SQL (`test/trip-occurrence/catalog.contract.ts`), o que pega tipo esquecido mas **não** pega
      erro de sintaxe nem de constraint. Rodar `make migration-test` antes de publicar em produção.
