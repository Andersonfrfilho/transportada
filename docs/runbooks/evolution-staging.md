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

## O pedido no grupo do motorista (spec 292 T4/T5)

Marcar o bot no grupo abre um pedido (um por vez por grupo; o dono é quem marcou). O bot pergunta a nota, o tipo de
ocorrência, a observação e confirma; ao confirmar, registra pela mesma `registerDriverOccurrence` do WhatsApp do
motorista, no nome do motorista do grupo. Só aparecem os tipos **ativos** do momento da nota, já filtrados pela
contratante (a mesma lista do WhatsApp do motorista); tipo desligado não aparece nem casa pelo nome. O que vem
depois (e-mail à contratante, retorno do boleto) é configuração do tipo.

- Pedido direto: `@bot prorrogação do boleto 17234` acha a nota e o tipo; o resto é perguntado.
- Sem marcar, só o dono responde. Outra pessoa responde pelo dono marcando o bot; marcação que não responde a
  pergunta aberta recebe "Há um pedido em andamento".
- `cancelar` (do dono ou de quem marca) encerra; 3 respostas que não cabem encerram e avisam o suporte.
- Prazo sem resposta: `whatsapp_evolution_settings.group_request_timeout_seconds` (padrão 600, de 60 a 3600). Por
  enquanto só por SQL em staging.
- Tabelas: `whatsapp_group_requests` (status `open`/`completed`/`cancelled`/`expired`/`abandoned`) e
  `whatsapp_group_request_messages` (cada mensagem aceita, uma vez por id do provedor, com quem respondeu e o passo).
- Logs: `whatsapp_group_request.opened|busy|cancelled|completed|abandoned|duplicate|raced|reply_failed|register_failed`
  (só empresa e pedido).
- Motorista sem acesso ao app (ficha sem vínculo ativo): o bot responde que a ocorrência precisa ficar no nome dele
  e nada é registrado.
- As respostas no grupo respeitam o intervalo do número (spec 289) e saem fora do webhook.

## Teste de aceite em staging (spec 281, critérios)

1. Conectar o número do dono pelo QR.
2. Enviar um boleto de teste a esse número pelo botão "Enviar por WhatsApp".
3. Responder no WhatsApp e confirmar que a resposta entra no fio da ocorrência.
4. Derrubar a instância (pelo painel, não pela API) e confirmar que o envio cai para o e-mail com erro tipado.

## Roteiro de teste do bot do motorista em staging (specs 292 e 293)

O passo a passo completo está no projeto Claude (`grupo-whatsapp/roteiro-teste-staging.md`). O que cabe guardar aqui:

- **Conferir o ambiente antes de testar:** `tmp/ops/staging-confere-roteiro-whatsapp.sh` (somente leitura; grava em
  `tmp/ops/saidas/`). Mostra estado do Evolution e número do bot, canal da Meta, motoristas com grupo na ficha (vínculo
  ativo e telefone verificado) e as viagens e notas abertas deles. Não imprime chave nem segredo.
- **Grupo (Evolution):** marcar o bot escolhendo o contato na lista. `@bot saí`, `@bot cheguei [nota]`,
  `@bot prorrogação do boleto 17234` (ou outro tipo ativo) e `@bot` sozinho para o menu numerado. Saí e cheguei
  registram sem confirmação e exigem viagem despachada; ocorrência pergunta observação e pede `1` (Sim) para registrar.
- **Individual só funciona pela Meta.** A mensagem individual que chega pelo Evolution vai apenas para a conversa da
  ocorrência (`evolution-conversation-inbound.service.ts`, "sem fluxo de comando"); o fluxo de comandos do motorista
  (spec 144, menu "Minha viagem" e comando direto da T14) roda só no módulo da Meta. Sem canal da Meta ativo em staging,
  o individual não é testável. Com a Meta, o grafo precisa estar republicado
  (`scripts-ops/producao-publicar-falas-do-bot.sh`, ambiente staging por padrão) para o menu de 5 opções e o comando
  direto existirem.
- **Entreguei com provas** (T15) só entra neste roteiro depois do deploy do PR #508 em staging.

## O que nunca fazer

- Não copiar o valor da chave global para variável da API: só a referência `${{evolution-api.AUTHENTICATION_API_KEY}}`, e só em staging.
- Não rodar `railway config apply` sem `railway config plan` sem nenhum `Delete` (ver incidente de 27/10 em `producao.md`).
- Não compartilhar o Postgres ou o Redis com outro ambiente.
- Não ligar o Evolution em produção sem aprovação do dono.
- Não colar número, texto ou chave em chat, log ou PR.
