# Feature 281 — O WhatsApp gratuito responde pelo Evolution API

Pedido do dono (Anderson, 26/10/2026): "monte uma spec para adicionar o Evolution no SDK como quem responde, para termos uma
opção gratuita de envio de mensagens". Veio da conversa sobre o botão "Compartilhar" do app do motorista (PR #374): o
WhatsApp pessoal não deixa anexar arquivo por link, e a API oficial (Meta Cloud) exige conta empresarial aprovada.

Specs lidas antes (mesmo assunto): 062 (canal WhatsApp por empresa, Meta Cloud), 144 (comando pelo WhatsApp), 143 e 274
(a contratante responde/recebe por e-mail; ADR-0111), 248 e 279 (encaminhar boleto ao cliente por e-mail), 266
(compartilhar do app do motorista). Nada aqui recria o canal Meta: o Evolution entra **ao lado** dele.

## Problema e resultado

Hoje as mensagens do sistema saem por **e-mail** (Resend, por empresa) e, onde a empresa tem conta aprovada, pela **Meta
Cloud API** (`@adatechnology/meta-whatsapp-module`, spec 062). Quem não tem a conta Meta não tem WhatsApp nenhum, e é pelo
WhatsApp que o cliente do supermercado e o motorista de fato leem. O boleto prorrogado, por exemplo, só chega por e-mail.

Resultado: o **SDK de notificação** ganha o **Evolution API** (gateway WhatsApp de código aberto, hospedado por nós, sem
custo por mensagem) como um **provedor de envio e de resposta de WhatsApp**, escolhido por empresa, com o mesmo contrato
do provedor Meta. Com ele a empresa:

1. **Envia** texto e **arquivo** (o PDF do boleto) por WhatsApp a um número, pelo mesmo trilho do e-mail (279 D3: um envio
   por destino, idempotente, entrega registrada, ator auditado);
2. **Recebe** a resposta do número no mesmo fio da conversa (como a contratante responde por e-mail na 143/274), com os
   estados enviada / entregue / lida;
3. Escolhe, por empresa, **Meta oficial** ou **Evolution**, sem mudar nenhuma tela de quem envia;
4. Deixa um **roteador** (D8/D9) escolher o canal mais barato e seguro por mensagem: e-mail, janela aberta, Evolution ou modelo Meta.

## Fora do escopo

- Substituir ou remover o provedor Meta (062/144): o fluxo de comando por menu segue na Meta; o Evolution é só mensagem.
- Fluxo de comando por menu (144) sobre o Evolution: spec futura, se o dono quiser.
- Campanha, disparo em massa e lista de transmissão (ver R2).
- Detectar telefone no texto da conversa para abrir o WhatsApp (etapa pequena à parte, sem relação com o provedor).

## Decisões e riscos

- **D1 — Onde mora.** O provedor Evolution vive no **SDK de notificação** (`~/Documents/personal/adatechnology-packages`),
  atrás da **mesma porta** de provedor de WhatsApp que a Meta usa: `sendText`, `sendMedia`, `parseWebhook`, estados de
  entrega. O produto só escolhe o provedor pela configuração da empresa; nenhuma regra de Evolution no código do produto.
- **D2 — Hospedagem.** Uma instância do Evolution API por ambiente (staging e produção separados, nunca compartilhados),
  como serviço no Railway, com Postgres/Redis próprios. Chave global só no serviço; a API do produto guarda a chave da
  instância **cifrada por empresa**, como `contractor_mail_settings`.
- **D3 — Uma instância (número) por empresa.** O dono da empresa liga o número lendo o QR code na tela de configuração; o
  estado (`open`, `connecting`, `close`) aparece nela. Sem número conectado, o envio por WhatsApp fica desligado e o sistema
  cai no e-mail, nunca em silêncio.
- **D4 — Destino validado pela API.** Como na 279 D4: o número é normalizado (E.164, DDI 55), validado e **mascarado** em
  resposta e log. Nunca se dispara para número que a API não validou; só guarda no cadastro com `save = true`.
- **D5 — Reuso do trilho.** O envio é um novo canal do `forward-contractor-reply-by-email`-equivalente (248/279):
  idempotente por (retorno, anexo, número), entrega gravada com o ator, linha do tempo "Boleto enviado por WhatsApp". O
  texto vem do modelo do tipo (ADR-0108); layout não existe em WhatsApp, então o modelo ganha o canal `whatsapp` (texto puro).
- **D6 — Resposta entra no fio.** O webhook do Evolution (assinado por segredo por empresa, com anti-replay) vira mensagem
  da conversa da ocorrência pelo número que casa com a contratante/cliente; número sem correspondência vai para a fila de
  "não atribuídas" já existente, não é descartado.
- **D7 — O Evolution é o número que fala primeiro.** Pedido do dono (26/10/2026): o Evolution é o número para respostas e
  fluxos que o sistema precisa **iniciar sem a pessoa ter chamado** (aviso ao motorista, atendente chamando o motorista,
  lembrete, cobrança de documento). A Meta fica para o que ela faz melhor (janela de 24 h aberta, modelo aprovado, volume).
- **D8 — Roteador por custo e risco, no SDK.** Uma política escolhe o canal de cada mensagem, nesta ordem, e para na primeira
  que serve: (1) **e-mail** para cliente com e-mail e sem urgência (custo zero, sem risco); (2) **janela de 24 h aberta** (a
  pessoa escreveu há pouco): mensagem livre, sem custo de modelo; (3) **motorista e atendente** (interno, opt-in, já tem o
  número salvo): Evolution, risco baixo; (4) **cliente frio** (nunca escreveu): modelo aprovado da Meta, ou Evolution só
  dentro do teto e com intervalo (R2). A tabela de regras é dado da empresa, não código.
- **D9 — Teto e disjuntor.** Orçamento mensal por empresa (conta mensagens pagas e avisa a 80%); teto por número/dia;
  aquecimento do número (volume sobe aos poucos nas primeiras semanas); pausa entre envios com variação; sem envio fora do
  horário configurado; **disjuntor**: queda, bloqueio ou taxa de falha alta desliga o Evolution sozinho e manda para o
  e-mail, com aviso ao dono.
- **D10 — Abrir a janela.** O motorista entra pelo próprio app ("falar pelo WhatsApp", `wa.me` para o número da empresa) ou
  responde um "OK" ao primeiro aviso; isso abre a janela, prova o opt-in e reduz o risco de ban.
- **D11 — O tipo de ocorrência decide o canal.** Pedido do dono (27/10/2026): uma coluna no tipo (`client_channel`:
  `off`, `email`, `whatsapp`, `both`), no mesmo molde do `client_email_type` da 279; devolução nasce em `whatsapp`. A
  configuração do tipo continua mandando; o app lê o que o servidor resolveu e o servidor recobra.
- **D12 — Contatos do cliente, uma tabela só.** A `delivery_client_emails` da 279 D1 é generalizada para
  `delivery_client_contacts (id, company_id, tax_id, channel email|whatsapp, purpose, address, label, created_by,
created_via, source_occurrence_id, created_at)`: mesmo limite por cliente e tipo, mesma unicidade, `address` é e-mail ou
  número E.164. A 279 passa a apontar para esta tabela (ela ainda não foi a `main`, então a troca é aditiva).
- **D13 — O motorista completa o que falta, na ocorrência.** Com o canal do tipo ligado, o app mostra o número e o e-mail já
  guardados (mascarados, marcados). O que falta aparece como campo **opcional**. O que ele informar passa por **tela de
  confirmação** (número formatado) e só é guardado com `save = true`; o escritório pode editar ou remover. A API valida e
  normaliza (D4); guarda quem informou (`created_by`, `created_via` = motorista ou escritório) e de qual ocorrência.
- **D14 — Falha de WhatsApp cai no e-mail guardado**, com aviso; sem e-mail, o erro é tipado e a tela diz o que falta.
- **R1 — Não é oficial.** O Evolution (Baileys) fala o protocolo do WhatsApp Web, que a Meta **não autoriza**: o número pode
  ser banido, e uma mudança do WhatsApp pode quebrar o envio até o pacote atualizar. É uma opção gratuita, **não** o
  caminho garantido; o produto precisa dizer isso na tela de configuração e manter o e-mail como padrão e como reserva.
- **R2 — Limites anti-ban.** Só mensagem ligada a uma ocorrência, a quem já falou com a empresa ou a número que o motorista
  ou o escritório informou na hora; teto por número/dia e intervalo entre envios, configuráveis; nada de envio em massa.
- **R3 — LGPD.** Número e conteúdo são dado pessoal e, no caso do boleto, fiscal: o arquivo sai por link assinado de vida
  curta que o **Evolution baixa**, nunca por URL pública duradoura; nada de número ou texto em log.

## Futuro próximo (não faz parte desta entrega)

Ideias discutidas com o dono em 27/10/2026, registradas para não se perderem; nada abaixo entra nas tasks agora:

- **Sessão principal e extras.** O SDK trata o número como uma **sessão** (`sessionId`), com uma única **principal** por empresa
  (a que faz todo envio iniciado pelo sistema); sessões extras de setor ou atendente, se um dia precisar, com a conversa presa à
  sessão em que começou. Hoje só existe a principal.
- **Modos por empresa.** Só Evolution, só Meta ou híbrido (o roteador da D8 escolhe), com reserva para a Meta desligada por padrão,
  provedor fixado por tipo de ocorrência e teto mensal da Meta.
- **Atendentes num número só.** Uma conversa por número de cliente com o campo "atendida por", fila de não atribuídas e regras de
  direcionamento (assunto, carteira do cliente, rodízio, assumir da fila); transferir é trocar o campo. Atendente usa o painel, nunca
  o app do WhatsApp (limite de aparelhos vinculados). Passar o cliente à atendente por link `wa.me` é opcional; atendente chamando
  cliente pelo WhatsApp pessoal fica fora (risco de ban, sem auditoria, LGPD).

## Histórias priorizadas

### P1 — Enviar o boleto por WhatsApp

**Given** a empresa com número Evolution conectado e uma ocorrência com boleto aceito **When** o operador ou o motorista
escolhe "Enviar por WhatsApp" e informa (ou escolhe) o número **Then** o PDF e o texto do modelo saem desse número, a entrega
fica registrada e aparece na linha do tempo; repetir o mesmo toque não duplica.

### P1 — Conectar o número

**Given** o dono em Configurações **When** lê o QR code **Then** o estado vira "conectado"; se cair, a tela avisa e o envio
cai para o e-mail.

### P2 — A resposta volta ao fio

**Given** o cliente respondendo no WhatsApp **When** o webhook chega **Then** a mensagem aparece na conversa da ocorrência,
sem duplicar se o webhook repetir.

### P3 — Escolher o provedor

**Given** uma empresa com Meta e Evolution configurados **When** o dono escolhe o provedor padrão **Then** os envios novos
usam o escolhido; os antigos mantêm o provedor com que saíram.

## Requisitos funcionais

- RF1 Provedor `evolution` na porta de WhatsApp do SDK de notificação: `sendText`, `sendMedia` (PDF/imagem por URL assinada
  ou base64 de até 25 MB, o limite do chat), `parseWebhook`, mapeamento de estados (enviada, entregue, lida, falhou).
- RF2 Configuração por empresa: provedor padrão, URL e chave da instância (cifrada), estado da conexão, QR code, teto
  diário e intervalo mínimo.
- RF8 Coluna `client_channel` no tipo (D11), validação e aba Tipos; a API recusa o envio com `off` (409).
- RF9 Tabela de contatos do cliente (D12) com CRUD no painel e rota do motorista restrita à viagem e à ocorrência dele; limite e validação como na 279 D2/D4.
- RF10 Confirmação do contato novo e `save` no app do motorista (D13); idempotente por `idempotencyKey`.
- RF3 Envio de boleto por WhatsApp reaproveitando o trilho de 248/279 (D5), com `idempotencyKey` e fila offline no app do
  motorista como no "Enviar ao cliente".
- RF4 Webhook assinado e anti-replay em rota pública por empresa; mensagem recebida vira mensagem da conversa (D6).
- RF5 Fallback explícito: instância caída, número inválido ou teto atingido devolvem erro tipado e a tela oferece o e-mail.
- RF6 Auditoria: cada envio e cada mudança de configuração em `audit_logs`; número mascarado.
- RF7 Aviso de risco (R1) na tela de configuração, em português, antes de ligar.

## Requisitos não funcionais

- Nenhum segredo, número ou texto de mensagem em log, evento ou métrica.
- Sem dependência do Evolution no caminho do e-mail: instância fora do ar não atrasa nem derruba o envio por e-mail.
- Contrato de paridade (skill `contrato-de-paridade`): a lista de provedores e a de estados de entrega em uma constante só,
  com contrato que compara SDK e produto nos dois sentidos.
- Publicar em etapas: SDK → API → telas (ADR-0081 §9). Tudo em `staging` primeiro; produção só com aprovação do dono.

## Casos extremos e falhas

- Instância desconectada no meio do envio: tentativa fica `failed` com motivo; reenviar é idempotente.
- Número sem WhatsApp: o Evolution responde que não existe; o erro é tipado (`WHATSAPP_NUMBER_NOT_FOUND`) e sugere e-mail.
- Número banido ou instância bloqueada: estado `blocked`, envio desligado, aviso ao dono; nada cai para a Meta sozinho.
- Webhook repetido ou fora de ordem: deduplica por id da mensagem do provedor; estado só avança (enviada → entregue → lida).
- Arquivo acima do limite ou tipo não aceito: recusa antes de chamar o Evolution.
- Dois operadores enviando o mesmo boleto ao mesmo número: o segundo vê "já enviado", sem segunda mensagem.

## Critérios de aceite

- Contrato do provedor passa com um Evolution simulado (texto, arquivo, webhook, os quatro estados).
- Envio duplicado devolve o mesmo resultado, sem segunda chamada ao gateway.
- Sem número conectado a rota recusa com erro tipado e a tela oferece o e-mail.
- Log e evento de uma execução completa não contêm número, texto nem chave (teste).
- Em staging: boleto de teste enviado a um número do dono, resposta entrando no fio, queda da instância caindo no e-mail.

## Dúvidas

- [NEEDS CLARIFICATION: "SDK" é o pacote de notificação (`adatechnology-packages`) ou o `conversations-ui`? Esta spec assume o
  de notificação, que é onde mora o provedor de envio; o `conversations-ui` só mostra a conversa.]
- [NEEDS CLARIFICATION: o dono aceita o risco R1 (número pode ser banido) como opção gratuita, com o e-mail como padrão?]
- [NEEDS CLARIFICATION: um número por empresa ou um número único da plataforma? Pela ADR-0021 (instalação dedicada) a spec
  assume um por empresa.]
- [NEEDS CLARIFICATION: a resposta do WhatsApp entra na conversa da contratante, na do motorista ou nas duas?]
- [NEEDS CLARIFICATION: onde hospedar o Evolution (Railway ao lado da API, ou VPS à parte) e quem cuida do número de teste?]
