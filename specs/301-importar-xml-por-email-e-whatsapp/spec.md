# Feature 301 — Importar XML de NF-e por e-mail e por WhatsApp

> Pedido do Anderson em 08/11/2026: receber um zip cheio de XML (ou XMLs soltos) por e-mail e pelo WhatsApp, marcando o bot.

## Problema e resultado

Nota que não cita o CNPJ da transportadora não vem da SEFAZ (ver spec 298). Hoje o único caminho de XML é a tela
"Enviar XML" (`POST /nfe-imports/xml`, `.xml` e `.zip`). O contratante costuma mandar esses XMLs por e-mail ou
WhatsApp, e a operação baixa e reenvia à mão.

**Resultado:** o mesmo XML (ou zip) entra no sistema de três jeitos, **todos pelo mesmo caminho de importação**
(`requestUpload`: fila, deduplicação, relatório por item):

1. tela "Enviar XML" (já existe);
2. **e-mail** para uma caixa dedicada de notas;
3. **WhatsApp**: arquivo enviado marcando o bot (grupo ou conversa direta).

Em 2 e 3 o remetente recebe de volta um resumo: importadas, já estavam no sistema, inválidas (com o motivo).

## Fatos levantados no código (08/11/2026)

| Fato                                                                                                           | Fonte                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tela aceita `application/xml`, `text/xml`, `application/zip`; cria importação `source = upload`                | `nfe-imports/presentation/nfe-imports.schema.ts:13`, `request-nfe-import.use-case.ts` |
| Webhook de e-mail recebido (Resend, assinado) existe, mas só trata respostas de ocorrência e **não lê anexos** | `contractor-mail/application/process-inbound-email-webhook.use-case.ts`               |
| Endereço de entrada com token + allowlist de remetentes existe só para a prévia `.xlsm` (spec 237)             | `cargo-receiving/application/contractor-preview-email.use-case.ts`                    |
| Leitor de zip seguro (zip-slip, zip bomb) existe para a prévia                                                 | `cargo-receiving/domain/cargo-preview-zip.parser.ts`                                  |
| O bot lê só legenda de documento; não baixa mídia de XML                                                       | `occurrence-conversation/application/whatsapp-conversation-inbound.service.ts`        |

## Decisões (padrão mais seguro; o dono pode trocar)

- **D1 — Caixa:** nova, no domínio de entrada já configurado (ex.: `notas@<domínio de entrada>`), uma por instalação.
- **D2 — Quem pode enviar:** e-mail só de remetentes da allowlist da empresa (com DKIM alinhado, como a spec 237 RF3);
  WhatsApp só de números **cadastrados** (operador, motorista, ajudante). Fora disso: recusa educada, nada é importado.
- **D3 — Ator da importação:** e-mail e WhatsApp não têm usuário logado; a importação é gravada com o usuário dono do
  remetente (WhatsApp) ou com um ator de sistema "caixa de notas" (e-mail), e a origem (`email`/`whatsapp`) fica no
  registro e na trilha de auditoria.
- **D4 — Limites de segurança (não de volume):** tamanho por arquivo como na tela; zip aninhado e entrada que não seja `.xml` são ignorados
  e contados como inválidos, sem derrubar o lote.
- **D6 — Grupos:** o bot só age em grupo com marcação explícita; empresa vem do grupo já vinculado (spec 292), nunca do texto.
- **D5 — Resposta:** e-mail responde ao remetente; WhatsApp responde na mesma conversa/grupo marcando quem enviou.

## Fora do escopo

- Ler texto livre do e-mail/mensagem, PDF ou imagem de DANFE.
- Importar a planilha de prévia (spec 237).
- Acrescentar a nota à viagem automaticamente (continua ação da operação, spec 298 D4).

## Histórias priorizadas

### P1 — E-mail com zip de XMLs

**Given** remetente na allowlist **When** manda e-mail com `notas.zip` cheio de XML para a caixa **Then** uma importação
é criada, e o remetente recebe resposta "N importadas, M já estavam, K inválidas (motivo)".

### P1 — E-mail com XMLs soltos

**Given** e-mail com vários `.xml` anexos **When** recebido **Then** viram uma única importação, uma linha por arquivo.

### P1 — WhatsApp marcando o bot

**Given** número cadastrado no grupo **When** envia XML ou zip marcando o bot (ou na conversa direta) **Then** o bot baixa
o arquivo, cria a importação e responde na conversa com o resumo.

### P1 — Grupos do WhatsApp

**Given** o bot está num grupo (specs 292/293: grupo do motorista, grupos da operação) **When** um membro cadastrado envia
XML/zip marcando o bot (ou respondendo ao arquivo com a marcação) **Then** o bot importa e responde **no grupo**, marcando
quem enviou. Arquivo sem marcação no grupo é ignorado (o bot não lê tudo que passa). Vale para qualquer grupo em que o bot
esteja; o grupo identifica a empresa, o remetente (número) precisa ser cadastrado, e quem está no grupo mas não é cadastrado
não importa nada.

### P1 — Remetente não autorizado

**Given** remetente fora da allowlist / número não cadastrado **When** envia **Then** nada é importado; resposta
genérica (e-mail: nenhuma; WhatsApp: "este número não pode importar notas"); registro da tentativa, sem o conteúdo.

### P2 — Reenvio e duplicidade

**Given** o mesmo zip enviado duas vezes **Then** a segunda vez retorna "já estavam no sistema" (idempotência por sha256
do anexo + chave de acesso), sem duplicar nota.

## Carga, lotes, logs e avisos (pedido do Anderson em 08/11/2026)

O recebimento **nunca** processa na requisição nem pesa no serviço; tudo é fila e lote.

- **RN1 — Receber é só enfileirar:** o webhook (e-mail ou Evolution) confere assinatura/remetente, grava o anexo no storage
  e a mensagem na fila, e responde 2xx em milissegundos. Parse de zip e de XML roda no worker, nunca na API.
- **RN2 — Lotes:** o worker processa em lotes de tamanho fixo (ex.: 50 XMLs por lote, configurável), com concorrência limitada
  e uma importação por vez por empresa. Zip grande vira vários lotes; um lote com erro não derruba os outros.
- **RN3 — Volume não recusa, enfileira:** nada é recusado por quantidade. Zip grande, muitos anexos ou muitas mensagens
  entram na fila e são processados aos poucos, no ritmo do worker (lotes de RN2), em ordem de chegada e com justiça entre
  empresas. O remetente recebe logo "recebi N arquivos, estou processando" e depois o resumo final. Só há recusa por
  **segurança**: remetente não autorizado, arquivo que não é XML/zip, zip malicioso (zip-slip, bomba de descompressão) —
  e, nesses casos, só o item ruim é descartado, com motivo. A fila tem alerta de tamanho e de idade (RN6), não teto.
  Reentrega do webhook não reprocessa (idempotência por mensagem).
- **RN4 — Erro por item, com motivo:** cada XML termina `importada`, `já existia`, `inválida` ou `falhou`, com código e motivo
  em português (XML malformado, não é NF-e, chave inválida, assinatura ausente, fora do limite, zip protegido…). Falha
  transitória (storage, banco) tenta de novo com espera crescente; esgotou → vai para a fila morta e fica `falhou`, nunca some.
- **RN5 — Logs:** log estruturado por mensagem e por lote (correlationId, origem, empresa, contagens, duração, código do
  erro), **sem** o conteúdo do XML nem dados pessoais. Métricas: mensagens recebidas, itens por resultado, tamanho da fila,
  tempo de processamento, idade da mensagem mais antiga.
- **RN6 — Avisos:** o remetente sempre recebe o resumo (ou o motivo da recusa). A operação vê o resultado na tela de
  importações e é avisada (notificação) quando há falha definitiva, fila morta com item ou fila parada além do limite;
  alerta de operação para fila crescendo. Passo de produção novo vai para `docs/runbooks/producao.md`.

## Requisitos funcionais

- RF1 Webhook de e-mail novo (assinatura Svix conferida **antes** de ler o corpo) busca os anexos pelo Resend, guarda o
  MIME bruto com sha256 e entrega os arquivos ao `requestUpload`.
- RF2 Handler de documento no webhook da Evolution: baixa a mídia, valida tipo e tamanho, entrega ao `requestUpload`.
- RF3 Serviço único "importar XML recebido" (origem `upload` | `email` | `whatsapp`) usado pelos três caminhos.
- RF4 `nfe_imports` ganha `received_via` (`screen`/`email`/`whatsapp`) e `received_from` (migration aditiva, com rollback); `source` segue `upload`.
- RF5 Resumo ao remetente montado a partir do relatório da importação, pelo worker quando a importação termina.
- RF6 Tela de importações mostra a origem e o remetente.

## Requisitos não funcionais

- `companyId` sempre do contexto resolvido (caixa/número → empresa), nunca do conteúdo.
- XML fiscal original preservado; nenhum XML nem conteúdo de nota em log.
- Anexo hostil (zip bomb, zip-slip, XML com entidades externas) recusado sem afetar o resto do lote.
- Idempotência por mensagem (`email_id` / id da mensagem Evolution): reentrega do webhook não duplica.

## Critérios de aceite

Contratos para cada história acima, mais isolamento multiempresa e os negativos de segurança; integração com banco para
a deduplicação; evidência em `evidence.md`.

## Dúvidas

Nenhum `[NEEDS CLARIFICATION]` aberto. D1–D5 são o padrão seguro adotado; se o dono preferir outro (por exemplo,
motorista não poder enviar), é ajuste de configuração, não de desenho.
