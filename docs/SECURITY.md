# Achados de segurança

Achado não vive no histórico de conversa: entra aqui com data, dono e desfecho. Item resolvido não
some — muda para "Fechado" com a data e o que passou a valer.

## Abertos

**Onde:** `api-transportada`, `contractor-portal/presentation/contractor-occurrence.routes.ts`
(`GET /client/me/occurrences`, `POST /client/me/occurrences/:id/decision`); `identity/domain/
authorization.policy.ts` (`occurrences.decide` no papel `contractor`, `occurrences.resolve` em
`company-admin`/`operator`/`finance`); `delivery-clients/application/occurrence-statement.use-case.ts`

- `presentation/occurrence-statement.routes.ts` (`GET /extra-charge-batches/:id/statement`).

**O que é:** três coisas novas no mesmo pacote de risco de sempre — superfície pública que decide
dinheiro/logística, permissão nova cujo escopo precisa ser revisitado quando o produto crescer, e um
artefato com dado pessoal que sai do controle do sistema assim que é baixado.

1. **Superfície externa nova.** O portal ganha uma segunda decisão do contratante (a primeira é
   `charges.decide`, spec 060): autorizar reentrega, marcar pagamento de produto ou registrar outra
   solução, com nota livre de até 2000 caracteres. A rota lê o escopo da conta (`ContractorScope`,
   ADR-0050 §4) e a listagem é `inner join` com `trip_occurrence_cases` filtrando por status
   (`test/*-schema/tenant-safety.contract.ts` cobre o vazamento cruzado); o risco que fica é o mesmo
   de toda superfície do portal — texto livre do contratante grava direto em `decision_note`, sem
   sanitização de HTML/script, porque hoje ele só é lido de volta pela transportadora numa tela
   interna (nunca renderizado para outro contratante). Se um dia esse texto for exibido a um terceiro,
   sanitizar antes.
2. **Duas permissões novas.** `occurrences.decide` (só no papel `contractor`, nunca em papel interno —
   D6) e `occurrences.resolve` (`company-admin`, `operator`, `finance`; nunca `separator`, que registra
   a própria ocorrência — D7, autoaprovação seria o mesmo modo de falha que a ADR-0067 fechou).
   `test/separator-role.contract.test.ts` reprova se alguma rota de `occurrences.resolve` aparecer
   como alcançável pelo separador. Nenhuma das duas herda de permissão existente — revisar de novo
   quando o catálogo de papéis mudar.
3. **A evidência sai em PDF e fica com quem baixou.** `GET /extra-charge-batches/:id/statement`
   (`trip.financials`) devolve o demonstrativo com as fotos da ocorrência embutidas — depois do
   download, o arquivo está fora do alcance do expurgo e de qualquer controle de acesso do produto.
   O artefato em si é imutável e gerado uma vez (D14), mas **quem baixa vira dono de uma cópia sem
   prazo de descarte**, exatamente como qualquer PDF de fatura hoje. Sem controle novo além do que já
   existe para `invoice-pdf.gateway.ts`.

**Segundo motivo da retenção de cinco anos (spec 161 D9, ampliado pela D15 desta spec):** a foto da
ocorrência deixou de ser só guarda fiscal e janela de rediscussão — agora é **anexo de uma cobrança**
(`delivery_charges.origin = 'occurrence'`). Enquanto o demonstrativo daquele período for contestável,
a imagem que o sustenta precisa sobreviver ao mesmo prazo que a cobrança. Os cinco anos continuam
cobrindo os dois motivos ao mesmo tempo — não há prazo próprio da cobrança correndo em paralelo — e o
expurgo do worker segue apagando de verdade ao fim da janela; a leitura do demonstrativo já sai com o
selo "foto expirada (retenção de 5 anos)" para a foto vencida, nunca com imagem quebrada nem
escondendo a cobrança (`occurrence-statement-layout.policy.ts`, `resolveEvidence`).

**Nenhum log carrega PII dos caminhos novos:** `grep -rn "logger\.\|console\." $(git diff
main...HEAD --name-only -- 'src/**occurrence*' 'src/delivery-clients/**')` não bate em nenhum dos 77
arquivos tocados pela spec — a rota, os casos de uso e os repositórios não logam nota, observação,
nome de produto nem dado de motorista; erros de domínio (`occurrence-charge.policy.ts`,
`occurrence-settlement.policy.ts` etc.) também não embutem esses campos na `message` do `ApiError`
(mesma varredura, filtrando por `note|observ|driver|motorista|product|payer` em `message:`, zero
resultado). O que chega ao `http_request_failed` é código e status, nunca o texto do contratante nem
o valor do acerto.

**Origem:** spec 164, T29 (revisão final da Fase 7). Registrado em 2026-09-22.

### 2026-09-25 — o microfone passa a ser permitido à própria origem no painel (spec 183 T705)

**Onde:** `frontend-transportada`, `server.ts` (`SECURITY_HEADERS`) e
`shared/contentSecurityPolicy.service.ts` (`media-src`).

**O que é:**

- O cabeçalho passa a `camera=(self), geolocation=(self), microphone=(self)`. O operador e o
  motorista gravam áudio na conversa da ocorrência (RF17, P9). O pedido de mudança foi feito e o
  usuário autorizou em 25/09/2026.
- `media-src` ganha `blob:`, para ouvir a gravação antes de enviar.

**O que continua fechado:**

- O **portal da contratante** segue `microphone=()`. O contrato de lá varre `src/` e falha se
  aparecer `getUserMedia` ou `MediaRecorder`.
- No painel, `(self)` não é `*`: nenhum iframe herda o microfone.

**O que a decisão limita:**

- O microfone só abre no clique em "Gravar áudio", e a trilha é parada ao terminar ou ao sair da
  tela.
- A gravação para sozinha em 5 min.
- O áudio só existe como anexo enviado: sobe por URL assinada, é conferido pelos bytes (assinatura
  OGG/MP4/WEBM) e vai para o bucket privado com a mesma retenção dos anexos.
- Nada é gravado sem o operador ouvir e escolher "Usar áudio".

**O que falta:** nada em aberto. O contrato de cabeçalhos exige `(self)` exato (falha com `*` ou com
origem de terceiro), e o da CSP exige `media-src 'self' blob:` mais só o bucket.

**Origem:** spec 183 T705.

### 2026-09-22 — foto de ocorrência vinda do WhatsApp entra sem reencode: EXIF/GPS preservado e sem miniatura (spec 161, risco aceito)

**Onde:** `api-transportada`, `whatsapp-commands` (T13, `registerOccurrence` em `src/main.ts`), que
chama `persistSeparationOccurrenceWithAttachment` com o **arquivo bruto** baixado da Meta; a mesma
rota, pelo canal web (T21–T22), reencoda no navegador antes de subir (`occurrencePhotoImage.service.ts`
— ≤ 1600 px / ≤ 400 KB, sem EXIF, com miniatura).

**O que é (risco aceito):** a foto anexada pelo operador no canal web tem EXIF removido e miniatura
gerada no cliente, mas a foto que chega pelo WhatsApp é o `mediaBytes` que a Meta entrega, sem
nenhum reprocessamento no servidor — grava com `purpose = trip_occurrence_attachment` e **sem**
`thumbnail_object_id` (D14). Dois efeitos: (1) metadado EXIF do aparelho do operador — que pode
incluir GPS, data/hora e modelo do aparelho — é preservado e servido junto com a foto por quem tiver
acesso ao presigned URL; (2) sem miniatura, as três telas (painel da nota, detalhe da ocorrência,
feed) caem para o original em resolução cheia, pesando mais a listagem.

**Por que foi aceito assim:** reencodar/stripar EXIF e gerar miniatura no servidor exigiria uma
biblioteca de imagem nativa (`sharp` é a referência) — binário nativo por plataforma (risco de
compatibilidade com Bun), superfície de CVE de decodificador de imagem exposta a arquivo de origem
externa (a Meta, não o operador autenticado), e custo de CPU no caminho de um webhook que já processa
mídia de terceiro. O produto optou por não acrescentar essa dependência nesta spec; o caminho do
canal web (reencode no navegador, de quem já está autenticado e no dispositivo) cobre o caso mais
comum.

**O que limita o estrago:** o bucket é privado, presigned URL de 5 minutos (`security.md` §7); só
quem tem `trip.manage`/`trip.report-on-behalf`/o próprio motorista vê a ocorrência. O expurgo de
cinco anos (achado acima) se aplica igual às duas origens.

**O que falta:** se o volume de uso do canal WhatsApp crescer, revisitar com `sharp` (ou equivalente
sem binário nativo) atrás de um sandbox/timeout, ou mover o reencode para um passo assíncrono no
worker em vez do caminho síncrono do webhook.

**Origem:** spec 161, T13 e revisão de arquitetura da Fase 5 (`opus`, ajuste 6). Registrado em
2026-09-22.

### 2026-09-22 — retenção de cinco anos da foto de ocorrência de separação: rotina existe, prova ponta-a-ponta pendente (spec 161)

**Onde:** `api-transportada`, `trips/domain/occurrence-attachment.policy.ts`
(`OCCURRENCE_ATTACHMENT_RETENTION_YEARS = 5`, `resolveOccurrenceAttachmentRetentionUntil`);
`worker-transportada`, `trip-occurrence-attachment-purge/` (rotina `trip.occurrence-attachment.purge`,
T17/T18).

**Atualizado em 22/09/2026 (Fase 5, T17/T18): a rotina de expurgo passou a existir.** A varredura
consultada pelo índice parcial `stored_objects_purpose_retention_idx` apaga bytes (original e
miniatura, na mesma unidade de trabalho) e marca `stored_objects.status = 'deleted'`/`deleted_at` no
mesmo `UPDATE`, além de remover a linha de `trip_document_occurrence_attachments`; objeto órfão
(sem linha de anexo) é apagado e marcado sozinho. Registrada nas quatro apps
(`job-catalog.constant.ts`) e agendada por `drizzle/20260922112706_trip_occurrence_attachment_purge_job`
(`minimumIntervalSeconds: 86_400`). Prova: `test/trip-occurrence-attachment-purge.contract.test.ts`
(17 casos — ordem das operações com portas falsas, órfão, convergência com objeto ausente, laço,
teto de lotes, teto de falhas de storage seguidas).

**O que continua aberto:** a T19 (integração contra Postgres + RabbitMQ + MinIO reais, via `make
worker-integration`) não rodou — o Docker está fora do ar na máquina onde a Fase 5 foi implementada.
É o único gate que prova que os bytes **de fato** saem do bucket; os testes de contrato substituem o
storage por porta falsa. Até a T19 rodar contra infraestrutura real, o comportamento fim-a-fim segue
não verificado, embora a lógica esteja coberta por contrato.

**Dado pessoal guardado:** a foto da ocorrência (galpão) pode conter placa, rosto, documento ou
qualquer coisa que apareça no enquadramento — dado pessoal guardado além da finalidade declarada
(LGPD, art. 6º, minimização e necessidade) até o expurgo confirmado rodar contra o ambiente real.

**Origem:** spec 161, revisão final (achado I6, 2026-09-22) e Fase 5 (T17/T18, 22/09/2026).

### 2026-09-25 — a app do motorista guarda a última viagem no aparelho, para abrir sem rede (spec 189)

**Onde:** `frontend-driver`, IndexedDB `transportada.driver-trip` versão 3, store `trip-snapshot`
(`src/modules/driver-trip/shared/tripSnapshot.service.ts`, `indexedDbQueue.service.ts`), e as filas
`field-reports`/`event-attachments` do mesmo banco; boot em `src/main.tsx` (ADR-0075 §8, plan D4/D5).

**O que é (risco aceito):** para o motorista abrir a viagem no subsolo, sem sinal e antes do
Keycloak responder, a app grava o último `GET /me/trips/current` no aparelho. Ele carrega dado
pessoal de terceiro e dado comercial — nome do destinatário, rótulo e coordenadas das paradas,
número, chave de acesso (`accessKey`) e valor (`totalAmount`) das notas, e a placa do veículo
(`vehiclePlate`) — e fica legível por quem tiver o celular desbloqueado e abrir as ferramentas do
navegador. A fila offline (`field-reports`/`event-attachments`) guarda ainda a posição de cada
toque, a foto e a assinatura do comprovante e o documento e o nome de quem recebeu
(`receiverDocument`/`receiverName`). Sem rede, a app mostra esse snapshot **sem token**: a leitura
não passa pelo Keycloak, só pela posse do aparelho.

**Como está contido:**

- **Dono.** A chave é `SHA-256(sub)` em hex (`crypto.subtle`); o `sub` em si não é gravado. O
  ponteiro `last` diz de quem é o snapshot que o boot sem rede pode abrir.
- **Descarte.** Sai quando outro `sub` autentica no aparelho, quando passa de **24 h** de
  `savedAt`, quando nenhuma viagem da resposta está aberta (todas `completed`/`cancelled`, ou lista
  vazia) e no "Sair". O vencido é apagado na própria leitura do boot.
- **Fila com dono.** Cada evento e cada anexo enfileirado leva o mesmo `subHash`. A drenagem só
  envia os do `sub` autenticado — nem o envio manual manda item de outra conta —, e o que é de outra
  conta aparece como "pendências de outra conta", com "Descartar" e aviso. Nunca sai com o token de
  quem não tocou.
- **Sem token no aparelho.** O snapshot não guarda token nem refresh token; a drenagem fica
  suspensa até haver sessão. Os anexos seguem com o descarte de 7 dias da spec 159, e desde a spec
  189 T9.2 os eventos parados também (`discardStaleAttachments` com a fila de eventos, pelo
  `createdAt`), levando junto os anexos pendurados neles.
- **"Sair" com pendência própria.** Antes de sair, a app avisa "N registros seus ainda não
  subiram" e oferece "Enviar agora" (com sessão) ou "Descartar e sair" — o descarte
  (`queueOwner.service.ts:discardOwnPending`) apaga evento, blob, documento e nome do recebedor e
  posição, só do dono. Sem rede, o logout do Keycloak rejeita e a app recarrega para "sem viagem
  salva" (`signOut.service.ts`). ⚠️ Nesse caso a sessão SSO do Keycloak continua viva até o próximo
  logout com rede: o snapshot e a fila já saíram, mas quem abrir a app com rede entra sem senha.
- **Retirada do consentimento de posição que falhou (risco aceito).** Desligar o interruptor para o
  GPS e o envio **na hora**, antes da resposta do `PUT /me/location-consent`
  (`useLocationConsent.hook.ts`, `isRevokeFailed`). Se o `PUT { accepted: false }` não chega ao
  servidor, a tela avisa ("Não foi possível salvar a sua escolha") e oferece tentar de novo — mas
  a marca de falha vive só em memória: ao recarregar a app, o servidor ainda diz `acceptedAt`, o
  interruptor volta ligado e a posição volta a subir. O motorista vê o interruptor ligado no
  Perfil e o indicador na tela da viagem; o conserto é desligar de novo com rede.
- **"Confirmar em lote" (decisão do usuário, spec 189 T9.2).** Sem rede, a posse do celular basta
  para registrar em nome de quem usou por último — "Cheguei", "Entreguei", "Devolvi", ocorrência e
  foto. Tudo o que é gravado com `canSync: false` sai marcado `isUnverified` (evento e anexo), e a
  drenagem **não** o envia, nem pelo "Enviar agora". Depois de autenticar, o dono vê "N registros
  feitos sem rede às HH:MM — enviar?": um toque tira a marca e drena
  (`unverifiedPending.service.ts:confirmUnverifiedPending`); "Descartar", com confirmação, apaga
  evento, blob, documento do recebedor e posição, e o anexo pendurado num evento descartado vai
  junto (`discardUnverifiedPending`). Quem autentica com outro `sub` vê esses itens como pendência
  de outra conta, nunca como seus.
- **Só na origem da app.** O IndexedDB é da origem `motorista.<zona>`; nada disso vai para log, URL
  ou beacon.

**O que falta:** o snapshot e a fila ficam em texto claro no IndexedDB (sem criptografia em repouso
no aparelho — a chave teria de morar no mesmo aparelho, e só adiaria quem já tem o celular
desbloqueado). Se o produto passar a guardar mais do que a viagem corrente, revisitar.

**Origem:** spec 189 T3.3a (boot sem rede, snapshot e fila com dono). Registrado em 2026-09-25.

### 2026-09-18 — posição e horário da foto do comprovante são declarados pelo aparelho (spec 159)

**Onde:** `api-transportada`, `POST /me/trips/current/documents/:documentId/proof` (multipart
`latitude`, `longitude`, `accuracyMeters`, `capturedAt`) e a nota do motorista que deriva deles
(ADR-0070); `frontend-transportada`, fila offline de anexos do PWA (IndexedDB).

**O que é (risco aceito):** a pontualidade da foto (`on_time`/`late`/`away`) sai de dados que o
**cliente declara**. Um aparelho adulterado pode mandar a coordenada da parada e um `capturedAt`
plausível sem estar lá. O servidor limita o que dá: `capturedAt` só vale dentro de
`[max(entrega − 2 min, recebimento − missingAfterHours), recebimento + 2 min]`, a precisão soma ao
raio no máximo um raio e acima de 10 km é recusada, a foto substituta nunca melhora a pontualidade, e
a foto sem posição conta como longe. Não há atestado do aparelho (Play Integrity/App Attest) nem
checagem de EXIF — a nota é sinal de gestão, não prova. A decisão foi do usuário na spec 159.

**Dado pessoal guardado:** a posição da foto é dado de localização (LGPD). Ela não entra em log nem
em resposta (a ficha mostra só motivo, pontos e datas) e cai aos 90 dias pelo expurgo
`trip.location.purge` do worker (latitude, longitude e precisão; `captured_at` fica). O `params:` do
`DrizzleQueryError` é apagado antes de sair para o Sentry. **Resta:** a fila offline do PWA guarda a
foto **com a posição** no IndexedDB do aparelho até conseguir subir — sem prazo de descarte no
aparelho e legível por quem tiver o celular desbloqueado.

**O que falta:** prazo de descarte da fila offline no PWA (apagar anexo parado há mais de
`missingAfterHours`, ou ao sair da conta); avaliar atestado do aparelho se a nota passar a pesar em
dinheiro. Limitação conhecida da atribuição: o evento de entrega anterior à T11, sem
`reported_by_driver_id`, ainda acha o motorista pelo vínculo atual da conta — se o acesso ao app for
desligado, essa parte do histórico some da ficha (as entregas novas não dependem mais do vínculo).

**Origem:** spec 159, revisão T11 (achados de segurança sobre posição e tenant). Registrado em
2026-09-18.

### 2026-09-18 — a linha do tempo junta nomes, motivo de devolução e nota de ocorrência numa leitura só

**Onde:** `GET /trips/:id/timeline` (spec 158), política `TRIP_FIELD_READ_POLICY` (`fleet.read` ou
`trip.report-on-behalf`).

**Achado (B1 da revisão da T9):** o `finance` e o separador passam a ver, numa lista só, o nome de
quem registrou cada evento, o do motorista em nome de quem o escritório agiu, o motivo de devolução
e o texto livre da ocorrência — que pode trazer dado pessoal de destinatário digitado no campo. Cada
campo já saía para a mesma política em `GET /trips/:id` e em `…/documents/:documentId/occurrences`;
a diferença é de agregação, não de alcance. Do motorista só sai o nome (spec 156 D11).

**Decisão:** aceito. A resposta nunca traz id de usuário, recebedor, coordenada, chave de storage
nem XML (aceite 8, validador estrito no front), e a nota não vai ao portal do contratante.

**Achado relacionado (B2):** `trip_status_events.actor_user_id` não tem FK de membership (ADR-0068
§1, para não travar a remoção de usuário). O ator vem sempre do contexto autenticado e o canal é
decidido na composição, nunca pelo cliente; a leitura só resolve nome por membership escopado pela
empresa. Aceito, com o risco residual de um escritor futuro gravar id errado sem erro do banco.

**Dono:** time da API. **Origem:** revisão de segurança da T9 da spec 158.

### 2026-09-16 — chave de envio do Resend e senha do SMTP expostas em conversa

**Onde:** worker de produção no Railway — `RESEND_API_KEY` (referenciada da chave que o operador
mantém como `RESEND_TRANSPORTADORA_FERNANDES_API_KEY`) e a senha da caixa
`nao-responda@fernandes-transportadora.com.br` no `SMTP_URL`.

**O que é:** ao destravar o envio de convite por e-mail, a chave do Resend e a senha do SMTP foram
escritas em texto numa sessão de assistente de código, e parte de uma senha anterior apareceu em saída
de terminal. Pela regra deste repositório, segredo que passa por terminal ou log está queimado.
A decisão do dono foi manter a chave em produção para liberar os convites agora.

**O que falta:** gerar chave nova no Resend (só envio, domínio `fernandes-transportadora.com.br`),
gravar no worker de produção e revogar a antiga; trocar a senha da caixa `nao-responda@` no Zoho (ou
remover o `SMTP_URL`, já que com `RESEND_API_KEY` o worker não usa mais SMTP). Tirar a chave do
`~/.zshrc` local, onde fica em texto puro.

**Origem:** incidente de convites que não chegavam, 2026-09-16.

### 2026-09-16 — quatro rotas novas da spec 152 sem rate limit dedicado (T14 item 6)

**Onde:** `api-transportada`, `nfe-documents/presentation/package-box.routes.ts` e
`package-box-measurement-export.routes.ts` (spec 152, medida de caixa pela câmera).

**O que é:** as quatro rotas novas —
`GET /nfe-package-boxes/measurement-settings`, `GET /nfe-package-boxes`,
`PUT /nfe-package-boxes/:id` (as três sob `cargo.measure`) e
`GET /nfe-package-box-measurements` (sob `settings.manage`, export do histórico) — não declaram
`rateLimit: { store: 'postgres', scope, maxRequests, windowSeconds }`, o padrão que
`contractor-mail` já usa (spec 150 T406) e que `test/rate-limited-routes.contract.test.ts` cobra.
Todas exigem autenticação e permissão de empresa (nunca são anônimas), então o risco é abuso por um
usuário autenticado — não enumeração nem custo externo direto —, mas `PUT /nfe-package-boxes/:id`
grava linha de histórico a cada chamada (`nfe_package_box_measurements`, append-only) e um cliente
comprometido ou automação com bug poderia inflar a tabela sem limite.

**O que falta:** decidir o `scope`/`maxRequests`/`windowSeconds` de cada rota e implementar, seguindo
o padrão de `contractor-mail`. Fica pendente, fora do escopo da revisão de segurança T14 (que corrigiu
CSP × `data:`, injeção de fórmula em CSV, a validação de margem de `camera_adjusted`, a lista de
rotas do separador e a negociação de `Accept-Encoding`).

**Atualização 2026-09-18:** a rota nova `GET /nfe-package-boxes/pending-export` (a exportação do que
falta medir, até 10 000 caixas numa resposta) já nasceu com teto por usuário em memória
(`package-box-pending-export.rate-limit.ts`, 10 a cada 5 min). As quatro acima continuam pendentes.
⚠️ O balde é em memória: vale **por réplica** (com N réplicas o teto real é N × 10) e **zera a cada
deploy/restart** — é contenção de abuso casual, não garantia; garantia exige o balde no Postgres.

**Origem:** spec 152, revisão de segurança T14, achado item 6. Registrado em 2026-09-16.

### 2026-09-18 — `GET /delivery-charges` e as regras de cobrança não recortam pelo vínculo do motorista (pré-existente)

**Onde:** `api-transportada`, `delivery-clients/presentation/delivery-charge.routes.ts`
(`CHARGE_READ_POLICY = trip.read`) → `delivery-charges.use-case.ts` (`list` filtra só por
`companyId`). Mesmo caso de `GET /delivery-clients/:id/charge-rules`.

**O que é:** `trip.read` é das contas de campo (`driver`, `aggregate`) e do `separator`. As duas
leituras pedem `trip.read` e devolvem as cobranças e as regras da **empresa inteira** — um motorista
ou agregado lê cobrança de viagem que não é dele (BOLA, API1:2023). As rotas `/me` que também pedem
`trip.read` recortam pelo vínculo; estas não.

**O que limita o estrago:** só usuários da própria empresa; cobrança não carrega CPF nem endereço do
cliente final. Não foi alterado na T15 (fora do escopo das rotas do escritório).

**O que falta:** decidir se estas leituras são do escritório (trocar para `fleet.read`/`trip.manage`)
ou do campo (recortar pelo vínculo de motorista/agregado), com contrato negativo.

**Origem:** revisão de segurança da spec 156 (T15), ao corrigir a frase sobre `trip.read` no
`CLAUDE.md` da API. Registrado em 2026-09-18.

### 2026-09-18 — o IP da auditoria vem de `x-forwarded-for`, que o cliente pode forjar (pré-existente)

**Onde:** `api-transportada`, `http/client-ip.service.ts` (`resolveClientIp`), usado pela trilha
das rotas do escritório em nome do motorista (`audit_logs.metadata.ipAddress`, spec 156) e pelos
limitadores em memória por IP.

**O que é:** `resolveClientIp` confia no **primeiro** endereço de `x-forwarded-for` (e depois em
`x-real-ip`). Atrás do proxy do Railway/Cloudflare, o primeiro endereço da cadeia é o que o próprio
cliente mandou, se ele mandou o cabeçalho — o proxy acrescenta o dele no fim. Então quem chama pode
escolher o IP que a trilha grava (`security.md` §10 pede "ator, alvo, IP e timestamp") e o balde do
limitador por IP em que cai. Anterior à spec 156; a T15 só o expôs de novo, ao mover a auditoria do
escritório para dentro da transação.

**O que limita o estrago:** o ator da trilha é o usuário autenticado pelo token (não forjável), e os
tetos das escritas do escritório contam por empresa e usuário no Postgres, não por IP. O IP é dado
de apoio da investigação, não a identidade.

**O que falta:** confiar só no endereço que o proxy conhecido acrescentou (o último de
`x-forwarded-for`, ou o cabeçalho próprio do provedor, como `cf-connecting-ip`), configurável por
ambiente, e um contrato que prenda o comportamento com uma cadeia forjada.

**Origem:** revisão de segurança da spec 156 (T15). Registrado em 2026-09-18.

### 2026-09-18 — objeto órfão no bucket do comprovante: limpeza por requisição, sem varredura periódica (spec 156 T15)

**Onde:** `api-transportada`, `trips/application/stored-object-cleanup.service.ts`, usado por
`report-document-delivery.use-case.ts` (`field-delivery`), `report-field-proof.use-case.ts`
(`field-proof`) e `register-office-document-occurrences.use-case.ts` (`field-occurrences`).

**O que é:** as três rotas do escritório sobem o arquivo **dentro** da transação da baixa, para que
o anexo recusado desfaça a entrega inteira. Quando a transação desfaz depois do upload, o objeto já
está no bucket sem nenhuma linha em `stored_objects` apontando para ele. A T15 acrescentou a limpeza
por requisição (`runWithStoredObjectCleanup`: apaga o objeto e relança o erro original), mas ela não
cobre três casos: o processo morrer entre o upload e o `catch`; a própria remoção falhar (ela é
engolida para não trocar o erro que o cliente recebe); e o canhoto do escritório **substituído**
pelo unique `(company, stop_event, kind)`, cuja linha antiga de `stored_objects` e cujo objeto ficam
sem referência (o mesmo vale para a foto substituta do motorista, desde a spec 082).

**O que limita o estrago:** o bucket é privado (`security.md` §7), a chave do objeto só tem
identificadores opacos (`tenants/<empresa>/delivery-proofs/<evento>/<objeto>`) e ninguém serve um
objeto sem linha que o referencie. O custo é armazenamento e retenção de imagem de canhoto (dado
pessoal: assinatura e, às vezes, nome) além do necessário.

**O que falta:** uma varredura periódica (cron) que liste os objetos de `delivery-proofs/` sem linha
viva que os referencie há mais de N horas e os apague, com contagem no log. Até lá, a remoção
depende da limpeza por requisição.

**Fechado parcialmente em 22/09/2026 (spec 161, T17):** para `trip-occurrence-attachments/`, a
rotina `trip.occurrence-attachment.purge` agora cobre o objeto órfão (sem linha em
`trip_document_occurrence_attachments`) — mas só depois que `retention_until` vence (cinco anos), não
logo após a transação desfazer. `delivery-proofs/` continua sem varredura nenhuma.

**Origem:** revisão de código da spec 156 (T15). Registrado em 2026-09-18.

### 2026-09-18 — `GET /trips/field-delivery-settings` sem rate limit (spec 156 T13)

**Onde:** `api-transportada`, `trips/presentation/trip-field-delivery-settings.routes.ts`.

**O que é:** a leitura estreita do interruptor da leitura do canhoto (ADR-0069 §6) não declara
`rateLimit`. É autenticada, exige `trip.report-on-behalf` na empresa do contexto, só lê um booleano
por chave primária e não grava nada nem dispara custo externo — o risco é o mesmo das leituras de
configuração da spec 152 acima (abuso por usuário autenticado), menor por não gravar.

**O que falta:** entrar no mesmo lote de decisão de `scope`/`maxRequests`/`windowSeconds` das rotas da
spec 152. O cliente (T14) pede uma vez por abertura do assistente, com o cache do TanStack Query.

**Origem:** validação do architect sobre a T13 da spec 156 (R8). Registrado em 2026-09-18.

### 2026-09-18 — `GET /trips/:id/field-delivery-documents` sem rate limit (spec 156 T14)

**Onde:** `api-transportada`, `trips/presentation/trip-field-delivery-documents.routes.ts`.

**O que é:** a leitura da chave de acesso das notas da viagem, para o OCR do canhoto casar pela
chave inteira (ADR-0069 §3), não declara `rateLimit`. Mesmo perfil da rota de configuração acima:
autenticada, `trip.report-on-behalf` na empresa do contexto, só leitura (nunca grava), sem custo
externo — o risco é abuso por usuário autenticado, e a resposta é limitada às notas de uma viagem.

**O que falta:** entrar no mesmo lote de decisão de `scope`/`maxRequests`/`windowSeconds` das rotas
da spec 152 e da rota de configuração acima. O cliente (T14) pede uma vez por abertura do
assistente do escritório, com o cache do TanStack Query.

**Origem:** spec 156 T14 (ADR-0069 §2/§3, R8). Registrado em 2026-09-18.

### 2026-09-16 — foto congelada da medida pela câmera quebrava sob a CSP real (T14 item 1, fechado)

**Onde:** `frontend-transportada`, `components/ui/useBoxDimensionScanner.hook.ts` e
`box-dimension-scanner.tsx` (spec 152, medida de caixa pela câmera).

**O que era:** a foto congelada (o retrato usado para marcar os quatro cantos da caixa) era gerada
com `canvas.toDataURL('image/png')` e consumida como `<img src="data:...">`. A CSP real de produção
(`contentSecurityPolicy.service.ts`) tem `img-src 'self' blob: <api>` — sem `data:` — então a imagem
nunca carregava fora de desenvolvimento (onde o servidor de dev não serve CSP nenhuma, e por isso o
defeito não aparecia em nenhum teste até agora).

**Fechado:** trocado para `canvas.toBlob` + `URL.createObjectURL` (já coberto por `blob:` na
diretiva), com a URL de objeto revogada em `returnToLive()` e na limpeza do efeito, ao lado do
`worker.terminate()`. Prova: sonda headless com Chromium real
(`test/design-system/box-dimension-scanner-csp.contract.ts`) aplica a MESMA diretiva que o build
emite e confirma, num navegador de verdade, que um `<img src="data:...">` dispara
`securitypolicyviolation` em `img-src` sob essa política e que um `<img src="blob:...">` carrega sem
nenhuma violação. `content-security-policy.contract.ts` ganhou asserção travando `data:` fora de
`img-src` para sempre.

**Origem:** spec 152, revisão de segurança T14, achado item 1. Fechado em 2026-09-16.

### 2026-09-16 — injeção de fórmula em CSV nos exports que usam dado de XML de terceiro (T14 item 2, fechado)

**Onde:** `frontend-transportada`, `nfe-workspace/shared/cameraMeasurementExport.service.ts`,
`fleet/shared/freightRegionExport.service.ts` e `fleet/shared/vehicleSelectionExport.service.ts`.

**O que era:** `escapeField` só duplicava aspas (RFC 4180), sem neutralizar o gatilho de fórmula do
Excel (`=`, `+`, `-`, `@`, tab, CR no início do campo). `productCode`/`cartonGtin` do export de
medida pela câmera vêm direto do XML da NF-e — dado de terceiro, sem validação de conteúdo — e um
código de produto começando com `=` abriria execução de fórmula (incluindo comando de sistema via
DDE) para quem abrisse o CSV no Excel.

**Fechado:** o escape ganhou prefixo `'` quando o campo casa `/^[=+\-@\t\r]/u`, extraído para
`modules/shared/csv.service.ts` (`escapeCsvField`) e reusado pelos três exports — segunda
implementação do mesmo escape não diverge mais em silêncio. Prova:
`test/shared/csv.contract.ts` (o helper) e um caso vermelho-para-verde em
`test/nfe-workspace/camera-measurement-validation.contract.ts` com `productCode` malicioso.

**Origem:** spec 152, revisão de segurança T14, achado item 2. Fechado em 2026-09-16.

### 2026-09-15 — texto livre do modelo de e-mail pode carregar URL (M1, revisão final da Fase 4)

**Onde:** `api-transportada`/`frontend-transportada`, `contractor-mail-templates` (spec 150, RF13/RF14).

**O que é:** `intro`, `closing`, `itemText` e `subject` são texto livre — quem tem `settings.manage`
pode cadastrar um modelo com uma URL dentro (legítima ou não). O e-mail sai como transacional da
transportadora, então um link malicioso ali tem a credibilidade do remetente de verdade; nada na
rota `POST`/`PATCH /contractor-mail-templates` detecta ou avisa sobre URL no texto, e não há trilha
de quem editou o quê (o mesmo buraco do M2, agora aplicado à edição de modelo, não só ao envio).

**O que falta:** duas frentes, as duas **pendentes antes de produção**: (1) a auditoria de edição de
modelo — quem mudou o texto e quando — que o M2 já cobre para o resto do fluxo; (2) um aviso na tela
(e, opcionalmente, na fronteira HTTP) quando o texto salvo contém uma URL, para quem revisa o modelo
decidir se ela é esperada. RF12 (escapar toda variável interpolada) já protege contra injeção de
HTML/script — este achado é sobre **conteúdo intencionalmente digitado**, que RF12 não cobre.

**Origem:** spec 150, revisão de segurança final da Fase 4. Decidido pelo usuário em 2026-09-15.

### 2026-09-15 — teto do limitador de e-mail é por usuário, não por empresa (L1)

**Onde:** `api-transportada`, `POST /address-correction-requests/mail` e
`POST /contractor-mail-settings/test-email` (mesmo par do M1 fechado abaixo).

**O que é:** a janela do Postgres (`rate_limit_windows`) tem chave `scope:companyId:userId` — o teto
é por usuário dentro da empresa, não agregado por `companyId`. N operadores da mesma transportadora
multiplicam o volume total em N × teto/h.

**Por que fica assim:** decisão consciente, não lacuna esquecida — a distribuição é **instalação
dedicada por transportadora** (ADR-0021): não existe o cenário de uma empresa hostil compartilhando
banco com outra para inflar custo alheio, e o teto por usuário já limita o dano de uma única
credencial comprometida ou de um operador em loop. Um teto agregado por empresa é reavaliado se o
produto deixar de ser instalação dedicada.

**Origem:** spec 150, RF18, revisão de segurança final da Fase 4. Decidido pelo usuário em 2026-09-15.

### 2026-09-15 — rotas anônimas seguem só com limitador em memória, por processo (L4)

**Onde:** `api-transportada`, todas as rotas sem autenticação: `POST`/`.../confirm
/password-resets`, `POST /public/aggregate-application-attachments`, o webhook do WhatsApp, o
inbound do Resend (`contractor-mail`), o CEP/geocodificação públicos.

**O que é:** o limitador com estado compartilhado (`rate_limit_windows`, Postgres) só cobre as duas
rotas de e-mail autenticadas da spec 150 (M1, fechado); toda rota anônima continua só com o
limitador em memória do processo — sob múltiplas réplicas, o teto real é `N réplicas × teto/janela`,
não o teto declarado. `POST /password-resets` já tem uma marcação própria (`api-transportada/CLAUDE.md`,
"⚠️ Sem rate limit") por ser a rota que mais se presta a enumeração/abuso sem credencial nenhuma — é
a **candidata natural** a migrar para o limitador com estado compartilhado primeiro, pelo mesmo
desenho de `DrizzleRateLimiterRepository`/`rate_limit_windows` que a spec 150 já construiu.

**O que falta:** decidir se/quando estender o limitador com estado compartilhado às rotas anônimas,
começando por `password-resets`. Fora do escopo desta spec.

**Origem:** spec 150, RF18, revisão de segurança final da Fase 4 (achado geral já citado no M1
fechado, registrado aqui com identidade própria). Decidido pelo usuário em 2026-09-15.

### 2026-09-15 — trilha de auditoria do envio de e-mail e do CRUD de contatos da contratante (M2)

**Onde:** `api-transportada`, módulos `contractor-mail` e `address-correction` (spec 150, Fase 4).

**O que é:** nenhuma ação deste fluxo grava linha em `audit_logs`: nem o envio do pedido de correção
(`POST /address-correction-requests/mail`), nem criar/editar/(des)ativar um contato de e-mail da
contratante (`POST`/`PATCH /contractors/:id/contacts`, T301), nem o CRUD de modelos de e-mail
(`POST`/`PATCH /contractor-mail-templates`, T402/T403). O §10 do baseline pede trilha para "ação
sensível" — envio dispara e-mail em nome da transportadora para um terceiro, e o contato decide quem
recebe esse e-mail; os dois qualificam. É o M2 da revisão de segurança da Fase 4 desta spec.

**O que já existe, e não é trilha de auditoria:** `contractor_mail_messages` grava o que foi enviado
(`thread_id`, destinatários, `template_id`); `contractor_contacts` e `contractor_mail_templates` têm
`created_at`/`updated_at` (`actor_user_id` só existe nos modelos e na configuração, não no contato);
o log estrutural de cada requisição carrega `correlationId`, sem PII. Responder "quem cadastrou este
contato" ou "quem mandou este e-mail" hoje exige cruzar a tabela de negócio com o log de requisição —
o mesmo problema já registrado no achado de `audit_logs` sem IP, logo abaixo.

**O que falta:** decidir e implementar a trilha (RF19). Decisão do usuário nesta rodada: fica fora da
Fase 4, pendente **antes de produção**.

**Origem:** spec 150, RF19, revisão de segurança da Fase 4. Decidido pelo usuário em 2026-09-15.

### 2026-09-15 — CPF/CNPJ ainda viaja na URL de `GET /contractors/by-tax-id/:taxId` (B3, fechado só no fluxo novo)

**Onde:** `api-transportada`, `delivery-clients/presentation/contractor.routes.ts`.

**O que é:** a revisão de segurança da Fase 4 achou o CPF/CNPJ do emitente viajando no **caminho** da
URL do fluxo de correção de endereço — o mesmo problema do §8 do baseline (CEP/coordenada em query
string), agora com documento de pessoa/empresa, que fica gravado em log de proxy e de CDN.

**Fechado para o fluxo novo:** `POST /address-correction-requests/recipients`, body
`{ contractorTaxId }`, substitui as duas chamadas antigas (`GET /contractors/by-tax-id/:taxId` +
`GET /contractors/:id/contacts`) por uma só, com o documento no **corpo**
(`find-address-correction-recipients.use-case.ts`; frontend em `findAddressCorrectionRecipients`,
`nfeWorkspaceClient.service.ts`). Prova: o teste do client confere que `request.url` nunca contém o
CNPJ.

**Continua aberto:** `GET /contractors/by-tax-id/:taxId` (`fleet.read`) não foi removida — outros
consumidores do produto ainda a chamam, por exemplo a resolução de `contractorId` a partir do
relatório de endereços no `nfe-workspace` (`docs/ai-context/frontend-transportada.md` § "Clientes a
atualizar"). Migrar esses consumidores para mandar o documento no corpo, em vez do caminho, é
trabalho fora do escopo desta spec e fica pendente.

**Origem:** spec 150, revisão de segurança da Fase 4, correção pós-revisão final (item 10 do
`evidence.md`). B3.

### 2026-09-15 — CSP: `frame-src` deixa de ser `'none'` para a prévia do modelo de e-mail (spec 150 T403)

**Onde:** `frontend-transportada`, `shared/contentSecurityPolicy.service.ts`.

**O que é:** `frame-src` era `'none'` desde a ADR-0037 — nenhum `iframe` existia no bundle. A prévia
de modelo de e-mail (T402/T403) precisa renderizar HTML de terceiro (o texto que o operador digitou,
já escapado no servidor) sem `dangerouslySetInnerHTML`; a escolha foi um
`<iframe sandbox="" srcDoc={html}>`, sem `allow-scripts`, e isso exige abrir `frame-src` para pelo
menos a própria origem.

**O limite:** `frame-src 'self'`, nunca liberado (`'none'` solto) nem `*`. `about:srcdoc` de um
`iframe` `sandbox` é resolvido contra a origem do documento que o criou, então `'self'` já basta —
nenhum `iframe` de terceiro passa a ser aceito, e sem `allow-scripts` o conteúdo do sandbox não
executa script. `frame-ancestors` e `object-src` continuam `'none'`: a própria app segue impossível
de embutir em terceiro.

**O que falta:** nada em aberto. `test/shared/content-security-policy.contract.ts` cobra os dois
sentidos — falha se `frame-src` voltar a `'none'` (quebraria a prévia) e falha se deixar de ser
`'self'` ou virar algo mais permissivo.

**Origem:** spec 150, T403.

### 2026-09-13 — `audit_logs` não guarda IP

**Onde:** `audit_logs` (todo o produto, não só `contractor-mail`) — sem coluna de endereço de
origem.

**O que é:** o §10 do baseline (`security.md`) pede que ação sensível grave "ator, alvo, IP e
timestamp". A trilha grava os três primeiros e o quarto, mas nunca o IP de quem fez a chamada — nem
aqui, nem em nenhuma outra tabela de auditoria do repositório. O IP só se recupera **cruzando** o
`correlationId` da linha de auditoria com o log de acesso da requisição (que carrega
`resolveClientIp`, via `http/client-ip.service.ts`), e isso exige acesso aos dois sistemas ao mesmo
tempo — não é uma consulta, é uma investigação.

**O que limita o estrago:** o cruzamento é possível hoje — `correlationId` está em toda linha de
`audit_logs` e em todo log de requisição, então nada foi perdido, só não fica pronto numa coluna só.

**O que falta:** decidir, por escrito, se vale a pena desnormalizar o IP para dentro de
`audit_logs` (replicando o que `resolveClientIp` já resolve por requisição) ou se o cruzamento por
`correlationId` é aceitável como política permanente do produto. Achado válido para o produto
inteiro, não só para `contractor_mail_settings` — registrado aqui porque foi a revisão da T008
(spec 143) que o notou, ao conferir a auditoria de `saveSettings`.

**Origem:** spec 143, revisão da T008.

### 2026-09-13 — webhook de e-mail recebido: anônimo, assinado, e o corpo dele decide dinheiro

**Onde:** `POST /public/inbound-emails/{webhookId}` (`api-transportada`, módulo `contractor-mail`,
spec 143). É a **terceira** superfície anônima do produto, depois do postback da NFS-e e do lote de
taxas da ADR-0048, e a primeira **assinada**.

**O que é:** o Resend assina o webhook por Svix (HMAC-SHA256 sobre `svix-id.svix-timestamp.corpo`),
então o §3 do baseline é cumprido, ao contrário do postback da NFS-e. O risco que sobra é de outra
natureza: **o que chega por aqui decide dinheiro**, porque uma resposta `APROVADO` aprova uma taxa
(ADR-0063).

**O que limita o estrago:**

- A assinatura é conferida contra o segredo **daquela empresa**, com `timingSafeEqual` e janela de
  5 minutos, e o `email_id` repetido converge sem gravar de novo (por empresa —
  `unique(company_id, provider_email_id)`; o `svix-id` não é guardado, porque um replay assinado
  repete o corpo e, portanto, o `email_id` — ver a correção pós-revisão da T010 no RF11 do
  `spec.md`).
- O corpo do webhook não é fonte de nada: remetente, conteúdo e MIME vêm da API do Resend, com a
  chave.
- A decisão exige DKIM alinhado ao `From`, **verificado por nós** sobre o MIME bruto. Forjar a
  resposta de uma contratante exige a chave privada DKIM do domínio dela.
- O tenant sai do token da conversa e **precisa** coincidir com o do `webhookId`.
- Remetente fora da lista da contratante, ou sem `can_decide`, nunca decide.
- Correção pós-revisão da T010 (2026-09-13): a rota **tem** limitador agora
  (`public-inbound-email.routes.ts`, no molde de `public-cnpj-info.routes.ts`), e a ordem de
  checagem dentro do caso de uso barateia a rejeição — cabeçalhos `svix-*` ausentes/malformados e
  timestamp fora da janela nunca chegam a consultar o banco (`lookupSettings`) nem a abrir o
  segredo, então um `POST` em rajada sem assinatura de verdade nem toca o repositório.

**O que falta:** nada específico desta rota — ela deixou de ser o "buraco" citado antes. Os demais
achados abaixo (recuperação de senha, definição de senha por admin) continuam sem limitador.

**Origem:** spec 143, T002. Atualizado na revisão da T010.

### 2026-09-13 — a chave do Resend que lê recebidos alcança a caixa inteira da conta

**Onde:** `contractor_mail_settings.secret_envelope` (`api-transportada` e `worker-transportada`).

**O que é:** para buscar o conteúdo e o MIME bruto de uma resposta, o worker usa uma chave de API do
Resend capaz de ler e-mails recebidos. Essa chave lê **todo** e-mail recebido pela conta, não só os
das contratantes, e também envia em nome do domínio. Vazada, ela serve para ler a correspondência e
para mandar e-mail que passa no DKIM da transportadora.

**O que limita o estrago:** selada em envelope A256GCM com AAD por empresa, no padrão da credencial
da Nota RP; nunca volta na resposta da API, nunca entra em log, e é aberta só no gateway, uma vez
por operação.

**O que falta:** usar uma chave **só para este fim**, separada da que o `SMTP_URL` já usa, e o
escopo mínimo que o Resend permitir (a T007 confirma qual é). Rotação fica com o administrador, pela
própria página.

**Origem:** spec 143, T002.

### 2026-09-13 — respostas das contratantes guardadas sem prazo de descarte

**Onde:** `contractor_mail_messages.body_text` e o original bruto no bucket privado (`raw_object_id`).

**O que é:** a resposta de uma contratante é dado pessoal (nome, e-mail e o que ela escreve), e fica
guardada **sem expirar**, porque é o comprovante de uma decisão financeira: é ela que prova "o
cliente aprovou". O mesmo raciocínio do rascunho da spec 070.

**O que limita o estrago:** o corpo nunca entra em log (há contrato por texto de fonte), o bucket é
privado, e as mensagens são filtradas por `company_id`.

`contractor_mail_messages.body_html` (spec 150 T302, só em mensagens de saída, teto de 512 KiB) tem
o mesmo tratamento de `body_text`: fora de log, filtrado por `company_id`, e com a mesma retenção
ainda por decidir.

**O que falta:** decidir a retenção. Uma saída possível é descartar o corpo das mensagens que **não**
decidiram nada depois de um prazo e manter só as que decidiram.

**Origem:** spec 143, T002.

### 2026-09-12 — a liquidação por procuração: quatro baixos que a revisão da Fase 3 liberou com ressalva

**Onde:** `api-transportada`/`worker-transportada`, `whatsapp-commands`/`whatsapp-command-settlement`
(spec 144, ADR-0064). `security-reviewer` revisou `93fa655b..76879561` em 2026-09-12: **LIBERA COM
CORREÇÕES**, 0 crítico, 0 alto, 2 médios (M1 e M2, fechados pela T014b — `795cb137`) e 4 baixos. Os
quatro baixos ficam aqui, como a task pediu.

- **B1 — a retomada de pedidos em `confirming` não tem reivindicação atômica no banco.** Só a linha
  de `job_executions` serializa, e isso vale **só** para o worker: uma chamada paralela pela rota
  `POST /whatsapp-command-requests/:id/settlement` não tem a mesma trava. Duas chamadas concorrentes
  sobre o mesmo pedido parado se apoiam só nas chaves de idempotência da emissão
  (`confirm-document-selection.use-case.ts:144-160`) para não duplicar lote ou nota — o que já limita
  o estrago, mas não é reivindicação exclusiva por construção.
- **B3 — as consultas do worker filtram por `batchItemId` e aplicam a empresa depois, em memória.**
  `drizzle-settlement-candidate.repository.ts:174-191` lê `cte_issuance_attempts`/
  `cte_fiscal_documents` sem `company_id` na cláusula SQL, e confere o tenant no código depois de ler.
  O resultado está certo — provado por contrato de tenant —, mas não é filtro por construção como o
  resto do repositório.
- **B4 — o digest da prévia não cobre o ambiente fiscal nem o certificado.** Uma retomada depois de
  15 minutos (`issuance-preview-digest.policy.ts:40-65`) emite pelo **perfil atual**, enquanto a
  fatura agrupa pelo **tomador congelado** na prévia — se o perfil de emissão mudar de certificado ou
  de ambiente fiscal entre a confirmação e a retomada, a emissão segue o novo perfil e a fatura pode
  discordar de qual documento ela está cobrando.
- **B2 — fechado pela T014b.** O `resolveActor` da liquidação aceitava papel de serviço como "quem
  confirmou"; hoje `resolveHumanActor` recusa `SERVICE_COMPANY_ROLES` nos dois caminhos (revalidação
  e retomada). Ver "Fechados" abaixo.

**Mitigação em vigor:** a procuração revalida `billing.create` do ator antes de faturar (ADR-0064); a
digital de idempotência de cada passo (lote, emissão, nota, fatura) impede duplicar mesmo sob corrida;
nenhum dos quatro é explorável hoje sem já ter passado pela confirmação de um pedido real.

**Desfecho pendente:** reivindicação atômica da rota de liquidação (B1); filtro de tenant por
construção no repositório de candidatos do worker (B3); o digest cobrir versão do perfil de emissão,
não só dos perfis de CT-e/NFS-e (B4).

**Registrado também (spec 144 T014b):** `mdfe.auto-issue` era **concedível a pessoa** por grupo ou
concessão avulsa antes desta spec — o mesmo furo que a revisão achou em `whatsapp.settle` (M1) já
existia nele, e não tinha sido notado porque nenhum papel humano dependia dele. A T014b fechou os
dois juntos: `SERVICE_ONLY_PERMISSIONS` em `authorization.policy.ts` tira as duas permissões de
`isGrantablePermission`, e `resolveCompanyPermissions` ignora qualquer linha gravada com elas.

### 2026-09-11 — o webhook público do WhatsApp passa a disparar ação de negócio

**Onde:** `api-transportada`, `whatsapp-commands` (spec 144, Fases 2–4: FlowActions do motorista, do
operador e da emissão por seleção).

**O que é:** até a spec 062 o webhook do WhatsApp só gravava mensagem na inbox. A partir desta spec
uma mensagem recebida pode **separar nota, despachar viagem, registrar entrega, emitir CT-e/NFS-e e
faturar** — o mesmo webhook público (`X-Hub-Signature-256`, ADR-0051) agora aciona efeito real, sem
nenhum humano abrir o painel.

- **Teto por número: 30 mensagens em 10 minutos, limitador em memória por processo.** Com N réplicas
  da API o teto real é `30 × N`, e um `restart` zera o contador — o mesmo M4 já registrado abaixo (a
  chave hoje é `phone_key`, sem o nono dígito, então as duas grafias da Meta não dobram o teto dentro
  de um processo, mas entre processos o problema é o mesmo dos outros limitadores desta API).
- **Resposta neutra.** As quatro recusas de `resolveWhatsAppActor` (D1/ADR-0063) e as de verificação de
  telefone chegam à conversa como a mesma frase, no máximo uma vez a cada 24 h por número — quem não
  é dono do número não aprende nada por tentativa.
- **O achado de rate limit global continua aberto.** Esta API não tem limitador de infraestrutura em
  lugar nenhum (rotas de senha, CEP, candidatura de agregado, e agora o webhook que aciona negócio) —
  não é um problema novo desta spec, é o mesmo de sempre com uma superfície de acionamento maior:
  antes o pior caso de um webhook sem teto era inflar a inbox; hoje é inflar `cte_batches` e
  `nfse_service_invoices`.
- **`toMetaRecipient` ainda envia sem o `55`.** Achado da Fase 1 (validação do architect, 2026-09-11):
  `worker-transportada/src/whatsapp/infrastructure/whatsapp-code-sender.gateway.ts:100-102` só tira
  dígitos não numéricos do telefone (`phone.replaceAll(/[^0-9]/gu, '')`), sem passar por
  `toWhatsAppPhone` (a canonicalização da spec 144 que garante o prefixo `55`). Conferido em
  2026-09-13 contra o HEAD desta branch: **ainda não corrigido**. O convite por WhatsApp da spec 062
  T005 continua saindo sem código de país quando o contato foi digitado sem ele.

**Mitigação em vigor:** toda FlowAction de negócio passa por `withAuthorizedActor`, que re-resolve o
ator a cada chamada e confere a permissão real da membership (nunca confia no que a sessão gravou);
nada de ator, PII ou permissão entra no `context` persistido da sessão; o menu raiz é filtrado por
permissão antes de ser oferecido (`whatsapp-root-menu.policy.ts`); o despachante nunca deixa erro de
infraestrutura ou de domínio propagar ao webhook (`whatsapp.command.failed`, sempre `handled`) — um
500 ali desativaria o webhook de todas as empresas na Meta.

**Desfecho pendente:** limitador com estado compartilhado, a mesma decisão já pendente para as rotas
anônimas de senha e do portal do contratante; corrigir `toMetaRecipient` para usar `toWhatsAppPhone`.

### 2026-09-11 — o bot do WhatsApp: tetos por processo, código na inbox e o Keycloak desativado

**Onde:** `api-transportada`, `whatsapp-commands` (spec 144, revisão de segurança antecipada; as
correções de código são a T005b).

**O que é:** três resíduos que a T005b registra em vez de corrigir.

- **M4 — os tetos vivem em memória, por processo.** O teto de mensagens por número (30 em 10 min),
  a resposta neutra (uma por número a cada 24 h) e o de pedidos de código (5 por usuário em 10 min)
  são `createRateLimiter`, sem estado compartilhado. Com N réplicas o teto de mensagens vira 30×N e
  a resposta neutra vira N por 24 h; restart zera tudo. A chave passou a ser a `phone_key` (sem o
  nono dígito) — as duas grafias da Meta não dobram mais o teto dentro de um processo.
- **B1 — o código de verificação fica em texto** no log de mensagens do
  `@adatechnology/meta-whatsapp-module` e na inbox, porque a mensagem que o traz é uma mensagem como
  outra qualquer. Ele é de uso único, vale dez minutos e só verifica vindo do `from` assinado; o
  risco é quem lê a inbox ver um código já gasto ou prestes a vencer.
- **B6 — usuário desativado direto no Keycloak segue ativo pelo bot** até o vínculo vencer (90
  dias): o contexto do canal é montado pela membership no nosso banco, sem token, e o provedor não é
  consultado. Suspender pelo produto desfaz o vínculo (com trilha, desde a T005b); desativar só no
  console do Keycloak, não.

**Mitigação em vigor:** número verificado é credencial só de gente — service account, plataforma e
contexto de canal são recusados na rota e no resolve (T005b A1); a política de membership não sobe
fora de `/me/` (M2); o vínculo vencido libera o número (M1).

**Desfecho pendente:** limitador com estado compartilhado (a mesma decisão das rotas anônimas de
senha e do portal); pedir ao pacote que não persista o corpo da mensagem que é só o código; e
consultar o `enabled` do provedor, ou sincronizá-lo, antes de aceitar o número.

### 2026-08-31 — a foto de perfil ganha endereço público, sem login e sem trilha

O atributo `picture` do realm passa a guardar `\${API}/public/company-users/{token}/picture`, uma
rota **anônima**. É o que permite a um consumidor do provedor exibir a foto: a rota autenticada não
servia a ninguém do lado de lá, porque `<img src>` não manda `Authorization`.

O que isso expõe, e é decisão consciente:

- **Quem tiver o link vê o rosto da pessoa sem se identificar.** O token é a credencial inteira: 32
  bytes de aleatório em base64url, imprevisível por varredura, mas um link que vaze num print, num
  e-mail ou no log de um proxy vale enquanto a foto não mudar.
- **A leitura não deixa trilha.** A rota autenticada registra quem pediu; esta não tem quem registrar.
- **A revogação é a troca da foto.** O token gira a cada gravação, e o endereço anterior passa a
  responder 404. Não há outra forma de revogar um endereço sem login.
- Isto **contraria o `security.md` §7** desta base, que reserva URL pública para asset comprovadamente
  não sensível (logo, ícone). Rosto não é ícone, e a exceção é deliberada.
- `cache-control: no-store` mesmo sendo público: com o token girando, cache intermediário serviria a
  imagem antiga de um endereço que já deixou de valer.

A alternativa avaliada e descartada foi guardar a imagem inteira no atributo (`data:` URI): ela não
amplia exposição, mas põe centenas de kilobytes por pessoa na tabela de atributos do Keycloak — e
não resolve o caso de quem precisa **exibir** a foto fora do nosso sistema.

### 2026-08-31 — telefone e foto passam a viver no realm, ao lado do documento

O provedor passa a guardar a identificação completa da pessoa: além do `tax_id` que já estava em
claro, entram `phone` e `picture`. A foto vai como `data:` URI — o conteúdo, não um endereço: a URL
anterior apontava para a nossa rota autenticada, e nenhum consumidor do lado de lá conseguia buscá-la
(`<img src>` não manda `Authorization`), então o atributo existia sem servir para nada.

O que muda em exposição, e é decisão consciente:

- **Telefone em claro no realm.** Havia um contrato dizendo que o contato do convite não vazava para
  os atributos; ele foi reescrito. Quando o canal do convite é telefone, contato e telefone são o
  mesmo valor por construção — não há como guardar um e não o outro.
- **A foto passou a ser endereço público**, não conteúdo no atributo — ver a entrada seguinte, do
  mesmo dia, que substitui esta decisão poucas horas depois.
- **Nenhum dos três tem mapper de claim**, e isso é o que impede o pior: só `company_id` entra no
  token. Mapear `picture` poria centenas de kilobytes dentro de cada token emitido.
- **A senha continua fora**, e isso não se negocia — há contrato cobrando.

Um defeito que veio junto e foi corrigido: `updateAttributes` do Admin API **substitui o conjunto
inteiro**, e a edição de perfil mandava só `company_id` + `tax_id`. Gravar o CPF apagava a foto do
provedor. Era invisível enquanto ninguém lia o atributo; com a imagem morando lá, seria perda de
dado. Toda edição passa a escrever a ficha completa.

### 2026-08-31 — administrador define senha definitiva de outro usuário, sem limitador

`PUT /company-users/:id/password` (`users.manage`, escopo `company`) grava a senha do usuário no
Keycloak. O vínculo com a empresa do token é conferido antes de a rota tocar no provedor, o piso é
de 12 caracteres, a senha não passa pelo banco desta aplicação e a resposta é 204 sem eco do corpo.
A trilha (`company-user.password.set`) guarda ator, alvo e correlação, nunca o valor.

O que fica em aberto, e é decisão registrada e não esquecimento:

- **Sem rate limit**, como toda esta API — não existe limitador aqui. Uma conta com `users.manage`
  comprometida pode reescrever senha de todo mundo da empresa dela sem atrito nenhum.
- **A senha definitiva passa pela mão do administrador.** O caminho preferido continua sendo o link
  de redefinição, oferecido lado a lado no mesmo painel, e a opção temporária existe para forçar a
  troca no primeiro acesso. A senha definitiva ficou porque instalação com e-mail quebrado é caso
  real desta base, e sem ela a única saída era o provedor.
- **Não há notificação ao dono da conta** quando um terceiro troca a senha dela. Quem só olha a
  trilha descobre depois; quem não olha, não descobre.

### 2026-08-27 — o portal do contratante não tem limite de requisição, como o resto da API

**Onde:** `api-transportada`, módulo `contractor-portal` (`GET /client/me/deliveries`).

**O que é:** a rota exige sessão autenticada e recorta pelo vínculo da conta — não há enumeração de
documento a fazer, porque o documento nunca chega do cliente. O que fica em aberto é o mesmo buraco
já registrado para as rotas de recuperação de senha: **não existe limitador nesta API**, e agora há
uma conta legítima na mão de alguém de fora da transportadora.

**Risco:** um contratante (ou credencial dele, vazada) pode varrer a rota sem teto. O que ele lê é o
que já é dele — o custo é de disponibilidade, não de confidencialidade.

**Mitigação em vigor:** o recorte é por vínculo, com `company_id` nas duas chaves estrangeiras; o
payload é lista fechada, sem id interno; e o teto de leitura é cem linhas por chamada.

**Desfecho pendente:** limitador por usuário autenticado, junto com o das rotas anônimas de senha —
é uma decisão só, e é infraestrutura, não regra de domínio.

### 2026-09-02 — a leitura do anexo grava CPF e CNH em texto puro, e sem prazo de descarte

**Onde:** `api-transportada`/`worker-transportada`, coluna
`aggregate_application_attachments.extracted_fields` (jsonb).

**O que é:** a spec 071 ampliou o que o servidor lê do anexo da candidatura, e tudo que ele lê é
gravado nessa coluna **inteiro, como veio**. Antes só o CCMEI era lido, e dele saíam razão social,
CNPJ, endereço e o nome do empresário. Agora saem também:

- do **CRLV**: `ownerTaxId` — o **CPF do proprietário do veículo** — e `ownerName`;
- da **CNH**, por OCR: `licenseNumber` (o número de registro), `licenseCategory` e `name`.

O `licenseNumber` é exatamente o campo que a ADR-0039 decidiu cifrar em `fleet_drivers`, e o
argumento que tornava aquela mudança barata — "não há leitor" — não vale aqui: esta coluna existe
para ser lida, é o que o operador confere na fila de revisão.

⚠️ E ela **não tem prazo de descarte**. A tabela nasceu sem `expires_at` por decisão de 2026-08-27,
registrada no próprio schema, porque o rascunho é o comprovante do que o candidato digitou. A
consequência que aquela decisão já antecipava — "PII sem prazo de descarte torna a ADR-0039 mais
urgente, não menos" — cresceu com a 071: agora é PII de quem **não foi aprovado** e talvez nunca
seja, guardada sem data para sair.

**Risco:** dump de banco ou backup vazado expõe CPF, número de CNH e nome de todo mundo que se
candidatou — inclusive de terceiros que nunca se candidataram, porque o proprietário do veículo do
CRLV frequentemente **não é** o candidato (é o caso normal do agregado que roda com veículo de
outra pessoa, e a própria spec 071 o trata como esperado). Essas pessoas não têm relação com a
transportadora e não consentiram com nada.

Este é o **terceiro** lugar do mesmo banco com CPF em claro, ao lado de `fleet_drivers.tax_id` e
`identity_user_profiles.tax_id` (achados de 2026-08-20 e 2026-08-26).

**Mitigação em vigor:** a coluna só é lida por rota autenticada com `fleet.manage` e escopo de
empresa; a leitura nunca volta para o formulário de quem se candidatou; o bucket é privado e o
backup é cifrado antes de subir, com a chave fora dele. Nada disso protege contra dump do banco.

**Resolvido em parte, em 02/09/2026 — a retenção do anexo revisado.** A decisão da revisão passou a
**descartar a leitura**: `extracted_fields` vai a `null` no **mesmo `UPDATE`** que grava
`status`/`reviewed_by`/`reviewed_at` (`drizzle-aggregate-application-attachment-review.repository.ts`).
Em duas escritas, uma falha no meio deixaria a PII para trás justamente no caminho de erro, que é o
menos observado. Nada se perde: o arquivo original continua no bucket, e a rota de download continua
servindo-o; o que sai é a **cópia** do que o documento dizia, depois que ela já cumpriu a função de
sustentar a conferência.

A tela ganhou um terceiro estado junto, porque "não consegui ler" e "descartei depois de revisar"
chegam as duas como `null` — chamá-las pelo mesmo nome faria o painel dizer que falhou em ler um
documento que leu, e mandaria o operador abrir o arquivo à toa.

Prova em `test/integration/aggregate-application-attachment-link.integration.ts`, contra Postgres de
verdade, nos dois desfechos da revisão.

**Desfecho pendente:** duas decisões, e elas são independentes.

1. **Cifra:** entra junto com a decisão já pendente de `fleet_drivers` + `identity_user_profiles` —
   resolver um lugar de três não fecha nada, e são três. **Não mexida.**
2. **Retenção do que nunca foi revisado:** o descarte acima só alcança o anexo que **passou pela
   revisão**. O rascunho abandonado — quem anexou e não enviou a candidatura, ou candidatura que
   ninguém abriu — continua sem prazo, e é o volume que só cresce. Fechar isso é dar prazo ao
   rascunho, e prazo exige job agendado: é trabalho com spec própria, não uma linha a mais.

⚠️ O mesmo padrão existe em `aggregate_documents.extracted_fields` (o documento do agregado já
cadastrado, spec 046), que também guarda a saída de `extractCnhFields`. Não foi tocado aqui: aquele
registro é da ficha aprovada e tem outro ciclo de vida, mas herda a mesma pergunta de cifra.

**Dono:** a definir.

### 2026-08-26 — CPF do usuário fica em texto puro em `identity_user_profiles`

**Onde:** `api-transportada`, módulo `identity` (coluna `identity_user_profiles.tax_id`).

**O que é:** o `security.md §5` pede campo sensível em repouso — CPF entre eles — cifrado com
chave de aplicação. A coluna nova nasceu em texto puro, deliberadamente, porque o mesmo dado já
está assim em `fleet_drivers.tax_id`, com `check` de formato e unique por empresa. Cifrar só de um
lado teria dois custos concretos: a unicidade deixaria de ser verificável pelo banco (texto cifrado
com IV aleatório não colide mesmo quando o CPF é igual), e o casamento entre o convite e a ficha de
frota — que é a razão da coluna existir — passaria a exigir decifrar a tabela inteira a cada
convite. Também criaria um terceiro padrão de armazenamento para o mesmo documento no mesmo banco.

**Risco:** dump de banco ou backup vazado expõe CPF de todo usuário e de todo motorista. A
exposição não aumentou com esta coluna — `fleet_drivers` já a tinha —, mas o alcance cresceu:
agora pega também quem não é motorista.

**Mitigação em vigor:** a API nunca devolve o CPF por extenso; a listagem e a resposta do convite
saem mascaradas (`***09`), como o contato. Backup é cifrado antes de subir ao bucket, com a chave
fora dele.

**Desfecho pendente:** decidir de uma vez, para `fleet_drivers` e `identity_user_profiles` juntos,
entre (a) cifra determinística com chave de aplicação, que preserva unicidade e igualdade, ou (b)
aceitar o texto puro e registrar a exceção. Resolver só um dos dois lados não fecha nada.

**Dono:** a definir.

### 2026-08-25 — `POST /public/aggregate-applications` é anônima e sem limitador dedicado

**Onde:** `api-transportada`, módulo `fleet` (spec 053, T007).

**O que é:** a rota aceita candidatura de agregado sem autenticação, e a resposta é `202`
invariável de propósito — documento novo, reenvio ou documento já motorista respondem igual,
para não existir sonda de "este documento já existe". Isso fecha o oráculo de enumeração, mas não
substitui um limitador: sem teto, a rota é um canal de escrita (uma linha por chamada) acionável
por qualquer um. O mesmo item já registrado para recuperação de senha e para a landing pública
continua em aberto — falta o limitador de borda, mais duro aqui por escrever no banco a cada
chamada em vez de só ler.

**O que já limita o estrago:** o `CHECK` de documento (T005) recusa entrada fora do formato de
CPF/CNPJ antes de gravar, e o unique parcial por `(company_id, tax_id) where status = 'pending'`
faz reenvio update em vez de inserir linha nova — flood do mesmo documento não cresce a tabela.

**Origem:** spec 053, T007.

### 2026-08-25 — `GET /public/landing-settings` é anônima e sem limitador dedicado

**Onde:** `api-transportada`, módulo `landing` (spec 053, T004).

**O que é:** a rota responde sem autenticação e sem chave de tenant no path — ela sempre lê a
empresa provisionada da instalação (`PROVISION_COMPANY_ID`). Não há PII na resposta (marca,
contatos institucionais já públicos, endereço das unidades) e o corpo é idêntico para qualquer
chamador, então não é oráculo de nada. O que falta é o mesmo item já registrado abaixo para
recuperação de senha: um limitador de borda — aqui o risco é menor (raspagem de conteúdo público),
mas a rota soma à lista de anônimas sem teto.

**Origem:** spec 053, T004.

### 2026-08-26 — o worker passa a ter identidade de máquina, e ela alcança todas as empresas

**Onde:** `api-transportada`, caminho de autenticação; `worker-transportada`, credencial de cliente.

**O que é:** o worker vira um cliente do Keycloak com service account (ADR-0047), para acionar a
emissão automática de MDF-e que a spec 065 decidiu. Ele é reconhecido por papel em
`realm_access.roles`, pela mesma porta em que `platform-admin` já é.

**O que muda em risco, e é o motivo desta entrada:** o `§2` acima manda derivar o tenant do contexto
autenticado e nunca de campo livre do cliente. Um token de gente carrega `company_id` e fica **preso a
uma empresa**; um service account **não pode** — o worker processa CT-e de todas elas. Então a empresa
chega no pedido e continua sendo **validada contra a membership real do usuário do serviço**: a
autorização é idêntica à de gente, o que muda é o transporte.

O preço é concreto: **o token do serviço é cross-tenant**. Vazado, ele alcança toda empresa onde a
membership sintética existir — enquanto um token de gente alcança uma.

**As três guardas, e nenhuma é opcional:**

1. **Escopo de uma rota.** O serviço não recebe `mdfe.manage`, que também descarta manifesto: recebe
   uma permissão criada para isto, e o papel dele concede só ela.
2. **Segredo rotacionável**, em variável validada no boot, e a troca vale a partir do próximo token —
   rotacionar não pode exigir janela de emissão parada.
3. **Trilha com a identidade do serviço**, nunca "o sistema": é a linha que responde por que aquele
   manifesto saiu.

**O que falta:** **tudo.** Nesta data existe só a decisão registrada — o caminho de autenticação, o
papel, a permissão e a credencial do worker **não foram implementados**. Enquanto não forem, o MDF-e
automático só sai se alguém chamar a rota na mão, e o painel de prontidão é quem avisa que dá.

**Origem:** spec 065, ADR-0047.

### 2026-08-26 — a posição passa a ser permitida à própria origem, e a coordenada tem prazo

**Onde:** `frontend-transportada`, `server.ts` (mapa `SECURITY_HEADERS`); `api-transportada`,
`trip_stop_events`.

**O que é:** o cabeçalho passa a `camera=(self), geolocation=(self), microphone=()`. O motorista
confirma a entrega no celular e a coordenada carimba **onde ele estava quando confirmou** — é o que
separa "entreguei" de "entreguei lá" (ADR-0045 §3). Abrir capacidade de dispositivo é decisão que se
audita, e por isso ela é registrada aqui em vez de ser uma linha mudada em silêncio.

**O que continua fechado:** `microphone=()`, para todo mundo. E `(self)` não é `*`: nenhum `iframe` de
terceiro herda a posição, e a CSP declara `frame-src 'none'` desde a ADR-0037.

**O que a decisão proíbe, e é a parte que importa:** a captura é `getCurrentPosition` **uma vez por
confirmação**, nunca `watchPosition`. A coordenada mora no evento de entrega e **não existe tabela de
posição do motorista** — não há "onde ele está agora", só "onde estava quando confirmou". Recusar a
permissão **não bloqueia a entrega**: ela é gravada com `location: null`, porque produto que exige
coordenada é produto que o motorista contorna anotando no papel.

**Retenção:** 90 dias. Depois disso o expurgo agendado apaga `latitude`, `longitude` e
`accuracy_meters` **preservando o evento** — a viagem continua auditável, a localização da pessoa não
fica. Dado de localização de pessoa identificada é dado pessoal na LGPD (art. 5º, I), e reter "por
garantia" transforma comprovante em passivo.

**O que falta:** nada em aberto. O contrato de cabeçalhos guarda os dois sentidos (falha se
`geolocation` voltar a `()` e falha se `microphone` deixar de ser `()`), e o expurgo tem teste de
integração com relógio injetado — retenção escrita e não implementada é retenção que não existe.

**Origem:** spec 057, T001/T005/T012.

### 2026-08-24 — a câmera passa a ser permitida à própria origem no `Permissions-Policy`

**Onde:** `frontend-transportada`, `server.ts` (mapa `SECURITY_HEADERS`).

**O que é:** o cabeçalho era `camera=(), geolocation=(), microphone=()`. `camera=()` nega a **própria**
origem: `getUserMedia` falha antes de qualquer diálogo do navegador. Passa a `camera=(self)`, para o
separador ler o QR da nota pela câmera do celular na tela de viagem (spec 055). Abrir capacidade de
dispositivo é decisão que se audita, e por isso ela é registrada aqui em vez de ser uma linha mudada
em silêncio.

**O que continua fechado:** `geolocation=()` e `microphone=()` — a tela não pede posição nem áudio, e
nada nesta mudança os toca. `(self)` não é `*`: nenhum `iframe` de terceiro herda a câmera, e a CSP
já declara `frame-src 'none'` desde a ADR-0037, então não há moldura de terceiro dentro da nossa tela
para herdar coisa alguma. O navegador continua pedindo consentimento ao usuário a cada origem — o
cabeçalho remove o bloqueio, não a permissão.

**O que falta:** nada em aberto. O contrato
`frontend-transportada/test/shared/security-headers.contract.ts` guarda os dois sentidos: falha se
`camera` voltar a `()` e falha se `geolocation` ou `microphone` deixarem de ser `()` — a carona de
capacidade de dispositivo é o risco real de seis meses adiante, não a câmera que alguém pediu.

**Origem:** spec 055, T003.

### 2026-08-21 — a rota de CEP chama provedor externo sem limitador de requisição

**Onde:** `api-transportada`, `addresses/presentation/postal-code.routes.ts` e
`addresses/infrastructure/postal-code.gateway.ts` (`GET /postal-codes/{cep}`).

**O que é:** a rota é autenticada (`addresses.read`, escopo `company`) e, quando as nossas tabelas não
sabem o CEP, chama a BrasilAPI e, se ela falhar, o ViaCEP. **Esta API não tem limitador de requisição
nenhum**, então um cliente em laço vira uma chamada externa por requisição, com a nossa infraestrutura
como origem em vez do navegador do operador — o que é exatamente o que a ADR-0037 apontou como preço
do proxy ("pediria um limitador de taxa que esta API não tem"). É o §3 do baseline, que manda limitar
"qualquer rota que dispare custo externo".

**O que já limita o estrago:** a rota exige token com `addresses.read` (fora de `finance`, `viewer`,
`driver` e `aggregate`) e resolve o tenant antes de tocar no domínio, então não há caminho anônimo; só
chega ao provedor **o que a base não souber**, e a base tende a saber cada vez mais; o campo da tela é
debounced e cancelado por `AbortSignal` a cada tecla; o `AbortSignal` e o timeout do gateway impedem
que uma resposta pendurada acumule requisição; e a resposta sai com `cache-control: no-store`, sem
nada logado do endereço.

**O que falta:** um limitador na borda — por empresa e por usuário autenticado, mais duro nesta rota
por ela disparar custo externo. É o **mesmo limitador ausente** dos dois achados abaixo
(recuperação de senha e o de 2026-08-13); não são três problemas, é um, cobrado em três lugares. Um
cache curto de CEP por empresa reduziria a chamada externa, mas não substitui o teto.

**Decisão:** **ADR-0040**, item 5 — a rota sobe assim, com o achado datado. O saldo é positivo (o
volume de transferência ao provedor cai) e o preço está escrito em vez de descoberto depois.

**Atualização 2026-09-24 (spec 186):** a busca passou a correr em paralelo — banco e provedores
partem juntos, e entre os provedores entra a AwesomeAPI (`cep.awesomeapi.com.br`). Duas frases acima
deixam de valer: agora **todo CEP consultado sai para os três provedores** configurados
(`brasilapi.com.br`, `cep.awesomeapi.com.br`, `viacep.com.br`), inclusive quando a base sabia, e um
cliente em laço vira **três** chamadas externas por requisição, não uma. O que sai continua sendo
oito dígitos de CEP e nada mais — a porta do provedor não recebe `companyId`, e os perdedores da
corrida são abortados. Com `GOOGLE_MAPS_API_KEY` presente, `maps.googleapis.com` é o quarto destino:
**cada busca é uma chamada paga** (um laço aqui é custo, não só volume), e o resultado preenche campo
que é gravado, o que os termos do Google Maps Platform não permitem guardar para sempre (ADR-0044
§3) — risco aceito por decisão do usuário, spec 186. O limitador que falta passou a pesar três vezes mais; a prioridade dele não
muda, mas este é o argumento mais forte que ele tem hoje.

**Origem:** spec 050, T7.2.

### 2026-08-20 — endereço do motorista sai do navegador para quatro terceiros, sem CSP para conter

**Onde:** `frontend-transportada`, `fleet/shared/driverAddress.service.ts` e
`fleet/hooks/useDriverAddressLookup.hook.ts` (formulário de motorista e cadastro rápido).

**O que é** (como estava quando foi achado; o estado de hoje está em "Decisão", abaixo)**:** o
preenchimento de endereço consultava quatro provedores públicos direto do navegador do
operador — `brasilapi.com.br` e `viacep.com.br` pelo CEP, `photon.komoot.io` e
`nominatim.openstreetmap.org` pela busca textual — e o mapa é um `iframe` de
`openstreetmap.org/export/embed.html` com a coordenada na URL. O que viaja é **dado pessoal de
pessoa física** (CEP e endereço residencial do motorista, digitados na tela), e viaja **na query
string**, que é exatamente o que o §8 do baseline proíbe. São quatro operadores sem contrato, sem
DPA e fora do inventário de tratamento — e o `Referer` entrega de quebra a origem da instalação do
cliente.

Um quinto destino sai do mesmo formulário e **não** carrega dado pessoal: a lista de municípios do
IBGE (`brasilapi.com.br/api/ibge/municipios/v1/{UF}`, em `fleet/shared/municipality.service.ts`)
manda só a sigla do estado. Ele não é achado de LGPD; entra aqui porque a CSP que faltar precisa
enumerá-lo também, senão publicar a diretiva quebra o select de cidade.

Não há **CSP nenhuma no repositório** (`rg 'connect-src|Content-Security-Policy'` não devolve nada),
o que é violação autônoma do §3 e o que faz este achado ser sem teto: nada na borda declara para
onde o bundle pode falar, então qualquer destino novo — nosso ou de dependência comprometida — sai
sem obstáculo.

A política de uso do Nominatim ainda pede no máximo 1 req/s e um `User-Agent`/`Referer`
identificável. `User-Agent` é cabeçalho proibido ao `fetch` do navegador: **não temos como cumprir
essa metade** de dentro da página.

**O que já limita o estrago:** a busca é debounced (400ms), sai só a partir de cinco caracteres, é
cancelada por `AbortSignal` a cada tecla e pede no máximo seis resultados; nenhuma resposta é logada;
e a chamada parte do navegador do operador, não do servidor, então o endereço não passa pela nossa
infraestrutura a caminho do terceiro.

**Decisão (2026-08-20):** a **ADR-0037** decidiu, status `aceito`, e está **executada**. A leitura
campo por campo mostrou que não é um trilho, são quatro com exposição muito diferente: a consulta de
CEP manda **oito dígitos** e nada mais, enquanto quem mandava o endereço residencial inteiro era
`locateAddress` — e ela existe **para o mapa**, não para preencher o formulário, que já está
preenchido quando ela roda. Então: saiu o mapa (com o `iframe`, a coordenada e a geocodificação de
confirmação), saiu o Nominatim (a política pede `User-Agent`, cabeçalho proibido ao `fetch` — termo
que não temos como cumprir de dentro da página), ficaram a consulta de CEP com os dois provedores, o
Photon e a lista do IBGE. **Não
há proxy:** hoje a requisição parte do navegador do operador e o endereço não passa pela nossa
infraestrutura; o proxy inverteria isso, criando superfície de PII onde não existe nenhuma, e pediria
um limitador que esta API não tem.

**Executado (spec 046, T007-A):** saíram o mapa, o `iframe`, a coordenada, a geocodificação de
confirmação e o provedor Nominatim. Sobraram três destinos com dado pessoal — `brasilapi.com.br` e
`viacep.com.br` recebendo **oito dígitos de CEP**, e `photon.komoot.io` recebendo o **termo
digitado** — mais a lista do IBGE, que leva só a sigla do estado. O endereço residencial completo
**não sai mais do navegador**. O contrato-guarda
`apps/frontend-transportada/test/fleet/address-map-removed.contract.ts` falha se algum dos símbolos
ou dos dois destinos voltar ao bundle.

**Atualizado (spec 069, 2026-09-01) — o endereço passou a sair também do servidor, e por dois
trilhos novos.** Até aqui o parágrafo acima descrevia bem o risco: as chamadas partiam do navegador
do operador, e a nossa infraestrutura não via o dado. A geocodificação inverte isso de propósito.

- **Degrau 1, sempre**: o CEP vai à BrasilAPI (`/cep/v2`) **a partir do worker** — na rotina de
  população adiantada e dentro da sugestão. São **oito dígitos**, a mesma exposição que a consulta de
  CEP já tinha, agora com a nossa infraestrutura no caminho.
- **Degrau 2, só por marca humana**: o endereço **por extenso** — logradouro, número, bairro, cidade,
  UF e CEP — vai ao Google Geocoding, a partir da API. É a maior exposição de endereço que o produto
  já teve para um terceiro, e ela é deliberada: a ADR-0044 §3 escolheu o provedor por cobertura em
  cidade do interior e **assumiu por escrito** a exceção aos Termos do Google Maps Platform, que não
  permitem o armazenamento permanente que fazemos.

**O que limita o estrago:** o degrau 2 **não tem gatilho automático** — só um humano com
`trip.manage` o dispara, há teto de 60 marcas por hora por empresa, e um contrato de teste
(`worker/test/routing/paid-provider-never-called.contract.ts`) falha se a sugestão passar a chamá-lo
sozinha. O endereço enviado é lido **escopado pela empresa do contexto**. Nada do endereço entra em
log, em nenhum nível, e há contrato varrendo as linhas emitidas nos três cenários — inclusive no erro
do provedor, que devolve o endereço na mensagem.

⚠️ **Aberto:** `geocoded_addresses` guarda `cityCode|postalCode|number` em claro e sem tenant. Não há
nome, documento nem razão social, e é isso que sustenta a tabela não ter `company_id` — mas o CEP e o
número **são** um ponto de entrega identificável, e a decisão de não criptografá-los não foi tomada
por escrito em ADR, como foi a da ficha do motorista (ADR-0039). Fica registrado para ser decidido,
não redescoberto.

⚠️ **Aberto:** a rota da marca **não tem rate limit de infraestrutura** — o teto é de aplicação,
contado na própria trilha. É o mesmo achado já registrado para as rotas de senha: não existe
limitador nesta API.

**Executado (spec 046, T008):** a CSP existe e é servida em toda resposta. Ela é composta no
**build** — `VITE_API_URL` e `VITE_KEYCLOAK_URL` são inlinadas no bundle e não existem no contêiner
que serve o `dist` —, sai por `dist/content-security-policy.txt` e o `server.ts` **não sobe** sem o
arquivo (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`), porque publicar sem cabeçalho é a única falha
que não quebra nada visível. `connect-src` enumera os três destinos mais a API e o Keycloak;
`frame-src`, `frame-ancestors` e `object-src` são `'none'`; `script-src 'self'` sem `unsafe-eval`. A
folga de `'unsafe-inline'` existe **só** em `style-src`, pelo atributo `style` da camada flutuante que
nonce não cobre (`style-src-attr` é ignorado pelo Safari < 15.4 e quebraria todo select no iPhone).
O contrato `test/shared/content-security-policy.contract.ts` varre `src/**` por origem `https://` e
falha se alguma não estiver na diretiva ou declarada como nunca buscada — destino novo em qualquer
módulo cai ali.

**Executado (spec 050, T6.1–T6.4):** o CEP **não sai mais do navegador**. Ele passa por
`GET /postal-codes/{cep}` (`addresses.read`, escopo `company`), que consulta primeiro as nossas quatro
tabelas de endereço — `nfe_addresses`, `fleet_drivers`, `company_fiscal_profiles` e os dois CEPs de
`mdfe_manifests`, cinco consultas em corrida, `company_id` no `where` de cada uma — e só chama a
BrasilAPI e o ViaCEP quando a base não sabe. Todo acerto local é uma transferência a terceiro que não
acontece, e é a primeira redução deste achado que é **medida** em vez de declarada.
`viacep.com.br` saiu do `connect-src`; `brasilapi.com.br` ficou pelo cadastro por CNPJ e pela lista de
municípios do IBGE, que continuam saindo do navegador. **ADR-0040** — que reverte, para o CEP e só
para ele, o "não há proxy" do item 5 da ADR-0037: o proxy volta porque o navegador não lê as nossas
tabelas, não como remédio de privacidade.

**O que falta:** inventariar no registro de tratamento o que sobrou — o termo digitado indo ao Photon,
e o CEP indo aos dois provedores **quando a base não souber**. O achado **encolheu três vezes**, e não
fechou: a borda declara para onde o bundle pode falar e o volume caiu, mas o caminho ao provedor sem
contrato continua existindo, agora com a nossa infraestrutura como origem (ver o achado de
2026-08-21, no topo).

**Origem:** auditoria de lacunas do cadastro de motorista (spec de endereço, ainda sem
`spec.md`/`evidence.md`).

### 2026-08-20 — data de nascimento do motorista em claro, contra o §5

**Onde:** `fleet_drivers.birth_date` (`api-transportada/src/database/fleet.schema.ts`).

**O que é:** o §5 do baseline manda criptografar campo sensível em repouso e nomeia data de
nascimento entre eles, com chave de aplicação separada da chave do banco. A coluna é `date` em
claro. `license_number` (CNH, onze dígitos), o endereço residencial e o trio do RG
(`identity_document`, `identity_document_issuer`, `identity_document_state`, acrescentados em
2026-08-23) estão na mesma situação, e o `tax_id` do motorista — CPF — já estava, desde antes desta
feature.

**O que já limita o estrago:** a tabela é por empresa, toda query filtra `company_id`, o banco não
tem exposição pública e o acesso é só pela rede interna; nenhum destes campos vai para log, e
nenhum aparece em nome de objeto no bucket. O backup é criptografado antes do upload.

**Decisão (2026-08-20):** a **ADR-0039** decidiu, status `aceito`, e **não está executada**. A leitura
coluna por coluna mostrou que a tabela não tem uma resposta só, e que o campo mais sensível é o único
que não dá para proteger: `birth_date`, `license_number`, o endereço e o telefone vão para um envelope
A256GCM único, com AAD por motorista e índice cego com HMAC para a CNH continuar única por empresa —
justamente porque **não têm leitor**, e por isso é o momento mais barato que vai existir. O adendo de
2026-08-23 põe o trio do RG no mesmo envelope, pelo mesmo motivo, sem índice cego: o RG não é único no
produto.
`tax_id` fica em claro por decisão: `mdfe-payload.builder.ts:72` já o lê, e o mesmo CPF está em claro
em `mdfe_issuance_payloads.payload`, comprometido por `payload_sha256`, e no XML que o produto
preserva — criptografá-lo protegeria o motorista que nunca entrou em manifesto e cobraria a unicidade,
o CHECK e o caminho de outra app. `name` (busca por trecho) e `license_expires_at` (a data que o aviso
de CNH vai varrer) ficam em claro por serem o que se consulta.

**O que a ADR não promete:** o chaveiro vive no ambiente da própria API. Isto defende **leitura do
banco sem a aplicação** — credencial somente-leitura vazada, Adminer ou Metabase mal configurado,
`pg_dump` indevido, backup restaurado em outro lugar —, que é a ameaça que o §5 descreve ao pedir
chave separada da do banco. Não defende aplicação comprometida.

**O que falta:** executar. Migração de expansão, backfill que sela pela aplicação, índice cego e
contração — que é **destrutiva** e exige aprovação humana, com `rollback.sql` que devolve as colunas e
não os valores. É spec própria. Até ela existir, as colunas seguem em claro: o achado saiu de "sem
decisão" para "decidido e pendente", e não fechou.

**Lacuna que este achado revelou e não resolve:** **não existe rotação de chave neste repositório**,
para nenhum envelope — nem para as credenciais de NFS-e. O `keyId` deixa a porta aberta; re-selar
linha não está escrito.

**Origem:** auditoria de lacunas do cadastro de motorista.

### 2026-08-17 — postback de NFS-e sem assinatura, autenticado só pelo token do caminho

**Onde:** `POST /public/nfse-callbacks/{token}` (`api-transportada`, módulo `nfse-callbacks`).

**O que é:** a Nota RP **não assina o postback**. A coleção oficial da v2 mostra os quatro exemplos
de retorno saindo com um único cabeçalho, `Content-Type: application/json` — não há
`X-Hub-Signature-256`, `X-Signature` nem equivalente para verificar. Isso quebra a regra do §3 do
baseline ("todo webhook público valida assinatura HMAC com `rawBody`"), e não por escolha nossa: não
há o que validar. A única prova de origem é o token opaco no caminho, e ele viaja na URL — logo
aparece em log de proxy e de CDN, que é justamente onde token não deveria estar.

**O que já limita o estrago:** o postback é **gatilho, não fonte da verdade**. O corpo não é lido,
não é validado e não é logado; quem chama a rota só consegue **antecipar** uma reconciliação que o
cron `nfse.status.pull` faria de qualquer jeito, e o estado da nota vem depois disso da consulta
autenticada ao provedor. A resposta é 204 invariável — token válido, inventado, empresa inexistente
ou banco fora do ar respondem igual, então a rota não é oráculo de existência. O token é opaco, por
empresa, guardado só como digest sha256, comparado com `timingSafeEqual` e sem saída antecipada do
laço. E a rota **só existe** onde `NFSE_CALLBACK_BASE_URL` está configurada.

**O que falta:** um limitador na borda (a API não tem nenhum — ver o achado abaixo, é o mesmo
buraco), e reavaliar se o provedor passa a assinar. Rotação do token de callback por empresa
continua sendo o remédio se um endereço vazar.

**Origem:** spec 040, T011.

### 2026-08-13 — rotas anônimas de recuperação de senha sem rate limit

**Onde:** `POST /password-resets` e `POST /password-resets/confirm` (`api-transportada`, módulo
`identity`).

**O que é:** as duas rotas atendem sem autenticação nenhuma, e esta API **não tem limitador para
registrá-las** — `rg 'rateLimit|rate-limit|RATE_LIMIT' apps/api-transportada/src` não devolve nada.
Sem teto, a primeira rota é um canal de envio de e-mail acionável por qualquer um, e a segunda
aceita tentativa ilimitada de adivinhar o código.

**O que já limita o estrago:** o código é de uso único, expira em 15 minutos e vem de fonte
criptográfica; a primeira rota responde 204 para login existente e inexistente, então não serve de
oráculo de enumeração; e nenhuma das duas escreve `username`, endereço ou código em log.

**O que falta:** um limitador na borda da API — por IP e por login alvo, mais duro nestas duas
rotas — e o gate de tentativas por pedido, que hoje só existe pela expiração.

**Origem:** spec 033, T006. A task pedia "registrar no limitador"; não havia onde.

### 2026-08-25 — staging passa a conter os dados pessoais de produção

**Onde:** `deploy/staging-refresh/`, serviço Railway com `cronSchedule` semanal.

**O que é:** staging aponta para o ambiente de homologação da SEFAZ, e homologação não devolve nota
real — a distribuição roda e traz nada, deixando staging sem massa para testar. A decisão foi
espelhar a base de produção inteira em staging uma vez por semana, **sem anonimização**, porque o
objetivo declarado é replicar o ambiente.

A consequência é que staging passa a guardar os mesmos dados pessoais de terceiros que produção:
CPF/CNPJ, nome, endereço e telefone de destinatário em `nfe_participants`/`nfe_addresses`. Sob a
LGPD isso é tratamento com finalidade diferente da coleta, e o dado não é da transportadora: é dos
clientes dos clientes dela.

**O que ficou de fora, por decisão:** os XML assinados **não** são copiados — copiá-los exigiria uma
credencial de leitura do bucket fiscal de produção morando dentro de staging, e isso é acesso
permanente, não o retrato semanal que foi decidido. Também não atravessam: nenhum dado de emissão
(CT-e, MDF-e, NFS-e, faturamento), a numeração fiscal, as credenciais de provedor de NFS-e, e o
`secret_envelope` de `digital_certificates` — o certificado A1 que assina documento fiscal de
verdade, que num restore cru iria junto e é risco maior que qualquer PII.

**O que já limita o estrago:** a réplica roda **dentro do Railway**, como o ciclo de backup — o dump descriptografado e os XML não atravessam runner hospedado de terceiro, que era o desenho inicial e foi descartado por isso. O banco de produção nunca é acessado — a origem é o backup cifrado
que o ciclo diário já produz, e o bucket é copiado com credencial de leitura. O Keycloak de
produção **não** atravessa: staging mantém os próprios usuários e realm, então login de produção
não passa a valer lá. A guarda do primeiro passo recusa qualquer alvo cujo host seja o de produção,
antes de baixar qualquer coisa.

**Atualização de 2026-09-14 — as identidades são religadas ao realm de staging.** O restore traz
`external_identities` com o issuer e os subjects de produção, e com eles todo login de staging
respondia 401. O passo `rebind_identities` casa cada usuário do realm de staging com a pessoa do
sistema pelo username (e, na falta dele, pelo e-mail do perfil), e grava o vínculo no issuer de
staging. Consequência declarada: **quem tem conta no realm de staging passa a entrar como a pessoa
de produção com o mesmo username ou e-mail**, com as memberships dela. A conta de serviço com o papel
`transportada-service` é ligada ao ator sintético com membership `automation` (ADR-0047) — sem isso
o worker de staging levaria 401. O casamento ambíguo (um e-mail em mais de um perfil, ou mais de um
ator `automation`) fica de fora, as demais `service-account-*` ficam de fora, e o log registra só
contagens. O passo recusa rodar se o issuer configurado já estiver nos dados restaurados — é o sinal
de que a variável aponta para o Keycloak de produção. O serviço passa a guardar o client secret de
admin do realm de staging.

**O que falta:** tratar staging com o mesmo controle de acesso de produção, que é o preço da
decisão — quem entra em staging passa a ver PII real. Concretamente: revisar quem tem credencial do
banco e do bucket de staging, e definir retenção (hoje o refresh sobrescreve, mas nada expira).
Reavaliar a anonimização se algum dia staging for aberto a alguém de fora do time.

**Origem:** pedido de operação, 2026-08-25. O risco foi levantado e a cópia idêntica foi decidida
conscientemente.

### 2026-09-25 — `style-src 'unsafe-inline'` na app do motorista (risco aceito)

**Onde:** `apps/frontend-driver`, `src/modules/shared/contentSecurityPolicy.service.ts`
(`buildContentSecurityPolicy`), cópia por valor de `apps/frontend-client` (ADR-0075 §7).

**O que é:** a CSP emitida declara `style-src 'self' 'unsafe-inline'`, em vez de restringir só a
`style-src-attr` (a diretiva mais estreita, que cobriria o atributo `style=""` sem abrir `<style>`
solto). A folha já traz o motivo escrito ao lado da linha: `style-src-attr` é ignorada pelo Safari
< 15.4, e sem `style-src` declarando `unsafe-inline` o navegador que não reconhece a diretiva mais
nova cai para bloquear inline por completo — e a app do motorista é aberta no celular, onde Safari
antigo ainda existe em campo.

**Por que foi aceito assim:** apertar para `style-src-attr` sozinho troca um risco conhecido e
contido (inline permitido, sem `<style>` externo controlado por atacante — o `object-src`/`frame-
src none` e o `script-src` sem `unsafe-inline` continuam de pé) por uma quebra silenciosa: Safari
antigo perde todo estilo inline da app (React `style={{...}}`, os poucos usos de `style` do design
system copiado) sem aviso nenhum na tela, pior que manter a exceção.

**O que limita o estrago:** `unsafe-inline` aqui só afeta `style-src` — `script-src` continua sem
ele fora do smoke autenticado (`allowsInlineScript`), e é `script-src` que carrega o risco real de
XSS. CSS injetado por essa via não executa código; o pior caso é desfiguração visual, não
exfiltração.

**O que falta:** revisitar quando o piso de Safari suportado subir de 15.4 — aí `style-src-attr`
some sozinho da lista de "ignorado" e a diretiva mais estreita passa a valer sem quebrar ninguém.

**Origem:** spec 189, T9.2 (revisão final, achado L1). Registrado em 2026-09-25.

### 2026-09-25 — CI não roda `bun audit` (pendência, com os números)

**Onde:** `.github/workflows/ci.yml` e `deploy.yml` — nenhum job chama `bun audit` nem equivalente.

**O que é:** a auditoria de dependência exigida por `security.md` §4 ("CI roda auditoria de
dependência e falha em vulnerabilidade alta/crítica sem exceção registrada") não existe neste
repositório. Rodado à mão em 25/09/2026 contra o lockfile atual:

```
$ bun audit
44 vulnerabilities (29 high, 12 moderate, 3 low)
```

em 10 pacotes transitivos: `@xmldom/xmldom` (via `@adatechnology/fiscal-provider`),
`brace-expansion` (via `eslint`/`typescript-eslint`/`vite-plugin-pwa`), `mailauth`/`nodemailer` (via
o worker), `nanoid` e `postcss` (via `vite` do portal), `sharp` (via `@vite-pwa/assets-generator`),
`fast-xml-parser` (via a API e o pacote fiscal), `joi` (via `mailauth`), `fast-uri` (via `eslint` e
`vite-plugin-pwa`) e `browserslist` (via `@vitejs/plugin-react`/`vite-plugin-pwa`). Todos
transitivos de ferramenta de build/lint ou de um pacote de terceiro (`mailauth`, usado pelo
worker para DKIM/DMARC) — nenhum é dependência direta do produto, e nenhum destes CVEs tem
caminho de exploração conhecido a partir de entrada do usuário nesta base (a maioria é
`ReDoS`/DoS em parser de XML/URI que não recebe payload externo não confiável, ou vulnerabilidade
de ferramenta de build que roda só no CI, nunca em produção).

**O que falta:** um job de auditoria no `ci.yml` (gate de qualidade), com `--audit-level` no piso
que a instalação aceitar e uma lista de exceção registrada por CVE (`--ignore`) para o que for
avaliado e aceito — este achado não fecha a lacuna, só documenta que ela existe e dá o número atual
para comparar na próxima medição.

**Origem:** spec 189, T9.2 (revisão final, achado L9). Registrado em 2026-09-25.

### 2026-09-25 — o link "navegar até a parada" manda o endereço para o Google (risco aceito)

**Onde:** `apps/frontend-driver`, `driverTripView.service.ts:buildNavigationHref`, chamado por
`DriverStopCard.component.tsx` (`window.open`, `NON_FETCH_ORIGIN` inclui `https://maps.google.com`
em `contentSecurityPolicy.service.ts`).

**O que é:** o botão "Navegar" da parada monta `https://maps.google.com/?q=<coordenada ou
endereço>` e abre numa aba nova — o endereço de entrega (ou a coordenada, quando existe) do
destinatário vai na query string para o Google, um terceiro fora do produto. O destinatário é
pessoa física em boa parte das entregas, e o endereço é dado dele, não do motorista.

**Por que foi aceito assim (ADR-0045 §8):** "navegar é delegar" — a app não implementa roteirização
turn-by-turn própria; ela entrega a parada ao aplicativo de mapa que o motorista já tem instalado,
e não há como abrir navegação nativa sem passar o destino por algum canal. É `window.open` de um
gesto do próprio motorista (não um `fetch` em segundo plano, não some do controle do usuário), e
`maps.google.com` está declarado à parte em `NON_FETCH_ORIGIN`, justamente para não entrar em
`connect-src` — o bundle nomeia a origem sem nunca buscar nela.

**O que limita o estrago:** só o endereço/coordenada da parada viaja, nunca nome do destinatário,
documento, telefone ou qualquer outro campo — os mesmos que a API já não expõe a quem não tem
`fleet.read`. O Google já processa a mesma classe de dado quando qualquer pessoa cola um endereço
na própria busca; não é um canal novo de vazamento em massa, é uma consulta pontual por toque.

**O que falta:** nada de código pendente — é decisão de produto (delegar navegação), não defeito.
Revisitar só se o produto um dia trocar por navegação própria ou por um provedor de mapa sem esse
acoplamento.

**Origem:** spec 189, T9.2 (revisão final, achado L10); ADR-0045 §8. Registrado em 2026-09-25.

## CPF em claro no Keycloak, para casar a pessoa dos dois lados

**Data:** 2026-08-29 · **Decidido conscientemente**

A reconciliação entre os usuários da empresa e o realm precisa saber quando duas contas são a mesma
pessoa. A pessoa tem **um documento e vários e-mails**, então o documento é a chave que funciona — e
o realm não guardava documento nenhum: o produto só escrevia `company_id`.

A partir de agora o CPF é gravado **em claro** no atributo `tax_id` do usuário do Keycloak, no
convite, na edição de perfil e num backfill de quem já existe. Isso espalha PII para um segundo
sistema: o CPF passa a existir no banco do Keycloak e nos backups dele, fora do alcance das nossas
regras de retenção.

**A alternativa que foi oferecida e recusada:** índice cego com HMAC, o mesmo padrão que a ADR-0039
escolheu para a CNH do motorista. Ele casaria a pessoa igual — compara-se hash com hash — sem que o
documento saísse da nossa base. O custo era uma chave nova para gerenciar e um valor ilegível no
console do Keycloak. A escolha por valor em claro foi do dono do produto, com o risco declarado.

**O que limita o estrago hoje:** o atributo não é lido por ninguém além da reconciliação, e ela
mascara o documento na resposta (`***09`) — o valor cru é usado só para casar, dentro do servidor.
O backfill não escreve documento vazio, e a escrita leva `company_id` junto porque o Admin API
substitui o conjunto inteiro de atributos.

**O que falta:** decidir a retenção do atributo no realm (hoje nada o expira), e reavaliar o índice
cego se o Keycloak passar a ser acessado por mais gente do que hoje.

## Fechados

### 2026-09-25 — PUT tardio na URL de subida trocava a foto da ocorrência já conferida (spec 179)

**Onde:** `api-transportada`, `trips/application/confirm-occurrence-upload.use-case.ts` e
`trips/domain/occurrence-attachment.policy.ts` (`buildOccurrenceUploadFinalObjectKey`). Mesmo defeito
de forma do achado S1 da spec 183 (T903, anexo da conversa da ocorrência), achado depois ali e
procurado aqui.

**O que era:** a URL de PUT assinada da foto/PDF da ocorrência do motorista vale 15 minutos e segue
valendo depois da confirmação — a assinatura cobre chave e `Content-Length`, não um "uso único".
`confirmOccurrenceUpload` lia o objeto na chave da subida, conferia tipo pela assinatura dos bytes,
teto e sha256, e gravava `stored_objects.object_key` **na mesma chave**. Um PUT tardio com outro
arquivo do mesmo tamanho trocava os bytes já conferidos: o download passava a devolver o arquivo
novo, com tipo nunca conferido e sha256 que não bate mais com o registrado. Medido contra o MinIO
local antes da correção: o download devolveu o byte trocado.

**Corrigido:** a confirmação grava os bytes que acabou de conferir numa chave final nova
(`tenants/<empresa>/trip-occurrence-attachments/<viagem>/<token>`, 256 bits aleatórios em base64url),
que nenhuma URL assinada alcança, e aponta o registro para ela. A chave da subida só é apagada
**depois** de o registro gravado. Falha na gravação do registro apaga a cópia final (melhor esforço)
e sobe o erro; a chamada que perde a corrida de confirmação concorrente (achado [2]) apaga a própria
cópia e deixa a chave da subida para a vencedora. Contrato em
`test/trip-occurrence/upload.contract.ts` (ordem `store → confirm → delete`, limpeza na falha e na
corrida perdida); integração contra Postgres e S3 em
`test/integration/trip-occurrence-upload-confirm.integration.ts` (PUT tardio na mesma URL não muda o
download).

**Residual aceito:** o PUT tardio ainda **escreve** — recria a chave da subida com bytes que nada
referencia. `trip.occurrence-upload.expire` só varre linhas `pending`, e a linha já está
`confirmed`, então esse objeto fica órfão no bucket. Mesmo destino de uma falha ao apagar a chave da
subida depois da confirmação. Só quem recebeu a URL (o próprio motorista) consegue fazer isso, dentro
dos 15 minutos, com o tamanho declarado — nunca muda o anexo. ⚠️ A integração pula quando o S3 não
responde, e a CI não sobe o MinIO: a prova contra storage real só roda localmente.

### 2026-09-24 — objeto do upload de ocorrência sem dono no bucket, sem expurgo (spec 179)

**Onde:** `api-transportada` (`shared/job-catalog.constant.ts`, migration
`20260924033423_lumpy_scalphunter`); `worker-transportada`
(`trip-occurrence-upload-expire/`); `cron-transportada` e
`frontend-transportada/src/modules/shared/jobCatalog.constant.ts` (cópia do catálogo). Achado [3] da
revisão de código de 23/09 do lote da spec 179, registrado aberto em 23/09, fechado em 24/09 com
escopo ampliado para o worker.

**O que era:** `TRIP_OCCURRENCE_UPLOAD_STATUSES` incluía `'expired'`, mas nada escrevia esse status e
não havia varredura de `trip_occurrence_uploads` nem do objeto correspondente no bucket. Dois
vazamentos, contra §1/§7 deste documento:

1. Motorista pede a URL assinada, sobe a foto, perde sinal antes de chamar `confirm`: bytes ficavam
   no bucket, a linha em `trip_occurrence_uploads` ficava `pending` para sempre, e **não existia**
   `stored_objects` para essa foto — invisível para `trip.occurrence-attachment.purge` (spec 161
   RF21), que só varre `stored_objects`.
2. `confirm` roda e nunca é seguido do registro da ocorrência: `stored_objects` nasce com
   `retentionUntil` de cinco anos e nenhuma `trip_document_occurrences` aponta para ele.

**Corrigido (1):** nova rotina `trip.occurrence-upload.expire`
(`worker-transportada/src/trip-occurrence-upload-expire/`), registrada em `JOB_CATALOG` nas quatro
apps e agendada a cada `JOB_TICK_INTERVAL_SECONDS` (300s) via `job_schedules`
(migration `20260924033423_lumpy_scalphunter`). A cada batida: acha `trip_occurrence_uploads`
`pending` com `expires_at` vencido há mais de `TRIP_OCCURRENCE_UPLOAD_EXPIRE_GRACE_SECONDS` (900s —
a folga soma aos 900s da própria URL, para relógio/latência entre API e worker nunca apagarem um
objeto no instante em que um `confirm` legítimo ainda pode fechar `pending → confirmed`); trava a
linha com `for update skip locked` reconferindo `status = 'pending'` no momento do lock (perde a
corrida para um `confirm` concorrente com naturalidade); apaga o objeto do bucket **antes** de marcar
`expired` — a exclusão é idempotente do lado do storage (S3/MinIO aceitam apagar uma chave que já não
existe, cobrindo o caso do motorista que nunca chegou a subir nada), então rodar de novo sobre a
mesma linha nunca falha por "objeto já removido". Prova contra Postgres e MinIO reais em
`worker-transportada/test/integration/trip-occurrence-upload-expire.integration.ts`: o pendente
vencido (com e sem objeto de fato subido) vira `expired` e o objeto some do bucket; o pendente dentro
da janela continua intocado; o segundo ciclo não encontra mais nada.

**(2) já estava coberto, sem código novo:** a linha `stored_objects` que o `confirm` grava
(`drizzle-occurrence-upload.repository.ts`, achados [1]/[2] deste mesmo lote) usa
`resolveOccurrenceAttachmentRetentionUntil`, a mesma função e o mesmo prazo de cinco anos que
`trip.occurrence-attachment.purge` já aplica. Essa rotina resolve a unidade por
`findAttachmentByObjectId` em `trip_document_occurrence_attachments` (o anexo múltiplo do escritório,
spec 161) — a ocorrência do motorista (T203, spec 179) referencia o objeto por uma coluna diferente,
`trip_document_occurrences.attachment_object_id`, que essa consulta não conhece. Um objeto confirmado
por este caminho e nunca vinculado a uma ocorrência entra, portanto, no ramo "objeto órfão"
(`purgeOrphanObject`) da rotina existente assim que os cinco anos de retenção vencerem — mesmo se a
ocorrência **for** registrada depois, o objeto já legitimamente referenciado seria apagado só ao fim
dos mesmos cinco anos, que é exatamente a retenção pretendida (RF21) para toda foto de ocorrência,
não um vazamento paralelo. Não há um segundo vazamento aqui, só o mesmo prazo de sempre.

### 2026-09-12 — o ator da liquidação por procuração podia ser conta de serviço (B2)

**Onde:** `api-transportada`, `whatsapp-command-settlement` (spec 144, T014b, `795cb137`).

A revisão de segurança da Fase 3 (2026-09-12) achou que `resolveActor` da rota
`POST /whatsapp-command-requests/:id/settlement` aceitava um ator de papel `automation` como "quem
confirmou" — hoje inexplorável, porque o ator sempre nasce de pessoa, mas a defesa não estava
escrita. **Corrigido:** `resolveHumanActor` embrulha `deps.resolveActor` nos dois caminhos (revalidação
e retomada) e recusa qualquer membership de `SERVICE_COMPANY_ROLES`, a mesma marca que
`resolve-whatsapp-actor.use-case.ts` já usava na entrada da conversa. Papel de serviço agora dá
`actor_not_authorized` sem faturar e sem resumo, e a retomada devolve `resume_denied` sem chamar
`resume`. Prova em `settle-whatsapp-command.contract.ts`.

### 2026-09-07 — CPF real em fixture versionada

`test/fleet/vehicle-owner-completeness.contract.ts` e `test/fleet/vehicle-owner-fix.contract.ts`
carregavam nome, CPF e RNTRC do proprietário de um CRLV real — dado de pessoa física commitado,
contra o §1 do baseline.

Descoberto por acaso: o mesmo trio apareceu na tela de quem subiu aquele documento, e a busca pelo
nome só achou os dois arquivos de teste. O CPF era o **único** com dígitos verificadores válidos em
toda a base de teste; os seis do seed local são inválidos de propósito.

Trocado por dado sintético. `test/fleet/synthetic-tax-id.contract.ts` passa a reprovar CPF válido em
qualquer fixture, com lista fechada de exceções para os canônicos de documentação.

### 2026-09-15 — envio de e-mail à contratante sem teto de requisição (M1)

**Onde:** `api-transportada`, `POST /address-correction-requests/mail` e
`POST /contractor-mail-settings/test-email` (spec 150, revisão de segurança da Fase 4, fechado pela
T406).

**O que era:** as duas rotas disparam e-mail pelo Resend e não tinham limitador nenhum — um operador
(ou uma credencial comprometida) podia reenviar em rajada, sem teto, gerando custo direto no
provedor. É o M1 da revisão de segurança da Fase 4 desta spec.

**Corrigido:** as duas rotas declaram `rateLimit: { store: 'postgres', scope: 'contractor-mail',
maxRequests, windowSeconds }` — o `rateLimit` de rota virou união discriminada entre o limitador em
memória que a API já tinha (`store: 'memory'`) e este novo, com estado no Postgres
(`http/rate-limit-window.port.ts`, `DrizzleRateLimiterRepository`, tabela `rate_limit_windows`).
Janela fixa **compartilhada entre instâncias** (ao contrário do limitador em memória, que é por
processo), chave `scope:companyId:userId` — só UUIDs, nunca PII —, aplicada no mesmo ponto de hoje:
depois de `authorize`, antes de `parse`/idempotência (corpo inválido e replay idempotente contam
contra o teto). **Fail-closed**: erro do limitador propaga sem `try/catch` e vira 500 pelo Router —
sem saber quantos envios já saíram, o envio não sai. Estourado, `429 TOO_MANY_REQUESTS` com
`Retry-After`. Tetos vêm de env (`RATE_LIMIT_CONTRACTOR_MAIL_MAX`/
`RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS`), padrão 20 por hora. As janelas vencidas são apagadas
pela rotina `rate-limit.window.purge` do worker (corte de 48 h). Prova:
`test/integration/rate-limiter.integration.ts` — 30 chamadas concorrentes, exatamente 20 passam.

**O que continua aberto:** o teto é **por usuário**, não por empresa — não há um segundo teto
agregado só por `companyId`, então N operadores da mesma empresa multiplicam o volume total em
N × 20/h. E este achado fecha só o par de rotas de e-mail: as demais rotas autenticadas e todas as
rotas públicas/anônimas do produto (recuperação de senha, CEP, portal do contratante, candidatura de
agregado, webhook do WhatsApp — cada uma já registrada acima) continuam só com o limitador em
memória por processo, sem estado compartilhado entre instâncias. O achado geral "sem limitador com
estado compartilhado" segue aberto para o resto da API.

**Origem:** spec 150, RF18, revisão de segurança da Fase 4. T406, 2026-09-15.

_Nenhum ainda._
