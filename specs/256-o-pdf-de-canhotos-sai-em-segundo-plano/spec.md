# Feature 256 — O PDF de canhotos sai em segundo plano, num arquivo só

## Problema e resultado

A spec 253 entrega o PDF de canhotos pela API, no mesmo pedido HTTP, com teto de **200 blocos**:
o arquivo é montado inteiro na memória (`bufferPages`) porque o rodapé "Página X de Y" precisa do
total de páginas. Para o volume real (mais de 200 notas por exportação) isso não serve, e subir o
teto só aumenta o pico de memória da API.

Resultado: o operador pede o PDF, **vê o andamento** ("Medindo…", depois "N de M canhotos"), pode
**cancelar**, e ao fim baixa **um único PDF**. A geração roda no **worker**, em fluxo, sem segurar o
arquivo na memória, e a API só cria o trabalho e informa o estado.

## Decisões do usuário (2026-10-08)

- Pedido: "200 ainda é pouco e pensando nisso não podemos sobrecarregar os serviços, então precisamos
  fazer por partes, streamings e loadings".
- **Um PDF só.** Sem volumes nem partes: o resultado de cada exportação é **um arquivo**.

## Decisões por recomendação (aceitas por padrão; o usuário pode rever)

- Quem pede é quem baixa: o trabalho pertence à **pessoa** (não à empresa); outro usuário recebe 404.
- Arquivo disponível por **24 h**; depois o worker apaga o objeto e o trabalho vira `expired`.
- Aviso de pronto **só na tela** (sem e-mail).
- "Página X de Y" **mantida**, sobre o arquivo inteiro (dois passes: medir, depois desenhar).
- Teto inicial de **1000 canhotos** por exportação (medido na Fase 0; só sobe se o tamanho do arquivo
  e a memória do worker permitirem). Acima, 422 `TRIP_PROOF_REPORT_TOO_LARGE` com o teto.
- No máximo **2 exportações abertas por usuário** e **5 por empresa**; o worker faz **uma por vez**
  por instância.
- Permissão própria `trip.proof-export` para o `POST`, concedida no realm versionado aos mesmos papéis
  que passam em `fleet.read`/`trip.report-on-behalf` — o roteador só aceita `anyPermission` em GET e a
  regra de boot não se relaxa.

## Requisitos

- **RF1** `POST /v1/trip-proof-exports` recebe `{ filters }` (mesmos filtros da 253, até **1000** notas
  resolvidas) e o header `Idempotency-Key` obrigatório. Responde **202** com
  `{ id, status, totalBlocks }`. A mesma chave com o mesmo corpo devolve **200** com o mesmo trabalho;
  com corpo diferente, 409 `TRIP_PROOF_EXPORT_KEY_REUSED`. Erros: 400 `INVALID_REQUEST` (Zod, juntos),
  401, 403, 422 `TRIP_PROOF_REPORT_TOO_LARGE` (`details[{field:'blocks',max}]`), 422
  `TRIP_PROOF_EXPORT_EMPTY`, 422 `TRIP_PROOF_EXPORT_TOO_MANY_OPEN`, 429.
- **RF2** O trabalho guarda **só ids e flags** (`documentIds`, `canReadFinancials`, quem pediu, empresa).
  Nunca nomes, cidades, valores nem imagem. O worker lê as informações da nota por consulta própria,
  filtrada por `company_id`, e respeita `canReadFinancials` gravado no trabalho.
- **RF3** `GET /v1/trip-proof-exports/:id` devolve
  `{ id, status, totalBlocks, renderedBlocks, unavailableBlocks, totalPages?, expiresAt?, failureCode? }`,
  `status` em `queued|measuring|rendering|ready|failed|cancelled|expired`. Quem não é o dono recebe 404.
  `GET /v1/trip-proof-exports` lista os trabalhos do próprio usuário nas últimas 24 h.
- **RF4** `GET /v1/trip-proof-exports/:id/download-url` devolve URL assinada de **5 minutos** para o PDF
  único. 409 `TRIP_PROOF_EXPORT_NOT_READY` se ainda não terminou; 410 `TRIP_PROOF_EXPORT_EXPIRED`.
  Bucket e chave nunca saem na resposta.
- **RF5** `DELETE /v1/trip-proof-exports/:id` cancela (se em andamento) ou remove (se terminado) e é
  **idempotente** (204). O worker checa o cancelamento entre blocos e apaga o temporário.
- **RF6** O worker consome o trabalho de uma fila própria (outbox → RabbitMQ, padrão da spec 237) e gera
  o PDF **em fluxo**: passe 1 mede (dimensão de cada imagem, total de páginas), passe 2 desenha **sem
  `bufferPages`**, escrevendo o rodapé em cada página, para arquivo temporário; ao fim sobe o arquivo ao
  bucket por fluxo ou multipart. Memória do worker não cresce com o número de canhotos.
- **RF7** Progresso gravado a cada **25 blocos ou 2 s** (o que vier primeiro). Imagem que falha leitura
  ganha até 3 tentativas e depois o bloco "Imagem indisponível"; `unavailableBlocks` conta esses casos e
  o PDF segue. Falha geral → `failed` com `failureCode` estável, sem stack nem texto de erro de terceiro.
- **RF8** O layout do PDF é o da 253 (RF10 a RF12 dela): fluxo de blocos, imagem a 100% da largura útil
  com 5 a 7 cm, rotação da foto vertical, bloco de aviso sem canhoto, "1 de 2" na reentrega, só
  `kind = photo`, valor só com `trip.financials`, CPF/telefone fora. O worker o recebe **copiado por valor**
  e um **contrato de paridade** garante que layout e informações são iguais aos da API enquanto as duas
  convivem.
- **RF9** Painel (`/trips` e aba de notas): o botão **Exportar canhotos (PDF)** passa a criar o trabalho;
  um painel mostra barra de progresso com `aria-live="polite"` ("Medindo…", "N de M canhotos"), botão
  **Cancelar** e, pronto, **Baixar PDF** (navegação direta à URL assinada, não `blob` em memória). A
  lista **Exportações recentes** mostra os trabalhos das últimas 24 h. A recusa de 422 mostra o teto.
  O botão deixa de se desabilitar acima de 100 notas: vale o teto de 1000.
- **RF10** Retenção: o worker apaga, a cada hora, os objetos e marca `expired` os trabalhos com mais de
  24 h; trabalhos presos em `measuring`/`rendering` por mais de 30 min sem progresso viram `failed`.
- **RF11** Sem PII em log: só `exportId`, `companyId`, contagens e códigos. Tudo em i18n (pt-BR e en,
  acentuado). Documentação viva atualizada (regra 14) e auditoria §15.
- **RF12** Quando a 256 chegar à produção, a rota `GET /v1/trip-document-report/proofs-pdf` da 253 é
  **aposentada**: sai a rota, o gateway da API, o use case e o serviço do front. O contrato de paridade
  do RF8 deixa de existir junto com ela.

## Fora do escopo

- Várias partes/volumes e ZIP (descartados pelo usuário).
- E-mail de aviso, compartilhamento do arquivo com outro usuário, agendamento.
- Mexer na planilha da 253 (≤ 5000 linhas, lida por cursor em lotes de 100).
- Estado novo de viagem; imagens dentro do `.xlsx`.
