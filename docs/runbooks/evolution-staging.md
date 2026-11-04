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

## A entrega com provas pelo grupo e pelo individual (spec 293 T15)

`@bot entreguei 17234` (ou "Entreguei" no menu do `@bot`) **não dá a baixa na hora**: abre a entrega em preparo da
nota e o bot pede o que a configuração do comprovante exige para aquela nota (Configurações → Comprovante, com a
exceção da contratante e do destinatário). Desligado não é pedido; opcional é oferecido uma vez e aceita "pular";
obrigatório insiste. A localização é sempre só oferecida. Quando chega tudo, o bot mostra o resumo e pede 1 (Sim) ou
2 (Não); no Sim, dá a baixa pela mesma função do app (canal `whatsapp`) e anexa as fotos como comprovante.

- Uma nota por vez no grupo (o lote e o "devolvi" são da T13). Na conversa individual (Meta), "Entregar" e
  "entreguei 17234" abrem a mesma preparação: as provas valem num canal ou no outro, ligadas pela nota.
- Foto e localização no grupo: só as do **motorista do grupo** contam, pelo telefone da ficha
  (`fleet_drivers.phone`, com ou sem o nono dígito). Ficha sem telefone ou com outro número: a mídia é ignorada
  (`groupIgnored.not_driver` no log do webhook). Foto só é baixada (`POST /chat/getBase64FromMediaMessage/{instância}`)
  quando há entrega em preparo; legenda com o número da nota leva a foto para ela.
- Localização compartilhada no grupo fica guardada em memória por pouco tempo e entra no próximo "saí", "cheguei" ou
  "entreguei" do motorista; sem ela, o "saí"/"cheguei" registra `unavailable` e o bot dá a dica.
- Assinatura obrigatória: o bot avisa que só no app e a nota segue em preparo (o app fecha normalmente).
- Tabela `whatsapp_delivery_preparations` (uma `open` por nota; `completed`, `cancelled`, `superseded` quando a nota
  fechou por outro caminho). Fotos pendentes no bucket privado em
  `tenants/<empresa>/whatsapp-delivery-preparations/<preparação>/…`, apagadas depois da baixa.
- Logs: `whatsapp_delivery_preparation.opened|completed|superseded|raced|attach_failed` e
  `whatsapp_group_proof.download_failed` (só empresa, preparação e motivo).
- Ainda não existe (próximo PR da T15): lembretes e prazo da entrega em preparo e alerta ao escritório.

Conferir uma preparação em staging (sem dado de quem recebeu):

```sql
select id, document_number, origin_channel, status, awaiting, jsonb_array_length(photos) as fotos,
       received_by is not null as tem_quem_recebeu, latitude is not null as tem_localizacao, opened_at, closed_at
  from whatsapp_delivery_preparations order by opened_at desc limit 20;
```

## A ocorrência que pede foto, número ou valor pelo WhatsApp (spec 293 T15)

Antes, o tipo de ocorrência que exigia foto, número do documento do cliente ou valor pago era recusado no WhatsApp
("registre pelo aplicativo"). Agora, depois da confirmação (grupo) ou da observação (individual), o bot abre a
**ocorrência em coleta** e pede o que a exigência efetiva do tipo para aquela nota pede (tipo + exceção da
contratante + exceção do destinatário, a mesma do app). Off não é pedido; opcional é oferecido uma vez e aceita
"pular"; obrigatório insiste. Quando chega tudo, registra pela mesma `registerDriverOccurrence` do app, que confere
de novo no servidor.

- Assinatura, produtos e valor pago **por item** continuam só no app: obrigatórios, o bot responde com a recusa de
  sempre e não abre coleta.
- Uma coleta aberta por motorista. Escolher outra ocorrência substitui a anterior (`superseded`). "cancelar" fecha
  sem registrar.
- A foto (grupo ou individual) vai para a coleta quando ela está pedindo foto; senão, para a entrega em preparo.
  Ela vira **upload confirmado de ocorrência** (`trip_occurrence_uploads`, mesma conferência do app); acima de 512 KiB
  é reduzida a JPEG no servidor. Foto que a conferência recusa: o bot pede outra.
- No grupo, a coleta que espera texto segura o pedido no passo `collect`; a que espera foto fecha o pedido e a foto
  chega sozinha.
- Erro que não é de negócio no registro: a coleta fica aberta e qualquer resposta tenta de novo com a mesma chave
  (`whatsapp-occurrence-draft:<id>`).
- Tabela `whatsapp_occurrence_drafts` (uma `open` por motorista). Logs:
  `whatsapp_occurrence_draft.opened|completed|superseded|raced|photo_rejected|register_failed` (só empresa, coleta e
  motivo; nunca observação, número ou valor).

Para testar em staging: no cadastro do tipo (aba Tipos de `/ocorrencias`), deixar foto ou número como obrigatório, e
registrar pelo `@bot` no grupo ou pela conversa individual.

```sql
select id, document_number, origin_channel, status, awaiting, jsonb_array_length(photos) as fotos,
       reference_number is not null as tem_numero, declared_amount is not null as tem_valor, opened_at, closed_at
  from whatsapp_occurrence_drafts order by opened_at desc limit 20;
```

## Áudio para o bot, no grupo e no individual (spec 292 T9)

O motorista (ou quem está falando com o bot) pode mandar **áudio de voz** em vez de escrever. O bot responde na
hora "🎙️ Estou escutando o seu áudio, só um momento", baixa o áudio do provedor, manda transcrever e mostra o texto:
"Entendi assim: ... Está certo? 1 - Sim / 2 - Não". **Nada anda sem a confirmação**: "1" (ou sim/s/ok/confirmo)
segue o fluxo como se a pessoa tivesse digitado aquele texto; "2" (ou não/n) descarta. Outra mensagem dela também
descarta o áudio e segue normalmente. O áudio pendente vale 10 minutos e mora na memória da API (uma réplica): um
deploy no meio só faz a pessoa mandar de novo.

- **No grupo** o bot só ouve o áudio de quem tem o pedido aberto (o bot está esperando a resposta dela) ou o áudio
  que **cita (responde) uma mensagem do bot**. Áudio entre as pessoas do grupo continua ignorado. Para começar um
  pedido por áudio: marque o bot por texto (`@bot`) e mande o áudio em seguida, ou responda a uma mensagem do bot com
  o áudio. Só quem mandou o áudio confirma.
- **No individual** (Meta) todo áudio de número vinculado é ouvido.
- Respostas de erro: mais de 2 minutos; sem transcritor configurado ("ainda não consigo ouvir áudio"); falha ao
  baixar; falha ou fila cheia do worker; áudio sem fala (o whisper devolve `[BLANK_AUDIO]` ou vazio).
- **Quem transcreve é o worker** (o `whisper-cli` e o modelo `ggml-small-q5_1` moram na imagem dele, ADR-0103), na
  rota interna `POST /internal/bot-audio-transcriptions`: uma transcrição por vez, até 3 esperando (mais que isso,
  503), corpo até 8 MB, nada gravado. A API chama por `WORKER_INTERNAL_URL` com `BOT_AUDIO_TRANSCRIPTION_TOKEN`
  no `authorization`; sem o token certo a rota responde 404. Não há chave de provedor externo.
- Variáveis (staging): no `worker`, `BOT_AUDIO_TRANSCRIPTION_TOKEN` (32+ caracteres) e `WORKER_HOSTNAME=::` (a rede
  privada do Railway é IPv6; o padrão `0.0.0.0` não é alcançável por `worker.railway.internal`); na `api`,
  `BOT_AUDIO_TRANSCRIPTION_TOKEN=${{worker.BOT_AUDIO_TRANSCRIPTION_TOKEN}}` e
  `WORKER_INTERNAL_URL=http://${{worker.RAILWAY_PRIVATE_DOMAIN}}:<WORKER_PORT>`. O script
  `staging-ligar-audio-bot.sh` (pasta `tmp/ops/` do Anderson) grava as quatro sem redeployar e confere que o token é
  o mesmo nos dois sem imprimi-lo.
- Logs (nunca texto, número nem grupo): API `whatsapp_bot_audio.awaiting_confirmation|download_failed|transcription_failed`;
  worker `bot_audio_transcription.completed|failed` (tamanho, duração e código).

**Frase de chamada (sem `@`).** Com `WHATSAPP_BOT_WAKE_PHRASE` na `api` (ex.: `atendimento Fernandes`; é da
instalação, nunca do código), um áudio de até 60 s no grupo que não é para o bot (sem pedido aberto e sem citar o
bot) é transcrito **calado**. Sem a frase, é descartado: nada responde, o texto não é gravado nem logado (log só
`whatsapp_bot_audio.listen_failed` em falha). Com a frase, o resto da fala vira o pedido: "Entendi assim: …" e
1/2 como no `@bot`; só a frase abre o menu. Com a sessão aberta, o bot ouve só o dono dela, sem a frase (inclusive o áudio
mandado depois de escolher a opção no menu); áudio de outra pessoa nem é transcrito. Depois de um "2" (áudio descartado), quem respondeu pode reenviar
em áudio ou texto sem a frase nem `@` por 5 minutos, uma vez (`BOT_AUDIO_RETRY_WINDOW_MS`). A comparação tolera a transcrição (prefixo de 5 letras por palavra,
"da/de/do" no meio: "atendimento da Fernandez" casa). O script `staging-frase-chamada-bot.sh` (pasta `tmp/ops/`)
grava a variável na `api` de staging.

Teste em staging: no grupo de teste, `@bot` por texto, depois um áudio "prorrogação de boleto da nota <número>";
esperar o "Entendi assim", responder 1 e seguir o pedido. Repetir respondendo 2 (descarta) e com um áudio
mudo (resposta de "não consegui entender").

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
