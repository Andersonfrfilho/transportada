# ADR-0074 — A transcrição do áudio roda na nossa infraestrutura, com o whisper local

- **Status:** aceito (2026-09-26)
- **Data:** 2026-09-26
- **Contexto:** spec 183 (RF18, T706). Resolve a única `[NEEDS CLARIFICATION]` que restava na spec.

## Contexto

A conversa da ocorrência recebe áudio da contratante e do motorista: pelo WhatsApp, pelo app e pelo
portal. A RF18 pede que o worker transcreva esse áudio para leitura, e a spec deixou em aberto duas
perguntas:

- que motor transcreve;
- se a voz de terceiros pode sair para um provedor (LGPD: base legal, retenção no provedor, região).

A voz é dado pessoal da contratante e do motorista.

A base já tem um precedente. O quickcart transcreve pelo pacote
`@adatechnology/audio-transcription-provider`, com duas peças:

- o **Groq** (hospedado, nos EUA) como motor principal;
- o **whisper.cpp local** (`whisper-cli` mais o modelo `large-v3-turbo-q5_0`, compilados no
  Dockerfile) como reserva.

O OCR do transportada já roda em casa (`tesseract-server`) pelo mesmo motivo: documento de terceiro
não sai da nossa infraestrutura.

## Decisão

1. **Só o motor local.** O worker transcreve com o whisper.cpp do pacote
   (`@adatechnology/audio-transcription-provider/whisper-local`), num `Dockerfile` com o mesmo
   estágio do quickcart:
   - `whisper-cli` estático;
   - modelo `large-v3-turbo-q5_0`, com cerca de 550 MB. O `small` erra demais em pt-BR.
   - `ffmpeg` no runner.

   Nenhum provedor hospedado entra. **A voz não sai da nossa infraestrutura:**
   - não há transferência internacional (LGPD art. 33);
   - não há operador novo;
   - não há segredo novo.

2. **O pacote, não código próprio.** Vale o molde do `transcriberAdapter.ts` do quickcart:
   - só o adapter lê o ambiente;
   - o subpath `/whisper-local` é importado dinamicamente, só no worker que transcreve;
   - desligado é `undefined`, e o anexo fica sem texto ("não avaliado"), nunca com um texto fingido.
3. **Ligada por padrão, com interruptor por empresa.** Decisão do dono do projeto: toda empresa
   transcreve desde o deploy e pode desligar em Configurações. Desligar não apaga o que já foi
   transcrito.
4. **O texto só serve para leitura** (spec D4 e RF18):
   - fica ligado ao anexo, com motor, idioma e horário, e aparece marcado como transcrição
     automática;
   - nunca passa pela política de decisão nem pela de interpretação da 143;
   - falha de transcrição não falha a mensagem: o player aparece sem o texto.
5. **Configuração, não segredo.** São variáveis de ambiente do worker, no molde do quickcart:
   - `TRANSCRIPTION_ENABLED` liga o motor na instalação;
   - `TRANSCRIPTION_LOCAL_MODEL_PATH` aponta o modelo;
   - `TRANSCRIPTION_LANGUAGE`, padrão `pt`.

   Nenhuma delas é segredo. Elas entram no `.env.example` e no schema de ambiente junto com a T706.

## Consequências

- A imagem do worker cresce cerca de 600 MB (modelo mais `whisper-cli`), e cada áudio custa CPU:
  de segundos a um minuto, fora do caminho da requisição. Um pico de áudios forma fila no worker, não
  latência na API.
- Se o volume pedir motor hospedado, isso é **ADR nova**: transferência de dado pessoal a operador
  estrangeiro exige base legal, contrato e aviso. Não é troca de variável.
- O portal continua sem microfone (ADR-0073): a contratante manda áudio pelo WhatsApp, não grava pelo
  portal.
