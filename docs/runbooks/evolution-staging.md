# Runbook — Evolution API em staging (spec 281)

O Evolution é o gateway de WhatsApp gratuito (não oficial, risco de banimento: spec 281 R1). Este runbook cobre só o
**staging**. Produção tem runbook próprio, e nada aqui vale para ela sem aprovação do dono.

> Estado (28/10/2026): o serviço `evolution-api` (com `evolution-postgres` e `evolution-redis`) está declarado em
> `.railway/railway.ts` só para staging. O "Criar e conectar" (PR #404) só foi testado com resposta simulada: o primeiro
> teste real, com o número do dono, ainda não foi feito. Produção não tem Evolution.

## O que existe

- **Serviço Evolution no Railway, no ambiente de staging.** Postgres e Redis próprios, nunca compartilhados com a API.
- **Chave global** da instalação do Evolution (`AUTHENTICATION_API_KEY`): mora no serviço Evolution. A API de **staging**
  a recebe por referência (`EVOLUTION_GLOBAL_API_KEY=${{evolution-api.AUTHENTICATION_API_KEY}}`, com
  `EVOLUTION_BASE_URL=http://evolution-api.railway.internal:8080`) só para criar a instância da empresa; nunca vai ao
  banco, ao navegador nem a log. Sem as duas variáveis (caso de produção) a tela pede endereço e chave à mão.
- **Chave de cada instância** (um número por empresa): guardada na API, cifrada por empresa (como `contractor_mail_settings`).
  Não existe em variável de ambiente.
- **Webhook por empresa**: `POST /public/whatsapp-evolution/:webhookId`. O segredo fica no cabeçalho
  `x-transportada-webhook-token`, gerado pela API e selado em `whatsapp_evolution_settings.webhook_secret_envelope`.

## Rotas da API para o dono (staging)

Todas em `/company-settings/whatsapp-evolution`, com `settings.manage`:

| Ação                                                                       | Rota                  |
| -------------------------------------------------------------------------- | --------------------- |
| Ler e gravar a configuração (URL, chave, provedor padrão, teto, intervalo) | `GET` e `PUT` na raiz |
| Criar a instância pelo Evolution do ambiente ("Criar e conectar")          | `POST …/provision`    |
| Estado da conexão (`open`, `connecting`, `close`)                          | `GET …/connection`    |
| QR code para ligar o número                                                | `POST …/qr`           |
| Apontar o webhook de novo (troca o segredo)                                | `POST …/webhook`      |

## Passos de rotina

1. **Ver se o serviço responde.** Abrir a URL do serviço Evolution de staging pelo painel do Railway (ambiente de staging).
   Se não responder, ver os logs (passo 2) antes de mexer em qualquer coisa.
2. **Ler logs do serviço.** Pelo painel do Railway, no serviço Evolution, ambiente de staging (ou pela ferramenta Railway
   do Claude). Nos logs não deve aparecer número, texto ou chave;
   se aparecer, é bug: avisar antes de continuar.
3. **Ver o estado da conexão.** `GET /company-settings/whatsapp-evolution/connection` com o token de uma conta de dono de
   staging. Se estiver `close`, pedir o QR de novo (`POST …/qr`) e ler com o WhatsApp do número de teste.
4. **Reiniciar o serviço Evolution.** Só se o estado travar em `connecting` por mais de alguns minutos. Pelo painel do
   Railway (Restart do serviço, ambiente staging). Depois repetir o passo 3.
5. **Apontar o webhook de novo** (depois de trocar a URL do serviço ou a chave): `POST …/webhook`. A resposta nunca
   traz o segredo.

## Queda e fallback

- Instância caída: o envio por WhatsApp falha com `whatsapp_disconnected` e a tela oferece o e-mail. Nada cai para a Meta
  sozinho. O e-mail não depende do Evolution: a queda não o atrasa.
- Número sem WhatsApp: `whatsapp_number_not_found`. Usar o e-mail.
- Número banido ou instância bloqueada (estado `blocked`): desligar o envio por WhatsApp na configuração da empresa e avisar
  o dono.

## Mensagens do grupo do motorista (spec 292 T3)

O webhook passou a ler grupo. Só passa mensagem de grupo que está na ficha de um motorista (T1), que marca o bot ou
que vem do dono de um pedido aberto (o pedido é da T4; até ela, nenhum pedido fica aberto). Grupo fora da ficha não gera
nenhuma chamada ao Evolution.

- Log da entrega: `whatsapp_evolution.webhook.received` com `group` (aceitas) e `groupIgnored` (contagem por motivo:
  `unknown_group`, `not_addressed`, `no_text`, `unknown_sender`, `own_number`, `from_me`, `identity_unavailable`).
- Log da aceita (até a T4): `whatsapp_evolution.group.admitted` com `via` (`mention` ou `owner_reply`). Sem número,
  texto nem id de grupo em log.
- Marcação por `@lid`: a API lê `GET /group/participants/{instância}?groupJid=…` para traduzir `@lid` em número
  (cache de 5 min por grupo, releitura no máximo a cada 30 s quando aparece um `@lid` novo) e
  `GET /instance/fetchInstances` para o número do bot (cache de 10 min).
- `identity_unavailable` em sequência: o Evolution não respondeu a uma dessas duas leituras, ou não informou o número do
  chip. Conferir o estado da conexão; a mensagem é descartada (porta fechada), não aceita sem saber quem escreveu.
- `unknown_sender`: quem escreveu só veio como `@lid` e a lista de participantes não trouxe o número dele.

## O motorista no chat direto com o número do bot (spec 308 T2 a T5)

O 1:1 de quem é **motorista ativo** da empresa (telefone da ficha, com ou sem o nono dígito, e de uma ficha só) entra no
mesmo fluxo do grupo, como um "grupo de um só": o pedido fica em `whatsapp_group_requests` com
`group_jid = <número>@s.whatsapp.net`. Não precisa marcar o bot nem dizer a frase de chamada no áudio, a API não
pergunta ao Evolution quem escreveu (nada de `GET /group/participants` para o 1:1) e a resposta sai sem `@número`.

- Fica no painel, como antes: quem não é motorista (cliente do boleto, contato da contratante), motorista inativo,
  número em duas fichas, e a resposta do motorista que **cita** uma mensagem de conversa da ocorrência.
- Teto por número: o mesmo balde do painel (`occurrence-conversation-evolution:<empresa>:<chave do número>`, 30 em 10
  min, por processo). Acima dele a mensagem não vai a lugar nenhum (`outcome: rate_limited`).
- Logs: `whatsapp_evolution.direct_message` por mensagem (`outcome`: `admitted`, `audio`, `audio_answer`, `media`,
  `rate_limited`, `no_text`; mais `hasText`, `isReply`, `providerMessageId`) e `direct` na contagem de
  `whatsapp_evolution.webhook.received`. Sem número nem texto.
- Ver os pedidos do 1:1 em staging: `select status, step, opened_at from whatsapp_group_requests where group_jid like
'%@s.whatsapp.net' order by opened_at desc limit 20;`
- Foto, localização e áudio no 1:1 (T3): seguem o caminho do grupo. A foto conta como marcada (canhoto); a
  localização responde o passo da localização do "saí"/"cheguei" do pedido aberto no 1:1 (registra com o ponto) ou,
  sem pedido, completa a entrega em preparo; sem nada esperando, o bot responde "Recebi a localização. Nenhuma
  pergunta minha está esperando por ela". O áudio vai à transcrição sem frase de chamada; com o pedido aberto, a
  resposta curta falada ("pular") vai direto ao passo, sem ele o bot pede o "Entendi assim" e aceita "1"/"2" digitado
  ou "sim"/"não" falado. No log: `outcome` `media`, `audio` ou `audio_answer` em `whatsapp_evolution.direct_message`.
- Conferir em staging (com o número do Anderson, que é motorista na ficha de teste): mandar "saí" no 1:1, depois a
  localização atual; o pedido fecha (`status` diferente de `open` na consulta acima) e o bot responde "Saída
  registrada". Mandar um áudio "cheguei", responder "sim" por áudio e ver o pedido da localização.
- Menu de XML (T4): quem passa em `findImportSender` (papel que importa nota, número verificado) vê "Enviar XML das notas"
  no menu do 1:1; quem só importa e **não** é motorista recebe apenas a orientação, sem abrir pedido
  (`whatsapp_group_requests.driver_id` é `NOT NULL`). Motorista sem papel de XML não vê a opção.
- Lembrete de parada (spec 299, T5): o pedido aberto e o áudio esperando confirmação no 1:1
  (`<número>@s.whatsapp.net`, com e sem o nono dígito) também seguram o lembrete (`driver-open-question.adapter.ts`).
  **Ainda não coberto:** o lembrete não escolhe o 1:1 do Evolution como canal (o "direto" do `channel-resolver` é a sessão
  da Meta e o envio proativo pelo 1:1 do Evolution não existe); ele continua indo ao grupo.
- Sessões duplicadas (decisão, T5): o mesmo motorista pode ter um pedido aberto no grupo e outro no 1:1 (o índice é por
  `(empresa, group_jid)`). Aceito de propósito: cada conversa responde onde perguntou, e o pedido vence em 10 min.
  Coberto por contrato de integração (`whatsapp-group-request-repository.integration.ts`). Se confundir o motorista no teste,
  a saída é fechar o pedido da outra conversa ao abrir (task nova).
- 1:1 só com `@lid` (T5): continua ignorado (sem número não há como reconhecer), mas agora é **medido**: a contagem
  `lidOnly` em `whatsapp_evolution.webhook.received` (sem número nem texto). Se for maior que zero com motorista real
  escrevendo, abrir task para resolver o `@lid` pelo cadastro de contatos do Evolution.
- Conferência pronta (somente leitura, números mascarados): `bash /home/miyazaki/Documents/personal/transportada/tmp/ops/staging-chat-direto-confere.sh`
  — últimos pedidos do 1:1, motoristas com pedido no grupo e no 1:1 ao mesmo tempo, fichas com telefone repetido e os
  desfechos/`lidOnly` dos logs da última hora.

## Roteiro de teste do bot do motorista em staging (specs 292 e 293)

O passo a passo completo está no projeto Claude (`grupo-whatsapp/roteiro-teste-staging.md`). O que cabe guardar aqui:

- **Conferir o ambiente antes de testar:** `tmp/ops/staging-confere-roteiro-whatsapp.sh` (somente leitura; grava em
  `tmp/ops/saidas/`). Mostra estado do Evolution e número do bot, canal da Meta, motoristas com grupo na ficha (vínculo
  ativo e telefone verificado) e as viagens e notas abertas deles. Não imprime chave nem segredo.
- **Grupo (Evolution):** marcar o bot escolhendo o contato na lista. `@bot saí`, `@bot cheguei [nota]`,
  `@bot prorrogação do boleto 17234` (ou outro tipo ativo) e `@bot` sozinho para o menu numerado. Saí e cheguei
  registram sem confirmação e exigem viagem despachada; ocorrência pergunta observação e pede `1` (Sim) para registrar.
- **Individual pelo Evolution (spec 308, desde a T2):** o motorista ativo que escreve ao número do bot recebe o mesmo
  fluxo do grupo, sem marcar o bot (ver "O motorista no chat direto" acima e a seção 6 do roteiro). Quem não é
  motorista segue para a conversa da ocorrência. **Individual pela Meta** (spec 144, menu "Minha viagem" e comando
  direto da T14) roda só no módulo da Meta e precisa de canal da Meta ativo. Com a Meta, o grafo precisa estar republicado
  (`scripts-ops/producao-publicar-falas-do-bot.sh`, ambiente staging por padrão) para o menu de 5 opções e o comando
  direto existirem.
- **Entreguei com provas** (T15) só entra neste roteiro depois do deploy do PR #508 em staging.

## O que nunca fazer

- Não copiar o valor da chave global para variável da API: só a referência `${{evolution-api.AUTHENTICATION_API_KEY}}`, e só em staging.
- Não rodar `railway config apply` sem `railway config plan` sem nenhum `Delete` (ver incidente de 27/10 em `producao.md`).
- Não compartilhar o Postgres ou o Redis com outro ambiente.
- Não ligar o Evolution em produção sem aprovação do dono.
- Não colar número, texto ou chave em chat, log ou PR.

## Resposta do cliente ao boleto no WhatsApp (08/11/2026)

Caso: o cliente (ou o teste do Anderson) responde "ola" ao boleto atualizado e "o bot não responde". **Não é falha:** a
resposta entra na **conversa do cliente** no painel (`conversation: 1` no log `whatsapp_evolution.webhook.received`,
pela `findLatestClientConversation`); quem responde é uma pessoa, pelo chat. Não existe resposta automática.

Como conferir (só leitura, pela ferramenta Railway do Claude, sem script):

1. Logs do serviço `evolution-api` (staging): `CONNECTED TO WHATSAPP` e o corpo da mensagem recebida (`status: 'DELIVERY_ACK'`).
2. Logs do serviço `api` (staging) com filtro `whatsapp_evolution`: `conversation`/`unassigned` > 0 mostra que a resposta chegou.
   `statuses: 0` em todas as entregas: o selo de entrega do que sai não está avançando (ver pendência na thread).

A linha "✉️" do boleto no WhatsApp saía vazia quando o perfil fiscal não tem e-mail; agora a linha só com emoji some.
