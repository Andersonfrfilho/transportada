# ADR 0103 — A transcrição de áudio roda com modelo próprio (whisper.cpp no worker)

- **Status:** proposta (2026-10-10, spec 264). Vira **aceita** na T0.2 da spec 264, com o modelo e as medidas
  preenchidos abaixo; produção exige aprovação humana própria. 2026-10-11: medida local feita (candidato `small-q5_1`);
  a medida no Railway, que decide, está pendente de permissão para criar o serviço temporário.
- **Data:** 2026-10-10
- **Nasce da spec 264**; fecha a dúvida da spec 183 (RF18, T706)
- **Citações:** ADR-0072, ADR-0073, ADR-0081 §9, ADR-0101, specs 183, 252, 263

## Contexto

A spec 183 (RF18, D8) decidiu que o áudio da conversa é mensagem e que a transcrição é só ajuda de leitura, gerada pelo
worker depois de gravar o áudio, desligável por empresa, e que "transcrever manda a voz de terceiros a um provedor, e
isso exige ADR própria". A T706 ficou bloqueada por falta dessa decisão.

O pacote `@adatechnology/audio-transcription-provider@0.1.0` oferece dois motores atrás da mesma porta estrutural
(`AudioTranscriber`): Groq hospedado (padrão; aceita `baseUrl` compatível com OpenAI) e `whisper-local` (whisper.cpp +
ffmpeg + modelo ggml, em processo filho, subpath opt-in), além de uma cadeia (`createTranscriberChain`) e da distinção
retriável/definitivo nos erros.

## Decisão

1. **O motor é o `whisper-local`, rodando dentro da imagem do worker.** Nenhuma voz sai da nossa infraestrutura;
   nenhum custo por uso. (Decisão do dono, 2026-10-10.)
2. **O modelo é escolhido por medida no runner do Railway** (spike T0.2 da spec 264), pelo critério fechado do plano
   da 264 § d: o menor modelo sem loop de repetição, com erro de palavras aceitável numa amostra pt-BR conferida à
   mão, fator de tempo real ≤ 1 em 2 min de áudio e RAM de pico + base do worker ≤ 70 % do teto do serviço.
   - **Medida local feita, medida no Railway pendente (2026-10-11).** A criação do serviço temporário foi negada pela
     permissão da sessão; sem o runner, o critério (iii) não fecha e esta ADR **continua proposta**. Números e
     ressalvas em `specs/264-*/evidence.md` § "T0.2 — medidas".
   - **Candidato da medida local: `small-q5_1`** · sha256
     `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` (190 085 487 bytes, `ggerganov/whisper.cpp`
     no Hugging Face) · whisper.cpp **`v1.9.4`** (commit `927cfce34f31707e17f2bff35c349632fb9e2c3a`, conferido no
     build; `-DGGML_NATIVE=OFF`, `-DBUILD_SHARED_LIBS=OFF`).
   - Medidas locais (Alpine + Bun 1.3.14, 8 CPUs/8 GB, `--threads 7`, Apple M3 Pro sob carga 12–18): imagem
     **+291 MB** (ffmpeg e libs 107 MB + `whisper-cli` 2,8 MB + modelo 181 MB), RAM de pico **0,50 GB** (com a base do
     worker: 1,15 GB de 8 GB = 14 %), fator de tempo real **0,27–0,36** em 2 min, erro de palavras **2,5–7,6 %** em
     **12** áudios TTS pt-BR (limpo, ruído de cabine ~8 dB SNR, fala rápida; 10 s a 5 min), nenhum loop. Deploy: não
     medido.
   - `base` reprovou (ii): 17–23 % com ruído e até 210 palavras engolidas. Os dois `large-v3-turbo` passaram (i), (ii) e
     (iv), mas engolem frases inteiras e ficaram com fator **0,79–1,50** em 2 min **já no M3** — tendem a reprovar (iii)
     no EPYC do Railway.
   - Teto de duração: **mantido em 10 min**. Cadência: **5 min** (`JOB_TICK_INTERVAL_SECONDS = 300` e o `cron` do Railway
     em `*/5`; não há agendador mais fino). Worker: 8 vCPU / 8 GB (o mesmo plano em staging e produção), sem mudança.
   - Para virar **aceita**: rodar o spike preparado no serviço `spike-whisper-264` (staging), confirmar fator ≤ 1 em
     2 min no runner com o candidato, registrar imagem, build, deploy, RAM pelo Railway, impacto no canhoto e custo, e
     derrubar o serviço.
3. **Groq/OpenAI e qualquer serviço hospedado ficam fora**, inclusive como reserva em cadeia. Ligar um deles exige ADR
   nova (privacidade e custo).
4. **Um áudio por vez por instância**, em processo filho; teto de duração transcrita (padrão 10 min); sem a variável
   do modelo a rotina não é registrada (inerte, molde da spec 252).
5. **Se nenhum modelo cumprir o critério no worker**, a decisão volta ao dono (plano maior, serviço interno dedicado
   sem domínio público, ou critério mais frouxo) — não se resolve por conta própria.

## Consequências

- **Privacidade:** a fala de motorista, operador e contratante nunca vai a terceiro. O texto é dado pessoal novo:
  tabela do produto com `company_id`, fora de log, retenção amarrada ao áudio (spec 264 D10), registro em
  `docs/SECURITY.md`.
- **Custo:** zero por uso; custo de infra medido acima (RAM/CPU do plano, imagem maior, deploy mais lento).
- **Operação:** o worker passa a carregar `ffmpeg` e `whisper-cli` compilado de tag fixada, e o modelo conferido por
  sha256 no build. Atualizar o whisper.cpp ou o modelo é mudança de imagem com nova medida.
- **Qualidade:** em CPU e com ruído de cabine o texto erra; por isso o aviso "gerada por máquina" e o áudio como
  registro (183 D8). A transcrição nunca decide nada.
- **Latência:** até a cadência da rotina mais o tempo de processamento — aceitável para leitura assistida, não para
  conversa em tempo real.

## Alternativas descartadas

- **Groq (Whisper hospedado)** — mais rápido e sem carga no worker, mas manda a voz de terceiros a um serviço externo,
  com cota (free tier 20 req/min, 2.000/dia) e cobrança com piso de 10 s por requisição fora dele. O dono recusou
  custo por uso e envio da voz para fora.
- **OpenAI (Whisper/transcribe API)** — mesmos motivos, com custo por minuto.
- **Cadeia Groq → local** — reintroduz o envio para fora no caminho feliz; fica para ADR futura, se algum dia for
  aceitável.
- **Transcrever no aparelho (navegador)** — modelos WASM pesados demais para o celular do motorista, bateria e dados;
  e o escritório e os canais externos não teriam transcrição.
- **Serviço interno dedicado desde já** — isola a CPU, mas é um serviço a mais para operar antes de existir medida que o
  justifique; fica como saída de emergência (Decisão 5).
- **`base` (~148 MB) por economia** — o README do pacote registra loop de repetição e troca de palavras em pt-BR com
  áudio de celular; entra no spike só como piso de comparação. Medido (T0.2, local): sem loop, mas 17–23 % de erro com
  ruído e janelas de 30 s trocadas por "música de fundo".
- **`large-v3-turbo` (recomendação do README do pacote)** — medido (T0.2, local): mesma faixa de erro do `small` no
  proxy TTS, 1,8 GB de RAM, frases inteiras engolidas e fator de tempo real no limite já numa CPU mais rápida que a do
  runner. Volta à mesa só se o `small-q5_1` falhar na T6.3 com áudio real e o runner provar folga.
