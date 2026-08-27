# 065 — O caminhão sai antes do documento · evidência

> ⚠️ **Parcial.** O caminho do barracão até o manifesto automático está inteiro e verificado. Faltam
> três coisas, e a primeira é a que o motorista sente: **o DAMDFE não chega até ele**. O que falta
> está no fim, e é a primeira coisa a ler.

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
2. **Nenhuma notificação (T017, requisito 11).** "Ficou pronta", "emitido" e sobretudo "não consegui
   emitir, e o motivo" não saem. O automático que **recusa** hoje só deixa rastro em log: quem opera
   descobre abrindo a viagem.
3. **Sem E2E da carga mista (T018).** Cada pedaço tem contrato e integração; a costura do barracão
   ao manifesto autorizado não foi exercitada de ponta a ponta.
4. **O evento `cte.authorized.v1` não existe.** A 059 previa evento e consumer; o que entrou é uma
   **chamada direta** do efeito de emissão para a API, decidida na ADR-0047. É mais simples e está
   testada, mas não tem a retentativa que uma fila daria — e por desenho não pode ter, porque
   reentregar a mensagem de emissão reemitiria o CT-e.
5. **A membership sintética do serviço é provisionada à mão** em instalação real. Localmente ela
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

## Auditoria de segurança (§15 do `code-standart.md`)

- O token do serviço é **cross-tenant** — é o preço escrito na ADR-0047, mitigado por escopo de uma
  rota, membership por empresa e segredo rotacionável.
- Nenhum segredo em log: o erro do token carrega status, nunca corpo.
- Nenhuma chave de acesso nem CNPJ de participante em log no caminho novo.
- O cabeçalho de empresa fora de forma é `403`, não `500` — texto que não é UUID nunca chega ao
  `where` do Postgres.
