# Feature 264 — O áudio e a transcrição chegam à conversa por assunto

> Continua a spec **263** (a conversa por assunto no app do motorista e no painel, visão do participante do SDK) e
> fecha a **183 RF18 / T706** (transcrição, aberta e bloqueada pela escolha do provedor). Decisão de arquitetura
> nova: [ADR-0103](../../docs/adr/0103-a-transcricao-roda-com-modelo-proprio.md) (proposta; aceita na T0.2).

## Specs do mesmo assunto (lidas contra o código em 2026-10-10)

| Spec / ADR      | O que já decidiu e esta spec **usa sem refazer**                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 183 D8, RF17    | Áudio é **mensagem**: anexo com `sha256`, como qualquer outro. A transcrição é **ajuda de leitura** — marcada como de máquina, embaixo do player, nunca decide, nunca vira sugestão de decisão, nunca substitui o áudio. Formatos aceitos OGG/Opus, M4A (`audio/mp4`), WEBM; teto 16 MB no app, no portal e no WhatsApp; gravação de até 5 min (`DEFAULT_MAX_RECORDING_MILLISECONDS`).                                                                     |
| 183 RF18 / T706 | A transcrição é feita pelo **worker depois de gravar** o áudio, por uma porta `speech-to-text.port.ts`; o texto fica ligado ao anexo com motor, idioma e horário; falha **não** falha a mensagem; a empresa pode desligar; migration **própria**, depois da ADR do provedor. Esta spec é essa migration e essa ADR.                                                                                                                                        |
| 183 T705        | Gravação e player foram feitos **no produto** (`ConversationAudioRecorder`/`ConversationAudioPlayer` do painel; `PortalAudioPlayer`), porque as peças de áudio do SDK são Tailwind. Lições que valem aqui: URL do anexo estável por 4 min (senão o áudio recomeça a cada leitura), `defaultPlaybackRate` junto de `playbackRate`, piso de largura do player a 390 px, `microphone=(self)` só onde se grava, `media-src` com `blob:` para ouvir a gravação. |
| 263 D1, D10     | A conversa por assunto vem da **visão do participante** do SDK (`@adatechnology/conversations-ui/participant`), `.cv-p-*`, sem Tailwind, capacidade **por ausência de prop**; o app do motorista só faz a fiação. O desenho aprovado pelo dono ("o melhor resultado de design") não muda para quem não ligar áudio.                                                                                                                                        |
| 263 D5          | Offline-first: a mensagem espera na fila do app com a `Idempotency-Key` = `clientMessageId`; reenvio nunca duplica; "Sair" descarta o outbox (LGPD, T1b.7).                                                                                                                                                                                                                                                                                                |
| ADR-0072        | Player, gravador e transcrição exibida são do **pacote**; a transcrição (porta e motor) é do **produto**.                                                                                                                                                                                                                                                                                                                                                  |
| ADR-0073        | O portal da contratante **não grava** (`microphone=()`); só ouve. Esta spec não muda isso.                                                                                                                                                                                                                                                                                                                                                                 |
| ADR-0081 §9     | Publicação em etapas: tolerante → API/banco/worker → telas.                                                                                                                                                                                                                                                                                                                                                                                                |
| ADR-0101        | Conversa tem assunto (`occurrence`/`document`/`trip`) e protocolo; anexos seguem a tabela única `occurrence_conversation_attachments`.                                                                                                                                                                                                                                                                                                                     |

## Problema

A 263 trocou a tela de conversa do motorista e o diálogo do escritório por assunto pela visão do participante do SDK.
Essa visão **não grava áudio** e só toca áudio com o `<audio controls>` nativo do navegador
(`ParticipantAttachmentItem.tsx`: sem velocidade, sem duração própria, sem transcrição). A conversa antiga da
ocorrência gravava e tocava (183 T705, prints `audio-gravando-app-390.png`, `audio-revisar-app-390.png`). Resultado:

- o **motorista**, que dirige e é quem mais precisa falar em vez de digitar, perdeu o microfone no app próprio
  (o `server.ts` do `frontend-driver` ainda responde `microphone=()`);
- o **escritório** perdeu o gravador na conversa por assunto (o painel ainda grava na tela antiga da ocorrência);
- ninguém lê o que foi dito: a transcrição (183 RF18) nunca saiu do papel, e escutar áudio no escritório barulhento ou
  no caminhão parado na doca é o gargalo.

## Objetivos

1. **Voltar o áudio** à visão do participante do SDK: gravar, ouvir antes de enviar, enviar como anexo (com `sha256`,
   como qualquer outro) e tocar na bolha com posição, duração e velocidade. Capacidade **opcional por ausência de
   prop**, sem mudar o markup nem o estilo padrão de quem não ligar.
2. **Transcrever** todo áudio de conversa com **modelo nosso**, gratuito por uso, rodando no worker (whisper.cpp,
   engine `whisper-local` do `@adatechnology/audio-transcription-provider`), e mostrar o texto embaixo do player, com o
   aviso "gerada por máquina".
3. Valer nas **duas pontas** (app do motorista e painel do escritório), nos **três assuntos** (ocorrência, nota,
   viagem) e para o áudio que **já chega** como anexo pelos outros canais (e-mail, portal; WhatsApp quando a 183 T702f
   gravar a mídia), sem mudar esses canais.

## Não-objetivos

- **Provedor hospedado** (Groq, OpenAI ou qualquer API paga/externa). Nem como reserva nesta spec (D2).
- **Gravar no portal da contratante** (ADR-0073 continua: o portal ouve, não grava). O portal **lê** a transcrição
  quando a conversa dele tiver áudio transcrito? **Não nesta spec**: o serializador `/client/**` não muda (D12).
- **Interpretar** o texto (intenção, resumo, palavra-chave, sugestão de decisão). A transcrição não entra em nenhuma
  política (183 D4/D8).
- **Transcrever áudio antigo** (anterior ao ligar da rotina) — não há backfill (D9).
- **Editar/corrigir** a transcrição à mão; **buscar** pela transcrição.
- **Converter formato** para o WhatsApp (183 RF17 fica como está).
- Remover a tela antiga da ocorrência do painel ou os `ConversationAudio*` do produto (Fase 10 da 189, aprovação
  humana).
- Push nativo, transcrição no aparelho (no navegador), streaming de transcrição.

## Decisões

### D1 — Áudio volta como capacidade opcional da visão do participante (decisão do dono)

A visão do participante ganha **gravador**, **player** e **bloco de transcrição** próprios, em `.cv-p-*`, sem
Tailwind (as peças `AudioRecorderButton`/`AudioPlayer`/`AudioTranscription` do SDK usam utilitárias e não entram na
visão do participante; reaproveita-se só o que é **puro**: `resolveRecordingFormat`, `RECORDING_FORMATS`,
`DEFAULT_MAX_RECORDING_MILLISECONDS`). Regras que o dono fixou e não se reabrem:

- **Sem a prop, nada muda.** Sem a opção de gravação (nome definido na T0.1; molde: `audioRecording?: {...}`, objeto
  presente = capacidade) não há microfone; nada de flag `hasX`. O markup e o CSS padrão dos demais fluxos são presos
  por **testes de ouro byte a byte** (os `*.golden.html` da visão do participante existentes e os do operador).
- **O player novo substitui o `<audio controls>` nativo só da visão do participante**, e é a **única** mudança de
  markup padrão aceita, declarada no changeset. Quem não passa nada continua ouvindo — melhor (posição, duração,
  velocidade), mas com o mesmo anexo e a mesma URL.
- **"O SDK não pode impactar outros fluxos"**: operador (`ConversationPane`, `MessageBubble`, `AudioPlayer`,
  `AudioRecorderButton`, `AudioTranscription`) e e-mail/WhatsApp não mudam um byte. Passe de revisão `opus` antes de
  publicar versão.

### D2 — A transcrição roda com modelo próprio, no worker (decisão do dono)

Motor: `createWhisperLocalTranscriber` (`@adatechnology/audio-transcription-provider/whisper-local`, whisper.cpp +
ffmpeg + modelo ggml) dentro da imagem do worker. **Sem custo por uso** e **sem mandar a voz de terceiros** a serviço
externo. Groq/OpenAI ficam fora (no máximo cadeia futura, outra ADR). Detalhe e alternativas: ADR-0103.

### D3 — Qual modelo é decidido por medida, não por palpite

O README do pacote recomenda `large-v3-turbo` (~1,6 GB) e desaconselha `base` em pt-BR (loop de repetição em áudio de
celular); a única medida dele é de GPU de laptop. O spike (T0.2, 🧠) mede **no runner do Railway** (CPU) `small`,
`large-v3-turbo` e as variantes quantizadas (`*-q5_*`), com áudio real de motorista em pt-BR (ruído de cabine, 10 s,
1 min e 5 min), e escolhe pelo critério fechado do plano (§ d): tempo ≤ duração do áudio (fator de tempo real ≤ 1) para
áudio de 2 min, RAM de pico dentro do teto do serviço, nenhuma repetição em loop, erro de palavras aceitável numa
amostra conferida à mão. `base` entra só como piso de comparação. O resultado vira a ADR-0103 aceita.

### D4 — Estados da transcrição: `pending` · `ready` · `failed` · `disabled` (decisão do dono)

Vocabulário fechado, exposto por anexo de áudio:

| Estado                         | Quando                                                           | O que a tela mostra                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pending`                      | áudio aceito, ainda não transcrito (inclui retentativa agendada) | player + "Transcrevendo…" discreto (a passagem a `ready` é anunciada pela região viva da thread, `contract.md` §3.3) |
| `ready`                        | texto gerado (pode ser vazio: silêncio é resultado, não falha)   | player + texto + "Transcrição gerada por máquina" (texto vazio: só "Nada foi dito no áudio" e o aviso)               |
| `failed`                       | erro definitivo ou retentativas esgotadas                        | **só o player** (183 RF18: o player aparece sem o texto); nenhum alarme ao leitor                                    |
| `failed` com código `too_long` | áudio de 10 minutos ou mais (RF15)                               | player + aviso discreto "Transcrição só para áudios de menos de 10 minutos" (RF15); sem tentativa de transcrever     |
| `disabled`                     | a empresa desligou a transcrição                                 | **só o player**                                                                                                      |
| _ausente_                      | áudio anterior à rotina, rotina não instalada, ou API antiga     | **só o player**                                                                                                      |

O vocabulário do participante é **novo e próprio** (`conversation-contracts`); o `TranscriptionStatus` do operador
(`pending|done|failed|unsupported`) **não muda** — mudar seria quebrar o operador (D1).

### D5 — A transcrição nunca decide, nunca substitui, nunca sai do lugar dela (183 D8, reforçado)

O texto não entra em política de decisão (tratativa, taxa, acerto, 143/164), nem em aviso do sino, nem em e-mail à
contratante, nem em mensagem do WhatsApp, nem em prévia da lista de conversas, nem em busca, nem em log. O registro é
o áudio. Prova por contrato (texto de fonte, molde de `conversation-never-decides.contract.ts`) e por mutação.

### D6 — Transcrever **todo** áudio de conversa, de qualquer canal e direção

A rotina transcreve todo anexo de áudio de `occurrence_conversation_attachments` (motorista, escritório, e-mail,
portal; WhatsApp quando a 183 T702f passar a gravar a mídia como anexo — hoje não grava, e esta spec não a implementa), porque "a transcrição aparece para quem lê" nas duas pontas: o escritório lê o que o motorista falou,
e o motorista parado lê o que o escritório gravou. Imagem e documento nunca entram.

### D7 — A rotina descobre o áudio sozinha; os caminhos de entrada não mudam

Em vez de gravar evento de outbox em cada caminho que liga anexo (app, painel, portal, WhatsApp e e-mail no worker), o
worker roda uma **rotina agendada** (`conversation.audio.transcribe`, registro de rotinas do `startJobRunConsumer`,
molde `trip.canhoto.read`) que acha os anexos de áudio sem transcrição e as próprias linhas `pending` vencidas, com
`FOR UPDATE SKIP LOCKED`. Motivo: o dono exige que WhatsApp/e-mail/portal **não mudem**; outbox exigiria escrever em
todos esses caminhos. A tabela da transcrição **é** a fila: estado, tentativas, próxima tentativa e prazo de posse
(_lease_). Custo aceito: latência até a cadência da rotina (alvo: 1 min; medido na T0.2).

### D8 — Erro retriável vs definitivo, como o pacote distingue

`isRetriable` do erro do pacote decide: retriável (timeout, processo morto, falha de E/S) volta a `pending` com
**backoff exponencial** (1 min, 5 min, 30 min; até 3 tentativas) e depois `failed`; definitivo
(`TranscriptionUnsupportedError`, áudio vazio, duração acima do teto) vira `failed` na hora. `failed` conta em métrica
com alerta (o "DLQ" desta fila é a contagem de `failed` por motivo). Motivo gravado como **código** (nunca a mensagem
do erro, que pode citar caminho de arquivo).

### D9 — Sem backfill; desligar esconde, não apaga

- A rotina só transcreve áudio criado **depois** de a rotina ser ligada na instalação e enquanto a empresa está
  ligada. **Marco decidido na T0.1** (`contract.md` §5.5–5.6): por empresa, `greatest(enabled_since,
routine_started_at)` — `routine_started_at` gravado na **primeira execução** da rotina que vê a empresa, e
  `enabled_since` regravado a cada religar.
- **Janela de recuperação** (regra de produto nova, estreita o D6): áudio com mais de
  `AUDIO_TRANSCRIPTION_RECOVERY_WINDOW` (padrão 72 h, configurável por env do worker) quando a rotina o encontra não é
  transcrito — a rotina que volta depois de dias parada não satura a CPU. **Confirmar com o dono antes da publicação em
  produção** (não bloqueia a Fase 1).
- **Padrão: ligada** (o dono falou em a empresa poder _desligar_). Sem linha de configuração = ligada.
- Desligar para de transcrever na hora e a API passa a devolver `disabled` para **todos** os áudios da empresa
  (inclusive os já transcritos, que ficam ocultos e guardados). Religar mostra de novo; o que chegou enquanto
  desligada **não** é transcrito depois (sem backfill). Revisável pelo dono na revisão da spec.

### D10 — LGPD: áudio e transcrição são dado pessoal

- O texto mora numa tabela do produto, com `company_id`, acessível só por quem já lê a conversa (BOLA da 183/263).
- **Retenção amarrada ao áudio:** a transcrição nunca vive mais que o áudio. Objeto do áudio `deleted` em
  `stored_objects` ⇒ a rotina anula `text` e marca o expurgo; a API nunca mostra texto de áudio apagado.
- **Nunca em log**, nem em erro, Sentry, métrica, evento de outbox, aviso, e-mail ou `clientDiagnostics`. Log só com
  ids, estado, código de erro, duração e motor.
- O arquivo temporário do worker (WAV convertido) vive em diretório próprio e é apagado no `finally` (o pacote já
  faz); o disco do contêiner é efêmero.
- Registro em `docs/SECURITY.md` (finalidade: leitura assistida da conversa; base: execução do contrato de transporte;
  sem compartilhamento com terceiros).

### D11 — O app do motorista passa a pedir microfone

`frontend-driver` muda `Permissions-Policy` para `microphone=(self)` (hoje `()`) e a CSP ganha `media-src 'self' blob:
<storage>` — **hoje a CSP do app não declara `media-src`** (cai em `default-src 'self'`), então nem o áudio do bucket
toca no app; `blob:` serve para ouvir a gravação antes de enviar. Mesmo desenho do painel
(`contentSecurityPolicy.service.ts` do painel, 183 T705). É a mesma autorização que o dono deu ao painel em 25/09/2026 (183 T705), quando o painel
ainda servia o motorista; a app própria (ADR-0075) nasceu sem ela. Registro em `docs/SECURITY.md` e no `CLAUDE.md` da
app. O portal segue `microphone=()`.

### D12 — Onde a transcrição aparece

Rotas da conversa por assunto do **motorista** (`/me/trips/current/conversations/**`) e do **escritório**
(`/trips/:tripId/conversations/**`), e a conversa antiga da ocorrência no painel **só se** o mesmo serializador já
servir as duas (T0.1 confere; se não servir, a tela antiga fica sem transcrição — ela é legado da Fase 10 da 189). As
rotas antigas `/me/.../occurrences/:id/**` e o portal `/client/**` **não mudam** (ADR-0101 §8, ADR-0073).

### D13 — Áudio offline entra na fila como qualquer anexo

O áudio gravado sem rede vira `File` no envio da visão do participante (`sendMessage({ files })`), e o app o guarda na
fila do outbox de conversa (IndexedDB, mesmo dono `subHash`, mesmo "Sair" que descarta) até subir pelo envio em duas
etapas da 183. Conta no teto de bytes do outbox. Nada de caminho novo de fila.

## Histórias priorizadas

### P1 — O motorista responde falando

**Given** o motorista com o app aberto na conversa da NF 4521 **When** toca no microfone, fala 20 s, para, ouve e toca
"Enviar áudio" **Then** a bolha de áudio aparece com o relógio da fila (ou ✓ com rede), e o escritório recebe o áudio
na conversa da nota com player.

### P1 — O escritório lê o que o motorista falou

**Given** um áudio do motorista recebido há 1 min **When** o operador abre a conversa **Then** vê o player e,
embaixo, o texto com "Transcrição gerada por máquina"; antes de ficar pronto, "Transcrevendo…".

### P1 — Sem rede, o áudio espera

**Given** o motorista sem sinal **When** grava e envia um áudio **Then** a bolha fica "na fila" e, voltando a rede,
o áudio sobe e a mensagem sai **uma** vez.

### P2 — O escritório responde falando, e o motorista lê parado

**Given** o operador na conversa da viagem **When** grava e envia um áudio **Then** o motorista ouve no app e, depois
da rotina, lê a transcrição embaixo do player.

### P2 — Áudio que chega por outro canal ganha texto

**Given** a contratante manda um áudio como anexo de e-mail ou pelo portal na conversa da ocorrência **When** a rotina
passa **Then** o operador lê a transcrição embaixo do player, e o fluxo do canal não mudou. (Áudio do **WhatsApp** hoje
**não** vira anexo da conversa — `extractWhatsAppConversationText` guarda só texto/legenda, 183 T702f bloqueada; quando
a T702f entrar, a rotina o transcreve sem mudança nesta spec, por D6/D7.)

### P3 — A empresa desliga

**Given** a empresa desliga a transcrição nas configurações **When** chega um áudio novo **Then** só o player
aparece, nada é transcrito, e os textos já gerados somem da tela.

## Requisitos funcionais

**Gravação (SDK + apps)**

- **RF1** Com a capacidade ligada, o compositor da visão do participante mostra o botão de microfone (ícone + nome
  acessível "Gravar áudio", alvo ≥ 44 px) no lugar do enviar quando o campo está vazio (padrão WhatsApp; o desenho
  exato na T0.1). Sem a capacidade, o compositor é **idêntico byte a byte** ao de hoje.
- **RF2** Gravar mostra o relógio "m:ss de 5:00" e "Parar"; ao atingir o teto (padrão `DEFAULT_MAX_RECORDING_MILLISECONDS`,
  sobrescrevível para menos pelo host), para sozinho. Depois: "Ouça antes de enviar", com tocar, "Enviar áudio" e
  "Descartar áudio".
- **RF3** Formato pela ordem de `resolveRecordingFormat` (OGG/Opus → M4A → WEBM); o arquivo enviado tem o `type`
  normalizado do pacote e nome estável (`audio-<data>.<ext>`). Duração e tamanho são conferidos **antes de subir**:
  acima do teto de bytes do canal (`channelCapabilityFor('app')`/16 MB de áudio da 183) ou vazio ⇒ recusa clara, sem
  enviar e sem apagar o rascunho de texto.
- **RF4** Microfone **negado** ⇒ frase "Sem permissão para usar o microfone." e o botão volta ao estado inicial; o
  anexo de arquivo e o texto continuam valendo. Navegador **sem** `MediaRecorder`/`getUserMedia` ⇒ o microfone **não
  aparece**. Permissão nunca é pedida antes do toque.
- **RF5** Trocar de aba do app, bloquear a tela (`pagehide`/oculto) ou receber chamada (trilha encerrada/muda) durante
  a gravação **para** a gravação e a leva à revisão com o que foi gravado (nada é enviado sozinho); na revisão, essas
  mesmas interrupções **pausam** a reprodução e **mantêm** a gravação (decisão do dono, 2026-10-11). Sair da conversa
  (unmount) **descarta**. Em toda saída, o microfone é liberado (`track.stop()`), inclusive quando a permissão resolve
  depois de sair (token de cancelamento, `contract.md` §2.1). A gravação conta como captura aberta no `captureRegistry`
  do app (não recarregar a página no meio).
- **RF6** Offline: o áudio enviado sem rede entra no outbox de conversa (D13) com a mesma `clientMessageId`; a bolha
  mostra "na fila"; reenvio não duplica; "Sair" descarta o áudio pendente com o resto.

**Player (SDK)**

- **RF7** Anexo `kind: 'audio'` na visão do participante mostra player próprio: tocar/pausar (nome acessível que muda
  com o estado), posição/duração em texto, barra de progresso operável por teclado (`<input type="range">` nativo com
  `aria-valuetext`; `preload="none"`, nada baixado antes do toque — `contract.md` §3.2), velocidade 1× / 1,5× / 2× (`defaultPlaybackRate` + `playbackRate`). Toca **um** áudio por vez na
  conversa.
- **RF8** A URL do anexo não troca enquanto o player existe (lição da 183 T705: troca de `src` recomeça o áudio). O
  player tem piso de largura que não esconde o botão de tocar a 375 px.
- **RF9** Duração exibida vem de `durationMs` do anexo quando o servidor manda; senão, do `loadedmetadata`.

**Transcrição (contratos + API + worker + SDK)**

- **RF10** `ParticipantAttachment` ganha campos **opcionais**: `durationMs?` e `transcription?: { status, text?,
language?, engine?, generatedAt? }` com `status` ∈ D4. Ausente ⇒ nada desenhado além do player.
- **RF11** A visão do participante mostra o bloco de transcrição embaixo do player por estado (D4), com o aviso
  "Transcrição gerada por máquina" sempre junto do texto, texto selecionável, longo recolhido em 6 linhas com "Ver
  tudo", e leitor de tela lendo aviso + texto. Sem campo, nada.
- **RF12** A API expõe `transcription` (e `durationMs` quando houver) em cada anexo de áudio das rotas de conversa por
  assunto do motorista e do escritório (D12), em **lote** (uma consulta por página de mensagens, sem N+1), e
  `disabled` quando a empresa desligou. As rotas antigas e o portal não mudam (contrato de ouro das respostas).
- **RF13** A rotina `conversation.audio.transcribe` no worker: reivindica até N áudios por ciclo (`SKIP LOCKED`, lease),
  baixa o objeto pela linha (nunca pela mensagem), confere o `sha256`, chama a porta, grava texto, idioma, duração,
  motor, modelo e tempo de processamento, e fecha `ready`. Um áudio por vez por instância (CPU).
- **RF14** Erros conforme D8: retriável ⇒ `pending` com `next_attempt_at` em backoff, até 3 tentativas; definitivo ou
  esgotado ⇒ `failed` com código (`unsupported_format`, `too_long`, `empty_audio`, `object_missing`,
  `sha256_mismatch`, `engine_timeout`, `engine_failed`, `attempts_exhausted`, e `company_disabled` — emenda da T0.1:
  pendente encerrada porque a empresa desligou; D4 proíbe gravar `disabled`, então ela é gravada como falha e fica fora
  do alerta, `contract.md` §5.7). Nenhuma falha toca a mensagem. A duração é medida com `ffprobe` **antes** do motor
  (o motor não mede), e `too_long` nunca chama o transcritor.
- **RF15** **Só áudios de menos de 10 minutos são transcritos** (decisão do dono, 2026-10-11). Áudio de 10 minutos ou
  mais (`AUDIO_TRANSCRIPTION_MAX_DURATION_MS`, 600 000 ms; a comparação é `duração >= teto`) vira `failed`/`too_long`
  sem rodar o motor, e o produto **avisa**: o bloco de transcrição do áudio mostra "Transcrição só para áudios de
  menos de 10 minutos" (texto com o número vindo do teto, não fixo no JSX), em vez de calar. O aviso também consta
  na tela de configurações da transcrição (RF17) e no `labels` do SDK (`transcriptionTooLong`, default em inglês).
  O teto é só desta rotina: o áudio continua enviado, guardado e tocando normalmente. A T0.2 pode **baixar** o
  teto se a medida exigir, nunca subi-lo sem aval do dono.
- **RF16** Sem `AUDIO_TRANSCRIPTION_MODEL_PATH` (ou sem binário) a rotina **não é registrada** (boot verde,
  `job_run_routine_missing`, molde da 252) — nada fica `pending` para sempre: a API mostra só o player.
- **RF17** Configuração por empresa: tela de configurações do painel ganha "Transcrever áudios das conversas"
  (liga/desliga, `settings.manage`, padrão ligado), com a frase do que acontece ao desligar (D9) e a frase do limite
  ("Só áudios de menos de 10 minutos são transcritos", RF15). A mudança grava trilha de auditoria (ator, empresa,
  valor, horário).
- **RF18** Retenção (D10): áudio apagado ⇒ texto anulado pela rotina e nunca exposto.
- **RF19** Todo texto novo em `pt-BR` e `en`: no SDK por `labels` (default em inglês, como a 263), nos apps em
  `.locale.json`.

**Infra**

- **RF20** A imagem do worker leva `ffmpeg`, `whisper-cli` (compilado de versão fixada) e o modelo escolhido (com
  `sha256` conferido no build), sem ferramentas de build no estágio final; o health continua respondendo durante uma
  transcrição (o motor roda em processo filho).

## Requisitos não funcionais

- **Tempo:** áudio de 1 min do motorista transcrito em até a cadência da rotina + 1 min no runner de staging (alvo
  medido na T0.2 e conferido na T6.3).
- **Recursos:** RAM de pico do worker com transcrição em curso dentro do teto do serviço com folga de 30 %; nenhuma
  outra rotina do worker (canhoto, planta, prévia) perde prazo durante uma transcrição (medido).
- **Custo:** zero por uso; o custo de infra (RAM/CPU extra, tamanho da imagem, tempo de deploy) é medido e registrado
  na ADR-0103.
- **Segurança:** `companyId` sempre do contexto/linha; BOLA da 263 herdada; transcrição fora de log (contrato de texto
  de fonte); `.strict()` nos schemas novos **de requisição** (as respostas da visão do participante são _strip_ e
  validadas por anexo nos apps, `contract.md` §1); nenhum segredo novo.
- **Bundle:** o export `/participant` não puxa o operador nem dependência nova de áudio (mesma medida da 263 T0.2).

## Casos extremos e falhas

- **Dois cliques em "Enviar áudio"**: uma mensagem (mesma `clientMessageId`).
- **Gravação de 0 s ou silêncio**: "Nada foi captado pelo microfone." e nada sobe; áudio enviado e silencioso
  transcreve `ready` com texto vazio.
- **Safari grava `audio/mp4`, Firefox OGG, Chromium `audio/webm` ou mp4**: todos aceitos pela política de anexo da
  183; o ffmpeg do worker converte qualquer um.
- **Áudio do WhatsApp em AMR ou formato fora da lista**: `failed`/`unsupported_format`, player como hoje.
- **Worker reinicia no meio**: lease vence e outra execução retoma; nunca duas transcrições do mesmo áudio gravadas
  (único por anexo; grava só quem tem a posse).
- **Empresa desliga com transcrições `pending`**: a rotina as encerra como `failed`/`company_disabled` sem rodar o
  motor (a tela mostra `disabled` enquanto desligada; depois de religar, só o player — sem backfill).
- **Dois toques síncronos em "Enviar áudio"**: trava por ref no gravador; o `send` gera `clientMessageId` novo por
  chamada, então a idempotência do servidor sozinha não bastaria.
- **Fila offline cheia ou `QuotaExceededError`**: o áudio não entra na fila, a bolha fica "falhou — tocar para
  reenviar" e o app diz que a fila está cheia (`contract.md` §5.4).
- **Motorista trocado no meio da viagem** (ADR-0097): quem perde a conversa perde a transcrição junto (mesma BOLA).
- **Áudio apagado pelo expurgo**: texto anulado; tela mostra o que mostra hoje para anexo apagado.
- **Telefone com áudio tocando recebe nova mensagem**: o áudio não para nem recomeça (URL estável, RF8).

## Critérios de aceite (por comando)

- **A1** SDK: `bun run test` e `tsc --noEmit` dos dois pacotes verdes; **ouro byte a byte** dos `*.golden.html` da
  visão do participante sem a capacidade inalterados, e do operador inalterados (diff vazio); cenários de ouro novos
  com a capacidade.
- **A2** Changeset minor em `conversation-contracts` e `conversations-ui` declarando a troca do `<audio>` nativo pelo
  player na visão do participante; passe `opus` registrado antes da publicação.
- **A3** API: contrato das rotas por assunto com `transcription` nos quatro estados + ausente; contrato de ouro das
  rotas antigas e do portal sem diferença; `bun --env-file=../../.env.test run test:integration` verde nos arquivos
  tocados (lista em lote sem N+1 provada por contagem de consultas); `make migration-test` verde.
- **A4** Worker: contrato da rotina com transcritor falso (retriável → backoff → `failed`; definitivo → `failed`;
  lease; empresa desligada; áudio apagado), contrato "a transcrição nunca decide nem vai a log" provado por mutação;
  `make worker-integration` verde.
- **A5** Imagem do worker: build local com `whisper-cli --help` e o `sha256` do modelo conferidos; medida da T0.2
  registrada.
- **A6** Apps: `make check` verde; smoke Playwright do `frontend-driver` (gravar com microfone falso do Chromium,
  ouvir, enviar, offline) **e** do painel (gravar e enviar na conversa por assunto, ver a transcrição) verdes
  localmente.
- **A7** Revisão de design com print a 375 px e 1440 px: alvo ≥ 44 px, leitor de tela, contraste ≥ 4,5:1 do texto e
  do aviso nos dois temas.

## Dúvidas

Nenhuma `[NEEDS CLARIFICATION]`. As decisões do dono (D1, D2, D4, D6 parcial, "desligável") estão registradas, e as
que o planejador tomou por delegação foram **confirmadas pelo dono em 2026-10-11**: padrão **ligado** (D9), desligar
**esconde** em vez de apagar (D9), sem backfill (D9), portal sem transcrição (D12) e teto de transcrição de
**menos de 10 minutos**, com aviso na tela (RF15). O que só a medida responde (modelo, cadência, RAM) é a T0.2, que
**para e pergunta** se a medida mostrar que o worker não comporta o modelo aceitável (ver plano § d, "saída de emergência").
