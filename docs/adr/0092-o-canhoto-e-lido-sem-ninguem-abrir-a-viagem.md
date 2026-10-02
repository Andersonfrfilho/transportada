# ADR 0092 — O canhoto é lido sem ninguém abrir a viagem

- Status: aceito
- Data: 2026-10-01
- Nasce da spec 222, e revisa a RF25 da spec 220
- Decisão do usuário em 2026-10-01: a leitura passa a acontecer numa rotina do servidor

## Contexto

A spec 220 pôs a leitura automática do canhoto **no navegador**, e a rota da conferência diz isso
por escrito: "`automatic` entra pela rota porque RF25 põe a leitura no navegador: não existe outro
chamador". Era verdade, e era uma escolha defensável — o aparelho que já tem a foto na tela é o que
tem o pixel mais perto.

O que ela não previu é **quando** a tela está aberta. A leitura monta dentro do painel do
comprovante (`TripDetail.component.tsx:1498`) e a consulta que a alimenta só liga com uma nota
aberta (`useTripWorkspace.hook.ts:451`, `enabled: openProofDocumentId !== null`). A consequência,
medida no código e não suposta: **canhoto que ninguém abriu nunca foi lido**. Fica
`canhoto_review = 'pending'` com `canhoto_read_source = NULL` indefinidamente, inclusive quando o
código de barras da foto casaria com a própria nota e aprovaria sozinho pela regra que já existe.

Uma viagem com quarenta entregas, portanto, não tem quarenta conferências pendentes por falta de
regra — tem por falta de alguém abrir quarenta painéis.

## Decisão

### 1. A leitura ganha um segundo chamador, e o veredito não se move

Uma rotina agendada (`trip.canhoto.read`: o cron publica, o worker consome) varre os canhotos
pendentes, decodifica o código de barras e **reporta o que leu**. Quem decide continua sendo
`resolveAutomaticCanhotoReview`, no servidor.

Isto é o coração desta ADR: a RF26 da 220 ("OCR nunca aprova sozinho", "código de barras aprova
porque não interpreta") é invariante **do servidor**, não convenção do cliente. Nada na política de
domínio muda — é justamente por ela já estar no lugar certo que um canal novo custa tão pouco.

⚠️ **E a garantia é mais estreita do que "cliente não consegue aprovar".** O servidor compara o
número declarado contra a cópia que ele mesmo tem (`lockCanhotoProof` traz `nfe_documents.number`),
então o que um chamador não consegue é:

- aprovar com leitura que **discorde** do número daquela nota;
- aprovar nota sem NF-e vinculada, que não tem número a comparar;
- chegar a `rejected` — `resolveAutomaticVerdict` devolve só `approved` ou `pending`.

O que ele **consegue** é aprovar um canhoto que não leu, se souber o número certo e declarar
`readSource: 'barcode'`. Isso não é regressão: a rota de gente já aceita `action: 'automatic'` de
qualquer `trip.manage`, com exatamente o mesmo poder, desde a 220. O que esta ADR acrescenta é um
chamador **cross-tenant** (ADR-0047 §3), desacompanhado e de cinco em cinco minutos — e é por isso
que ele tem permissão mínima própria (§2) e trilha por comprovante (§7), não porque a aprovação
forjada seja impossível.

### 2. O robô tem rota própria e permissão própria

A conferência de gente é `trip.manage`. O robô **não** recebe `trip.manage` — isso lhe daria separar,
carregar, cancelar e aprovar à mão. Ele recebe uma rota só dele
(`PATCH /trips/:id/documents/:documentId/proof/review/automatic`) e a permissão
`trip.canhoto-auto-review`, concedida só ao papel `automation`. É o ADR-0047 §4 aplicado sem
desconto: "um serviço que pode tudo o que um operador pode é um operador com senha que ninguém
troca".

O nome tem prefixo `trip` porque **`canhoto` não é um domínio**: não existe módulo `canhoto/`, a
tabela é `trip_delivery_proofs` e a rota é `/trips/...`. Os vinte e um prefixos do catálogo são
domínios do produto, e inventar o vigésimo segundo por uma permissão só compraria simetria com
`mdfe.auto-issue` ao preço de um domínio que não existe. O sufixo é `-review`, não `-read`, porque
em todo o catálogo `.read` significa ver — uma permissão de **escrita** terminada em `-read` seria
lida errado por quem audita a matriz de concessão, que é o único lugar onde esse nome aparece para
gente.

E ela entra em **duas** listas, não uma: o catálogo e `SERVICE_ONLY_PERMISSIONS`. É a segunda que
`isGrantablePermission` consulta para recusar concessão por grupo ou avulsa — sem ela, quem tem
`groups.manage` concede a si mesmo a porta do robô, que é um `approved` sem `trip.manage`, sem
trilha de pessoa e com `canhoto_review_by_user_id` nulo.

A rota do robô **não aceita `action`** — o `.strict()` do Zod recusa. O canal fica impossível de usar
para aprovar ou recusar, não por disciplina de quem chama, mas por forma do contrato.

### 3. Só o código de barras. O OCR fica no navegador

A rotina não roda OCR. Pela RF26, OCR nunca aprova: ele sugere. Rodar Tesseract por canhoto no
worker gastaria CPU para produzir exatamente o mesmo `pending` que o canhoto já tem — e o número
sugerido, que é o que ajuda a pessoa, continua sendo lido no navegador quando ela abre o comprovante
ou o maço.

### 4. A decodificação é wasm, em `worker_thread`

`@jsquash/{jpeg,png,webp}`, não `sharp`. Medido (spike T4.1, registrado em
`specs/222-.../spike-decodificador.md`): foto de 12,2 MP em `worker_thread`, com os flags de
empacotamento do worker, 101 ms em JPEG, 179 ms em PNG, 312 ms em WebP, casando a chave de acesso
exata. O `sharp` saiu ~1,8x mais rápido **na medição de 4,3 MP no processo principal** (12 ms contra
22 ms) e não foi medido em `worker_thread` — a procedência fica dita porque um número sem origem num
ADR é o que faz alguém "corrigir" a decisão depois. De qualquer forma a velocidade não decide nada
aqui: 101 ms por foto dá ~4 s de CPU num ciclo de quarenta canhotos, contra uma batida de 300 s.

O teto de bytes é **8 MB, conferido antes do download**, pelo tamanho já gravado em
`stored_objects` — não depois de baixar. O PNG de 12 MP do spike deu 10,7 MB e levou o RSS do worker
a ~300 MB; 8 MB cobre JPEG e WebP de câmera com folga e corta justamente esse caso.

O que decide é o `bun install --frozen-lockfile` da CI e do Railway não depender de binário nativo
por plataforma. O `sharp` traz um prebuild por sistema e arquitetura, e é esse tipo de dependência
que falha no ambiente em que ninguém testou. `worker_thread` é o ADR-0053 pela mesma razão de lá: a
decodificação é CPU, e CPU no event loop é uma fila que ninguém vê.

### 5. Máquina nunca recusa, e nunca passa por cima de gente

O que a rotina não confirma fica `pending`. Sobre veredito humano ela devolve `unchanged` — a
política já garante, e a rotina não ganha exceção.

**O caminho inverso é permitido de propósito**: a pessoa aprova por cima de um `approved`
automático, e isso aplica (a política não trata origem `automatic` como veredito humano). Então o
maço pode aprovar o que a rotina acabou de aprovar e receber **200**, não o 409 em torno do qual a
RF-A7 foi desenhada. É o comportamento certo — quem olhou a foto manda mais que quem leu a barra —
e a tela não deve chamá-lo de conflito.

**A varredura exclui viagem cancelada e nota liberada.** `lockCanhotoProof` não filtra nenhuma das
duas, então sem o corte na varredura a tela recusaria oferecer o canhoto de uma viagem cancelada
enquanto a máquina o aprovaria calada — e o primeiro "o robô aprovou canhoto de viagem cancelada"
seria lido como defeito, com razão. Máquina e tela concordam, e quem garante é a consulta da fila.

### 6. A rotina encurta a fila; ela não é a conferência

A conferência continua sendo humana, e é por isso que a mesma spec 222 entrega a ação do maço com a
foto na frente de quem aprova. A rotina tira da fila o que a máquina sabe confirmar; o que sobra
continua precisando de olho. Uma rotina que "aprovasse o resto" seria a RF26 revogada por outro
caminho.

### 7. A trilha é por comprovante, não por ciclo

O caminho `automatic` de hoje **não** grava `audit_logs` — `reviewCanhotoProof` pula `insertAudit`
quando a ação é automática. Para o navegador isso era defensável: há uma pessoa logada olhando a
foto. Para o robô não é, e o ADR-0047 §6 já disse por quê: "'o sistema emitiu' é a linha que não
responde nada quando alguém pergunta por que aquele manifesto saiu".

A pergunta que **esta** feature vai receber é "por que este canhoto está aprovado se ninguém olhou".
A execução do job responde "um ciclo rodou às 14h05"; ela não responde "este comprovante, com esta
leitura, por este serviço". E como `canhoto_review_by_user_id` continua nulo por CHECK no caminho
automático, `audit_logs` é o **único** lugar onde a identidade do serviço pode aparecer — e a única
coisa que mostraria um token vazado em uso, já que ele alcança toda empresa com membership sintética.

Decisão: **a rota do robô grava trilha** (ação `trip.canhoto-review.automatic`, ator = usuário do
serviço, sem nota e sem PII). A rota de gente fica como está — mudar o silêncio dela é herança da
220 e não é escopo desta ADR.

### 8. A máquina registra que tentou, e não tenta para sempre

Sem isto a rotina tem um defeito que nenhum teste pegaria: canhoto **sem** código de barras — que é
o caso comum do escritório — não produz leitura nenhuma, continua com `canhoto_read_source` nulo, e
por isso volta à varredura. Baixado e decodificado a cada cinco minutos, para sempre, sem nunca
mudar de estado.

Por isso o comprovante ganha `canhoto_read_attempted_at`, e a varredura passa a exigir
`canhoto_read_source IS NULL AND canhoto_read_attempted_at IS NULL`. O instante é gravado quando a
leitura **terminou** e não produziu código utilizável — não quando ela falhou por fora:

| Situação                                         | Grava tentativa?     | Por quê                                                     |
| ------------------------------------------------ | -------------------- | ----------------------------------------------------------- |
| Leu código que casa                              | não se aplica        | vira `approved`, sai da fila pelo `read_source`             |
| Leu código que não casa                          | não se aplica        | grava `read_source`, sai da fila                            |
| Decodificou e não achou código                   | **sim**              | a máquina fez o que sabia fazer; é trabalho de gente        |
| Objeto ausente, acima do teto, timeout, API fora | **não**              | é falha de infraestrutura, e merece o próximo ciclo         |
| API devolve 400                                  | **não**, e é ruidoso | corpo malformado é defeito nosso, vai para o Sentry         |
| API devolve 401/403                              | **não**, e é ruidoso | segredo rotacionado ou permissão perdida, vai para o Sentry |

A recaptura (220 RF30) não é afetada: ela cria comprovante novo, com a coluna nula outra vez.

## Consequências

- O caminho do navegador **não muda**: `CanhotoAutomaticReview` e a rota de gente ficam como estão.
- Dois leitores, uma decisão. O custo de um terceiro leitor (app do motorista, por exemplo) passa a
  ser só uma permissão.
- Uma dependência nova no worker (wasm, sem binário nativo) e um ciclo com CPU — contidos por teto
  de lote, teto de bytes e orçamento de tempo.
- `trip_delivery_proofs` ganha uma coluna (`canhoto_read_attempted_at`) e um índice parcial da fila.
  O índice **não é grátis**: o predicado é avaliado em toda escrita da tabela, e porque
  `canhoto_review` e `canhoto_read_source` são colunas dele, o `UPDATE` que aprova um canhoto deixa
  de poder ser HOT. A relação também **não encolhe sozinha** — entrada liberada é reaproveitada pelo
  `VACUUM`, mas o pico de páginas só volta com `REINDEX`. É preço pequeno e vale pagar; o que não
  valia era vendê-lo como zero.
- O worker **lê por SQL e escreve por HTTP**: ele consulta a fila e as chaves de acesso direto no
  banco (como o `mdfe-auto-issue` faz) e só a escrita passa pela rota. A permissão é fronteira do
  **token**, não do processo — o processo já vê toda nota de toda empresa pela própria conexão.
- **O que se paga:** mais uma superfície autenticada de máquina, cross-tenant e desacompanhada. É
  mitigado por rota de escopo único, corpo que não aceita ação, permissão em
  `SERVICE_ONLY_PERMISSIONS` (nem grupo nem concessão avulsa a dão a gente) e trilha por comprovante
  (§7). Não é mitigado pela impossibilidade de forjar aprovação, que não existe (§1).

## Alternativas descartadas

| Alternativa                                                   | Por que não                                                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disparar a leitura no navegador quando o diálogo do maço abre | Resolve o maço e não resolve a fila: quem nunca abre a viagem continua sem leitura. Fica como plano B se o decodificador não fechar.                                                              |
| A rotina decidir o veredito e gravar direto no banco          | Devolveria a RF26 para fora do servidor e duplicaria a política em duas apps. O ponto da 220 é a decisão ter um lugar só.                                                                         |
| Dar `trip.manage` à conta de serviço                          | Um token cross-tenant que separa, carrega e cancela. ADR-0047 §4 existe exatamente contra isto.                                                                                                   |
| Ler a miniatura em vez do original                            | Miniatura de canhoto não tem resolução para código de barras — leria menos e aprovaria menos.                                                                                                     |
| `sharp`                                                       | Prebuild nativo por plataforma no caminho do `--frozen-lockfile`. Ganho de ~50 ms por foto num orçamento de 300 s não paga esse risco. Fica anotado se a rotina algum dia precisar redimensionar. |
| OCR no servidor                                               | Pela RF26 não aprova nada. Custo de CPU para chegar ao mesmo `pending`.                                                                                                                           |
