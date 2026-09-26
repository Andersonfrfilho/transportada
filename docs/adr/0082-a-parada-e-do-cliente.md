# ADR-0082 — A parada é do cliente

- **Status:** proposta (2026-09-25). Passa a `aceita` na T0.1 da spec 197, conferida contra o código.
- **Data:** 2026-09-25
- **Decisores:**
  - usuário, em 2026-09-25:
    - "Parada por cliente";
    - "se um mesmo cliente está em endereços diferentes cada um é uma parada";
    - a chegada é uma por cliente;
    - o cliente é o destinatário da nota;
  - o resto do desenho (chave, LGPD, roteirizador, ETA, migração, deploy) é desta ADR.
- **Spec:** `specs/197-a-parada-e-do-cliente/`
- **Revisa:**
  - **ADR-0043 §3.** A parada deixa de ser "uma por endereço de entrega distinto… e não o CNPJ" e
    passa a ser **uma por (cliente, endereço)**.
    - Deixa de valer "dois CNPJs no mesmo galpão são uma parada, e o motorista desce uma vez".
    - Continua valendo "a mesma rede entrega em cinco lojas, e são cinco paradas".
    - Continuam também a parada derivada e reconciliada, a normalização única do endereço e a parada
      `SEM ENDEREÇO`.
  - **ADR-0043, alternativas.** A parada por CNPJ foi rejeitada ali porque "dois CNPJs no mesmo galpão
    viram duas paradas para uma descida só". A objeção é aceita como custo; o motivo está no Contexto.
  - **Spec 056 D3** e a borda "destinatários diferentes, mesmo CEP e número → uma parada, rótulo com os
    dois nomes" (`specs/056-a-nota-anda-pela-viagem/spec.md:237`).
- **Aplica sem revisar:**
  - spec 073, seam "lugar × quem": o lugar segue em `resolvePhysicalDestination`, e o quem segue no
    `dest`;
  - ADR-0048 (`delivery_clients` por `(company_id, tax_id)`);
  - spec 084 (`client_delivery_addresses`);
  - spec 109 (deslocamento do ETA pelo atraso);
  - ADR-0077 (a ordem muda na rua; a planta fixada no despacho);
  - ADR-0079 (contatos da parada);
  - ADR-0080 (a correção de pino vale para o endereço).

## Contexto

A ADR-0043 §3 escolheu o endereço como chave da parada, contra o CNPJ, por um argumento físico: o
motorista desce uma vez. Em troca, a spec 056 prometeu um rótulo com os dois nomes. O rótulo nunca saiu:
`buildStopLabel` (`stop-label.policy.ts:40-47`) imprime rua, número, cidade e UF, e as notas das duas
lojas aparecem embaixo de um título que não diz de quem é nada. O motorista, que é quem usa a parada,
disse que ela "fica misturada" e "não faz muito sentido".

O código confirma que "uma parada, dois clientes" já era ambíguo em tudo o que é **do cliente**:

- **Janela no solver:** vale a do primeiro CNPJ com cadastro (worker
  `drizzle-route-optimization.repository.ts:1104-1120`).
- **Agendamento:** é um por parada (`delivery-client.schema.ts:283-309`), e o `delivery_client_id`
  dele nunca é escrito. O contratante que agenda pelo portal agenda a parada inteira, inclusive a do
  vizinho (`schedule-contractor-delivery.use-case.ts:50-54`).
- **Planta:** o nome é o da primeira nota (`trip-cargo-layout-input.support.ts:73`).

A descida física continua sendo uma. O que muda é que a **entrega** é por cliente: canhoto, recebedor,
agendamento, janela e ocorrência são de um cliente. A parada, que é a unidade que o motorista lê e
marca, passa a seguir a entrega. O lugar continua sendo a unidade do roteiro.

Há uma restrição forte: `address_key` é a chave do **lugar** no sistema inteiro. Ela é:

- a PK de `geocoded_addresses`;
- a chave da correção de pino (ADR-0080), de `address_correction_requests` e de
  `client_delivery_addresses`;
- a chave pela qual o worker lê a coordenada.

Pôr o cliente dentro dela quebraria a coordenada de toda parada.

## Decisão

### 1. A parada é o par (cliente, endereço)

- Mesmo endereço com clientes diferentes → paradas diferentes.
- Mesmo cliente em endereços diferentes → paradas diferentes.
- Mesmo cliente no mesmo endereço → uma parada.
- **Cliente = o destinatário da nota** (`dest`, papel `recipient` de `nfe_participants`). O
  `<entrega>` decide só o endereço.

### 2. O endereço fica como está; o cliente entra ao lado

`trip_stops.address_key` mantém o conteúdo e o significado: é o lugar. Nasce `trip_stops.recipient_key`,
e a identidade da parada passa a ser `(address_key, recipient_key)`, com unique parcial para as linhas
que têm a chave. Nulo significa parada criada antes desta ADR.

### 3. O que vai na chave do cliente, e o que ela é para a LGPD

- **Com documento:** `doc:` + SHA-256 de `stop-recipient:v1|<companyId>|<documento canônico>`, com o
  documento normalizado por `normalizeTaxId` (CNPJ alfanumérico incluso).
- **Sem documento e com nome** (estrangeiro, `<dest>` sem CNPJ/CPF): `name:` + SHA-256 da razão social
  canônica, no mesmo esquema. É canonicalização, não semelhança: grafias diferentes separam, e separar
  nunca mistura.
- **Sem `<dest>`:** `unknown`, que agrupa só pelo endereço, como hoje.
- **É pseudônimo fraco e é dado pessoal.**
  - O `companyId` é separador de domínio, não sal: impede cruzar clientes entre empresas pela coluna,
    mas um CPF (~10⁹ valores) se reverte por enumeração em segundos para quem tem o banco.
  - O documento já existe em claro em `nfe_participants`, `delivery_clients` e
    `client_delivery_addresses`, e esta decisão não cria cópia dele.
  - A chave é tratada como dado pessoal e **nunca sai do servidor**: nem resposta HTTP, nem log, nem
    fila, nem tabela de sugestão. O logger não redige por nome de campo, então a garantia é não
    entregá-la ao logger, vigiada por contrato estático e por varredura.
  - A chave é **zerada quando a viagem conclui ou é cancelada**, na mesma transação da troca de
    status: depois disso nada vincula, e ela só guardaria pseudônimo sem uso.

### 4. A chegada é por parada, sem propagação

Cada parada tem o próprio "Cheguei", inclusive quando divide o endereço com outra. A app diz "Mesmo
endereço da Parada N" para o motorista não procurar outro portão.

### 5. O rótulo é o cliente

A leitura devolve `recipientNames` por parada: o nome fantasia do `dest` ou, sem ele, a razão social,
derivado de `nfe_participants` como o endereço já é. `trip_stops.label` continua sendo o endereço, e
nenhuma coluna de nome nasce. A caixa que não coube na planta diz o cliente, não só o endereço. O
cliente dela sai da nota (`documentId` da caixa), porque o rótulo de endereço é igual entre irmãs. Sem
nota, a caixa diz os nomes das irmãs daquele endereço.

### 6. O roteirizador vê lugares, e o ETA soma o atendimento

- O worker junta as paradas da viagem por `address_key` num ponto do solver e devolve as paradas
  contíguas, com perna 0 entre irmãs. O pool multi-veículo já é por lugar.
- O tempo de parada do lugar é a soma das paradas, porque cada cliente é um recebimento.
- **O ETA da irmã _k_ é o ETA do lugar mais o atendimento das irmãs anteriores.** Um ETA igual para
  todas faria o deslocamento por atraso da spec 109 contar o atendimento da primeira como atraso da
  segunda, e empurrar de novo todas as paradas seguintes.
- O atendimento de cada irmã é o tempo de parada padrão da empresa, um por parada, inclusive a de
  cliente `unknown`.
- Quando uma irmã é acrescentada a um lugar que tinha uma parada só, pelo vínculo ou pelo comando, as
  paradas pendentes seguintes andam junto. O ETA delas foi calculado com um recebimento só naquele
  lugar.
- **A chegada a uma irmã, com outra irmã do mesmo endereço aberta (chegou e não concluiu), não desloca
  as demais paradas.** O deslocamento por atraso tem sinal e não tem limite, e se aplica a todas as
  pendentes. Tocar os dois "Cheguei" juntos no portão adiantaria toda a viagem, e o portal mostraria.
- A rota congelada não muda: o OSRM já dá perna 0 entre coordenadas iguais, e não há rateio por perna.
- Ordem manual (escritório antes do despacho, motorista depois, ADR-0077) pode separar irmãs. Só o
  roteirizador as mantém juntas.
- O limite medido do solver (spec 104) continua contando lugares.

### 7. Onde a parada nova nasce

- Em `draft` e `route_planned`: logo depois da última irmã do mesmo endereço, com o ETA dela mais o
  tempo de parada padrão.
- Em `separating`, `loading` e `loaded`, onde vincular também é aceito: no **fim**, como hoje. A
  etiqueta e a planta do barracão já seguem a ordem, e renumerar no meio do carregamento trocaria o
  desenho que o separador segue.

### 8. As viagens existentes

- **Migration aditiva, com rollback.**
- **O backfill é um comando de linha de comando** que vai na imagem (`src/cli`), com `--dry-run` por
  padrão. Cada execução fica gravada em `trip_stop_split_runs` e pode ser desfeita.
- O comando:
  - grava a chave nas paradas antigas de **um cliente só**, em qualquer viagem aberta, sem mover nada;
  - **parte** as paradas antigas misturadas **só** em viagem `draft`/`route_planned`, e só se a parada
    não tem fato nenhum (chegada, conclusão, evento, ocorrência, sugestão de pino, nota assentada,
    agendamento que não seja `pending`).
- Ao partir:
  - a parada original fica com o cliente que exige agendamento; com mais de um, ou com nenhum, fica
    com o do primeiro vínculo;
  - a planta é pedida de novo e a rota é recongelada, pela mesma função que o servidor usa;
  - as sugestões `queued` e `ready` vencem (`stale`), e o worker deixa de gravar `ready` por cima de
    uma sugestão vencida.
- Uma sugestão que estava calculando durante o comando termina com as paradas antigas. O aceite dela
  falha por conjunto de paradas diferente, que é falha segura.
- Separação, carregamento, rua e concluída ficam misturadas até acabar. Isso também garante que a planta
  fixada da ADR-0077 nunca é tocada.
- Enquanto uma viagem aberta tiver parada antiga, a nota nova do cliente que já está nela a reaproveita.

### 9. Deploy em três passos

1. Leituras aditivas, que já servem às paradas antigas.
2. Os fronts, depois de o usuário ver o preview.
3. O vínculo novo, o worker e o comando.

O painel aceita o campo novo antes do primeiro passo, porque o validador dele é estrito. Não há
interruptor de ambiente: a ordem dos passos faz o papel dele, e cada passo é coerente sozinho.

## Alternativas rejeitadas

- **Pôr o cliente dentro de `address_key`.** Quebra `geocoded_addresses`, a correção de pino e toda
  leitura de coordenada. Seria reescrever a chave do lugar para servir à chave da parada.
- **Documento canônico em claro na coluna**, como `client_delivery_addresses.client_tax_id` (spec 084).
  É o mais simples de depurar. Perdeu porque a chave da parada não precisa ser lida por gente nem
  casada fora do servidor. O hash impede que a coluna mostre o documento em dump parcial, em planilha
  exportada ou a quem olha a tabela, e impede usar a coluna como índice de busca de cliente. Não é
  proteção contra quem tem o banco inteiro, e isso está dito na §3.
- **`delivery_client_id` como chave do cliente.**
  - O cadastro nasce na importação, mas a criação "nunca derruba a importação" (ADR-0048 §1).
  - O CHECK de `delivery_clients.tax_id` recusa estrangeiro e nota sem documento.
  - Uma chave que às vezes é UUID e às vezes é hash parte o mesmo cliente em duas paradas no dia em que
    o cadastro falhou.
- **HMAC com chave nova no ambiente.**
  - Protegeria só contra quem tem `trip_stops` sem `nfe_participants`, no mesmo banco.
  - Custa uma variável nova no Railway, criada pelo usuário.
  - A rotação da chave partiria as paradas das viagens abertas.
- **Sem coluna: descobrir o cliente da parada pelas notas a cada vínculo.** Não dá invariante no banco,
  não marca o que o backfill já fez e fica ambíguo nas paradas antigas misturadas.
- **Chegada propagada às irmãs.** Rejeitada pelo usuário: cada cliente é um recebimento, e a hora de
  cada um é um fato próprio.
- **Rótulo com os dois nomes numa parada só** (a promessa da 056). É o que o motorista chamou de
  misturado, e não resolve janela, agendamento nem portal.
- **ETA igual para as irmãs.** Infla o ETA das paradas seguintes a cada chegada (§6).
- **Limitar o deslocamento do ETA em vez de pular a chegada da irmã.** Qualquer teto é um número
  inventado. A regra "irmã aberta não desloca" diz exatamente o caso: o motorista já está no portão.
- **Partir também as viagens em separação e carregamento.** A etiqueta impressa e a planta do barracão
  já seguem as paradas antigas.
- **Interruptor de ambiente no reconciliador.** Custa uma variável e um estado a mais para lembrar de
  remover. Os três passos de deploy dão o mesmo resultado.

## Consequências

- Mais paradas por viagem, com o mesmo número de pontos para o solver.
- A planta ganha fronteiras de descarga entre irmãs. A spec 197 mede a perda antes de publicar.
- O despacho automático pode passar a travar por agendamento de um cliente que antes se escondia atrás
  do vizinho (`TRIP_HAS_UNSCHEDULED_STOPS`). É correção.
- O painel precisa aceitar o campo novo **antes** de a API mandá-lo.
- A proposta multi-veículo continua mostrando lugares. A viagem aceita mostra clientes.
- Quem contar clientes por endereço (o `recipientCount` da spec 195) conta pela identidade do `dest` das
  notas, com a mesma função, e não pela coluna, que é nula em parada antiga e zerada em viagem
  concluída.
- A amostra de tempo de parada por cliente (058 D6, spec 198) fica contaminada quando o motorista toca
  os dois "Cheguei" juntos no portão.
- A cópia da chave do lugar no worker (`pool-address-key.ts`) e no painel (`stopAddressKey.service.ts`)
  não muda. Só o comentário "nunca por CNPJ" deixa de ser verdade para a parada.

## Seguimentos

- Mostrar os clientes na linha da proposta multi-veículo.
- Interseção das janelas de irmãs no solver, se a proposta errar por isso.
- Rodar o comando em produção, com aprovação humana, fora da spec 197.
- Remover a transição da §8 quando não houver parada antiga em viagem aberta.
