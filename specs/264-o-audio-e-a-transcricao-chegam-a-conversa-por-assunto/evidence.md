# Evidência — 264

## T0.2 — medidas

> **Situação (2026-10-11): parcial — medida local feita, medida no Railway bloqueada por permissão.** A criação do
> serviço temporário `spike-whisper-264` (`create-service` no projeto `transportada`, ambiente `staging`, workspace AdA
> Technology) foi **negada pelo classificador de permissões** da sessão. Pela regra da task, nada foi contornado (nem
> pela CLI `railway up`): nenhum serviço, volume, domínio ou variável foi criado ou tocado no Railway. A ADR-0103
> continua **proposta**, com o candidato da medida local registrado; o "aceita" depende da medida no runner.

### O que se mediu e onde

- **Máquina:** Apple M3 Pro (11 núcleos, 18 GB), Docker Desktop `aarch64` com 11 CPUs/8 GB. Cada medida roda num
  contêiner **Alpine com Bun 1.3.14 (a mesma base do worker)**, limitado a `--cpus=8 --memory=8g` (o teto do worker),
  com `whisper-cli` compilado da tag fixada e `--threads 7` (vCPU − 1, plano § d).
- ⚠️ **A máquina estava disputada:** `vm.loadavg` entre **12,5 e 17,9** em 11 núcleos durante toda a medida (outras
  sessões, Keycloak/MinIO/Postgres de outras árvores). Os tempos são **ruidosos** — a mesma combinação variou até 40 %
  (`large-v3-turbo-q5_0` em 2 min: 94 s limpo vs 133 s com ruído). E o M3 não é o EPYC x86 do Railway (núcleo mais
  rápido, NEON em vez de AVX2). **O fator de tempo real local não fecha o critério (iii) no worker**; ele só separa
  quem tem folga larga de quem está no limite.
- **whisper.cpp:** tag `v1.9.4` (2026-09-11; a `v1.9.5` tinha 5 dias e ficou de fora pela regra de duas semanas),
  commit `927cfce34f31707e17f2bff35c349632fb9e2c3a`, conferido no build (`test "$(git rev-parse HEAD)" = ...`).
  `cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
-DGGML_NATIVE=OFF`. Binário de 2,8 MB, dinâmico só contra `libstdc++`, `libgomp`, `libgcc_s` e musl.
- **Modelos** baixados de `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/`, sha256 conferido contra o oid
  LFS publicado pela API do Hugging Face (`/api/models/ggerganov/whisper.cpp/tree/main`) — os cinco bateram:

| modelo                | bytes         | sha256                                                             |
| --------------------- | ------------- | ------------------------------------------------------------------ |
| `base`                | 147 951 465   | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| `small-q5_1`          | 190 085 487   | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` |
| `small`               | 487 601 967   | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |
| `large-v3-turbo-q5_0` | 574 041 195   | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |
| `large-v3-turbo`      | 1 624 555 275 | `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69` |

### Áudio de teste (proxy otimista)

- **Nenhum áudio de cliente nem de pessoa real.** Texto original de logística (recado de motorista: doca, nota, canhoto,
  lacre, manifesto, diária; 832 palavras, sem números escritos em algarismo) falado por `say -v Luciana` (TTS pt-BR do
  macOS). Prefixos por frase para 10 s (36 palavras), 1 min (159), 2 min (315) e 5 min 17 s (833).
- Três variantes por duração, todas em **ogg/opus 24 kbit/s mono 48 kHz** (o que o `MediaRecorder` grava):
  - `clean` — a fala pura;
  - `noise` — ruído de cabine: ruído marrom (`anoisesrc=color=brown:amplitude=0.35`) + zumbido de motor de 90 Hz
    (`sine=frequency=90`, volume 0,12) + ruído rosa (`amplitude=0.08`), via `amix ... normalize=0,alimiter`;
    fala −14,9 dB RMS contra ruído −22,7 dB RMS ⇒ **SNR ≈ 8 dB**;
  - `fast` — `say -r 250` (fala ~55 % mais rápida que o padrão da voz).
- ⚠️ **TTS é proxy otimista:** dicção perfeita, sem sotaque, sem fala sobreposta, sem silêncio longo, sem o microfone
  do celular. O README do pacote registra loop de repetição de `small`/`base` **em áudio real de celular** — que este
  proxy não reproduziu. **A qualidade real em pt-BR com ruído de cabine continua risco aberto para a T6.3**, em staging,
  com áudio gravado no app com consentimento de quem fala.

### Comandos

```sh
# imagem do spike (Dockerfile no scratchpad: estágio Alpine compila whisper-cli; runtime = oven/bun:1.3.14-alpine
# + apk add ffmpeg libstdc++ libgomp time)
docker build -f Dockerfile.local -t spike-whisper-264:local .        # 61 s, compilação do whisper-cli incluída

# por modelo, os 12 áudios (o mesmo par de chamadas do pacote: ffmpeg → WAV 16 kHz mono, whisper-cli com as flags
# de createWhisperLocalTranscriber)
docker run --rm --cpus=8 --memory=8g -v audio:/audio:ro -v models:/models:ro ... spike-whisper-264:local \
  /scripts/bench.sh <modelo> 7 /audio /models /out <clips...>
#   bench.sh, por áudio:
#   /usr/bin/time -f "%e %M" ffmpeg -nostdin -loglevel error -i X.ogg -ar 16000 -ac 1 -y a.wav
#   /usr/bin/time -f "%e %M" whisper-cli --model ggml-<m>.bin --file a.wav --no-timestamps --language pt \
#     --max-context 0 --output-txt --output-file <saida> --threads 7

# erro de palavras: Levenshtein por palavra contra o texto-fonte, minúsculas, sem pontuação, hífen = espaço,
# "3"→"três" e "6"→"seis"; "maior repetição" = maior número de repetições consecutivas de um n-grama (1–8 palavras);
# "maior trecho perdido" = maior sequência do texto-fonte que sumiu da saída
python3 -I score.py audio out/local
```

A saída do `whisper-cli` foi medida **crua**, antes do `collapseRepetitions` do pacote — loop aqui é loop do modelo.

### Resultados por modelo

Fator de tempo real = (ffmpeg + whisper) ÷ duração. RSS = pico do processo `whisper-cli` (GNU `time %M`); o ffmpeg ficou
em 43–45 MB em todos.

| modelo                | áudio      | duração (s) | ffmpeg (s) | whisper (s) | fator de tempo real | RSS pico (MB) | erro de palavras | maior repetição | maior trecho perdido |
| --------------------- | ---------- | ----------: | ---------: | ----------: | ------------------: | ------------: | ---------------: | --------------: | -------------------: |
| `base`                | d010-clean |          14 |       0,19 |         1,7 |                0,14 |           283 |            8,3 % |               1 |                    1 |
| `base`                | d010-noise |          14 |       0,06 |         1,2 |                0,09 |           283 |            8,3 % |               1 |                    1 |
| `base`                | d060-clean |          60 |       0,17 |         4,3 |                0,07 |           288 |            7,5 % |               1 |                    1 |
| `base`                | d060-noise |          60 |       0,17 |         4,1 |                0,07 |           288 |           17,0 % |               1 |                    3 |
| `base`                | d120-clean |         120 |       0,50 |         8,4 |                0,07 |           294 |            4,8 % |               1 |                    1 |
| `base`                | d120-noise |         120 |       0,34 |        10,2 |                0,09 |           294 |           18,1 % |               1 |                   20 |
| `base`                | d120-fast  |          89 |       0,38 |         8,1 |                0,10 |           291 |            3,8 % |               1 |                    1 |
| `base`                | d300-clean |         317 |       1,28 |        24,3 |                0,08 |           312 |            9,2 % |               1 |                   35 |
| `base`                | d300-noise |         317 |       1,23 |        21,4 |                0,07 |           312 |           23,4 % |               1 |                   82 |
| `base`                | d300-fast  |         234 |       0,83 |        15,2 |                0,07 |           305 |           31,2 % |               1 |              **210** |
| `small-q5_1`          | d010-clean |          14 |       0,12 |         7,0 |                0,52 |           463 |            0,0 % |               1 |                    0 |
| `small-q5_1`          | d010-noise |          14 |       0,08 |         6,5 |                0,48 |           463 |           11,1 % |               1 |                    2 |
| `small-q5_1`          | d060-clean |          60 |       0,31 |        24,8 |                0,42 |           467 |            6,9 % |               1 |                    6 |
| `small-q5_1`          | d060-noise |          60 |       0,23 |        29,6 |                0,50 |           467 |            2,5 % |               1 |                    1 |
| `small-q5_1`          | d120-clean |         120 |       0,44 |        32,5 |            **0,27** |           473 |            3,5 % |               1 |                    6 |
| `small-q5_1`          | d120-noise |         120 |       0,66 |        33,4 |            **0,28** |           473 |            7,6 % |               1 |                    6 |
| `small-q5_1`          | d120-fast  |          89 |       0,93 |        31,4 |                0,36 |           470 |            2,2 % |               1 |                    3 |
| `small-q5_1`          | d300-clean |         317 |       1,36 |       122,7 |                0,39 |           498 |            4,3 % |               1 |                    6 |
| `small-q5_1`          | d300-noise |         317 |       1,32 |        72,7 |                0,23 |           496 |            6,6 % |               1 |                    6 |
| `small-q5_1`          | d300-fast  |         234 |       1,24 |        76,3 |                0,33 |           483 |            1,9 % |               1 |                    3 |
| `small`               | d010-clean |          14 |       0,11 |         6,7 |                0,50 |           753 |            0,0 % |               1 |                    0 |
| `small`               | d010-noise |          14 |       0,08 |         4,6 |                0,35 |           751 |            5,6 % |               1 |                    0 |
| `small`               | d060-clean |          60 |       0,22 |        14,7 |                0,25 |           754 |            6,3 % |               1 |                    6 |
| `small`               | d060-noise |          60 |       0,28 |        16,6 |                0,28 |           755 |            5,0 % |               1 |                    6 |
| `small`               | d120-clean |         120 |       0,49 |        31,7 |            **0,27** |           760 |            3,2 % |               1 |                    6 |
| `small`               | d120-noise |         120 |       0,43 |        43,0 |            **0,36** |           761 |            7,0 % |               1 |                    6 |
| `small`               | d120-fast  |          89 |       0,39 |        28,6 |                0,33 |           757 |            2,2 % |               1 |                    3 |
| `small`               | d300-clean |         317 |       1,78 |        67,7 |                0,22 |           779 |            4,1 % |               1 |                    6 |
| `small`               | d300-noise |         317 |       1,31 |        68,2 |                0,22 |           779 |            5,8 % |               1 |                    5 |
| `small`               | d300-fast  |         234 |       0,90 |        49,4 |                0,21 |           771 |            2,0 % |               1 |                    3 |
| `large-v3-turbo-q5_0` | d010-clean |          14 |       0,08 |        16,6 |                1,22 |           793 |            0,0 % |               1 |                    0 |
| `large-v3-turbo-q5_0` | d010-noise |          14 |       0,07 |        17,4 |                1,28 |           793 |            2,8 % |               1 |                    0 |
| `large-v3-turbo-q5_0` | d060-clean |          60 |       0,30 |        56,9 |                0,95 |           798 |            7,5 % |               1 |                    6 |
| `large-v3-turbo-q5_0` | d060-noise |          60 |       0,26 |        56,6 |                0,95 |           798 |            5,0 % |               1 |                    6 |
| `large-v3-turbo-q5_0` | d120-clean |         120 |       0,55 |        94,0 |            **0,79** |           805 |            7,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-noise |         120 |       0,99 |       132,9 |            **1,11** |           805 |            7,3 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d120-fast  |          89 |       0,56 |       132,6 |                1,50 |           802 |            1,6 % |               1 |                    3 |
| `large-v3-turbo-q5_0` | d300-clean |         317 |       2,11 |       373,4 |                1,18 |           827 |            6,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d300-noise |         317 |       1,20 |       222,5 |                0,70 |           827 |            6,6 % |               1 |                   16 |
| `large-v3-turbo-q5_0` | d300-fast  |         234 |       0,99 |       185,7 |                0,80 |           818 |            4,9 % |               1 |                   23 |
| `large-v3-turbo`      | d010-clean |          14 |       0,08 |        28,8 |                2,12 |         1 802 |            0,0 % |               1 |                    0 |
| `large-v3-turbo`      | d060-noise |          60 |       0,31 |        79,5 |                1,33 |         1 807 |            5,0 % |               1 |                    6 |
| `large-v3-turbo`      | d120-clean |         120 |       0,48 |       133,9 |            **1,12** |         1 814 |            7,3 % |               1 |                    8 |
| `large-v3-turbo`      | d120-noise |         120 |       0,48 |        94,1 |            **0,79** |         1 815 |            7,3 % |               1 |                   16 |
| `large-v3-turbo`      | d120-fast  |          89 |       0,33 |        78,8 |                0,89 |         1 810 |            1,6 % |               1 |                    3 |
| `large-v3-turbo`      | d300-noise |         317 |       1,55 |       251,1 |                0,80 |         1 836 |            6,6 % |               1 |                   16 |

(`base`: as variantes `d010-fast`/`d060-fast` deram 8,3 %/3,8 %, sem loop; `large-v3-turbo` só rodou seis áudios por
tempo de máquina — os mais longos e os com ruído.)

### Conferência à mão (amostra)

Diferenças palavra a palavra lidas uma a uma em `d120-clean`, `d120-noise`, `d300-noise` e `d300-fast`:

- **Nenhum loop** em nenhum modelo (maior repetição = 1). O modo de falha que apareceu foi outro: **janela engolida** —
  o decodificador troca 30 s de fala por uma alucinação curta ("música de fundo", "obrigada", "ouço").
  - `base` perdeu **210 palavras seguidas** em `d300-fast` (canhoto molhado, coleta, portaria, lacre — trocados por
    "música fundo ouço"), 82 em `d300-noise`, 20 em `d120-noise`; e troca termos do domínio ("ocorrência" →
    "opóvencia", "canhoto" → "outra nota", "carregada" → "acarrigada"). **Inútil para o caso.**
  - `large-v3-turbo` e `-q5_0` erram pouca palavra, mas **engolem frases inteiras** (16–23 palavras: "da última vez eu
    fiquei esperando quase a tarde inteira porque a carga não estava separada" → "obrigada"; "ele conferiu tudo, olhou
    o lacre" sumiu).
  - `small` e `small-q5_1` perdem no máximo 6 palavras (o mesmo trecho em todos os modelos, "enquanto isso eu vou
    adiantando a", fronteira de janela) e erram por **fonética**: "canhoto" → "canoto", "doca" → "dota", "porta" →
    "cota", "multa" → "luta", "almoxarifado" → "almocharifado/almoçarifado", "combino" → "convinho". Erros que um leitor
    corrige pelo contexto, com o áudio ao lado (183 D8) — mas "multa → luta" muda sentido.
- **Erro de palavras na amostra com ruído (SNR ≈ 8 dB):** `base` 17–23 %, `small-q5_1` 2,5–7,6 %, `small` 5,0–7,0 %,
  `large-v3-turbo(-q5_0)` 5,0–7,3 %. Com o proxy TTS, `small`/`small-q5_1` empatam com o turbo e não engolem frase.

### Canhoto ao lado (impacto na rotina vizinha)

Proxy de `trip.canhoto.read`: uma thread JS de CPU pura (`load.ts` com `bun`: laço sobre 256 KB + `sha256`, contando
operações/s — a decodificação do zxing roda numa única `worker_thread`), no mesmo contêiner de 8 CPUs, sozinha e durante
a transcrição de `d120-noise` com `--threads 7`:

| situação             | proxy do canhoto (op/s) | transcrição de 2 min |
| -------------------- | ----------------------: | -------------------: |
| sozinho (antes)      |                   541,4 |                    — |
| durante `small-q5_1` |           477,3 (−12 %) |  38,7 s (era 34,1 s) |
| durante `small`      |           482,7 (−11 %) |  35,3 s (era 43,4 s) |
| sozinho (depois)     |                   559,8 |                    — |

Com 7 threads de whisper em 8 CPUs a rotina vizinha perde ~11–12 % de vazão — não para. Medida em ARM disputado; o
número do EPYC fica para o Railway.

### Teto do serviço e RAM (critério iv)

- Worker (Railway, `get-service-metrics`, 168 h): **limite 8 vCPU / 8 GB** em staging e em produção; memória média
  0,20–0,22 GB, pico 0,47 GB (amostra de 60 s, produção) e 0,59 GB (amostra horária, staging). CPU média 0,04–0,06 vCPU.
- Teto de 70 % = 5,6 GB. Base do worker 0,6 GB + ffmpeg 0,05 GB + whisper: `base` 0,31 · `small-q5_1` 0,50 ·
  `small` 0,78 · `turbo-q5_0` 0,83 · `turbo` 1,84 GB ⇒ pior caso **2,5 GB = 31 %**. **Todos cumprem (iv)**, e um áudio
  por vez segura isso.

### Imagem e build (medidos localmente, arm64)

- Camada `apk add ffmpeg libstdc++ libgomp` sobre `oven/bun:1.3.14-alpine`: **107 MB** (descompactado); `whisper-cli`:
  **2,8 MB**; modelo: o tamanho do arquivo. Acréscimo à imagem do worker: `small-q5_1` ≈ **+291 MB**, `small` ≈ +598 MB,
  `turbo-q5_0` ≈ +684 MB, `turbo` ≈ +1,73 GB.
- Build do estágio do `whisper-cli` (clone raso + cmake, 11 CPUs): **61 s**. No builder do Railway: não medido.

### Cadência do agendador

Não é medida, é o código: `JOB_TICK_INTERVAL_SECONDS = 300` (`apps/worker-transportada/src/shared/job-catalog.constant.ts:11`,
"nada corre mais fino que ela"), disparada pelo serviço `cron` com `cronSchedule: '*/5 * * * *'` — e o cron do Railway
não aceita menos de 5 min. **Cadência = 5 min**, caso previsto no plano § d ("se o agendador só der 5 min, a T0.2
registra e a spec aceita"). Latência no pior caso ≈ 5 min + fila + processamento.

### Leitura contra o critério fechado (só a medida local)

| modelo                | (i) loop | (ii) erro de palavras                                  | (iii) fator ≤ 1 em 2 min (M3, disputado) | (iv) RAM ≤ 70 % |
| --------------------- | -------- | ------------------------------------------------------ | ---------------------------------------- | --------------- |
| `base`                | nenhum   | **reprova** — 17–23 % com ruído, 210 palavras perdidas | 0,07–0,10                                | 0,9 GB — ok     |
| `small-q5_1`          | nenhum   | 2,5–7,6 %, perda ≤ 6 palavras                          | 0,27–0,36                                | 1,1 GB — ok     |
| `small`               | nenhum   | 5,0–7,0 %, perda ≤ 6 palavras                          | 0,27–0,36                                | 1,4 GB — ok     |
| `large-v3-turbo-q5_0` | nenhum   | 5,0–7,6 %, mas engole frases (16–23)                   | **0,79–1,50 — no limite já no M3**       | 1,5 GB — ok     |
| `large-v3-turbo`      | nenhum   | 5,0–7,3 %, mas engole frases (8–16)                    | **0,79–1,12 — no limite já no M3**       | 2,5 GB — ok     |

**Candidato local: `small-q5_1`** — o menor que passa (i)–(iv) na medida local, com folga de ~3× no fator de tempo
real. Os dois turbo ficam no limite de (iii) **já numa CPU mais rápida que a do Railway**; a medida no EPYC tende a
reprová-los. **Não é escolha**: (iii) só fecha no runner do Railway, que não foi medido.

### O que NÃO foi medido, e por quê

1. **Tudo no Railway** — `create-service` negado pelo classificador de permissões; a task manda parar, não contornar:
   fator de tempo real no EPYC x86 (o número que decide (iii)), RAM de pico pelo `get-service-metrics`, tamanho da
   imagem no registry, tempo de build e de deploy no Railway, impacto real no canhoto, modelo de CPU e flags
   (AVX2/AVX-512) do runner. O contexto de build pronto ficou no scratchpad da sessão (Dockerfile x86 com
   `-DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON`, os cinco modelos baixados no build com
   `sha256sum -c`, os áudios TTS, `bench.sh`, `load.ts` e `run.sh` que imprime tudo no log e dorme) — basta autorizar a
   criação do serviço.
2. **Custo do spike:** zero — não houve serviço. Estimativa para quando rodar (preço público do Railway, a conferir na
   fatura): ~1 h com 8 vCPU e ~2 GB ≈ US$ 0,25.
3. **Áudio real** (voz humana, sotaque, celular, cabine de verdade): proibido usar áudio de cliente e não há gravação
   consentida ainda. Fica para a **T6.3** em staging; é lá que o aviso do README sobre loop em `small` com áudio de
   celular se confirma ou cai.
4. **Fator de tempo real limpo:** a máquina ficou com carga 12–18 durante toda a medida; não havia como isolá-la sem
   derrubar trabalho de outras sessões.
5. **Volume do Railway como alternativa à imagem** (plano § d): depende do Railway.
6. **Mac nativo com `/usr/bin/time -l`:** substituído pelo GNU `time` dentro do contêiner Alpine, que é a mesma base do
   worker; o `whisper-cli` do Homebrew usa Metal e mediria a GPU do laptop, não o caso.
7. **`--threads` diferente de 7:** não variado.
