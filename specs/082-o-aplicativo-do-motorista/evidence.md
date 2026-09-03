# 082 — O aplicativo do motorista · evidência

> Parcial, de propósito. Este arquivo registra o que rodou, o que **não** rodou e por quê — é a parte
> que importa para quem chegar depois, porque metade do que falta não é esforço, é decisão e
> aparelho.

## O que rodou

| Comando                                               | Resultado                                  |
| ----------------------------------------------------- | ------------------------------------------ |
| `bun run --cwd apps/api-transportada test`            | **4149** contratos, 0 falhas               |
| `bun run --cwd apps/worker-transportada test`         | **887** contratos, 0 falhas                |
| `bun run --cwd apps/frontend-transportada test`       | **2480** contratos, 0 falhas               |
| `make migration-test`                                 | **91** testes — aplica, exercita e reverte |
| `bun run --cwd transportada-mobile check`             | **133** contratos, 0 falhas                |
| `lint` + `typecheck` + `format:check` nas quatro apps | limpos                                     |

## O que cada verificação provou

| Decisão                                               | Como ela está travada                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **T0.1 — o app descobre onde autenticar**             | contrato HTTP na rota anônima: o bloco sai quando a instalação declara o cliente, e é **omitido** (não `null`) quando não |
| `url` e `realm` não divergem do issuer                | política pura que parte o `KEYCLOAK_ISSUER`, com localhost, proxy sob prefixo e barra final                               |
| **T0.2 — a viagem tem o estado da estrada**           | contrato percorre os **nove** estados; grid exaustivo de ação × estado subiu de 160 para 180 arestas                      |
| O toque esquecido não trava trabalho                  | fechar a primeira nota adianta para `on_delivery_route`; repetir converge em `unchanged`; `tripStatusRank` impede recuo   |
| **A viagem não some ao iniciar o trajeto**            | contrato **por texto de fonte**: nenhum repositório redigita o par `dispatched`/`in_transit` — a divergência compila      |
| **T0.3 — a distância é gravada**                      | contrato afirma a coluna **e** o `insert`: o campo chegou a ser aceito e descartado                                       |
| **T0.4 — o rastro expira sem depender do fechamento** | teto de 36h na ingestão + expurgo por idade, com o número comparado entre API e worker por contrato                       |
| **PKCE está certo**                                   | **vetor do RFC 7636, apêndice B** — é o vetor que prova o S256, não a aritmética de quem escreveu                         |
| A URL de autorização não vaza o verificador           | contrato afirma a ausência dele e de `client_secret` na URL                                                               |
| `state` alheio na volta é recusa                      | contrato: retorno costurado de fora não vira token                                                                        |
| **A tela não reinventa a máquina de estados**         | contrato por texto de fonte: nenhuma comparação de `trip.status` solta nas telas — é a lição do T016 do painel            |
| **A tela não mente sobre sincronização**              | `sending` conta como pendente; a tela usa `countPending` e o contrato proíbe filtro próprio                               |
| Anexo grande não descarta a entrega                   | contrato: acima do teto some o **anexo**, e a confirmação entra                                                           |
| O corpo da API é validado na fronteira                | campo desconhecido é ignorado, campo obrigatório ausente recusa a resposta inteira                                        |

## Dois defeitos que a verificação pegou antes de existirem

1. **A lista de estados "na rua" estava rederivada em cinco repositórios**, com recortes diferentes.
   Com `on_delivery_route` na máquina e as cópias intactas, a viagem sumiria de `/me/trips/current`
   no instante do toque em iniciar trajeto, e o rastro do portal do contratante pararia junto. O
   comentário do SQL cru até pedia revisão manual a cada estado novo — era essa revisão que ia falhar.
2. **A distância da ocorrência era aceita e descartada**: a rota parseava, o tipo compilava, e o
   `insert` não a mencionava. Campo que a API diz aceitar e não grava é pior que campo ausente,
   porque ninguém procura o dado.

E um terceiro, menor, que vale o registro: o contrato da tela reprovou o arquivo por causa da palavra
"webview" **no próprio comentário que explicava por que não há webview**. Regra que falha pelo texto
que a documenta não guarda nada — a varredura tira comentário antes.

## O que ficou de fora, e é para a próxima pessoa saber

### 1. `wrong_address` não entrou no catálogo — e é decisão, não esquecimento

A migration `20260903120000_stop_occurrence_kind_overlap`, do mesmo dia, **removeu**
`address_not_found` da ocorrência de parada com o motivo escrito: _"é da nota, e já é motivo de
devolução"_. Acrescentar `wrong_address` ali recriaria as duas portas para o mesmo fato que ela
consertou — o motorista poderia devolver a nota **e** abrir a ocorrência.

Três saídas, e nenhuma foi escolhida:

| Saída                                           | Custo                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| No catálogo da parada, como a ADR-0057 escreveu | recria as duas portas                                              |
| A correção nasce da devolução                   | uma porta só; não cobre quem entrega e só quer corrigir o cadastro |
| Tabela própria ligada ao `trip_document`        | cobre os dois casos; mais encanamento                              |

A ADR-0057 está commitada afirmando a primeira. **Quem escolher outra, emenda a ADR junto.**

### 2. Nada foi visto rodando em aparelho

Medido nesta máquina: `xcrun simctl list runtimes` devolve vazio — **nenhum runtime de iOS
instalado** — e não há SDK do Android. `bundle exec pod install` não rodou, e as duas dependências da
T1.3 (`async-storage`, `keychain`) têm código nativo.

O que isso deixa em aberto, por tela:

- se ela desenha, se o cartão cabe na mão, se o botão fica sob o teclado;
- **o esquema de retorno do PKCE** (`br.com.adatechnology.transportada://auth`) precisa ser declarado
  no `Info.plist` e no `AndroidManifest` — é o item que mais preocupa, porque é declaração nativa que
  ninguém descobre lendo código;
- a persistência da fila entre aberturas do app, e o arquivo em disco.

### 3. G004, G005 e G006 não têm miolo puro

A fila offline tinha, e está pronta e provada. O que resta — captura de câmera, recorte de
comprovante, assinatura com trava de orientação, posição em segundo plano, build assinado — é chamada
ao aparelho. Escrever isso sem nunca abrir uma câmera produz arquivo que passa em lint e falha na
primeira foto, e a rede por texto de fonte não alcança.

## Auditoria de segurança (§15 do `code-standart.md`)

- **Nenhum log de PII.** O expurgo do rastro conta quantos pings caíram, nunca de quem.
- **O token nunca sai do keychain**, e nunca vai para o armazenamento comum ao lado da URL.
- **O fluxo é de navegador do sistema**, nunca webview: a senha não passa por código nosso, e o
  contrato da tela afirma a ausência de campo de senha e de webview.
- **Cliente público sem segredo**: a URL de autorização e o corpo da troca não carregam
  `client_secret`, e o contrato afirma isso.
- **A janela do rastro é curta e cumprida**: 36h na ingestão e no expurgo, com o número comparado
  entre as duas apps por contrato.
