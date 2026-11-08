# Feature 308 — O bot atende no chat direto

> Pedido do dono (Anderson), 2026-11-08: "tudo que o bot faz em grupo de motorista ele deve fazer individualmente".
> Defeito que originou: o motorista (e o número do próprio Anderson, que tem envio de XML liberado) escreve ao número do
> Evolution no 1:1 e a mensagem só cai na conversa do painel, sem menu.
> Status: rascunho aguardando ok. Lida contra `origin/staging` `06f6b8e` (PR #589).

## Problema e resultado

`whatsapp-evolution-webhook.use-case.ts` manda toda mensagem 1:1 (`chat === 'user'`) para
`inbound.receiveMessage` (spec 281: conversa do painel ou "não atribuídas"). O fluxo de comando da 144 só existe na
Meta, e o fluxo do grupo (292/293/294/299/300) só roda para `chat === 'group'`. Não é uma flag: são dois trilhos.

Resultado: quem o bot reconhece, escrevendo no 1:1, recebe o mesmo que receberia no grupo (menu, "saí/cheguei",
próxima parada, ocorrência/prorrogação, boleto, foto/localização do canhoto, áudio com confirmação) e, se tiver
envio de XML liberado, a orientação para mandar os XMLs. Quem o bot não reconhece (cliente que recebeu o boleto,
contato da contratante) continua caindo no painel, como hoje.

## Decisão de desenho

**D1 — O 1:1 é um "grupo de um só".** Em vez de portar o dispatcher da Meta (sessão em `meta_whatsapp.sessions`,
mensagem no formato da Meta), o chat direto entra no **mesmo** `groupInbound`/sessões do pedido, com
`groupJid = <número>@s.whatsapp.net`, `sender = número`, `driverId` achado pelo telefone, e **sem exigir marcação**
do bot (no 1:1 toda mensagem do motorista é para o bot). Assim nenhuma regra do grupo é reescrita: tudo o que o grupo
faz, o 1:1 faz, e o que mudar no grupo muda junto. Respostas saem pelo mesmo `groupReplies` (uma mensagem por turno,
lista/botão como texto numerado, spec 292 T4b/300).
*Spike (T1) confirma* que sessões, envio e leitura de foto/áudio aceitam JID individual; se alguma tabela exigir
grupo cadastrado, o ajuste é a chave (não uma cópia do fluxo).

**D2 — Quem é reconhecido (nesta ordem, primeiro que casar).**
1. Documento `.xml/.zip/.rar`: segue a 301/306/307 (inalterado, vem antes de tudo).
2. Mensagem que **cita** uma mensagem da conversa da ocorrência e casa na atribuição da 281 (`via: reply`): continua
   na conversa do painel (o motorista responde ao chat da ocorrência).
3. Telefone de **motorista cadastrado** na empresa: fluxo do motorista (D1).
4. Telefone **verificado com membership** (144 D1) e papel em `NFE_XML_IMPORT_ROLES`: menu com a opção "enviar XML"
   (regra de `findImportSender`, reutilizada, nada recriado); a opção só orienta ("envie os XMLs ou um zip/rar das
   notas"), a importação já responde sozinha (301–307).
5. Qualquer outro número (cliente do boleto, contato da contratante): `receiveMessage` como hoje.

**D3 — Segurança.** Reconhecimento por telefone canônico (`toWhatsAppPhoneKey`/candidatos, como a 144 e a 292), nunca
por texto. Número reconhecido que perde o vínculo volta ao item 5. Limite por número no mesmo balde do Evolution.
Nada de número, texto ou nome em log.

**D4 — Staging primeiro.** Entrega por PR em staging; main só se Anderson pedir. Sem nova variável de ambiente.

## Requisitos

- **RF1** Motorista cadastrado escreve "oi"/"menu"/qualquer coisa no 1:1 e recebe o menu do motorista, igual ao do grupo.
- **RF2** Os comandos do grupo (saí, cheguei, próxima parada, entreguei/não entreguei, prorrogação e demais ocorrências,
  boleto, "pedir boleto de novo <NF>") funcionam iguais no 1:1, pelos mesmos casos de uso.
- **RF3** Foto do canhoto e localização no 1:1 seguem o caminho do grupo (293 T15); áudio, a transcrição com confirmação (292 T9).
- **RF4** A importação de XML (.xml/.zip/.rar) no 1:1 vale para todo número autorizado (`findImportSender`), com ou sem ser motorista, e o aceite a prova ponta a ponta no 1:1. Quem tem envio de XML liberado vê no menu "Enviar XML das notas" com a orientação; quem não tem, não vê.
- **RF5** Resposta do motorista a uma mensagem da conversa da ocorrência continua indo ao painel (D2.2).
- **RF6** Cliente/contato não reconhecido não recebe menu e continua no painel (D2.5), inclusive quem respondeu ao boleto.
- **RF7** A mensagem do 1:1 também alimenta a conversa da ocorrência do painel quando abrir ocorrência (292 T7).

## Fora do escopo

Mudar o fluxo do grupo; o dispatcher da Meta; novos comandos; quebrar o fluxo de importação de XML.

## Critérios de aceite

Contrato com dublês: motorista no 1:1 recebe menu; mesmo comando no grupo e no 1:1 dá o mesmo desfecho; citação à
conversa da ocorrência vai ao painel; número desconhecido vai ao painel; importador vê a opção de XML e motorista sem
papel não. Integração do webhook (`whatsapp-evolution-webhook.integration.ts`). Teste em staging com o número do
Anderson (roteiro em `roteiro-teste-staging.md`).

## Dúvidas

Nenhuma bloqueante. Premissa a confirmar: "envio de XML liberado" = a regra de `findImportSender` (como alinhado com a
thread do XML).
