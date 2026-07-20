# Feature 005 — Importação e distribuição de NF-e

## Problema e resultado

O TransportAdA já possui identidade tenant-scoped, configurações fiscais e
certificado A1 protegido, mas ainda não recebe NF-e nem preserva os documentos
que futuramente originarão CT-e. O package fiscal instalado importa XML e
consulta a Distribuição DFe, porém seu contrato público atual entrega apenas um
resumo e não cobre todos os dados normalizados exigidos pelo domínio.

O resultado desta feature é permitir que usuários autorizados enviem XMLs ou
ZIPs e iniciem uma distribuição DFe assíncrona, acompanhem cada processamento e
consultem os documentos importados. O XML original permanece em storage S3
compatível, cada efeito crítico passa por outbox e RabbitMQ, e duplicidade,
reprocessamento e cursores NSU são seguros entre tenants e consumidores
concorrentes.

## Premissas decididas

- Bun continua como runtime, package manager e test runner;
- API usa `Bun.serve`, worker usa RabbitMQ e frontend continua React/Vite;
- `companyId` e usuário solicitante vêm exclusivamente do contexto autenticado;
- `invoices.import` inicia upload, distribuição e reprocessamento;
- `invoices.read` consulta processamentos, NF-e e seu XML;
- o processamento é assíncrono; a API retorna `202` com um identificador;
- upload aceita um ou vários XMLs e um ou vários ZIPs contendo XMLs;
- os limites de quantidade, tamanho comprimido, tamanho expandido, profundidade
  e taxa são configuráveis e falham fechados;
- somente exports públicos e a versão exata instalada de
  `@adatechnology/fiscal-provider` são usados;
- a normalização completa de NF-e e o provider S3 reutilizável serão
  implementados e versionados em `adatechnology-packages`;
- nenhuma aplicação importa código-fonte de outra aplicação;
- o XML não atravessa RabbitMQ, logs, auditoria ou respostas de listagem;
- os exemplos locais em `example/` servem apenas para inspeção estrutural e
  testes manuais; dados reais não serão copiados para fixtures ou commits;
- o PFX fornecido continua fora do repositório e não será usado contra a SEFAZ
  sem um gate manual de homologação e aprovação explícita.

## Fora do escopo

| Item                                                    | Motivo                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Manifestação do destinatário                            | política e suporte precisam de feature fiscal própria           |
| Emissão, consulta, cancelamento ou inutilização de CT-e | pertencem às features 006 e 007                                 |
| Cálculo de frete e elegibilidade final para CT-e        | pertencem à feature 006                                         |
| Regras legais inferidas de CFOP, ICMS, modal ou tomador | não serão inventadas nesta feature                              |
| Consulta SEFAZ dentro da requisição HTTP                | toda distribuição externa ocorre no worker                      |
| SSE                                                     | polling controlado atende o MVP; SSE pode ser adicionado depois |
| OCR, PDF como origem ou XML recebido por e-mail         | a entrada do MVP é XML/ZIP                                      |
| Exclusão física automática do XML fiscal                | retenção exige política legal e operacional específica          |
| Deploy Railway ou bucket remoto                         | somente após gates locais e aprovação humana                    |
| Expor XML por URL pública                               | download exige autenticação, tenant e autorização               |
| Usar o certificado real nos testes automatizados        | testes usam gateway fake e credencial efêmera/sintética         |

## Histórias priorizadas

### P1 — Importar XMLs e ZIPs sem bloquear a API

**História:** Como operador fiscal, quero enviar várias NF-e e acompanhar cada
resultado sem que um documento inválido interrompa o lote.

**Critérios de aceite:**

1. **WHEN** um usuário com `invoices.import` envia arquivos permitidos **THEN**
   a API **SHALL** criar um processamento tenant-scoped, armazenar os objetos
   de entrada em staging e retornar `202` com o ID.
2. **WHEN** a transação confirma o processamento **THEN** ela **SHALL** gravar
   também um outbox event; o relay **SHALL** publicar um comando persistente na
   exchange `nfe-import` versionada.
3. **WHEN** um ZIP é processado **THEN** o worker **SHALL** impedir path
   traversal, links, entradas aninhadas indevidas, excesso de arquivos e
   expansão acima do limite antes de importar cada XML.
4. **WHEN** um XML contém DTD/ENTITY, estrutura não suportada, chave inválida ou
   excede limites **THEN** somente o item **SHALL** falhar com código seguro.
5. **WHEN** um XML válido pertence à empresa corrente **THEN**
   `@adatechnology/fiscal-provider` **SHALL** validar e normalizar o documento,
   o original **SHALL** ser preservado e os dados normalizados **SHALL** ser
   persistidos na mesma confirmação lógica.
6. **WHEN** a chave já existe para a mesma empresa **THEN** o item **SHALL** ser
   `DUPLICATED`, sem substituir o XML ou criar outro documento.
7. **WHEN** a mesma chave existe em outra empresa **THEN** ela **SHALL NOT**
   afetar a importação corrente nem revelar a existência do outro tenant.
8. **WHEN** um item falha **THEN** os demais **SHALL** continuar e o resumo
   final **SHALL** refletir importados, duplicados, inválidos, rejeitados e
   falhos.

**Teste independente:** um lote sintético com NF-e válida, duplicada, XML
inválido e ZIP seguro termina `PARTIALLY_PROCESSED`, preserva o XML válido no
MinIO e não mistura dois tenants.

### P1 — Consultar processamento e NF-e importadas

**História:** Como usuário fiscal, quero ver o progresso, os erros seguros e os
dados das NF-e para preparar o fluxo de CT-e.

**Critérios de aceite:**

1. **WHEN** um usuário com `invoices.read` lista importações **THEN** somente
   processamentos do tenant corrente **SHALL** ser retornados com paginação
   limitada e ordenação determinística.
2. **WHEN** consulta uma importação **THEN** totais e estados dos itens
   **SHALL** ser coerentes com o estado persistido, sem XML ou payload fiscal.
3. **WHEN** lista ou detalha NF-e **THEN** valores monetários **SHALL** ser
   strings decimais, datas **SHALL** ser ISO 8601 e produtos/participantes
   **SHALL** vir apenas do documento normalizado.
4. **WHEN** baixa o XML **THEN** a API **SHALL** autorizar o tenant antes de
   acessar o objeto e transmitir o original com headers seguros e `no-store`.
5. **WHEN** um ID pertence a outro tenant ou não existe **THEN** a API **SHALL**
   responder o mesmo `404`, sem enumeração.

**Teste independente:** dois tenants importam notas e tentam consultar IDs e
XMLs cruzados; cada um vê somente seus próprios dados.

### P1 — Processar jobs com entrega pelo menos uma vez

**História:** Como operação, quero que uma falha ou reinício não perca nem
duplique efeitos fiscais.

**Critérios de aceite:**

1. **WHEN** a API confirma um outbox record **THEN** um relay concorrente
   **SHALL** reivindicá-lo com lock no PostgreSQL, publicar com confirmação do
   broker e marcar publicação de forma idempotente.
2. **WHEN** RabbitMQ redeliver um comando **THEN** o worker **SHALL** obter o
   mesmo resultado sem duplicar documento, objeto final ou contador.
3. **WHEN** o erro é transitório **THEN** o comando **SHALL** seguir retry com
   backoff e limite; erro fatal **SHALL** ir para DLQ.
4. **WHEN** o efeito e a persistência confirmam **THEN** o consumidor
   **SHALL** executar ack; falha antes do commit **SHALL NOT** ser marcada como
   concluída.
5. **WHEN** várias instâncias disputam o mesmo item **THEN** apenas uma
   **SHALL** possuir o lease ativo e leases expirados **SHALL** ser
   recuperáveis.
6. **WHEN** uma mensagem chega a retry ou DLQ **THEN** XML, credencial e dados
   fiscais sensíveis **SHALL NOT** fazer parte do envelope.
7. **WHEN** tenant, ator ou agregado do envelope diverge do outbox/importação
   persistidos **THEN** o worker **SHALL** rejeitar a mensagem sem usar os
   campos recebidos como autoridade.

**Teste independente:** PostgreSQL e RabbitMQ reais exercitam redelivery,
restart, duas instâncias, retry/DLX, DLQ e replay sem duplicação.

### P2 — Distribuir DFe por NSU

**História:** Como operador fiscal, quero buscar documentos vinculados ao CNPJ
da transportadora sem perder o cursor nem consultar a SEFAZ em paralelo.

**Critérios de aceite:**

1. **WHEN** um usuário com `invoices.import` inicia distribuição **THEN** a API
   **SHALL** retornar `202` e o worker **SHALL** obter perfil e certificado
   ativo da mesma empresa.
2. **WHEN** não existe configuração fiscal ou certificado válido **THEN** o
   processamento **SHALL** falhar fechado antes de qualquer chamada externa.
3. **WHEN** a primeira distribuição começa **THEN** o cursor **SHALL** iniciar
   em `000000000000000`; chamadas seguintes **SHALL** usar o `ultNSU`
   persistido por empresa e ambiente.
4. **WHEN** `temMais` é verdadeiro **THEN** o worker **SHALL** continuar em
   páginas de até 50 itens, persistindo documentos e cursor de cada página
   atomicamente antes da próxima.
5. **WHEN** duas distribuições da mesma empresa/ambiente concorrem **THEN**
   somente uma **SHALL** consultar o provider; a outra **SHALL** fazer replay
   ou retornar conflito seguro.
6. **WHEN** o provider informa ausência de documentos ou bloqueio equivalente
   ao `cStat 656` **THEN** uma janela persistente **SHALL** impedir loops,
   inclusive após restart ou múltiplas instâncias.
7. **WHEN** chegam resumos ou eventos sem documento completo **THEN** eles
   **SHALL** ser preservados e correlacionados, mas **SHALL NOT** tornar a NF-e
   elegível para CT-e.
8. **WHEN** a SEFAZ ou o provider falha **THEN** a taxonomia interna
   **SHALL** classificar retry, rejeição e falha fatal sem expor resposta ou
   certificado.

**Teste independente:** gateway fake pagina 51 itens, redeliver uma página,
simula vazio/rate limit e prova cursor monotônico e isolamento entre empresas.

### P2 — Operar pela SPA Vite

**História:** Como operador, quero enviar documentos, acompanhar resultados,
reprocessar falhas permitidas e consultar NF-e em uma interface responsiva.

**Critérios de aceite:**

1. **WHEN** falta `invoices.import` **THEN** controles de upload,
   distribuição e reprocessamento **SHALL NOT** aparecer; a API continua
   negando por padrão.
2. **WHEN** arquivos são selecionados **THEN** a SPA **SHALL** validar limites
   básicos, enviar somente no submit e não persistir conteúdo em storage,
   cache, service worker ou logs.
3. **WHEN** um processamento está ativo **THEN** TanStack Query **SHALL**
   realizar polling limitado, parar em estado terminal e exibir contadores e
   erros seguros.
4. **WHEN** o usuário possui apenas `invoices.read` **THEN** ele **SHALL**
   consultar listas, detalhes e XML, sem iniciar efeitos.
5. **WHEN** a tela opera em 375, 768 ou 1280 pixels **THEN** upload, progresso,
   lista e detalhe **SHALL** permanecer utilizáveis sem overflow horizontal.

**Teste independente:** Playwright cobre operador, viewer e usuário sem
permissão em três viewports, e confirma ausência de XML em storages/caches.

## Requisitos funcionais e de segurança

| ID      | Requisito                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| NFI-001 | Toda operação usa `companyId` e ator do `CompanyContext`; campos livres nunca selecionam tenant.              |
| NFI-002 | `invoices.import` inicia upload, distribuição e reprocessamento; `invoices.read` consulta e baixa XML.        |
| NFI-003 | Upload aceita XMLs/ZIPs em lote, aplica limites antes da expansão e registra erro por item.                   |
| NFI-004 | XML com DTD/ENTITY, path traversal, link, formato ou tamanho proibido falha fechado.                          |
| NFI-005 | O importador público Ada valida chave, variante e participantes e retorna DTO normalizado sem `any`.          |
| NFI-006 | XML original usa escrita create-only, hash verificado e referência imutável em provider S3 compatível.        |
| NFI-007 | `UNIQUE(company_id, access_key)` impede duplicação sem vazar existência cross-tenant.                         |
| NFI-008 | Documento completo, resumo e evento são variantes explícitas; somente NF-e completa autorizada segue adiante. |
| NFI-009 | Dinheiro usa `numeric(19,4)`/string decimal; pesos e quantidades usam `numeric`, nunca `number` binário.      |
| NFI-010 | Cada importação e item possui estados, contadores e erros estruturados, seguros e auditáveis.                 |
| NFI-011 | API retorna `202` e grava estado + outbox na mesma transação; XML nunca entra no envelope.                    |
| NFI-012 | Exchanges, queues, routing keys, envelopes, retry/DLX e DLQ de importação e distribuição são versionados.     |
| NFI-013 | Relay usa publisher confirms e claim concorrente; consumer executa ack somente depois do commit.              |
| NFI-014 | `eventId`, NSU e chaves de negócio têm idempotência persistente; tenant/ator vêm do agregado autoritativo.    |
| NFI-015 | Reprocessamento cria tentativa rastreável e não altera XML original, chave ou histórico anterior.             |
| NFI-016 | Cursor NSU é monotônico e único por empresa/ambiente; distribuição concorrente usa lock/lease persistente.    |
| NFI-017 | Credencial A1 é decriptada apenas em memória no worker autorizado e nunca entra em log, fila ou storage.      |
| NFI-018 | Gateway fiscal depende somente da raiz pública da versão exata instalada e mapeia erros internamente.         |
| NFI-019 | Download de XML autentica e autoriza antes do storage, usa nome seguro, `no-store` e anti-enumeração.         |
| NFI-020 | Paginação usa cursor/limite validados e ordenação estável por `(createdAt,id)`.                               |
| NFI-021 | Auditoria guarda ator, tenant, ação, IDs, resultado e correlação, nunca XML, credencial ou resposta SEFAZ.    |
| NFI-022 | Frontend Vite usa TanStack Query, i18n, tokens/PWA e não persiste arquivo ou conteúdo fiscal.                 |
| NFI-023 | Apps permanecem instaláveis, testáveis, compiláveis e publicáveis de forma independente.                      |
| NFI-024 | Todo gate roda localmente pelo Makefile antes de qualquer Railway ou smoke real da SEFAZ.                     |

## Dados e constraints mínimos

- `nfe_imports`: empresa, origem, solicitante, correlação, idempotency key,
  estado, totais, versão, timestamps e erro terminal seguro;
- `nfe_import_items`: empresa + importação, ordinal/nome sanitizado, objeto de
  origem, hash, variante, chave/NSU/ambiente opcionais, estado, tentativa e
  erro seguro; distribuição aplica unique parcial por empresa, ambiente e NSU;
- `nfe_documents`: empresa, chave, campos normalizados, status, origem,
  referência imutável ao XML, hash, importação e ator;
- participantes, endereços, volumes e produtos em tabelas tenant-scoped
  próprias, com FKs compostas por empresa;
- `nfe_events`: empresa, chave alvo, tipo, sequência, data, objeto XML e
  metadados seguros; eventos podem aguardar o documento;
- `nfe_distribution_cursors`: empresa, ambiente, `ult_nsu`, `max_nsu`, janela
  de próxima consulta, lease e versão;
- `processing_outbox`: evento, agregado, empresa, tipo/versão, payload mínimo,
  tentativa, claim, publicação e timestamps;
- `processed_messages`: empresa, consumer, event ID, resultado e timestamp;
- `stored_objects`: empresa, provider, bucket, chave opaca, MIME, tamanho,
  SHA-256, estado staging/final/deleted, tipo, retenção e timestamps;
- uniques de negócio e FKs sempre incluem `company_id`, inclusive outbox e
  mensagens processadas;
- migrations são aditivas, explícitas e possuem rollback manual revisado.

## Estados

Importação:

```text
PENDING → QUEUED → PROCESSING → COMPLETED
                              ↘ PARTIALLY_PROCESSED
                              ↘ FAILED
PENDING/QUEUED → CANCELLED somente antes do primeiro efeito
```

Item:

```text
PENDING → VALIDATING → IMPORTED
                     ↘ DUPLICATED
                     ↘ INVALID
                     ↘ REJECTED
                     ↘ FAILED
```

Os estados terminais não retornam a estados anteriores. Reprocessamento cria
uma nova tentativa vinculada, sem reescrever o histórico.

## Casos extremos

- multipart ausente, nome inválido, MIME enganoso e extensão mista;
- XML com BOM/encoding válido, namespaces, whitespace e assinatura;
- DTD/ENTITY, documento truncado, chave ausente ou dígito verificador inválido;
- ZIP vazio, criptografado, recursivo, com symlink, path traversal ou zip bomb;
- vários arquivos com a mesma chave no mesmo request;
- `NFe` sem protocolo, `nfeProc`, resumo e `procEventoNFe`;
- evento antes do documento e replay do mesmo evento;
- CNPJ da empresa ausente dos participantes reconhecidos;
- falha S3 antes/depois da criação do processamento e objeto staging órfão;
- tentativa de sobrescrever key final com bytes iguais ou hash divergente;
- reconciliador concorrente, staging ainda ativo e staging órfão expirado;
- falha PostgreSQL depois do upload e antes do outbox;
- falha do publisher antes/depois do confirm;
- redelivery após commit e antes do ack;
- lease expirado, dois relays e dois consumers;
- mesmo idempotency key com payload diferente;
- cursor NSU regressivo, página repetida e 51 documentos;
- ausência de certificado, chave de envelope desconhecida ou segredo adulterado;
- acesso a importação, documento ou XML de outro tenant;
- shutdown com mensagens em voo.

## Rastreabilidade

| Requisito | História principal  | Status    |
| --------- | ------------------- | --------- |
| NFI-001   | Todas               | Specified |
| NFI-002   | Upload/consulta/SPA | Specified |
| NFI-003   | Upload              | Specified |
| NFI-004   | Upload              | Specified |
| NFI-005   | Upload/distribuição | Specified |
| NFI-006   | Upload/consulta     | Specified |
| NFI-007   | Upload              | Specified |
| NFI-008   | Upload/distribuição | Specified |
| NFI-009   | Consulta            | Specified |
| NFI-010   | Upload/consulta     | Specified |
| NFI-011   | Jobs                | Specified |
| NFI-012   | Jobs                | Specified |
| NFI-013   | Jobs                | Specified |
| NFI-014   | Jobs                | Specified |
| NFI-015   | Consulta/SPA        | Specified |
| NFI-016   | Distribuição        | Specified |
| NFI-017   | Distribuição        | Specified |
| NFI-018   | Upload/distribuição | Specified |
| NFI-019   | Consulta            | Specified |
| NFI-020   | Consulta            | Specified |
| NFI-021   | Todas               | Specified |
| NFI-022   | SPA                 | Specified |
| NFI-023   | Todas               | Specified |
| NFI-024   | Gates               | Specified |

## Critérios de sucesso

- lote sintético misto termina com contadores e erros corretos sem interromper
  os itens válidos;
- XML original baixado possui o mesmo SHA-256 dos bytes recebidos;
- escrita final recusa overwrite; replay do mesmo hash reutiliza a referência e
  hash diferente gera conflito fatal;
- duplicidade, replay e concorrência não criam segundo documento/objeto/efeito;
- duas empresas podem possuir a mesma chave sem ler dados uma da outra;
- 51 DF-e percorrem mais de uma página sem regressão ou salto de NSU;
- retry/DLX, DLQ, publisher confirm, outbox e shutdown são exercitados contra
  PostgreSQL, RabbitMQ e MinIO locais;
- frontend conclui upload, acompanhamento, consulta e download em três
  viewports sem persistir XML;
- package fiscal e object storage são empacotados, publicados e consumidos por
  versões exatas, sem `workspace:*`, `file:` ou imports entre apps;
- `make check`, migration/rollback, smoke gerenciado e revisão Sol ficam verdes
  antes de qualquer Railway ou chamada real à SEFAZ.

## Decisões fechadas e pendências não bloqueantes

- Vite é mantido porque o painel autenticado não exige SSR, SEO, Server
  Components ou BFF; Next.js só volta por novo requisito e ADR;
- polling limitado atende o acompanhamento inicial; SSE permanece evolução;
- manifestação, retenção legal e políticas tributárias permanecem fora do
  escopo e não bloqueiam upload/distribuição;
- o contrato instalado `@adatechnology/fiscal-provider@0.1.0` é a evidência
  normativa atual; sua evolução será aditiva e coberta por contrato público;
- não há decisão bloqueante; limites operacionais exatos são definidos no
  plano como configuração conservadora e testável.
