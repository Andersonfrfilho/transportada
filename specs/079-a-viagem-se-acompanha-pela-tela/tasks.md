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

- [x] **T021** ✅ **Fechada em 2026-09-02.** Os dois blocos vieram para antes de `TripStopList`;
      o que se **lê** — progresso, ocupação, mapa de carga — continua acima. Contrato de ordem por
      posição no JSX, provado por mutação.
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

- [x] **T010** ✅ **Fechada em 2026-09-02.** `tripProgress.service.ts`: rascunho não tem progresso
      nem previsão, e uma parada concluída não dá ritmo (com um ponto só não há intervalo para
      medir). A previsão parte do mais recente entre a última conclusão e agora — partir só da
      última daria término no passado para um caminhão parado, e o contrato pegou isso.
- [x] **T011** ⚠️ **`TripProgressBar.component.tsx` JÁ EXISTE** e já está no detalhe da viagem
      (`TripDetail.component.tsx:319`), com segmento por estado — entregue, carregada, pendente,
      devolvida, separada — e porcentagem. **Não recriar.**

      ✅ **Fechada em 2026-09-02**, e só com o que faltava: transição de largura com
      `prefers-reduced-motion` desligando **este** seletor, e a previsão ao lado. Sem ritmo medido a
      linha aparece dizendo que não há previsão, em vez de sumir — ausência de previsão é
      informação, e esconder a linha faz o operador achar que a tela não carregou.

- [x] **T012** ✅ **Fechada em 2026-09-02.** ⚠️ Não é cópia do `mapProjection.service.ts` do portal
      do cliente: lá a janela é fixa porque há um ponto só; aqui ela enquadra o roteiro inteiro. Sem
      extensão — uma parada, ou várias no mesmo portão — o ponto vai ao centro, senão a divisão pela
      amplitude daria `NaN` em toda coordenada.
- [x] **T013** ✅ **Fechada em 2026-09-02**, pelo primitivo `VectorMap` que já existia para a malha
      do IBGE. A coordenada sai de `geocoded_addresses` pela `address_key` — `trip_stops.latitude`
      existe e nunca é escrita (achado da T009), e lê-la devolveria nulo em toda parada.

### P10 · P11 · P13 — o ponto se corrige, a ordem se edita, o anexo se abre

- [x] **T023** ✅ **Fechada em 2026-09-02.** A rota `PATCH /geocoded-addresses/:addressKey` já
      existia **inteira** e sem consumidor nenhum. ⚠️ A chave não é UUID (`cityCode|postalCode|
number`): sem `encodeURIComponent` o pipe quebra o caminho e o servidor responde 404 para um
      endereço que existe. O texto diz que a correção vale para **todas** as viagens que passem por
      aquele portão, não só a que está aberta.
- [x] **T024** ✅ Reordenar as paradas **na proposta**, antes de aceitar. **Não** é o arraste de
      `TripStopList`, que reordena a viagem.

      **Decidido em 2026-09-02: a distância some, e a tela diz por quê.** Recalcular exigiria a
      matriz do OSRM, que roda no **worker** — um GA dentro do `Bun.serve` derruba o event loop
      (ADR-0044 §7), e é por isso que a sugestão já é assíncrona. Rota nova, fila nova e espera nova
      por um número que o operador reconfere ao aceitar.

      Publicar o número velho ao lado da ordem nova é a mentira que a task nomeia; **esconder sem
      dizer** é a versão silenciosa dela — quem viu 51 km e depois não vê nada conclui que a tela
      quebrou. A distância sai e o lugar dela é ocupado pela frase que explica.

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

## Fora do `tasks.md`, e fechadas junto

- [x] **Polling** ✅ **2026-09-02.** O `refetchInterval` existia desde a 057 P2 mas olhava só o
      estado da viagem: uma viagem despachada com tudo entregue seguia batendo no servidor para
      sempre, porque o estado só vira `completed` quando alguém fecha. Agora são **duas** condições
      — estar na rua e haver nota que ainda pode mudar —, mais o botão "Atualizar agora" ao lado do
      automático.

- [x] **Cadeia órfã de `deliverDocument`** ✅ **2026-09-02: decidido NÃO remover, com guarda.**

      `repository.deliverDocument` → `useCase.deliverDocument` ficou sem chamador quando a rota de
      entregar passou para a máquina de estados. Ela é a escrita que gravava `delivered_at` sem
      tocar em `separation_status` — o defeito que travou a barra de progresso.

      ⚠️ `test/integration/trip-repository.integration.ts` a usa para **preparar** o estado "nota
      entregue" e então provar que o `release` a recusa e que o tenant vizinho não escreve na nota
      alheia. Trocá-la por um `UPDATE` cru contradiria a regra do produto (`separation_status` nunca
      muda por UPDATE direto) e enfraqueceria cobertura de isolamento por causa de uma limpeza.

      O que impede o defeito de voltar é `test/trip-delivery-proof/orphan-deliver.contract.ts`:
      religar a rota à escrita antiga **reprova**. Remover a cadeia continua sendo limpeza legítima
      — mas é task própria, e ela começa por dar outra preparação de estado àquele teste.
