# ADR-0094 — O recebimento da carga acontece antes da viagem, e cada contratante tem o seu perfil

- **Status:** aceita
- **Data:** 2026-10-03
- **Decisores:** usuário (respostas de 2026-10-03 na spec 237), revisão `architect` (opus) na T1.1
- **Spec:** 237 (`specs/237-a-carga-chega-e-se-separa-antes-da-viagem/`)
- **Mantém:** ADR-0021 (instalação dedicada, isolamento multiempresa) · ADR-0043/0074 (eixo
  `separation_status` da nota na viagem e despacho derivado) · ADR-0044 §5 (a sugestão nunca cria
  viagem) · ADR-0048 (cadastro nasce sem regra; ausência é ausência)
- **Molde:** `delivery_proof_setting_contractor_overrides` (spec 218 RF-C1): tabela por contratante, FK
  composta com o tenant

## Contexto

A carga de um contratante chega **antes** de existir viagem: uma planilha de prévia por e-mail, a
mercadoria em paletes, a equipe desembrulha, organiza por cidade e separa por rota; há 24 h para separar
e abrir avaria, e 3 dias úteis desde a chegada para entregar. O usuário foi explícito: **isso vale para
um CNPJ específico**; outros contratantes terão outras regras.

O sistema só conhece a separação **dentro** de uma viagem (`trip_documents.separation_status`:
`pending → separated → loaded`, ADR-0043), depois de a nota ter sido vinculada. Antes disso não há estado,
relógio, prévia nem lugar para guardar "as regras deste contratante". O contratante só tem período de
fechamento, e-mail do relatório e observações (`contractors`).

A análise de quatro planilhas reais e 277 XMLs do mesmo emitente (`planilha-fr.md`) mostrou que a
planilha **não traz** número de NF-e, chave, série nem CNPJ do emitente; que o identificador da linha
(`Text001`) e o código do cliente (`Company`) **não aparecem** no XML; e que a prévia chega 2,7 a 4,2 h
**antes** da emissão das notas.

## Decisão

### 1. O recebimento é um eixo próprio, antes da viagem

A nota que chega tem um eixo de recebimento **separado** (`expected → received → separated`, Fase 2 da
237), agrupado por rota do contratante × cidade. `trip_documents.separation_status` **não é tocado**:
quando a nota entra numa viagem ela continua `pending`, e o despacho derivado (ADR-0074) segue lendo só o
eixo da viagem. Misturar os dois faria a separação de recebimento disparar o despacho de uma viagem que
ainda nem existe.

### 2. As regras de cada contratante são dado: o perfil de recebimento

`contractor_receiving_profiles`, uma linha por contratante, no molde de
`delivery_proof_setting_contractor_overrides`: FK composta `(company_id, contractor_id)` →
`contractors(company_id, id)`, `unique (company_id, contractor_id)`, PK `uuid`, sem ENUM nativo.
**Nenhum CNPJ de contratante entra em `src/`.**

**Ausência é ausência** (ADR-0048): contratante sem linha, ou com `is_enabled = false`, segue o fluxo de
hoje — nenhuma rota nova o afeta. As **regras do contratante** (janela, prazo, prévia, padrão, avaria) são
opcionais, e nulo é "o contratante não definiu", nunca "zero". `match_window_days` e
`weight_tolerance_percent` são outra coisa: **parâmetros do algoritmo de vínculo**, com padrão, por isso
`NOT NULL`.

| Coluna                            | Tipo           | Regra                                    | Para quê                                                          |
| --------------------------------- | -------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `is_enabled`                      | `boolean`      | not null, default `false`                | o perfil só vale ligado; desligar devolve o fluxo de hoje         |
| `separation_window_hours`         | `smallint`     | nulo, `1..168`                           | janela de separação/avaria desde a chegada (Fase 2/3)             |
| `delivery_deadline_business_days` | `smallint`     | nulo, `1..60`                            | prazo de entrega em dias úteis — **lido pela spec 236**           |
| `match_window_days`               | `smallint`     | not null, default `15`, `1..60`          | até quantos dias depois da prévia um XML ainda é candidato (RF5a) |
| `weight_tolerance_percent`        | `numeric(5,2)` | not null, default `0`, `0..100`          | tolerância do peso **acima** do piso de 0,01 kg (§4)              |
| `preview_enabled`                 | `boolean`      | not null, default `false`                | o contratante manda prévia                                        |
| `preview_sheet_name`              | `text`         | nulo, 1..31 caracteres (limite do Excel) | aba que tem os dados (`IMPORTAÇÃO`); nula = a primeira aba        |
| `preview_column_map`              | `jsonb`        | nulo, objeto; exigido com prévia ligada  | **nome de coluna → campo** da prévia, nunca posição               |
| `arrival_reference_pattern`       | `text`         | nulo, 1..200 caracteres                  | **deprecada** (revisão de segurança S3): sem leitor nem escritor  |
| `arrival_reference_label`         | `text`         | nulo, 1..60, sem caractere de controle   | texto literal que antecede o `NroCarga` no `infCpl`               |
| `requires_damage_check`           | `boolean`      | not null, default `false`                | conferência de avaria na entrada (Fase 3, D4 aberta: só dado)     |

Mais `id`, `company_id`, `contractor_id`, `created_at`, `updated_at`. CHECK de consistência:
`not preview_enabled or preview_column_map is not null` — prévia ligada sem mapa é prévia que o worker
nunca vai conseguir ler.

O formato de `preview_column_map` é validado na fronteira (Zod): chaves só entre os campos de item da
prévia (`contractorReference`, `recipientCode`, `recipientName`, `weightKg`, `volumeM3`, `value`,
`address`, `neighborhood`, `city`, `state`, `postalCode`, `routeName`, `routingDate`), valor = nome de
coluna (1..80 caracteres), no máximo 20 entradas, sem coluna repetida **depois de normalizar** (espaço
das pontas e caixa — a mesma normalização que o leitor da planilha vai usar). Com `preview_enabled`, o
mapa precisa ter pelo menos `routeName`, `value` e `weightKg`, que são o mínimo do vínculo (RF5a). O banco
só garante que é objeto.

_Revisão de segurança da Fase 4a (S3), 2026-10-04 — substitui o parágrafo abaixo:_ o filtro de padrão
não bastou (`NroCarga:(\d*)\d*\d*\d*\d*X` passava e levava 2,7 s sobre 200 dígitos;
`(\d+)\s*\d*…Z`, 23,6 s sobre 100). O perfil passou a guardar só o **texto** que antecede o número
(`arrival_reference_label`, ex.: `NroCarga:`), e o motor monta a gramática fechada
`literal + \s{0,5}([A-Za-z0-9]{1,30})` sobre os primeiros 2 000 caracteres, sem flag de usuário —
nenhuma expressão do usuário roda. Conferido contra 277 `infCpl` reais: 277 leituras iguais às do
padrão antigo. O `PUT` exige `arrivalReferenceLabel` e recusa a chave antiga; a coluna antiga fica,
sem uso, até uma limpeza decidida à parte. A alternativa "guardar só o rótulo" (tabela abaixo) virou a
decisão; o formato `CARGA N. 123/A` de outro emitente leria `123`.

`arrival_reference_pattern` é **dado**, nunca executado nesta fase. Na gravação: ≤ 200 caracteres,
compila com a flag `u` (em `try/catch`, erro vira 400 do campo), tem **exatamente um grupo de captura** (o
valor da carga) e recusa o que faz o motor retroceder sem limite: **quantificador aninhado** (`(a+)+`,
`(a*){2,}`), **grupo quantificado com alternação** (`(a|ab)+`), **referência para trás** (`\1`, `\k<x>`)
e **lookaround**. O padrão vai rodar sobre texto de NF-e de terceiro, e retrocesso catastrófico é negação
de serviço. Esse filtro é a primeira barreira, não a garantia: a fase que executar o padrão limita o
tamanho da entrada (`infCpl`) e roda com prazo, porque o motor de expressão do Bun (JavaScriptCore) também
retrocede.

#### As regras valem para a chegada que ainda vai nascer

Editar o perfil **nunca** age sobre chegada que já existe. A chegada (Fase 2) copia, no momento do
registro, o `separation_due_at` (de `separation_window_hours`) e o prazo em dias úteis (de
`delivery_deadline_business_days`, que a 236 lê); mudar o prazo de 3 para 5 dias amanhã não refaz o prazo
nem o selo das entregas de hoje. `separation_window_hours` nulo é chegada **sem relógio de separação**; o
que isso significa para a avaria de entrada é decisão da T3.1 (D4 aberta).

#### O que divergiu do RF1 da spec, e por quê

- **`preview_sender_allowlist` fica para a Fase 4b.** Quem é o remetente depende da D6 (endereço próprio
  × encaminhamento × caixa conectada); na opção (b) o remetente verificado passa a ser o da
  transportadora. Gravar a lista agora seria fixar uma semântica que a D6 pode inverter. Entra como
  coluna aditiva quando a D6 fechar.
- **`grouping` não vira coluna.** O usuário decidiu que a primeira separação é por rota × cidade; uma
  coluna com um único valor possível é configuração morta. Se outro contratante agrupar diferente, a
  coluna nasce aditiva, com o valor de hoje como padrão.
- **Acrescentados** `match_window_days`, `weight_tolerance_percent`, `preview_sheet_name` e
  `arrival_reference_pattern`: são os parâmetros que o vínculo por conteúdo (RF5a) e a leitura da planilha
  (RF4) precisam, e que a análise mostrou variar por contratante (aba, nomes de coluna, padrão do
  `infCpl`).
- **`notes` não entrou** (estava no pedido da T1.1): `contractors.notes` já existe, e duas observações na
  mesma ficha confundem quem lê.
- **Risco registrado:** o contratante é **um** CNPJ. Emitente com filiais vai precisar de uma lista de
  emitentes por perfil — aditiva, quando aparecer.

### 3. Prévia = chegada

Decisão do usuário: **1 prévia = 1 chegada**. Ao ler a prévia o sistema propõe a chegada (contratante, dia
planejado, roteiros, notas esperadas) e o operador só confirma a hora em que o caminhão chegou. O `LACRE`
dos XMLs (3 lacres para 18 cargas) é informação de apoio, não chave.

### 4. O vínculo da linha com a nota é por conteúdo, nunca por número

Detalhe medido em `planilha-fr.md`. Em resumo, dentro do universo de **um** contratante (notas do
emitente, não vinculadas, importadas depois do e-mail e dentro de `match_window_days`), em três níveis:
roteiro (`RouteName`) ↔ carga (`NroCarga` do `infCpl`, lido pelo `arrival_reference_pattern`) pelo
encaixe de totais; cliente dentro do grupo; e **n linhas ↔ 1 nota** pela soma exata de valor e peso (uma
NF junta vários pedidos do mesmo cliente). Veredito por linha `matched | ambiguous | suggested |
awaiting_xml | invalid`, sempre corrigível pelo operador. O vínculo é **assíncrono**: nasce quando o XML
é importado, porque a prévia chega antes da emissão.

**Medido na T4.3 (corpus real anonimizado), e o que isso corrige:**

- **O peso não é exato ao grama: há diferença de até 5 g por arredondamento da planilha** (`PESO TOTAL`
  com 2 casas, `pesoB` com 3; pior caso 0,0321%, em 15,6 kg). O peso concorda quando
  `|Δ| ≤ max(0,01 kg, weight_tolerance_percent × peso da nota)`: o piso
  (`PREVIEW_WEIGHT_ROUNDING_FLOOR_KG`) é do formato, não do contratante, e não depende de o perfil
  lembrar de configurar; o percentual vale acima dele para divergência real. O padrão da coluna fica `0`
  (sem migration). Com isso fecham 180 de 187 (FR-24-09) e 97 de 107 (FR-28-09) já com tolerância 0.
  _Revisão da Fase 4a (M5):_ cada linha somada arredonda até 5 g, então n linhas contra uma nota (ou um
  roteiro inteiro contra a carga) somam até 5·n g. O piso passou a
  `max(0,01 kg, 0,005 kg × linhas somadas)` (`PREVIEW_WEIGHT_ROUNDING_PER_LINE_KG`), na partição e nos
  totais do roteiro; para uma linha continua 0,01 kg. FR.ORLAN (FR-24-09) passou de votos a totais.
- **O par roteiro ↔ carga também nasce pelos votos**, não só pelos totais: com o XML chegando aos
  poucos (o fluxo principal), os totais só fecham no fim, e as linhas que já fecham sozinhas numa nota da
  carga bastam para parear. Empate de escore não pareia. _Revisão da Fase 4a (H1):_ um voto é
  coincidência de valor e peso — com uma nota só da carga importada, a linha de outro roteiro que
  coincidia pareava o roteiro errado (a diferença de contagem desempatava a favor do roteiro menor), o
  par era gravado, voltava como "conhecido" e travava o verdadeiro. Agora o par por votos exige
  **2 votos e 25% das linhas do roteiro** (`MIN_ROUTE_PAIR_VOTES`, `MIN_ROUTE_PAIR_VOTE_PERCENT`), a
  diferença de contagem não desempata, e ele **vale só na leitura em que nasceu**: nunca é gravado em
  `cargo_preview_route_loads` nem volta como par conhecido (linha `votes` de versão anterior é
  ignorada). Só o par pelos totais é gravado.
- **Valor e peso sozinhos são sugestão** (revisão da Fase 4a, M2 e a pergunta aberta da passada `open`):
  sem par pelos totais (ou firmado) e sem reforço independente — CEP, razão social ou alias — a linha que
  fecha valor e peso numa nota fica `suggested`, para o operador confirmar. Dentro de um par por votos
  também. Com isso o alias `Company → CNPJ` só é aprendido de vínculo com reforço; e desvincular revoga
  o alias que a prévia aprendeu daquele vínculo, salvo se outro item dela o sustenta. Medido no corpus:
  FR-24-09 180 → 177 `matched` (5 → 8 `suggested`), FR-28-09 97 → 96 (6 → 7).
- **A linha só vincula com o bloco inteiro** (revisão da Fase 4a, M6): a mesma nota em toda partição
  ótima não basta — o bloco de linhas também tem de ser o mesmo, senão a linha vincularia sozinha a uma
  nota que só fecha somada a outra que ninguém sabe qual é. Linhas idênticas do mesmo cliente (mesmo
  valor e peso) são intercambiáveis: trocá-las não é outra partição, e vão aos blocos pela ordem da
  linha.
- **Nota disputada na mesma passada é ambígua para todos que a disputam** (1:1), e linha de roteiro
  pareado só pega, fora do grupo, nota sem `NroCarga`.
- **Acima de 6 linhas do mesmo cliente** (`MAX_PARTITION_LINES`; o medido é ≤ 3) não há partição: só 1
  linha ↔ 1 nota; o que dependeria de soma fica esperando ou sugerido. A busca tem teto de 5 000 nós e
  de 64 soluções ótimas: estourou, é `ambiguous` — nunca trava.

### 5. Ler e gravar o perfil

`GET /contractors/:id/receiving-profile` devolve `{ data: null }` (200) para contratante sem perfil (e a
linha, com `isEnabled: false`, quando o perfil existe desligado), e `404 CONTRACTOR_NOT_FOUND` para
contratante de outra empresa ou inexistente. Leitura é `fleet.read`, como a do próprio contratante.

`PUT` substitui o perfil inteiro e **exige todas as chaves**, com `null` explícito onde não há regra:
campo omitido é `400`, não "volta ao padrão". O painel é PWA com cache; quando a Fase 4b acrescentar uma
coluna, um cliente antigo que omitisse o campo novo apagaria o valor sem erro nenhum — com a chave
obrigatória, ele recebe `400` e o problema aparece. O `PUT` é idempotente e audita em `audit_logs` só
quando algo mudou (o corpo devolvido pelo `GET`, reenviado, não grava nada). Escrever é
`settings.manage`: o perfil decide prazo e janela cobrados de outra empresa. `companyId` vem sempre do
contexto autenticado.

O módulo é novo, `src/cargo-receiving/` (as fases seguintes — chegada, prévia, vínculo — moram nele), e
confere a existência do contratante por consulta própria filtrada pela empresa, sem importar o repositório
de `delivery-clients`.

### 6. A chegada e a primeira separação (Fase 2, T2.1)

- **A nota entra `expected`**, vai a `received` (conferida na doca) e a `separated`, uma etapa por vez
  (`cargo-arrival-transition.policy.ts`). Repetir a etapa atual é no-op e não grava evento. **Não há
  volta**: nem a spec nem este ADR preveem desfazer conferência ou separação, e nada foi inventado.
  Chegada `closed` recusa toda transição; fechar exige todas as notas `separated`.
- **O relógio é copiado no registro:** `separation_window_hours` e `delivery_deadline_business_days`
  vêm do perfil ligado naquele instante; `separation_due_at = arrived_at + janela` em horas corridas
  (nulo sem janela). Perfil ausente ou desligado não abre chegada (`CARGO_RECEIVING_NOT_ENABLED`).
  "Vencida" é leitura: prazo passado **e** nota ainda não separada.
- **O grupo é `(rota, cidade)`**, leitura e nunca estado: a rota é texto livre do operador (a prévia a
  preencherá na Fase 4a) e a cidade é o código IBGE do endereço do **destinatário**.
- **Uma nota entra em no máximo uma chegada, para sempre** (`unique (company_id, nfe_document_id)`).
  Consequência aceita: nota posta por engano numa chegada não tem conserto nesta fase, e nota que
  volta (reentrega) não entra em outra chegada. Se uma história pedir, a troca por índice parcial com
  remoção lógica é aditiva. Na Fase 4 a nota esperada ainda sem XML vai exigir `nfe_document_id`
  nulo e um vínculo com a linha da prévia — também aditivo.
- **Canal:** só `backoffice` (a tela do painel e do separador, que não age em nome de motorista,
  ADR-0068 §3); canal novo entra no CHECK de forma aditiva.

### 7. A leitura da planilha de prévia (Fase 4a, T4.1)

A planilha é entrada hostil: um `.xlsm` é um zip OOXML com `xl/vbaProject.bin` (macro). A decisão é
um **leitor mínimo próprio** sobre duas bibliotecas que a API **já tem** — `fflate` 0.8.3 (zip/deflate,
sem dependências, fixada) e `fast-xml-parser` 5.10.1 (XML, já usada nos mapeadores de CT-e e MDF-e) —,
em `src/cargo-receiving/domain/`, sem I/O, com relógio e limites por parâmetro. **Nenhuma dependência
nova** entra no `bun.lock`.

- **O que se lê:** só `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` (se
  existir) e a aba escolhida (nome do perfil, ou a primeira). O diretório central do zip é lido pelo
  próprio leitor (não pelo `unzipSync`, que confia no tamanho declarado e decodifica o fluxo inteiro
  mesmo quando a saída estoura) e só essas entradas são descomprimidas. **`vbaProject.bin` nunca é
  descomprimido**, `RESULTADO` (tabela dinâmica com `#NAME?`) nunca é aberta, nenhuma fórmula é
  avaliada: a célula vale o `<v>` em cache, e célula de erro (`t="e"`) é ausente.
- **Descompressão contada:** `Inflate` em fatias de 4 KiB do fluxo comprimido; a cada fatia a saída é
  somada e, passado o teto, o leitor para (o excesso máximo de uma fatia é ~4 MiB, pela razão máxima
  do deflate). O tamanho declarado no diretório é conferido antes (teto) e depois (igualdade).
- **XML:** recusa `<!DOCTYPE`/`<!ENTITY` antes de qualquer parse (o OOXML não usa; é a porta do
  "billion laughs"). A aba é varrida por linha: só linhas com `<v>` ou `<is>` passam pelo parser, e a
  leitura termina na última linha com dado — a aba real reserva 13,8 mil linhas vazias, e o parse da
  aba inteira mediu **237 ms e 80 MB de heap**, contra milissegundos por linha.

| Limite                                | Teto                                                         | Medido nas quatro planilhas FR          | Erro                       |
| ------------------------------------- | ------------------------------------------------------------ | --------------------------------------- | -------------------------- |
| tamanho do arquivo                    | 5 MiB                                                        | 0,80–0,82 MB                            | `PREVIEW_FILE_TOO_LARGE`   |
| bytes mágicos                         | `PK\x03\x04`                                                 | —                                       | `PREVIEW_NOT_A_WORKBOOK`   |
| entradas no zip                       | 100                                                          | 25                                      | `PREVIEW_TOO_MANY_ENTRIES` |
| descompressão por entrada             | 8 MiB (era 30)                                               | `sheet1.xml` 3,36–3,39 MB (a maior)     | `PREVIEW_ZIP_BOMB`         |
| descompressão total (entradas lidas)  | 16 MiB (era 60)                                              | ~3,4 MB (arquivo inteiro: 5,65–5,73 MB) | `PREVIEW_ZIP_BOMB`         |
| `workbook.xml` e `.rels`              | 1 MiB cada                                                   | 1,2 KB e 1,4 KB                         | `PREVIEW_ZIP_BOMB`         |
| nome de entrada                       | sem `..`, `/` inicial, `\`, `C:`, NUL; sem repetição         | —                                       | `PREVIEW_ZIP_ENTRY_UNSAFE` |
| zip64, cifra, método ≠ 0/8            | recusados                                                    | nenhum                                  | `PREVIEW_NOT_A_WORKBOOK`   |
| strings compartilhadas                | 200 000                                                      | 492–802                                 | `PREVIEW_TOO_MANY_STRINGS` |
| texto de uma célula                   | 32 767 (o do Excel)                                          | ≤ 49                                    | `PREVIEW_CELL_TOO_LONG`    |
| última linha com dado                 | 5 000 (era 20 000)                                           | 127–233 (de 13 792 reservadas)          | `PREVIEW_TOO_MANY_ROWS`    |
| células por linha (contadas no texto) | 512                                                          | 14                                      | `PREVIEW_TOO_MANY_CELLS`   |
| células no total                      | 120 000                                                      | 1 658–3 036                             | `PREVIEW_TOO_MANY_CELLS`   |
| decimal em texto                      | 40 caracteres (antes do regex e do `BigInt`)                 | ≤ 18                                    | erro da linha              |
| orçamento cooperativo                 | 5 000 ms, conferido no zip, na aba, no cabeçalho e nos itens | 45–74 ms por planilha                   | `PREVIEW_PARSE_TIMEOUT`    |
| teto da thread do worker              | 10 000 ms, `terminate()`                                     | —                                       | `PREVIEW_PARSE_TIMEOUT`    |

**A promessa dos 5 s era falsa** (revisão de segurança da Fase 4a, S1/S4): o orçamento só era conferido
no zip e na varredura da aba, e o parse de uma linha é síncrono. 87 KiB comprimidos (uma linha com ~760
mil células) prenderam o event loop por 7,8–8,3 min e 2,27 GB; 123 KiB, 1,36 GB; 2 000 linhas com VALOR e
PESO num decimal de 32,7 mil dígitos, 22,9 s **com sucesso**. Os tetos acima (bytes menores, células,
decimal) cortam o custo na entrada; o orçamento passou a cobrir cabeçalho e itens; e o único teto real
para código síncrono é a **thread** do worker (§8). O Bun 1.3.14 ignora `resourceLimits` (medido), então
a memória fica limitada pelos tetos, não pela thread.

**Número e data** (revisão da Fase 4a, H2 e L3): o teto de dígitos inteiros é o da coluna de cada campo
(`value numeric(14,2)` → 12, `weight_kg numeric(12,3)` → 9, `volume_m3 numeric(12,4)` → 8;
`PREVIEW_DECIMAL_FIELDS`), medido depois do arredondamento, e passar dele é erro da linha — um EAN-13 em
VALOR estourava o `numeric` no banco e a mensagem voltava à fila para sempre. A data do roteiro respeita
o sistema do arquivo (`workbookPr date1904`, em que o mesmo serial é 1 462 dias depois) e a célula
`t="d"` em ISO, com ou sem hora.

Falta de aba (`PREVIEW_SHEET_NOT_FOUND`) e de coluna mapeada (`PREVIEW_COLUMN_NOT_FOUND`, com o nome,
todas de uma vez) recusam a planilha; coluna repetida no cabeçalho é `PREVIEW_COLUMN_DUPLICATED`,
porque escolher uma em silêncio é dado trocado. Erro de **linha** nunca recusa a planilha: vira
`rowErrors` com `{ rowNumber, field, message }`.

**Alternativas descartadas** (conferidas no registro do npm em 2026-10-04):

| Biblioteca               | Situação                                                                | Por que não                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exceljs` 4.4.0          | último publish 2024-12; `jszip`, `unzipper`, `archiver`, `saxes`, `tmp` | sem teto de descompressão controlável, lê o pacote inteiro (estilos, tabela dinâmica), dependência que escreve em disco temporário; 5 dependências novas no lockfile |
| `read-excel-file` 9.3.10 | ativa (2026-08); `fflate`, `saxen`, `unzipper-esm`, `worker-f`          | só leitura e enxuta, mas os limites (tamanho descomprimido, linhas, tempo) não são expostos, e traz 3 dependências novas para fazer o que `fflate` já faz aqui       |
| `xlsx` (SheetJS) 0.18.5  | a versão do npm é de 2022; o projeto saiu do npm                        | as correções de poluição de protótipo (GHSA-4r6h-8v6p-xvw6) e ReDoS (GHSA-5pgg-2g8v-p4x9) só existem fora do npm; superfície enorme (BIFF, CFB) para ler uma aba     |

As duas bibliotecas estão nas versões que fecham os avisos publicados: `fflate` 0.8.3 corrige o laço
infinito do `unzipSync` com ZIP64 malformado (GHSA-px8p-9vwx-vf98; o leitor nem usa `unzipSync` e
recusa ZIP64) e `fast-xml-parser` 5.10.1 corrige a expansão de entidade com `DOCTYPE` repetido
(GHSA-8r6m-32jq-jx6q; o leitor recusa `DOCTYPE` antes do parse). O custo aceito é manter ~1 100 linhas de leitor; o ganho é que cada teto é uma constante nomeada,
testada e provada por mutação, e que nada além das quatro entradas é sequer descomprimido.

### 8. A prévia por upload, o vínculo e a reavaliação (Fase 4a, T4.2 e T4.3 parte B)

- **A API guarda e enfileira; o worker lê e vincula.** `POST /cargo-previews` confere o tipo pelos
  bytes, guarda o arquivo no bucket privado com chave opaca e grava prévia, evento e pedido ao worker
  numa transação. O pedido vai a `cargo_preview_outbox`, **trilho próprio**: `processing_outbox` é
  preso a `nfe_import` por CHECK e FK. O teto do arquivo é **960 KiB**, e não os 5 MiB do leitor:
  o corpo da API para em 1 MiB antes da rota (o servidor, em 2 MiB), e subir esse teto para todas
  as rotas (inclusive as anônimas) por uma planilha de 0,8 MB não se paga. O leitor continua com
  5 MiB como defesa em profundidade. **Horizonte** (medido nas planilhas reais, revisão da Fase 4a,
  L4): o arquivo tem 0,80–0,82 MB, quase tudo parte fixa (macro, estilos, 13,8 mil linhas
  reservadas); cada linha de dado custa ~73 bytes comprimidos na aba e ~104–108 contando as strings
  novas. Sobram 168–184 KB até o teto: **~1 600 linhas a mais** (≈ 8× as 124–217 linhas com dado medidas). O que
  ameaça o teto é o modelo do contratante crescer (mais linhas reservadas, outra macro), não o dia
  cheio.
- **Uma nota, uma prévia, é do banco.** `cargo_preview_document_links` tem `unique (company_id,
document_id)`; as N linhas que fecham a mesma nota apontam para o vínculo **da prévia delas** por
  FK composta. Um unique no item não serviria, porque N linhas ↔ 1 nota é permitido.
- **Uma trava por contratante, advisory.** Worker (leitura e reavaliação) e operador (confirmar,
  desvincular, vincular) tomam `pg_advisory_xact_lock` da mesma chave antes de ler as notas livres.
  Não é a linha de `contractors` porque a importação de NF-e a regrava, e a importação não espera
  vínculo. As prévias são vinculadas da mais antiga para a mais nova: o resultado não depende da
  ordem de chegada das reavaliações. Isso vale também na leitura de uma prévia nova, que reavalia
  todas as prontas da janela (revisão da Fase 4a, M3) — antes ela vinculava só a si mesma e podia
  levar a nota que a mais antiga esperava.
- **A reavaliação nasce na importação, num savepoint, coalescida.** Toda nota nova pede a reavaliação
  do contratante do emitente (só com prévia em aberto), num `SAVEPOINT` que nunca derruba nem atrasa a
  importação; com um pedido pendente, a nota seguinte não grava outro, e ele nasce adiado 30 s — um
  lote de 300 XMLs vira uma reavaliação. Sem unique, de propósito: decidir o conflito esperaria a
  transação de outra importação. _Revisão da Fase 4a (M4, L2):_ só coalesce com pedido que ainda tem
  10 s de folga (`CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS`, medida por `clock_timestamp()`):
  o pedido prestes a sair pode ser lido antes de a importação comitar, e a nota dela ficaria sem
  reavaliação. E só conta prévia dentro de `match_window_days`. Desvincular também pede a reavaliação
  do contratante (a nota solta pode ser de outra prévia).
- **A prévia sempre termina** (revisão da Fase 4a, M1 e H2): a leitura que esgota a fila marca a prévia
  `failed` com `PREVIEW_PROCESSING_ABANDONED` antes da fila morta, e o estouro numérico no banco
  (22003) vira `PREVIEW_VALUE_OUT_OF_RANGE` — nunca retry infinito. Reenviar o mesmo arquivo de uma
  prévia `failed`, ou `processing` sem notícia há mais de 15 min (`CARGO_PREVIEW_PROCESSING_LEASE_MS`),
  **reabre a mesma prévia** (`queued`, evento `uploaded` com `reopened`, pedido novo ao worker, 201);
  pronta ou em leitura recente continua repetição (200). Os dois códigos entraram no CHECK de
  `cargo_previews.error_code` pela migration aditiva `20261004165112_cargo_preview_failure_codes`.
- **Revisão de segurança da Fase 4a (2026-10-04).** _S1:_ a leitura (parse + plano dos itens) roda numa
  `worker_thread` (`threaded-cargo-preview-workbook.gateway.ts`, molde do canhoto), terminada em 10 s:
  `PREVIEW_PARSE_TIMEOUT`, sem retentativa. A reentrega do broker (`redelivered`) de uma prévia já em
  `processing` não relê: `PREVIEW_PROCESSING_INTERRUPTED` (o reenvio do arquivo a reabre). _S2:_ o vínculo
  é linear no cliente grande (19 900 linhas: 9,9 s → 0,17 s, resultado idêntico em 3 400 cenários
  sorteados), consulta um orçamento cooperativo de 5 s por prévia, e a transação tem `statement_timeout`
  de 30 s; a prévia nova que estoura volta inteira (`PREVIEW_MATCH_TIMEOUT`, sem itens), a pronta fica como
  estava. _S5:_ 20 envios por 300 s por usuário e no máximo 5 prévias `queued`/`processing` por
  contratante (422 `CARGO_PREVIEW_TOO_MANY_OPEN`, sob trava advisory do envio). _S6:_ alias contrariado
  por vínculo reforçado é apagado. _S7:_ o worker monta a chave pela linha (nunca pela mensagem) e recusa
  acima de 960 KiB pelo `Content-Length`. Os três códigos novos entraram no CHECK pela migration aditiva
  `20261004174001_cargo_preview_security_failure_codes`.
- **O operador manda.** Item confirmado, desvinculado ou vinculado à mão fica `matched_by = user` e a
  reavaliação nunca mais o lê. Desvincular age no grupo inteiro (soltar uma linha de uma soma deixaria
  as outras apontando para uma nota que não fecha).
- **Janela das candidatas:** notas importadas (`created_at`) entre `received_at − match_window_days` e
  o menor de `agora` e `received_at + match_window_days` — o envio manual pode chegar depois do XML.

## Consequências

- Contratante novo com regra diferente é cadastro, não deploy.
- A spec 236 lê `delivery_deadline_business_days` sem depender do resto do módulo.
- O agregado `Contractor` **não muda**: o perfil é recurso separado, e as guardas de chave exata do
  painel continuam valendo sem alteração.
- A tabela do worker (`apps/worker-transportada/.../delivery-client.schema.ts`) não ganha nada até a fase
  que o worker ler o perfil.
- Os relógios e a avaria (Fases 2 e 3) e a prévia (Fase 4) leem esta tabela; nenhuma delas reescreve
  `trip_documents`.

## Alternativas descartadas

| Alternativa                                                             | Por que não                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regra por CNPJ no código (`if (taxId === …)`)                           | Produto genérico (ADR-0021): outra transportadora, outro contratante, e o código vira uma lista de clientes. O usuário já avisou que outros contratantes terão outra regra                                                                                        |
| Colunas novas em `company_delivery_proof_settings` (ou na exceção)      | Aquela tabela é o **formulário do comprovante** de entrega; recebimento é outro momento e outro dono. Misturar faz o `PUT` de um sobrescrever a regra do outro                                                                                                    |
| Colunas novas em `contractors`                                          | Muda o agregado `Contractor` (três guardas de chave exata no painel, `PATCH /contractors`) por um dado que só um contratante em dez terá; ausência fica difícil de ler                                                                                            |
| Relaxar o `NOT NULL` de `trip_document_occurrences.trip_document_id`    | Perde a garantia de que toda ocorrência pertence a algo; a avaria sem viagem (Fase 3) usa coluna irmã com `CHECK` de exatamente-um, decisão própria da T3.1                                                                                                       |
| Reaproveitar `separation_status` para a primeira separação              | A nota não está em viagem; o despacho derivado (ADR-0074) passaria a reagir a uma separação de galpão                                                                                                                                                             |
| Guardar só o rótulo (`NroCarga`) e extrair com expressão fixa do código | Mais seguro, e foi sugerido na revisão; ficou a expressão porque a análise só viu um contratante, e o formato do `infCpl` de outro emitente (`Carga: 123`, `CARGA N. 123/A`) não é conhecido. Fica como alternativa se o filtro de padrão se mostrar insuficiente |
| Mapa de colunas por posição (`A`, `B`, …)                               | O contratante reordena colunas; por nome, a mudança vira erro de coluna faltando, não dado trocado em silêncio                                                                                                                                                    |
