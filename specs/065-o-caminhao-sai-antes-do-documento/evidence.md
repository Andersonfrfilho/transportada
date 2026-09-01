# 065 — O caminhão sai antes do documento · evidência

> As dezoito tasks estão fechadas, e o caminho do barracão até o manifesto na mão do motorista está
> verificado ponta a ponta contra Postgres. **Quatro fechamentos têm ressalva** — o DAMDFE é botão e
> não troca automática, das três notificações só a falha saiu, o gatilho é chamada direta em vez de
> evento, e a membership do serviço é provisionada à mão. Estão no fim, e são a primeira coisa a ler.

## Os dois defeitos que esta spec conserta, e como eles se somavam

A operação real solta o caminhão **antes** de qualquer emissão. Contra isso, o código entregue pela
059 tinha dois buracos que sozinhos pareciam detalhe e juntos travavam a viagem de todo dia:

1. **O portão exigia `dispatched` exato.** A viagem que autoriza o lote já saiu — está `in_transit`
   ou `completed`. O caso mais comum desta transportadora era justamente o recusado.
2. **A prontidão só sabia de CT-e.** Entrega dentro de Ribeirão vira NFS-e e **nunca** terá CT-e:
   ela ficava `no_cte` para sempre. Como a carga mista é a carga normal, uma nota urbana travava a
   viagem inteira — para sempre, sem ninguém entender por quê.

Os dois foram fechados com contrato próprio, e a classificação (`resolveFiscalDocumentKind`) nasceu
com o município de **origem** lido e comparável: trocar a regra pela do par origem→destino, que é a
fiscalmente completa, é uma condição, não uma refatoração.

## O que rodou

| Comando                                                | Resultado                    |
| ------------------------------------------------------ | ---------------------------- |
| `make migration-test`                                  | **86** testes, 0 falhas      |
| `bun run --cwd apps/api-transportada test`             | **3342** contratos, 0 falhas |
| `bun run --cwd apps/api-transportada test:integration` | **152** contra Postgres      |
| `bun run --cwd apps/worker-transportada test`          | **736** contratos, 0 falhas  |
| `make worker-integration`                              | **57** testes, 0 falhas      |
| `bun run --cwd apps/frontend-transportada test`        | **2058** contratos, 0 falhas |
| `typecheck` + `lint` nas quatro apps                   | limpos                       |

## O que cada verificação provou

| Decisão                                | Como ela está travada                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| O portão aceita a viagem que já saiu   | contrato por estado: `dispatched`, `in_transit` e `completed` passam; `draft` e `separating` continuam recusados     |
| A nota urbana não trava a viagem       | prontidão com carga mista: as de CT-e contam, a de NFS-e vira pendência própria e a viagem fica `ready`              |
| Viagem só urbana não pede manifesto    | `not_applicable` — o botão não aparece, em vez de "incompleta" para sempre                                           |
| Sem município não se chuta o documento | `city_unknown` **bloqueia**: a nota indecisa pode ser CT-e, e manifestar sem ela seria declarar o que não se sabe    |
| A empresa do serviço não vem de graça  | o cabeçalho só vale para service account, e ainda passa pela membership real; para token de gente ele é **ignorado** |
| Escopo do crachá é uma rota            | `mdfe.auto-issue` não é dada a nenhum papel humano, e o contrato do seed local prova isso                            |
| Não se convida um robô                 | `automation` fica fora do CHECK de convite, e a rejeição do contrato de schema foi o que revelou a falta             |
| O gatilho não emite CT-e duas vezes    | a falha do gatilho **não** volta para a fila: reentregar a mensagem reemitiria o documento fiscal já pago            |
| O segredo não vaza pelo erro           | a recusa do provedor de identidade sai como código e status, sem corpo — contrato que procura o segredo na mensagem  |

## Uma coisa que a implementação decidiu diferente da spec

O **requisito 6c** pede "romaneio em PDF". O que entrou é **impressão do navegador** com folha de
estilo própria: o título e o "NÃO É DOCUMENTO FISCAL" acima de tudo, o resto da tela escondido, e a
placa só no papel. Gerar PDF no cliente exigiria embarcar um renderizador para um documento que
**não é fiscal** e cuja única finalidade é sair na impressora do barracão. Quem precisar de arquivo
usa "salvar como PDF" do próprio diálogo de impressão. Se o requisito for arquivo anexável por
e-mail, isso é trabalho novo, e é honesto chamá-lo assim.

## O que ficou de fora

1. **O DAMDFE não substitui o romaneio sozinho.** Ele é **botão**, por decisão de quem opera: com
   manifesto autorizado a viagem mostra um cartão com a chave e o código de barras, e os dois
   formatos saem sob demanda — DAMDFE em PDF e XML. O romaneio continua na tela abaixo dele, porque
   a carga urbana nunca terá manifesto e para ela o romaneio é o que existe.
2. **Das três notificações do requisito 11, só a falha saiu.** "Não consegui emitir, e o motivo"
   avisa; **"ficou pronta" e "emitido" não existem** — e é uma escolha, não um esquecimento: as duas
   são boas notícias sobre um processo que o operador não precisa acompanhar, e o aviso que ele
   precisa ler é o que exige ação dele. Se virar necessidade, o encanamento já está posto: catálogo,
   destinatário e chave de deduplicação são os mesmos.
3. **O evento `cte.authorized.v1` não existe.** A 059 previa evento e consumer; o que entrou é uma
   **chamada direta** do efeito de emissão para a API, decidida na ADR-0047. É mais simples e está
   testada, mas não tem a retentativa que uma fila daria — e por desenho não pode ter, porque
   reentregar a mensagem de emissão reemitiria o CT-e.
4. **A membership sintética do serviço é provisionada à mão** em instalação real. Localmente ela
   nasce no seed; numa transportadora, alguém precisa criá-la por empresa — e é exatamente essa
   lista que limita o estrago de um segredo vazado (ADR-0047 §3).

## O DAMDFE, e o que ele reaproveitou

O repositório tinha renderizador de **DACTE** e nenhum de DAMDFE. O que os dois têm em comum é o
**papel** — cabeçalho com emitente, sigla, código de barras da chave e protocolo, e daí para baixo
campos numa grade de 12 —, e é isso que virou `shared/fiscal-sheet`. O DACTE passou a montar só o
conteúdo dele, e os contratos que já existiam provam que o papel não mudou.

Três decisões que ficam escritas:

- **O DAMDFE nasce do XML autorizado**, nunca do payload que pedimos à SEFAZ. Papel montado do
  pedido imprimiria um documento que a SEFAZ não conhece — e é justamente o papel que a barreira
  confere.
- **Ele não leva QR Code.** O layout do MDF-e não publica um, ao contrário do CT-e; desenhar um
  inventado daria ao fiscal um código que não resolve em lugar nenhum.
- **O PDF vem como bytes; o XML, como URL assinada.** Numa barreira, uma URL de cinco minutos que
  expirou no bolso não abre nada — já o XML existe para ser repassado depois, e aí a URL serve.

| Decisão                                           | Como ela está travada                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| O motorista alcança **só** a viagem dele          | integração contra Postgres: o motorista de outra viagem recebe `missing`, não "não é seu"              |
| Manifesto de outra empresa é ausência             | mesma integração, com a empresa trocada                                                                |
| "Não voltou da SEFAZ" é diferente de "não existe" | manifesto em `issuing` responde `not-authorized`; o CHECK do banco recusou a fixture que tentou fingir |
| Uma cidade de descarga não some do papel          | contrato do parser: sem `isArray`, a única cidade viraria objeto e o papel sairia sem ela              |
| O papel diz quando é homologação                  | contrato lê o texto desenhado no PDF, não o layout                                                     |
| O nome do arquivo carrega a chave                 | contrato do cliente: `damdfe.pdf` genérico some entre downloads no celular                             |

## O aviso de que o MDF-e não saiu

Até esta rodada a recusa do automático existia **só em log**: a viagem circulava sem manifesto até
alguém abrir a tela por outro motivo — a diferença entre um atraso e uma multa em barreira.

| Decisão                                 | Como ela está travada                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Avisa **só** a recusa                   | contrato percorre os quatro desfechos que não são falha e exige silêncio em todos                 |
| O imprevisto não vira aviso             | erro que não é `ApiError < 500` sobe para a reentrega, e o contrato prova que nada foi notificado |
| Quem recebe é **quem despachou**        | integração contra Postgres: o destinatário sai de `trip_dispatch_snapshots`, com a placa junto    |
| Sem despacho, ninguém é avisado         | mesma integração — destinatário inventado é aviso que chega a quem não pode agir                  |
| Trinta CT-e não viram trinta avisos     | a chave de deduplicação leva viagem **e** motivo, e a integração confere a chave por extenso      |
| O motivo desconhecido chega como código | contrato próprio: "erro ao emitir" não é pesquisável, e um código é                               |

O texto não carrega nota, tomador nem chave: diz o veículo, o motivo e onde olhar. O template nasce
do catálogo e entra pelo passo de pré-deploy, que é idempotente — não houve migration.

## A costura inteira, contra Postgres

`test/integration/mixed-cargo-end-to-end.integration.ts`: três notas — duas para fora e uma dentro
do município da transportadora — atravessando criar → vincular → planejar → separar → carregar →
despachar → lote urgente → CT-e autorizado → prontidão → manifesto automático → o motorista com o
documento na mão, pelos mesmos use cases e repositórios que a API expõe.

O que ele prova e nenhum contrato provava: **a nota urbana não entra no lote urgente, não conta como
pendência de manifesto e não trava a viagem** — o defeito que esta spec existe para consertar,
verificado de ponta a ponta.

E ele já pagou o próprio preço: na primeira execução o manifesto recusou com
`MDFE_MANIFEST_DOCUMENTS_BLOCKED`, porque a nota do fixture não tinha participante `emitter` nem
volume — e é do **emitente** que sai o município de carregamento do MDF-e, e dos **volumes** que sai
o peso. Papéis diferentes respondem por coisas diferentes na mesma nota, e nenhum contrato com dublê
mostrava isso.

Duas fronteiras ficam de fora, declaradas no cabeçalho do arquivo: a **SEFAZ** (a autorização de CT-e
e de MDF-e é escrita como o worker a escreve — assinar e transmitir exige certificado e rede) e a
**criação do lote**, injetada para não arrastar cálculo de frete, que tem integração própria.

O teste mora em `test/integration/`, não em `test/e2e/`: a pasta, o `env.test.e2e` e o alvo de
Makefile que a task nomeia **não existem** neste repositório — o padrão real de "prova viva contra
Postgres" é `withDisposableDatabase`, e é nele que este entrou, rodando no mesmo `test:integration`.

## Auditoria de segurança (§15 do `code-standart.md`)

- O token do serviço é **cross-tenant** — é o preço escrito na ADR-0047, mitigado por escopo de uma
  rota, membership por empresa e segredo rotacionável.
- Nenhum segredo em log: o erro do token carrega status, nunca corpo.
- Nenhuma chave de acesso nem CNPJ de participante em log no caminho novo.
- O cabeçalho de empresa fora de forma é `403`, não `500` — texto que não é UUID nunca chega ao
  `where` do Postgres.
