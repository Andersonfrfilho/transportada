# Spec 197 — A parada é do cliente

## Problema e resultado

Decisão do usuário (2026-09-25): **"Parada por cliente"**. O motorista reclamou que as paradas
"ficam misturadas" e "não fazem muito sentido". Hoje, duas lojas no mesmo endereço aparecem como uma
parada só, com as notas das duas embaixo do mesmo título, e o título é só o endereço.

Esclarecimento do usuário, no mesmo dia: _"parada por cliente mas, se um mesmo cliente está em
endereços diferentes cada um é uma parada"_. **A parada é o par (cliente, endereço).**

Medido no código em 25/09/2026:

1. **A regra atual foi decidida de propósito, e ao contrário.** A ADR-0043 §3
   (`docs/adr/0043-a-nota-anda-pela-viagem.md:86-100`) e a spec 056 D3
   (`specs/056-a-nota-anda-pela-viagem/spec.md:97-112`) dizem "uma parada por endereço de entrega
   distinto… e não o CNPJ… dois CNPJs no mesmo galpão são uma parada, e o motorista desce uma vez". A
   borda da 056 (`spec.md:237`) diz "destinatários diferentes, mesmo CEP e número → uma parada, rótulo
   com os dois nomes". **A metade "rótulo com os dois nomes" nunca foi implementada**: `buildStopLabel`
   (`stop-label.policy.ts:40-47`) só monta rua, número, cidade e UF. É isso que o motorista vê como
   "misturado".
2. **A chave da parada é só o lugar.** `buildStopAddressKey` (`stop-address-key.ts:53-61`) devolve
   `${cityCode}|${postalCode}|${number}`. `reconcileStopOnLink` (`reconcile-trip-stops.use-case.ts:52-64`)
   procura por `(companyId, tripId, addressKey)` e reaproveita a parada. Não existe unique em
   `(trip_id, address_key)` (`trip.schema.ts:593-606`; migration `20260824202501_trip_stops`).
3. **A mesma chave é a do lugar em todo o resto.**
   - É a PK de `geocoded_addresses` (`geocoding.schema.ts:21-32`).
   - É a chave de `address_correction_requests` e de `client_delivery_addresses`.
   - É a chave da correção de pino da 195 (`specs/195-o-endereco-errado-vira-correcao/spec.md:55-59`,
     ADR-0080 §1).
   - É por ela que o worker lê a coordenada da parada (`drizzle-route-optimization.repository.ts:488-503`).

   **Mudar o conteúdo de `address_key` quebraria a coordenada de todas as paradas.**

4. **O cliente da parada já é ambíguo em quatro lugares.**
   - Janela no roteirizador: vale a do **primeiro** CNPJ com cadastro (`resolvePoolWindow`, worker
     `drizzle-route-optimization.repository.ts:1104-1120`).
   - Agendamento: é um por parada (`trip_stop_schedules`, unique `(company_id, stop_id)`,
     `delivery-client.schema.ts:283-309`). O `delivery_client_id` dele existe e **nunca é escrito**
     (`drizzle-trip-stop-schedule.repository.ts:63-92`). A trava do despacho, por sua vez, resolve o
     cliente por nota (`unscheduled-stop.query.ts:51-66`).
   - Portal: o contratante que agenda pela chave de acesso agenda a **parada inteira**
     (`schedule-contractor-delivery.use-case.ts:50-54`), inclusive a entrega do vizinho.
   - Planta: o nome do cliente na linha é o da primeira nota (`trip-cargo-layout-input.support.ts:73`),
     e o segundo cliente some. A caixa que não coube (`unplaced`) leva só o rótulo de endereço
     (`cargo-layout-label.policy.ts:84-87`).
5. **O nome que já existe vem da linha errada.** `chooseNfeDestinationRow` põe em `recipientName` o nome
   da linha **escolhida para o endereço** (`nfe-destination-choice.policy.ts:88`). Quando a nota tem
   `<entrega>`, essa linha é a do local de entrega, não a do destinatário.
6. **A parada é a unidade de muita coisa.**
   - planta de carga: a sequência entra no hash (`cargo-layout-hash.policy.ts:51-58`);
   - chegada e deslocamento do ETA pelo atraso (`report-stop-arrival.use-case.ts:51-167`);
   - ETA (`drizzle-trip-route.repository.ts:225-260`);
   - agendamento, ocorrência de parada, reordenação (192) e o mapa do painel.

   O MDF-e **não** é por parada: ele agrupa por nota (`manifest-cities.policy.ts:42-80`). A única
   leitura de parada no MDF-e conta municípios distintos (`trip-fiscal-readiness.query.ts:128-145`), e
   essa conta não muda.

**Resultado:**

- Duas notas de clientes diferentes no mesmo endereço viram **duas paradas**.
- Duas notas do mesmo cliente no mesmo endereço continuam sendo **uma**.
- O mesmo cliente em dois endereços continua sendo **duas**.
- O título da parada passa a ser **o nome do cliente**, com o endereço embaixo. Paradas que dividem o
  endereço dizem isso: "Mesmo endereço da Parada 1".
- Cada parada tem o próprio "Cheguei".
- O roteirizador continua tratando **o lugar** como um ponto. Paradas do mesmo endereço saem juntas da
  sugestão, e a hora prevista de cada cliente soma o atendimento dos anteriores.
- Viagens em rascunho ou com roteiro planejado são partidas por um comando de linha de comando, com
  dry-run e registro reversível. Viagens com fato de campo, em separação, em carregamento, na rua ou
  concluídas ficam como estão.

## Decisões (usuário e planejador, 2026-09-25)

Detalhe e alternativas na **ADR-0082**, que **revisa a ADR-0043 §3**. Uma linha cada. As decisões do
usuário estão marcadas; as outras são do planejador e podem mudar.

- **D1 — A chave (usuário).** A parada é o par **(cliente, endereço)**. Mesmo endereço com clientes
  diferentes → paradas separadas. Mesmo cliente em endereços diferentes → paradas separadas. Mesmo
  cliente no mesmo endereço → uma parada.
- **D2 — Quem é o cliente (usuário).** É o **destinatário da nota** (`dest`, papel `recipient` de
  `nfe_participants`). O `<entrega>` só decide o endereço. É o seam da 073: lugar =
  `resolvePhysicalDestination`, quem = `dest`.
- **D3 — Chegada (usuário).** **Uma por cliente.** Cada parada tem o próprio "Cheguei", mesmo quando
  duas paradas estão no mesmo endereço. A chegada não propaga para a irmã.
- **D4 — O endereço não muda.** `trip_stops.address_key` continua sendo só o lugar, com o mesmo
  conteúdo. Nasce ao lado `trip_stops.recipient_key`, e a identidade da parada passa a ser
  `(address_key, recipient_key)`.
- **D5 — O que vai na chave do cliente.** Um pseudônimo, nunca o documento cru: `doc:` + SHA-256
  hexadecimal de `stop-recipient:v1|<companyId>|<documento canônico>`, com o documento normalizado por
  `normalizeTaxId` (CNPJ alfanumérico incluso). O `companyId` é **separador de domínio, não sal**: um
  CPF se recupera por enumeração em segundos. É pseudônimo fraco e dado pessoal, e fica dentro do
  servidor (D18). Nenhuma chave nova no ambiente.
- **D6 — Destinatário sem documento.**
  - Com nome: `name:` + SHA-256 de `stop-recipient:v1|<companyId>|<razão social canônica>` (sem acento,
    caixa alta, pontuação fora, espaços colapsados). É canonicalização, não semelhança.
  - Sem documento e sem nome (sem `<dest>`): `unknown`, que agrupa só pelo endereço, como hoje.
  - Grafias diferentes do mesmo nome viram duas paradas. É falha segura: separar nunca mistura.
- **D7 — Por que não `delivery_client_id`.**
  - O cadastro nasce na importação, mas a criação "nunca derruba a importação" (ADR-0048 §1).
  - O CHECK de `delivery_clients.tax_id` recusa estrangeiro e nota sem documento.
  - Uma chave que às vezes é UUID e às vezes é hash parte o mesmo cliente em duas paradas no dia em
    que o cadastro falhou para uma das notas.
- **D8 — O rótulo.** A parada ganha `recipientNames` na leitura: o nome fantasia do `dest` ou, sem ele,
  a razão social. É derivado de `nfe_participants`, como o endereço já é
  (`drizzle-trip.repository.ts:1187-1214`). Nenhuma coluna nova de nome. Parada antiga misturada
  devolve os nomes distintos. `trip_stops.label` continua sendo o endereço.
- **D9 — Onde a parada nova nasce.** Depende da fase da viagem:
  - Em `draft` e `route_planned`: se o endereço já tem parada na viagem, a nova entra logo depois da
    última irmã, e as seguintes andam uma casa.
  - Em `separating`, `loading` e `loaded`, onde vincular também é aceito
    (`checkTripAcceptsLinkage`, `trip-state.policy.ts:128-134`): vai para o **fim**, como hoje. A
    etiqueta e a planta do barracão já seguem a ordem, e renumerar no meio do carregamento trocaria o
    desenho que o separador segue.
- **D10 — O roteirizador vê lugares.**
  - O worker junta as paradas da viagem pelo `address_key` num ponto só, resolve, e devolve as paradas
    contíguas, na ordem relativa atual.
  - O tempo de parada do lugar é a soma dos tempos das paradas.
  - A janela do lugar é a da primeira parada com janela. No caminho de viagem única isso é **inerte**:
    `trip_stops.delivery_window_*` nunca é escrito, então o solver não recebe janela por ali. Janela por
    cliente só existe no pool multi-veículo, que já é por lugar (worker `:873-903`) e continua como
    está.
- **D11 — Ordem manual pode separar irmãs.** O escritório (antes do despacho) e o motorista (192,
  depois) podem pôr outra parada entre duas irmãs. Só o roteirizador as mantém juntas.
- **D12 — A rota congelada não muda.** Irmãs consecutivas têm a mesma coordenada, e o OSRM devolve
  perna 0 entre coordenadas iguais. Não há rateio por perna para corrigir. Um contrato confirma a perna
  0; nada é colapsado.
- **D13 — ETA da irmã.** O ETA da irmã _k_ é o ETA do lugar mais a soma do tempo de atendimento das
  irmãs anteriores.
  - Sem isso, `shiftPendingStopsByDelay` (`report-stop-arrival.use-case.ts:154-167`,
    `eta-anchor.policy.ts:21-34`) contaria o atendimento da primeira irmã como atraso da segunda e o
    somaria de novo a todas as paradas seguintes.
  - O tempo de atendimento de cada irmã é o **tempo de parada padrão da empresa** (spec 058), um por
    parada criada, inclusive a de cliente `unknown`.
  - Onde a regra vale:
    - no worker (RF13);
    - no aceite multi-veículo (`trip-composer.adapter.ts:125-142`);
    - no comando (RF11);
    - na irmã inserida em `route_planned` (D9: ETA da última irmã + tempo de parada padrão).
  - Parada nova que não é irmã nasce sem ETA, como hoje.
  - **As paradas depois das irmãs andam junto.** Quando o vínculo (D9) ou o comando acrescenta uma
    irmã num lugar que tinha uma parada só, as paradas pendentes seguintes, que têm ETA, são deslocadas
    em +1 tempo de parada padrão por irmã acrescentada. Sem isso ficariam (N−1) × atendimento
    adiantadas, porque o ETA delas foi calculado com um recebimento só naquele lugar.
    - No worker isso não é preciso: o ponto do lugar já soma o atendimento de todas.
    - No aceite multi-veículo também não: o pool já multiplica pelo número de clientes (RF14).
  - **A chegada à irmã com outra irmã aberta não desloca ninguém.** O deslocamento pelo atraso tem
    sinal e não tem limite (`resolveEtaShiftMilliseconds`, `eta-anchor.policy.ts:32`), e
    `shiftPendingStops` (`drizzle-driver-field-report.repository.ts:282-305`) aplica o valor a todas
    as pendentes.
    - Sem esta regra, o motorista que toca os dois "Cheguei" juntos no portão geraria −atendimento em
      todas as paradas seguintes, e o portal mostraria isso.
    - Por isso, `shiftPendingStopsByDelay` não roda quando outra parada da mesma viagem, com o mesmo
      `address_key`, tem `arrived_at` e não tem `completed_at`.
    - A chegada da irmã é gravada normalmente. Só o deslocamento das outras é pulado.
- **D14 — Planta e caixa de fora.**
  - Cada cliente é um bloco de descarga próprio, com sequência própria. O hash muda para a viagem
    partida, e a planta recalcula.
  - `clientName` da linha passa a ser o do `dest` da parada.
  - A caixa que não coube passa a dizer **o cliente**, não só o endereço. A caixa de fora é a
    prioridade nº 1 do usuário.
  - O item que não coube (`UnplacedBox` = `{ count, documentId?, label, reason }`,
    `adatechnology-packages/packages/backend/cargo-placement/src/cargo-placement.policy.ts:155-164`)
    casa com a parada pelo `label` (`cargo-layout-label.policy.ts:84-87`), e o `label` é igual entre
    irmãs. Por isso o cliente sai da nota:
    - **com `documentId`**: o `dest` (papel `recipient`) daquela nota;
    - **sem `documentId`**: se o `label` casa com uma parada só, o nome dela; se casa com várias
      irmãs, os nomes delas juntados por " · ".
- **D15 — Aceite multi-veículo.** `reorderStops` (`trip-composer.adapter.ts:143-165`) passa a mapear
  endereço → **lista** de paradas, em ordem de sequência, em vez de `Map` com uma só (`:146`). O
  contrato `stopOrderByVehicle.orderedAddressKeys` (spec 112) **não** muda, porque a proposta
  continua sendo por lugar.
- **D16 — Migração das viagens existentes.**
  - A migration é **aditiva**: coluna anulável, CHECK, unique parcial e tabela de registro, com
    `rollback.sql`. `recipient_key` nulo significa parada anterior à 197.
  - O comando de linha de comando `split-stops-by-recipient` (`--dry-run` por padrão, `--apply`
    explícito) faz duas coisas:
    - (a) grava a chave nas paradas antigas de **um cliente só**, em viagem não concluída. Nada se
      move;
    - (b) **parte** as paradas antigas **misturadas**, só em viagem `draft` ou `route_planned`, e só se
      a parada não tem fato nenhum.
  - Contam como fato:
    - `arrived_at` ou `completed_at`;
    - linha em `trip_stop_events` ou em `trip_stop_occurrences`;
    - linha em `trip_stop_location_suggestions` (195);
    - nota entregue ou devolvida;
    - agendamento que não seja `pending`.
  - A parada original fica com o grupo cujo cliente tem `delivery_clients.requires_scheduling`. O
    cliente é casado por `nfe_participants` (`recipient`) → `delivery_clients` por
    `(company_id, tax_id)`, como `unscheduled-stop.query.ts:51-66`. Com dois ou mais grupos que
    exigem agendamento, fica o do primeiro vínculo entre eles. Sem nenhum, fica o do primeiro
    vínculo. O agendamento `pending` segue com a original.
  - O resto fica misturado até a viagem acabar. O comando lista o que pulou e por quê, só com ids.
    Viagem `completed` ou `cancelled` nunca é tocada.
- **D17 — Transição sem rasgo.** Enquanto houver parada antiga numa viagem aberta, vincular nota segue
  esta ordem:
  1. procura a parada com a chave;
  2. se não achar, procura a parada antiga do mesmo endereço **que já contém esse cliente** e a
     reaproveita — se ela for de um cliente só, grava a chave nela;
  3. senão, cria.
- **D18 — Contrato aditivo; a chave fica no servidor.**
  - `GET /trips/:id` ganha `recipientNames` por parada.
  - `GET /me/trips/current` ganha `recipientNames` e `sameAddressStopIds` por parada.
  - `recipient_key` **nunca** sai da API: nem resposta, nem log, nem fila, nem `route_suggestion_*`.
- **D19 — Portal, MDF-e e cobrança.**
  - O portal continua por nota. O ETA acompanha a parada da nota.
  - O agendamento pela chave de acesso passa a agendar só o cliente dele. **Parada antiga misturada
    continua agendando a parada inteira** até a viagem acabar.
  - O MDF-e não muda.
  - `delivery_charges` é por nota e cliente (`delivery-client.schema.ts:391`) e não muda.
- **D20 — 193, 195 e 198.**
  - A D12 da 193 (contatos distintos das notas pendentes da parada) continua certa e passa a ter, em
    geral, um contato só.
  - A correção de pino da 195 vale para o **endereço** e corrige as irmãs juntas. É o certo: é o mesmo
    portão.
  - O `recipientCount` da 195 conta clientes pela identidade do `dest` das notas, pela mesma
    `buildStopRecipientKey`. Não conta pela coluna, que é nula em parada antiga e zerada em viagem
    concluída (D22). Assim o mesmo cliente não é contado duas vezes.
  - A FK `stop_id` de `trip_stop_location_suggestions` (195) entra na lista de fatos do D16.
  - Para a 198: tocar os dois "Cheguei" juntos, ao chegar ao portão, contamina a amostra de tempo de
    parada por cliente (058 D6). A mediana da irmã passaria a incluir o atendimento da anterior.
- **D21 — Deploy em três passos**, sem interruptor de ambiente:
  1. leituras aditivas (`recipientNames`, `sameAddressStopIds`), que já servem às paradas antigas;
  2. os fronts, depois do preview com o usuário;
  3. a mudança do vínculo, o worker e o comando.

  O painel precisa aceitar o campo antes do passo 1 (T0.2).

- **D22 — A chave some quando a viagem acaba.** A transição para `completed` ou `cancelled` zera
  `recipient_key` das paradas da viagem, na mesma transação de `recordTripStatusChange`. Depois disso
  nada vincula, e a coluna só guardaria pseudônimo sem uso.

## Requisitos funcionais

### API — leituras (passo 1 do deploy)

- **RF1** `resolveNfeDestinationAddress` e `listStopAddresses` (`nfe-destination-address.support.ts:64-96`,
  `:102-136`) leem o papel `recipient` num **`leftJoin` próprio**. O `innerJoin` com `nfe_addresses`
  atual (`:68-93`, `:109-136`) perderia o `dest` sem endereço.
  - `recipientName` passa a sair do `dest` (D2), nunca da linha escolhida para o endereço.
  - O objeto interno ganha `recipient: { taxId, legalName, tradeName } | null`. O `taxId` não chega a
    nenhuma serialização.
- **RF2** `GET /trips/:id`: `recipientNames: string[]` por parada (D8), derivado na mesma consulta em
  lote do rótulo, sem N+1.
  - Na planta, `clientName` da linha = `recipientNames` da parada juntados por " · "
    (`trip-cargo-layout-input.support.ts:73`). O hash não muda por isso, porque `clientName` não entra
    nele (`cargo-layout-hash.policy.ts:9-11`).
  - A caixa que não coube (`cargo-layout-label.policy.ts:84-87`) ganha `clientName`, pela regra da
    D14:
    - com `documentId`, o `dest` daquela nota, lido na mesma consulta em lote de `listStopAddresses`;
    - sem `documentId`, o nome da única parada cujo `label` casa, ou os nomes das irmãs juntados por
      " · ".

    Não se casa pelo `label` quando há `documentId`, porque o `label` é igual entre irmãs.

  - O painel e o resumo impresso (`cargoPrintSummary.service.ts`) mostram "Cliente — endereço".

- **RF3** `GET /me/trips/current`: por parada, `recipientNames: string[]` e `sameAddressStopIds: string[]`
  (as outras paradas da mesma viagem com o mesmo `address_key`, em ordem de sequência).
  - `listDocuments` (`drizzle-current-driver-trip.repository.ts:687-735`) passa a selecionar também
    `tradeName` (hoje só `legalName`, `:696`).
  - `toDriverStop` fica em `:768-790`.
  - Os campos são aditivos.

### API — vínculo, ETA e comando (passo 3 do deploy)

- **RF4** `src/trips/domain/stop-recipient-key.ts`: função pura
  `buildStopRecipientKey({ companyId, recipient })`, com
  `recipient: { taxId: string | null, legalName: string | null } | null`, que devolve `doc:…`,
  `name:…` ou `unknown` (D5, D6). Prefixo de versão dentro do texto hasheado.
- **RF5** `reconcileStopOnLink` recebe `recipient`, e o port troca `findStopByAddressKey` por
  `findStopByKey({ addressKey, recipientKey })`.
  - Aplica a transição D17 e a posição D9 (`insertStopAfterSiblings` só em `draft`/`route_planned`,
    renumerando pelo estacionamento de sequência de `writeStopOrder`,
    `drizzle-trip-route.repository.ts:370-389`).
  - A irmã inserida nasce com o ETA da D13, e as pendentes seguintes com ETA andam +1 tempo padrão.
  - Todos os caminhos passam por aqui: vínculo simples (`drizzle-trip.repository.ts:415`), lote
    (`:510`), revisão (`trip-document-review-link.support.ts:77`) e desvio de endereço
    (`drizzle-delivery-address-override.repository.ts:179`).
  - Se a 192 já estiver em staging, a renumeração sobe `stop_order_version` junto.
- **RF6** Lock e unique.
  - Todo caminho trava a viagem antes de reconciliar. O vínculo já trava `trips` com `FOR UPDATE`
    (`drizzle-trip.repository.ts:395`, `:467`).
  - O desvio de endereço trava só a linha de `trip_documents`
    (`drizzle-delivery-address-override.repository.ts:145`), não `trips`. Ele passa a travar `trips`
    com o mesmo `FOR UPDATE`, antes da reconciliação. Sem isso, `insertStopAfterSiblings` pode
    colidir no unique de sequência.
  - O desvio também passa a reler o status da viagem **sob esse lock**: hoje as precondições são lidas
    fora da transação (`override-delivery-address.use-case.ts:80`), e a D9 depende do status para
    decidir a posição.
  - Nasce o unique parcial `(company_id, trip_id, address_key, recipient_key) where recipient_key is not
null`, como invariante.
  - O `INSERT` roda num SAVEPOINT (transação aninhada). Em `23505` nesse índice, volta ao SAVEPOINT,
    relê, reaproveita e loga `warn trip_stop_key_conflict` (só `tripId`).
- **RF7** As prévias agrupam pela mesma chave composta, `buildTripStopKey` (`${addressKey}#${recipientKey}`,
  só em memória). Isso vale para:
  - a prévia de carga (`cargo-preview.policy.ts:48-59`, `:101`; `trip-cargo-preview.query.ts:74`);
  - a valoração (`trip-valuation.query.ts:161-164`);
  - a ocupação (`trip-occupancy.support.ts:63`);
  - a concentração de peso (`weight-concentration.policy.ts:14`, `preview-trip-cargo.use-case.ts:172`).

  **A ordem da prévia:** o painel manda `stopOrder` por `addressKey` (`trip-request.schema.ts:98-130`), e
  `orderStopKeys` (`cargo-preview.policy.ts:31-40`) compara por igualdade. Com a chave composta, nada
  casaria e tudo iria para `MAX_SAFE_INTEGER`. Então `orderStopKeys` ranqueia pelo **prefixo**
  `addressKey` e desempata as irmãs pela ordem do primeiro vínculo das notas.

  O prefixo sai de `addressKeyOfTripStopKey`, com duas regras:
  - corta no **último** `#`, porque `normalizeAddressNumber` aceita `12#B` (`stop-address-key.ts:37-42`);
  - devolve `documento:${id}` inteiro, o fallback da prévia, que não tem `#` de cliente.

  **A prévia só serve viagem que ainda não existe.** `POST /trips/cargo-preview`
  (`trip.routes.ts:276`) não recebe `tripId`, e o painel só o chama da proposta e da criação rápida
  (`TripProposalDetail.component.tsx` e `TripQuickCreateDialog.component.tsx`, via
  `useTripCargoPreview.hook.ts`). A viagem nasce em `draft`, onde a D9 põe a irmã ao lado. Por isso a
  paridade do CA14 não diverge pela irmã no fim; a T0.1 reconfirma.

- **RF8** Chegada por parada, sem propagação (D3). Com o ETA de irmã da D13, o atendimento da primeira
  não vira atraso da segunda.
  - `report-stop-arrival.use-case.ts` **muda num ponto**: `shiftPendingStopsByDelay` (`:154-167`) não
    roda quando outra parada da mesma viagem, com o mesmo `address_key`, tem `arrived_at` e não tem
    `completed_at` (D13).
  - A consulta dessas irmãs roda na mesma transação da chegada.
  - A chegada da irmã é gravada como sempre.
- **RF9** `trip-composer.adapter.ts`:
  - `:143-165` (D15): as irmãs saem contíguas, na ordem de sequência atual;
  - `:125-142` (D13): a irmã _k_ recebe `ETA do lugar + (k − 1) × tempo de parada padrão`. É um
    tempo padrão por parada criada, inclusive a de cliente `unknown`.
- **RF10** Rota congelada: nenhuma mudança de código (D12). Contrato: duas paradas consecutivas com a
  mesma coordenada produzem perna 0, e `legs.length === points.length - 1`
  (`osrm-route-geometry.gateway.ts:56`, `:94`) continua verdadeiro.
- **RF11** Comando `src/cli/split-stops-by-recipient.ts` (D16). Entra no `build` do `package.json`,
  como o precedente `src/cli/import-package-box-catalog.ts` (spec 162, `package.json:11`,
  `Dockerfile:34-35`), e roda na imagem com
  `railway ssh --service api -- bun apps/api-transportada/dist/cli/split-stops-by-recipient.js [--apply] [--company <uuid>]`.
  - Uma transação por viagem, com `FOR UPDATE` em `trips` (o lock do vínculo). Status e fatos são
    reconferidos **depois** do lock.
  - A original fica com o grupo da D16. Cada grupo novo nasce logo depois (D9), e as notas mudam de
    `stop_id`.
  - ETA das irmãs pela D13, a partir do ETA da original, com o tempo de parada padrão da empresa (o
    mesmo que o worker lê, spec 058).
  - As pendentes seguintes que têm ETA andam +1 tempo padrão por irmã criada (D13).
  - **Depois de partir, pede a planta e recongela a rota.** As duas coisas saem de uma função só,
    `createTripRouteTollFreezer({ database, environment })`, extraída da closure de `main.ts:1921+`, com
    `requestCargoLayoutForTrip` e o lease. O `main` e o comando usam a mesma função. Falha é log `warn`,
    nunca o `catch {}` vazio de `reorder-trip-stops.use-case.ts:76-81`.
  - **Vence as sugestões abertas da viagem.**
    - Hoje nada escreve `stale` (`route-suggestion.schema.ts:44-51`), e o worker grava `ready` sem
      guarda de status (`drizzle-route-optimization.repository.ts:339-356`).
    - O comando passa para `stale` só as de status `queued` ou `ready`, num escritor novo,
      `markTripSuggestionsStale`, em `src/routing/infrastructure/drizzle-route-suggestion.repository.ts`.
    - O `UPDATE` do worker ganha a guarda `where status in ('queued', 'running')`, para não
      ressuscitar uma sugestão vencida.
    - Uma sugestão em `running` durante o comando termina `ready` com as paradas antigas. O aceite
      dela falha com `422 TRIP_STOP_SET_MISMATCH`, porque `reorderTripStops` exige o conjunto exato
      (`reorder-trip-stops.use-case.ts:62-68`). É falha segura e fica registrada.
  - Grava uma linha em `trip_stop_split_runs`: ordem anterior, movimentos
    `{ documentId, fromStopId, toStopId }`, paradas criadas e paradas que só ganharam a chave.
  - `--dry-run` (padrão) conta, lista as viagens que seriam partidas, as puladas com o motivo e os
    grupos de paradas antigas duplicadas (`(trip_id, address_key) … having count(*) > 1` entre as de
    chave nula). Não escreve nada.
  - Idempotente: rodar de novo não parte nada.
  - Saída e log só com ids e contagens.
- **RF12** Comando `src/cli/unsplit-stops.ts --run <runId>`: desfaz uma execução, viagem a viagem, na
  mesma transação e lock. Recusa a viagem, dizendo o motivo, se:
  - a viagem saiu de `draft`/`route_planned`;
  - algum movimento não confere: o `stop_id` atual da nota não é o `toStopId`, ou a nota não está viva
    (`released_at` nulo, sem `delivered_at`/`returned_at`);
  - alguma parada criada tem nota fora dos `moves`, agendamento (`trip_stop_schedules` não tem FK,
    `delivery-client.schema.ts:283-309`) ou qualquer fato da D16. A checagem vem depois de
    `SELECT … FROM trip_stops WHERE id = ANY(created) FOR UPDATE`, porque as FKs de `trip_documents`
    são `restrict` (`trip.schema.ts:704-714`).

  Aceita: devolve as notas, apaga as paradas criadas e restaura a ordem anterior com as paradas que
  nasceram depois da execução no fim, porque `reorder-trip-stops.use-case.ts:62-68` exige o conjunto
  exato. Zera a chave das `keyed_stop_ids`, recongela a rota, pede a planta, vence as sugestões e marca
  `reverted_at`.

- **RF13** Worker, sugestão de uma viagem (D10): `drizzle-route-optimization.repository.ts:488-560`
  agrupa `trip_stops` por `address_key` num ponto do solver (peso somado, tempo de parada somado). Na
  gravação da sugestão, expande de volta para uma linha de `route_suggestion_stops` por parada:
  - irmãs contíguas;
  - distância e duração 0 depois da primeira;
  - `estimated_arrival_at` da irmã _k_ pela D13.

  O "Sugerir ordem" da 192/202 passa pelo mesmo agrupamento.

- **RF14** Worker, pool multi-veículo: o tempo de parada do lugar é o padrão × o número de **clientes
  distintos** do lugar (mínimo 1), contados pela identidade do `dest`: documento, nome canônico
  quando não há documento, e `unknown` também conta como um. Não é `taxIds.size` (`:873-903`), que ignora o cliente sem documento. A
  canonicalização é cópia por valor de `stop-recipient-key.ts`, com contrato de paridade, no molde de
  `pool-address-key.ts`.
- **RF15** `recordTripStatusChange` zera `trip_stops.recipient_key` da viagem na transição para
  `completed` ou `cancelled` (D22).

### App do motorista (`apps/frontend-driver`)

- **RF16** Cabeçalho do acordeão do `DriverStopCard` (commit `8ba3e4b17` e `9ec97d683`;
  `DriverStopCard.component.tsx:230-275`: `<h2><button aria-expanded>`, `stopMeta` "Parada N" +
  `stopHeaderLabelText` com `stop.label`):
  - `stopHeaderLabelText` passa a ser o **nome do cliente**: `recipientNames[0]`, com "+N" quando a
    parada antiga for misturada;
  - uma linha nova `stopHeaderAddress`, dentro do mesmo `<button>`, traz o endereço (`stop.label`) sem
    truncar o número;
  - sem nome (`recipientNames` vazio), o título continua sendo o endereço;
  - o nome acessível do botão é "Parada N, cliente, endereço".
- **RF17** Chip "Mesmo endereço da Parada N" / "Mesmo endereço das Paradas N e M" na linha
  `stopChips`, quando `sameAddressStopIds` não é vazio. O N é resolvido pela sequência das irmãs na
  lista. É texto, não só ícone, e aparece sem rede, pelo snapshot. O acordeão (`useStopExpansion.hook.ts`)
  não muda.
- **RF18** O "Cheguei" é por parada. Depois de "Cheguei" na Parada 1, a Parada 2 irmã vira a atual
  (`findCurrentStop`, `driverTripView.service.ts:27-29`), abre sozinha e mostra o próprio "Cheguei".
- **RF19** `driverTripResponse.validation.ts:133-151` (`toStop`) passa `recipientNames` e
  `sameAddressStopIds`. Ausentes viram `[]`, para snapshot gravado antes da 197.
- **RF20** O romaneio (`DriverLoadSheet.component.tsx:95-98`) imprime "Parada N — Cliente — endereço".
  A prévia de ocorrência (`DriverStopCard.component.tsx:959`) usa o nome do cliente.

### Painel (`apps/frontend-transportada`)

- **RF21** **Antes de a API mandar o campo:** `recipientNames` entra em `TRIP_STOP_OPTIONAL_KEYS`
  (`trip.constant.ts:234-241`). O validador é estrito (`tripGuards.validation.ts:64-69`) e recusaria o
  detalhe inteiro. O mesmo vale para o módulo antigo `src/modules/driver-trip` do painel, se o validador
  dele for estrito.
- **RF22** `TripStopList` (`TripStopList.component.tsx:335`):
  - título = nome do cliente, endereço embaixo, selo "mesmo endereço da parada N";
  - `aria-label` da alça e do checkbox com o nome do cliente (`:310`, `:327`);
  - `TripStopDetail` ganha `recipientNames?` (`trip.types.ts:370-391`).
- **RF23** Mapa da viagem (`TripRouteMap.component.tsx:98`): `stopKey` passa a ser `stop.id`, para o
  leque de `resolveMarkerOffsets` (`assemblyMap.service.ts:95-142`) abrir as irmãs lado a lado em vez de
  sobrepor. A correção de pino (`:285`, `:307-308`) deduplica por `addressKey`, com o rótulo
  "endereço — paradas N e M".
- **RF24** A montagem (mapa de seleção, criação rápida, rascunho) continua por **lugar**
  (`assemblyMap.service.ts:258-298`, `assemblyOrder.service.ts:129-147`): um pino é um endereço, e
  `stopOrder` continua por `addressKey` (RF7 faz a API entender).
- **RF25** Planta: o nome da linha já vem de `clientName` (`cargoStopLabel.service.ts:67`). A caixa de
  fora (`TripCargoLayers`, `TripReviewQueue`, `cargoPrintSummary.service.ts`) passa a mostrar o
  cliente (RF2).

## Preview

Desenho de referência a 40 colunas (375 px). É o cenário da API de demonstração depois do ajuste da
T4.1:

- duas lojas no mesmo endereço (Praça da Sé, 100);
- um cliente com duas notas no mesmo endereço;
- o mesmo cliente (Supermercado Bom Preço) em dois endereços.

O cartão é o acordeão atual: a parada atual abre sozinha e as outras ficam fechadas.

### App do motorista — lista de paradas

```text
┌──────────────────────────────────────┐
│ Viagem GCQ8E47 · 7 paradas           │
├──────────────────────────────────────┤
│ Parada 1                           ˄ │
│ MERCEARIA DO CENTRO                  │
│ Praça da Sé, 100 — Centro, São Paulo │
│ [Em andamento] [Mesmo end. Parada 2] │
│ 11:00–12:00 · 1 nota                 │
│  [ Cheguei ]          [ Navegar ]    │
├──────────────────────────────────────┤
│ Parada 2                           ˅ │
│ PADARIA ESTRELA                      │
│ Praça da Sé, 100 — Centro, São Paulo │
│ [Pendente] [Mesmo end. Parada 1]     │
├──────────────────────────────────────┤
│ Parada 3                           ˅ │
│ FARMÁCIA BEM ESTAR                   │
│ Av. Paulista, 1500 — Bela Vista      │
│ [Pendente]                           │
├──────────────────────────────────────┤
│ Parada 4                           ˅ │
│ SUPERMERCADO BOM PREÇO               │
│ Rua Vergueiro, 3000 — Vila Mariana   │
│ [Pendente] [Mesmo end. Paradas 5, 6] │
├──────────────────────────────────────┤
│ Parada 5                           ˅ │
│ LOJA DE FERRAGENS SILVA              │
│ Rua Vergueiro, 3000 — Vila Mariana   │
│ [Pendente] [Mesmo end. Paradas 4, 6] │
├──────────────────────────────────────┤
│ Parada 6                           ˅ │
│ RESTAURANTE SABOR DA CASA            │
│ Rua Vergueiro, 3000 — Vila Mariana   │
│ [Pendente] [Mesmo end. Paradas 4, 5] │
├──────────────────────────────────────┤
│ Parada 7                           ˅ │
│ SUPERMERCADO BOM PREÇO               │
│ R. Domingos de Morais, 2100 — V. Mar.│
│ [Pendente]                           │
└──────────────────────────────────────┘
```

O chip escrito por extenso é "Mesmo endereço da Parada 2". O desenho abrevia para caber nas 40
colunas; o chip quebra linha se precisar.

A Parada 4 aberta mostra "2 notas": são as duas notas do Bom Preço naquele endereço, numa parada só.

Depois de "Cheguei" na Parada 1, ela mostra "Você chegou" e as ações das notas. Quando a 1 fica
concluída, a Parada 2 vira a atual, abre sozinha e mostra o próprio "Cheguei" (D3).

Parada antiga misturada, em viagem que não foi partida (D16):

```text
┌──────────────────────────────────────┐
│ Parada 3                           ˅ │
│ MERCADO ABADE +1                     │
│ Rua Miguel Petroni, 1166 — São Carlos│
│ [Pendente]                           │
└──────────────────────────────────────┘
```

### Painel — detalhe da viagem (lista de paradas)

```text
Paradas                                  7
────────────────────────────────────────
⠿ ☐ 1  MERCEARIA DO CENTRO        1 nota
       Praça da Sé, 100, São Paulo, SP
       ⇄ mesmo endereço da parada 2
⠿ ☐ 2  PADARIA ESTRELA            1 nota
       Praça da Sé, 100, São Paulo, SP
       ⇄ mesmo endereço da parada 1
⠿ ☐ 3  FARMÁCIA BEM ESTAR         1 nota
       Av. Paulista, 1500, São Paulo, SP
⠿ ☐ 4  SUPERMERCADO BOM PREÇO    2 notas
       Rua Vergueiro, 3000, São Paulo, SP
       ⇄ mesmo endereço das paradas 5 e 6
⠿ ☐ 5  LOJA DE FERRAGENS SILVA    1 nota
       Rua Vergueiro, 3000, São Paulo, SP
⠿ ☐ 6  RESTAURANTE SABOR DA CASA  1 nota
       Rua Vergueiro, 3000, São Paulo, SP
⠿ ☐ 7  SUPERMERCADO BOM PREÇO     1 nota
       R. Domingos de Morais, 2100, SP
```

### Painel — mapa da viagem e caixa de fora

```text
        (3)
                    (1)(2)   ← mesmo ponto,
                              em leque
    (4)(5)(6)
         (7)
Corrigir pino: [ Praça da Sé, 100 —      ]
               [ paradas 1 e 2         ▾ ]

Ficou fora do caminhão
  2 cx · PADARIA ESTRELA — Praça da Sé, 100
```

## Critérios de aceite

- **CA01** Viagem em rascunho: vincular a nota do cliente A e a do cliente B, ambas na Praça da Sé, 100.
  Resultado: duas paradas, sequências consecutivas, mesmo `addressKey`, `recipientNames` `["A"]` e
  `["B"]`.
- **CA02** Vincular a segunda nota do cliente A no mesmo endereço: continua uma parada de A, com duas
  notas.
- **CA03** Cliente A em dois endereços: duas paradas.
- **CA04** Nota com `<entrega>` em outro endereço e `dest` = A: a parada é (A, endereço de entrega), e o
  nome é o do `dest`, não o do local de entrega. `dest` sem `nfe_addresses` também dá o nome
  (`leftJoin`).
- **CA05** Destinatário estrangeiro (sem documento) com nome: agrupa pelo nome canônico. Sem `<dest>`:
  `unknown`, agrupado só pelo endereço.
- **CA06** Viagem `route_planned` com parada 3 = (lugar X, A) e parada 4 em outro lugar. Vincular (X, B)
  cria a parada 4 = (X, B), com ETA da 3 + tempo de parada padrão, e a antiga 4 vira 5 (D9, D13).
- **CA06b** A mesma situação com a viagem em `separating`, `loading` ou `loaded`: (X, B) nasce no fim,
  sem ETA, e nenhuma sequência existente muda.
- **CA07** Desvio de endereço concorrente com um vínculo na mesma viagem: um espera o outro (lock), e
  não há colisão de sequência nem de unique (integração, duas transações).
- **CA08** Desvio de endereço de uma nota de A move a nota para (novo endereço, A). A parada antiga
  esvazia e é apagada, como hoje.
- **CA09** `recipient_key`/`recipientKey` não aparece:
  - no corpo de `GET /trips/:id` nem de `GET /me/trips/current`;
  - no log do vínculo nem no `warn trip_stop_key_conflict` (`error-descriptor.service.ts:21-38`);
  - no log e na saída do comando.

  Há também um contrato estático: nenhuma chamada de `logger.` em `src/trips` e `src/cli` recebe um
  objeto com `recipientKey`.

- **CA10** Chegada na parada 1 não muda a irmã 2. **Chegada na 1 no horário previsto e chegada na 2
  vinte minutos depois, dentro do previsto pela D13 (tempo de parada padrão de 20 min): a parada 3 não
  se desloca.**
- **CA10b** Parada 1 e irmã 2 com "Cheguei" tocado no mesmo minuto, no horário previsto da 1: a parada 3
  **não** se desloca, e o portal (`GET /client/me/deliveries`) mostra o ETA da 3 sem mudança.
- **CA11** Sugestão de uma viagem com irmãs (contrato com fixture de 3 lugares / 5 paradas):
  - o solver recebe um ponto por lugar;
  - as irmãs saem contíguas;
  - a segunda tem 0 m / 0 s e ETA = ETA do lugar + tempo de parada da primeira.
- **CA12** Aceite multi-veículo de um lugar com dois clientes: a viagem nasce com as duas paradas
  contíguas, e a segunda tem o ETA do lugar + o tempo por cliente.
- **CA13** Rota congelada com irmãs consecutivas: perna 0 entre elas, e o número de pernas bate com o
  de pontos.
- **CA14** Prévia de carga, valoração e ocupação agrupam igual ao vínculo. O contrato de paridade monta
  as mesmas paradas **na mesma ordem** pelos dois caminhos, com `stopOrder` por `addressKey` e irmãs
  desempatadas pelo primeiro vínculo.
- **CA15** Comando em `--dry-run`: conta, lista as puladas e as duplicadas antigas, e não escreve. Em
  `--apply`:
  - parada antiga de um cliente só ganha a chave e não se move;
  - parada misturada em `route_planned` sem fato se parte. A original fica com o grupo do cliente com
    `requires_scheduling`; sem ele, com o do primeiro vínculo. O agendamento `pending` fica na
    original. As irmãs ganham ETA pela D13;
  - depois de partir: planta pedida, rota recongelada, sugestões abertas em `stale`;
  - parada misturada com chegada, nota entregue, ocorrência ou sugestão de pino (195), ou em viagem
    `separating`/`in_transit`: fica, e aparece na lista de puladas;
  - `completed` e `cancelled` não são lidas.
- **CA16** Rodar `--apply` duas vezes: a segunda não muda nada. `unsplit` da execução devolve notas,
  ordem e paradas ao estado anterior.
- **CA16b** `unsplit` com a viagem já em `separating`: recusa, sem escrever.
- **CA16c** `unsplit` com uma nota movida que foi desvinculada ou mudou de parada depois do split:
  recusa a viagem.
- **CA16d** `unsplit` com nota nova vinculada a uma parada criada, ou com agendamento nela: recusa a
  viagem.
- **CA16e** `unsplit` com uma parada nascida depois da execução: a ordem restaurada é a anterior, com a
  parada nova no fim.
- **CA17** Migration:
  - sobe;
  - o CHECK recusa `recipient_key` fora do vocabulário;
  - o unique parcial recusa duplicata e aceita dois nulos no mesmo endereço;
  - `rollback.sql` aborta se houver execução com `cardinality(created_stop_ids) > 0`, `reverted_at`
    nulo e a viagem ainda em `draft`/`route_planned`. Com a viagem já avançada, não aborta. Sem
    execução pendente, volta ao estado anterior.
- **CA18** App:
  - dois clientes no mesmo endereço aparecem como duas paradas, cada uma com o nome do cliente e o chip
    "Mesmo endereço", e cada uma com o próprio "Cheguei";
  - o mesmo cliente em dois endereços aparece duas vezes, sem chip;
  - alvos ≥ 44 px em 375 px.
- **CA19** Painel:
  - o detalhe não quebra com `recipientNames` (validador);
  - a lista mostra o nome;
  - as irmãs no mapa ficam em leque, não sobrepostas;
  - a caixa de fora diz o cliente: duas irmãs, cada uma com uma caixa de fora (com `documentId`), dão
    duas linhas, cada uma com o seu cliente; sem `documentId`, a linha junta os nomes das irmãs.
- **CA20** Prints 375 e 768 da lista do motorista e do painel (lista, mapa e caixa de fora) no preview
  local, vistos pelo usuário, com o "pode subir" dele no `evidence.md` antes de staging.
- **CA21** Viagem concluída ou cancelada: `recipient_key` das paradas dela fica nulo, na mesma
  transação da troca de status.

## Casos extremos e falhas

| Caso                                                                  | Comportamento                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nota sem CEP válido                                                   | Continua sem parada (`SEM ENDEREÇO`), como hoje. A chave do cliente não é calculada.                                                                                                      |
| Matriz e filial (CNPJs diferentes) no mesmo endereço                  | Duas paradas: são dois clientes fiscais (ADR-0048: "duas lojas da mesma rede são dois cadastros").                                                                                        |
| Mesmo CPF com duas grafias de nome                                    | Uma parada, porque a chave é o documento. O rótulo usa o nome da primeira nota.                                                                                                           |
| Estrangeiro com duas grafias de nome                                  | Duas paradas (D6, falha segura).                                                                                                                                                          |
| Nota A1 de A sem `<dest>` e A2 de A com `<dest>`                      | Duas paradas (`unknown` × `doc:`). É raro; aceito e registrado.                                                                                                                           |
| Parada antiga misturada recebe nota de um cliente novo                | Cria a parada do cliente novo (D17, na posição D9). A antiga não se parte sozinha.                                                                                                        |
| Cliente com agendamento obrigatório separado do vizinho               | Pode passar a travar o despacho automático com `TRIP_HAS_UNSCHEDULED_STOPS`. É o certo: antes ele se escondia atrás do agendamento do vizinho.                                            |
| Viagem com 120 lugares e 150 paradas                                  | O limite medido do solver (`MAX_OPTIMIZABLE_STOPS = 120`, spec 104) conta lugares (D10). O teto operacional `maxStopsPerRoute` é `null` hoje (`route-optimization.effect.ts:37`, `:194`). |
| Irmãs com janelas diferentes                                          | Só no pool multi-veículo; o lugar usa a da primeira com janela, a regra de hoje.                                                                                                          |
| Motorista toca os dois "Cheguei" juntos no portão                     | Aceito (D3). A chegada da irmã, com a outra aberta, não desloca as demais paradas (D13, CA10b). Efeito na amostra de tempo de parada: ver D20 (198).                                      |
| Portal: contratante agenda pela chave de acesso                       | Agenda só a parada do cliente dele. Em parada antiga misturada, agenda a parada inteira (D19).                                                                                            |
| Planta de viagem partida pelo comando                                 | Hash novo; o comando pede a planta. Viagem em separação ou carregamento não é partida (D16).                                                                                              |
| Paradas antigas duplicadas (mesma viagem, mesmo endereço, chave nula) | Podem existir, porque não havia unique. O dry-run lista; o comando trata cada parada por si.                                                                                              |

## Fora do escopo

- Juntar irmãs numa "descida" com um "Cheguei" só (o usuário decidiu por cliente, D3).
- Partir parada de viagem já em separação, carregamento, rua ou concluída.
- Mostrar os clientes na linha da proposta multi-veículo; a proposta segue por lugar. Fica como
  seguimento.
- Interseção de janelas de irmãs no solver. Seguimento, se a proposta errar por isso.
- Mudar a chave do lugar (`address_key`), `geocoded_addresses` ou a correção de pino.
- Chave de parada por `delivery_client_id` (D7).
- Rodar o comando em produção. É 👤, com aprovação, fora desta spec.
- MDF-e, CT-e, NFS-e e cobrança.

## Dependências

- **ADR-0043 §3 / spec 056 D3**: revisadas pela ADR-0082.
- **Spec 073**: seam lugar × quem.
- **ADR-0048**: cadastro `delivery_clients`.
- **Spec 084**: `client_delivery_addresses` guarda o documento canônico em claro
  (`client-delivery-address.schema.ts:45`). É a alternativa que a ADR-0082 rejeita para a parada.
- **Spec 060**: agendamento por parada (`trip_stop_schedules`) e cobrança de entrega.
- **Spec 107**: ETA carimbado.
- **Spec 109**: deslocamento do ETA pelo atraso; é base da D13.
- **Spec 192 / ADR-0077**: reordenação na rua e planta fixada. A 197 só parte viagem **antes** do
  despacho, então nunca toca planta fixada. Se a 192 entrar antes, a D9 e o comando sobem
  `stop_order_version` junto (T0.1 confere). O agrupamento por lugar do worker vale para o "Sugerir
  ordem" (192/202).
- **Spec 201**: ordem do painel e teclado no `TripStopList`. É o mesmo arquivo da RF22; quem entrar
  depois faz rebase.
- **Spec 193 / ADR-0079**, **spec 195 / ADR-0080** e **spec 198**: D20.
- **Spec 181**: o cabeçalho do cartão (endereço) passa a ser nome + endereço.

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` aberto. As três decisões de produto foram dadas pelo usuário em
2026-09-25: D1 (chave), D2 (cliente = `dest`) e D3 (chegada por cliente).

Pergunta da crítica (2026-09-25), registrada e respondida pela leitura do código: "`trip-cargo-preview.query.ts`
serve viagens existentes?" **Não.**

- `POST /trips/cargo-preview` (`trip.routes.ts:276`) não recebe `tripId`.
- O painel só chama a prévia pela proposta e pela criação rápida (`useTripCargoPreview.hook.ts`, usado
  em `TripProposalDetail.component.tsx` e `TripQuickCreateDialog.component.tsx`).
- A viagem nasce em `draft`, onde a D9 põe a irmã ao lado. Por isso a paridade do CA14 não diverge
  pela irmã no fim.

A T0.1 reconfirma. Se aparecer caminho que chame a prévia para viagem existente, ela para.
