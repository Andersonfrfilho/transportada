# ADR 0099 — A NFS-e fala o Sistema Nacional (Sefin Nacional / ADN), sem provedor no meio

- Status: proposto (revisado pelo `architect` em 08/10/2026, "aprovar com ajustes", ajustes aplicados;
  aguarda o usuário; nada da Fase 1 em diante começa antes)
- Data: 2026-10-08
- Decisões do usuário em 08/10/2026: ajustes 4, 8, 9, 15 e plano B
- Decisores: mantenedor do projeto (Anderson); revisão Opus em § "Revisão do architect"
- Emenda: ADR-0029 (provedor: sai a Nota RP, entra o Sistema Nacional), ADR-0035 (passa a haver dois
  ambientes) e ADR-0098 (ganha o valor `national` e, depois da primeira nota real, perde `v2`/`v3`)

## Contexto

A ADR-0029 deixou a troca de provedor como troca de adaptador atrás de `NfseFiscalGateway`, e a
ADR-0098 provou o caminho com a v3 da Nota RP. A spec 251 troca de novo: o worker monta a DPS 1.01,
assina com o A1 da própria transportadora e a envia por mTLS à Sefin Nacional, que é gratuita para o
contribuinte e tem ambiente de homologação (produção restrita). Fatos que delimitam a decisão
(`specs/251-emissor-nacional-gratuito/plan.md` § "Contrato do Sistema Nacional", lido no Swagger
oficial com o A1 em 08/10/2026):

1. **A emissão é síncrona.** `POST /SefinNacional/nfse` com `{"dpsXmlGZipB64"}` responde `201` com
   `chaveAcesso` e `nfseXmlGZipB64` na própria chamada; não há protocolo nem fila. `400`/`403`/`500`
   trazem `erros[]`. O trilho atual é assíncrono: o consumidor grava `accepted`, o write-back leva a
   nota a `pending_authorization`
   (`apps/worker-transportada/src/nfse-issuance/domain/nfse-write-back.policy.ts:30`) e só o
   `nfse.status.pull` autoriza (ADR-0029 §2).
2. **Idempotência é do emitente.** O `Id` da `infDPS` é `DPS` + município(7) + tipo de inscrição(1) +
   CNPJ(14) + série(5) + nDPS(15). `HEAD /dps/{id}` diz se aquela DPS já gerou NFS-e e `GET /dps/{id}`
   devolve a `chaveAcesso`. Série e `nDPS` são numeração nossa.
3. **A identidade da conexão é o certificado.** mTLS com e-CNPJ ICP-Brasil do próprio prestador; a
   assinatura da DPS e o TLS usam o mesmo A1; não existe procuração nem integrador (FAQ § 17.7). O
   cofre por empresa da ADR-0004 é obrigatório, não opcional.
4. **O pacote fiscal não expõe assinador público.** `@adatechnology/fiscal-provider` exporta do
   assinador só `evictCertificate`
   (`apps/worker-transportada/node_modules/@adatechnology/fiscal-provider/dist/index.d.ts:19`); o
   resto é `src/sefaz/*`, que o `CLAUDE.md` proíbe importar.
5. **Sem fonte oficial:** algoritmos XMLDSig, limites de taxa e o DANFSe (API de PDF sobrestada em
   03/08/2026, Swagger em 404). A nota 74 traz c14n 1.0 + RSA-SHA1 + SHA1, mas saiu **pela Nota RP**,
   que assinou por nós: é indício do que a Sefin aceita, não prova do que ela exige da DPS do
   contribuinte. A prova é a sonda (decisão 8).
6. **Risco de cadastro:** o convênio oficial de Ribeirão Preto (3543402) diz
   `aderenteEmissorNacional = 0` em restrita **e** produção; o usuário informa que o cadastro está
   desatualizado e que a prefeitura já aceita. Declaração do usuário, não fonte oficial.
7. **Decisão do usuário (08/10/2026):** a Nota RP sai do app e fica só na lib
   `@adatechnology/fiscal-provider`; sem contingência no app; a reversibilidade é o git.

## Decisão

1. **O síncrono cabe no desenho assíncrono sem estado novo: o adaptador devolve `accepted` com a
   chave, e o status pull autoriza.**
   - `issue` do adaptador nacional, nesta ordem: monta a DPS do payload congelado, assina, e
     **sempre** faz `HEAD /dps/{id}` antes do `POST`. `200` → `GET /dps/{id}` e devolve
     `accepted` com `providerDocumentId = chaveAcesso`, sem `POST`. `404` → `POST /nfse`.
     Invariante: **nunca há `POST` sem um `HEAD` que respondeu 404 para aquele `Id`** — cobre
     reentrega do RabbitMQ, retry do consumidor e reemissão ambígua com um só mecanismo.
   - `201` → `accepted` com `providerDocumentId = chaveAcesso` (50 dígitos; a coluna é `text`,
     `apps/api-transportada/src/database/nfse.schema.ts:349`). O `nfseXmlGZipB64` da resposta **não**
     é gravado pelo consumidor: o status pull lê o mesmo documento por `GET /nfse/{chaveAcesso}` e
     autoriza pelo caminho de sempre, que já grava o XML.
   - **A classificação lê o corpo, não o status** (como a ADR-0098 §2). `400` ou `403` com corpo
     `NFSePostResponseErro` legível e `erros[].codigo` presente → `rejected` com o **primeiro código
     oficial** (`E0010`, `E0717`, `E0718`…) e mensagem saneada; não há código sintético. O `403` com
     esse corpo é a recusa do certificado da transmissão: nada nasceu, a reemissão é segura e não
     gasta cinco retentativas num defeito de credencial. **`403` sem esse corpo** (página do IIS,
     WAF, proxy, limite — a evidência da T0.2 já viu um `403` "Access is denied" do IIS) → `error`
     recuperável: não há prova de que nada nasceu. `500`, `5xx`, `429`, timeout e falha de rede →
     `error` recuperável (nada é afirmado; o próximo `issue` começa pelo `HEAD`). Cada `rejected`
     consome o `nDPS` daquela tentativa como lacuna com rastro no ledger (ADR-0005 item 13); a
     reemissão usa número novo (decisão 4).
   - **Duplicidade na corrida `HEAD 404` → `POST`.** Um `POST` anterior que estourou o timeout pode
     ainda estar sendo processado: o `HEAD` da reentrega responde `404` e o novo `POST` recebe "DPS já
     gerou NFS-e". Essa recusa **não** é `rejected` (liberaria reemissão com número novo e duplicaria
     a nota): o adaptador faz `GET /dps/{id}` e devolve `accepted` com a `chaveAcesso`. O código
     oficial dessa recusa **não está no `plan.md` nem no `evidence.md`: a localizar no Anexo I (RN) ou
     na sonda T2.3b**; até lá, a constante fica vazia e o contrato da T2.1 prende o comportamento por
     um código de fixture nomeado como provisório.
   - `tipoAmbiente` da resposta diferente do `fiscal_environment` da tentativa → **falha terminal
     não recuperável** com causa nomeada `environment_mismatch`, sem write-back de sucesso, com log
     `error` e alerta (Sentry). Um `201` no ambiente trocado é nota que **nasceu** no outro ambiente:
     retentar ou reemitir multiplica o defeito. A API recusa reemissão automática dessa causa; a nota
     do outro ambiente é cancelada à mão no portal. A guarda de boot da decisão 5 impede que isso
     chegue a acontecer.
   - **Reemissão ambígua não aceita correção (decidido pelo usuário em 08/10/2026).** A chave herdada (`resolveInheritedProviderRequestKey`,
     `apps/api-transportada/src/nfse-invoices/domain/nfse-provider-request-key.policy.ts:28`) leva ao
     mesmo `nDPS` e ao mesmo `Id`; se o `HEAD` responder `200`, a nota antiga é adotada e a correção
     aceita por `applyNfseIssuanceCorrection`
     (`apps/api-transportada/src/nfse-invoices/application/nfse-invoice-reissue.use-case.ts:195`)
     some sem aviso. Com chave herdada e `correction` presente, a API responde
     `409 NFSE_REISSUE_CORRECTION_AMBIGUOUS`: o operador reemite sem correção (o `HEAD` resolve se a
     nota nasceu) e, se a nota nasceu errada, corrige por cancelamento e nota nova. **Alternativa
     descartada:** o pull comparar valor e tomador do XML com o payload congelado (como
     `NFSE_EXTERNAL_LINK_AMOUNT_MISMATCH` da ADR-0098). Ela só detecta depois que a nota fiscal real
     já existe com o conteúdo antigo — e a nota existe de qualquer jeito, então o desfecho é o mesmo
     cancelamento, só que mais tarde e com uma nota `authorized` cujo payload congelado mente. A
     falha ambígua é timeout/transporte, não recusa de conteúdo: correção nesse caso é rara, e
     bloqueá-la custa um passo a mais ao operador em vez de um estado inconsistente.
   - Status pull (`fetchStatus`): `GET /nfse/{chave}` `200` → `authorized` (número, data e chave
     lidos do XML); `404` → `error` (adia, **nunca** `rejected` — ADR-0098 §7); `401`/`403` → `error`.
   - **Cancelamento (evento `101101`).** O motivo do pedido (os nomes da ADR-0098 §9) vira o par
     `cMotivo`/`xMotivo` do `e101101` por um de-para em constante única do adaptador; os valores
     aceitos de `cMotivo` saem do XSD 1.01 na T2.2 (não estão transcritos no `plan.md`). O `POST
/nfse/{chave}/eventos` é síncrono, mas segue a regra da emissão: `201` → `accepted`, e o pull
     confirma o cancelamento pela consulta autenticada de eventos da nota (ADR-0029 §2), nunca pelo
     corpo do `201`. `400`/`422` com código oficial → `rejected` (a nota segue `authorized`);
     `5xx`, timeout e rede → `error` recuperável, e a retentativa consulta os eventos da nota antes de
     um novo `POST` (o mesmo invariante do `HEAD`).
   - **Alternativa descartada:** o consumidor gravar `authorized` direto do `201`. Economiza um ciclo,
     mas muda o write-back e quebra a ADR-0029 §2 (estado fiscal só por consulta autenticada) por
     conveniência do provedor — exatamente o que a spec proíbe. **Alternativa descartada:** carregar o
     XML no outcome de `issue` e gravá-lo no write-back: muda a porta e põe storage no consumidor; o
     custo evitado é um `GET`.
   - A latência extra é a do primeiro ciclo do pull, que o write-back de `accepted` já agenda;
     encurtá-la, se a medida pedir, é parâmetro de agendamento, não estado.

2. **Seleção pelo valor `national` de `NFSE_PROVIDER_API_VERSION`, gravado por tentativa; depois da
   primeira nota real a Nota RP sai do app.**
   - `NFSE_PROVIDER_API_VERSIONS` (`apps/api-transportada/src/shared/nfse-provider-api-version.constant.ts:4`)
     ganha `national`; o schema da variável segue só na API
     (`apps/api-transportada/src/config/environment.schema.ts:216`), que grava a versão em
     `providerConfig`; o worker roteia pela tentativa (`parseProviderApiVersion` e
     `resolveLatestIssuanceApiVersion`,
     `apps/worker-transportada/src/nfse-issuance/domain/nfse-provider-api-version.policy.ts:17` e `:26`),
     com um ramo `national` ao lado dos `if (providerApiVersion === 'v3')` de
     `apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:217`. O worker
     não ganha a variável. O nome `NFSE_NATIONAL_PROVIDER_API_VERSION = 'v3'` (`…constant.ts:8`) é
     enganoso a partir daqui e é renomeado na T2.4.
   - **Ordem de publicação: worker primeiro, variável depois.** Hoje o worker lê versão ausente **ou
     desconhecida** como `v2` (`return version === 'v3' ? 'v3' : DEFAULT_PROVIDER_API_VERSION`,
     `apps/worker-transportada/src/nfse-issuance/domain/nfse-provider-api-version.policy.ts:22`), e o
     deploy sobe a API antes do worker (`.github/workflows/deploy.yml:179-180`; worker e cron estão em
     `deploy-services`, que espera `deploy-api`, `:248` e `:389`). Uma tentativa `national` gravada pela API nova e lida pelo worker
     velho iria à **Nota RP v2** com a numeração nacional. Por isso: (a) **desde já** (T2.0, antes de
     qualquer valor novo na API), versão **desconhecida** vira recusa fatal nomeada
     `NFSE_PROVIDER_VERSION_UNKNOWN` no worker — só a **ausência** continua `v2`, que é o legado; (b)
     o ramo `national` do worker é publicado e confirmado no ar; (c) só então a API passa a aceitar e
     gravar `national` e a variável é trocada no ambiente. A troca da variável é passo de operação
     registrado em `evidence.md`, nunca efeito colateral do mesmo PR.
   - **Remoção (T4.2b, só depois da T4.2):** saem clientes v2/v3, roteio por versão Nota RP, vínculo
     externo por `id_nota` e seus contratos; a lib não é tocada. **Pré-condição medida por consulta:
     zero nota v2/v3 em estado não terminal** (`issuing`, `pending_authorization`) **e zero nota
     v2/v3 em `failed` com causa ambígua** (as de `AMBIGUOUS_CAUSES`, sem `providerDocumentId`): uma
     dessas reemitida por `national` herdaria a chave, mas o `HEAD` nacional não enxerga a Nota RP e
     duplicaria uma nota que talvez exista lá. Cada uma é resolvida antes (consulta ou vínculo pela
     v2/v3, ou cancelamento manual no portal). Notas v2/v3 já
     autorizadas mantêm XML/PDF no storage e seguem legíveis pela API; **consulta e cancelamento
     delas passam a ser manuais no portal da Nota RP** (a ADR-0098 já previa isso para a v2).
     Tentativa sem versão ou com `v2`/`v3` que ainda chegue ao worker vira recusa fatal nomeada
     `NFSE_PROVIDER_VERSION_RETIRED`, nunca retentativa.
   - Fecha o [NEEDS CLARIFICATION] 3 da spec. A T6.2 da 250 (virada para `v3`) **não é cancelada por
     esta ADR: fica suspensa até a sonda T2.3b**. Se a sonda aceitar, a 250 fecha sem a virada e a
     032/T030 fecha com a nota da T4.2 desta spec. Se a sonda falhar, o plano B é o webservice ISS.Net
     no padrão nacional (decisão 8); a T6.2 fica como alternativa descartada por ora. A razão: a produção está na **v2**, e a v2 já recusa a empresa (ADR-0098 §
     Consequências) — sem o nacional e sem a v3, a transportadora não emite NFS-e pelo sistema.
   - **Alternativa descartada:** manter a v3 como contingência alternável. Foi recusada pelo usuário
     e custaria dois adaptadores, dois limitadores e duas famílias de contrato para um caminho que
     não seria exercitado — contingência que nunca roda não é contingência.

3. **Certificado: mesmo cofre e mesma tabela, finalidade própria `nfse`.**
   - `digital_certificates` ganha `nfse` em `CERTIFICATE_PURPOSES`
     (`apps/api-transportada/src/database/digital-certificate.schema.ts:20`, check em `:68`); o AAD
     sai do formato existente `transportada:certificate:v1:<companyId>:<certificateId>:nfse`
     (`apps/api-transportada/src/companies/application/digital-certificate-secret.service.ts:90`).
     É o precedente do MDF-e, que lê a finalidade `mdfe`
     (`apps/worker-transportada/src/mdfe-issuance/infrastructure/drizzle-mdfe-certificate.repository.ts:35`).
     O arquivo PFX pode ser o mesmo do CT-e. **O cadastro aceita um único upload que sela dois
     envelopes** (`cte` e `nfse`, decidido pelo usuário em 08/10/2026) na mesma requisição, cada um com o próprio AAD: o PFX e a senha
     ficam em memória uma vez, nada atravessa finalidade (cada envelope é cifrado do texto claro, não
     de outro envelope) e as duas linhas seguem com rotação independente. O upload de uma finalidade
     só continua valendo; a T1.1 decide a tela.
   - **Alternativa descartada:** ler o certificado `cte`. Acopla a rotação dos dois trilhos (trocar
     o A1 do CT-e derruba a NFS-e no meio de um lote) e faz o trilho de NFS-e decifrar envelope
     selado para outra finalidade, o que a ADR-0004 §7 existe para impedir. **Alternativa
     descartada:** copiar o envelope do `cte` no servidor — exige decifrar com um AAD e recifrar com
     outro, a mesma travessia de finalidade.
   - Validade: `expires_at` já existe (`digital-certificate.schema.ts:42`). Emissão nova com A1 `nfse`
     vencido (metadado `expires_at`, sem abrir o envelope) é recusada na API (`409`) e no worker (`rejected` nomeado). **Alerta D-30 e D-7** por
     e-mail ao destinatário configurado (Anderson), em rotina diária do cron sobre os certificados
     ativos de toda finalidade, e selo no painel. **Quem renova: Anderson** (o A1 atual vence em
     05/11/2026). Não existe alerta de validade hoje: é trabalho novo da T1.1.
   - mTLS: o worker abre o PKCS#12 em memória e passa chave e certificado (PEM) ao `fetch` do Bun
     por chamada (`tls: { key, cert }`); `Uint8Array` de PFX, senha e chave são zerados no `finally`
     (best effort: PEM em `string` fica sob o GC — limitação já aceita na ADR-0004). A saída de rede
     precisa alcançar as URLs de LCR do certificado (`E1206`/`E107`). Leitor do PKCS#12: `node-forge`
     1.3.x, o mesmo que o `@adatechnology/fiscal-provider` já usa (dependência dele, não do app); entra
     como dependência direta do worker e da API, conferida pelo §13 do code-standart na T2.3.
   - **Só o worker abre o A1 `nfse`** (decidido pelo usuário em 08/10/2026, recomendação do assistente):
     a API **não** decifra o envelope; a chave vive em um só processo. O ADN exige mTLS para
     `/parametrizacao` (sem certificado a T0.2 recebeu `403`/`bad decrypt`; `evidence.md`, tabela dos
     corpos lidos), por isso a leitura dos parâmetros do município acontece no worker, na transmissão
     (decisão 7). A API só confere os metadados da linha (existe, ativa, `expires_at`). **Reabrir se um
     dia a alíquota do ADN precisar bloquear na criação.**
   - XMLDSig no **gateway da aplicação** (`nfse-national-dps.signer.ts` no worker), Enveloped sobre
     `infDPS` e `infPedReg`. Biblioteca: `xml-crypto` 6.3.x (a sonda usou a 6.3.3; é a mesma família
     que o pacote fiscal usa), que exige um DOM — `@xmldom/xmldom`; as duas entram pelo §13 do
     code-standart na T2.3 (mantidas, tipadas, compatíveis com Bun). **Alternativa descartada:** publicar antes um assinador público no pacote
     fiscal — ciclo de publicação antes de qualquer prova na restrita, o mesmo argumento da ADR-0029;
     extrair ao pacote depois de provado é seguimento.
   - **Credencial NFS-e no modo `national`: linha sem segredo (decidido pelo usuário em 08/10/2026).** A API exige credencial ativa
     (`NFSE_CREDENTIAL_MISSING`, `apps/api-transportada/src/nfse-invoices/domain/nfse-issuance.error.ts:132`)
     e a linha de `nfse_provider_credentials` carrega o que a emissão precisa além do segredo:
     `tax_id`, `municipal_registration` e `fiscal_environment`. No nacional não há token nem
     callback: `NFSE_PROVIDERS` (`nfse.schema.ts:44`) ganha `national`, e `secret_envelope` e
     `callback_token_sha256` (`nfse.schema.ts:281-282`) passam a nuláveis com check
     (`notarp` → os dois presentes; `national` → os dois nulos). A linha **não** referencia o
     certificado: o worker lê o A1 `nfse` ativo da empresa, como o MDF-e lê o `mdfe`, e a
     rotação do certificado não toca a credencial. Emissão `national` sem A1 `nfse` ativo e válido é
     `409` na API (conferência de metadados). **Alternativa descartada:** FK da credencial ao certificado — a rotação passaria a
     exigir editar a credencial, e um certificado novo ficaria inerte até alguém lembrar.
   - Nunca em log: PFX, senha, chave, DPS, NFS-e, corpo de evento. Log de recusa leva código e
     mensagem saneada (sequências longas de dígitos redigidas, como em
     `nfse_issuance_provider_outcome`).

4. **Numeração da DPS pela reserva da ADR-0005, na API, ao criar a tentativa.**
   - `fiscal_sequences` ganha o modelo `nfse_dps` em `FISCAL_MODELS`
     (`apps/api-transportada/src/database/fiscal-sequence.schema.ts:20`, check em `:54`); a sequência
     é por `(companyId, environment, model, series)`, a porta é a existente
     (`apps/api-transportada/src/companies/application/fiscal-sequence-reservation.port.ts:6`).
   - Série: coluna do perfil de emissão, faixa `00001`–`49998` (a Sefin aceita até `49999`; fora
     dela é `E0010`). **A série `49999` é reservada à sonda** e a qualquer prova manual fora do
     sistema, e o check do perfil a exclui. Motivo: o `Id` é determinístico; uma nota de prova com a
     mesma série e o mesmo `nDPS` de uma tentativa real faria o `HEAD` responder `200` e o sistema
     **adotaria a nota de prova**, e a ADR-0005 item 12 trava série e número inicial depois da
     primeira reserva — não dá para "pular" a sobreposição depois. Se a chave adotada já estiver em
     outra nota da empresa, o write-back ainda quebra no índice único
     `nfse_service_invoices_company_provider_document_unique`
     (`apps/api-transportada/src/database/nfse.schema.ts:387-389`). Série reservada separa os dois
     mundos sem depender de número inicial.
   - `reservationKey = nfse-dps:<provider_request_key>`. A reemissão ambígua copia a
     `provider_request_key` (ADR-0098 §5; coluna em `nfse.schema.ts:572`), logo recebe **o mesmo**
     `nDPS` e o mesmo `Id`, e o `HEAD` da decisão 1 acha a nota que talvez tenha nascido. Reemissão
     de DPS recusada usa chave nova e número novo: o número recusado nunca volta, e a lacuna tem
     rastro no ledger (ADR-0005 item 13). A reemissão ambígua não aceita correção (decisão 1).
   - A reserva roda na API, na mesma transação que cria a tentativa quando o repositório aceitar a
     transação do chamador (a T1.2 confere; se não aceitar, reserva antes, idempotente pela chave). O
     `Id` (`DPS[0-9]{42}`, com `nDPS` preenchido a 15) é gravado na tentativa e congelado: o worker
     nunca numera.
   - **Alternativa descartada:** numerar no worker na hora do envio. Põe a numeração fiscal no lado
     que reentrega mensagens e separa o número da intenção que a API registrou.

5. **Ambientes: emenda à ADR-0035 — passa a haver produção restrita e produção.**
   - A ADR-0035 §1 (um endereço só) continua: **uma variável por deploy**, não um par.
     `NFSE_PROVIDER_BASE_URL` é a base da Sefin (`…/SefinNacional`); entra
     `NFSE_NATIONAL_ADN_BASE_URL` (origem do ADN, que serve `/contribuintes` e `/parametrizacao`).
     Staging aponta para `*.producaorestrita.nfse.gov.br`, produção para `*.nfse.gov.br`. Lidas na API
     (parametrização) e no worker (emissão, consulta, eventos).
   - `tpAmb` da DPS sai do `fiscal_environment` da tentativa, que a credencial NFS-e já carrega
     (`nfse.schema.ts:278` e `:568`); a resposta é conferida (decisão 1). Credencial e certificado são
     por ambiente porque cada deploy tem o próprio banco e o próprio cofre; o PFX pode ser o mesmo
     (o e-CNPJ vale nos dois ambientes).
   - A ADR-0035 §2 (NFS-e só em produção) **deixa de valer para `national`**: staging emite, em
     produção restrita, e o pull roda lá. Guarda: com `FISCAL_ENVIRONMENT=homologation`, versão
     diferente de `national` desliga o trilho de NFS-e no boot — staging nunca fala com a Nota RP real.
   - **Guarda de boot do endereço**, na API e no worker: o host de `NFSE_PROVIDER_BASE_URL` e de
     `NFSE_NATIONAL_ADN_BASE_URL` confere com `FISCAL_ENVIRONMENT` — `*.producaorestrita.nfse.gov.br`
     só com `homologation`, `*.nfse.gov.br` sem `producaorestrita` só com `production`. Divergência
     falha o boot (fail-closed), antes de qualquer chamada. É a defesa primária; a conferência de
     `tipoAmbiente` da decisão 1 é a segunda.
   - Produção emite só depois da T4.2: nota de valor mínimo, conferida no portal, com aprovação humana.

6. **Documentos: XML imutável no storage; DANFSe por renderizador próprio no worker.**
   - O XML da NFS-e (assinado pelo município) é guardado como hoje: purpose `nfse_document`
     (`apps/api-transportada/src/database/storage.schema.ts:19`), create-only, SHA-256, bytes
     originais sem reformatar (ADR-0006). "Original" no nacional é o XML **já descomprimido** do
     `nfseXmlGZipB64` (base64 → gunzip), gravado como sai do gunzip, sem parse nem reserialização; o
     SHA-256 é calculado sobre esses bytes.
   - `verificationCode` é obrigatório nos fatos de autorização
     (`apps/worker-transportada/src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.ts:30`).
     O padrão nacional identifica e verifica a nota pela `chaveAcesso` (50 dígitos), e o `plan.md`
     não transcreve campo de código de verificação na NFS-e. Regra: se o XSD 1.01 da NFS-e tiver
     campo de código de verificação, ele preenche `verificationCode`; se não tiver, `verificationCode
= chaveAcesso`. A T2.2 confere no XSD e fixa a regra no contrato.
   - O PDF sai de `fetchDocument({ kind: 'pdf' })` do adaptador nacional, que renderiza o DANFSe a
     partir do XML da própria NFS-e (`pdfkit`, a mesma versão fixada na API). O pull já trata o PDF
     como conveniência que não bloqueia a autorização
     (`apps/worker-transportada/src/nfse-status-pull/application/reconcile-invoice.use-case.ts:179`): nada
     muda nele. Conteúdo: chave de acesso, número e data, prestador, tomador, discriminação, valores,
     ISS e retenções, ambiente (com tarja "SEM VALOR FISCAL" em produção restrita) e QR code da
     consulta pública — o leiaute segue a NT oficial do DANFSe quando a T2.5 a localizar. O QR code
     sai de `bwip-js`, a mesma biblioteca que a API já usa (`apps/api-transportada/package.json:53`):
     é a segunda dependência nova do worker, ao lado do `pdfkit` 0.19.1.
   - **Alternativa descartada:** renderizar na API sob demanda — PDF não bloqueia o event loop da API
     (regra da API) e os v2/v3 já guardam PDF; um caminho só para todos. **Alternativa descartada:**
     adiar o PDF — o painel e o cliente já esperam o documento, e o renderizador lê um XML que já
     temos. O PDF é representação, não prova: errar o leiaute não toca o XML fiscal.

7. **Parâmetros do município lidos do ADN pelo worker, na transmissão (A1 só no worker, decisão 3).**
   - O worker consulta `/parametrizacao/{codMun}/convenio`, `/{codServico}/{competencia}/aliquota`,
     `/{competencia}/retencoes` e `/{codServico}/{competencia}/regimes_especiais` **antes** do `POST`
     (fora de qualquer transação), com timeout curto, usando o mTLS do A1 `nfse` que ele já abre para
     a Sefin. Falha de rede/`5xx`/corpo ilegível → recuperável (retentativa do consumidor), sem
     emitir. O resultado é registrado no resultado da tentativa com a competência e a hora da leitura.
     A API não consulta o ADN.
   - **Qual alíquota compara.** O perfil tem `iss_rate` e `simples_national_rate`
     (`apps/api-transportada/src/database/nfse.schema.ts:165` e `:167`). Fora do Simples
     (`simples_national_rate` nulo), a alíquota do ADN diferente de `iss_rate` → recusa fatal nomeada
     no worker (`NFSE_MUNICIPAL_RATE_MISMATCH`, com os dois valores, sem retentativa); o worker não
     sobrescreve o perfil em silêncio. **No Simples** (o caso da transportadora, `evidence.md`), o ISS segue a faixa do
     Simples e não a alíquota municipal: o valor do ADN é apenas registrado
     (nunca bloqueia), então a perda de não bloquear na criação é pequena. A T1.3 confere se o perfil tem marcador de regime melhor que a
     nulidade de `simples_national_rate`; se tiver, ele decide.
   - **ADN `404` na alíquota** (serviço sem parametrização no município) não é indisponibilidade:
     não é falha: registra `municipalRate: not_parameterized` e a emissão segue com o
     perfil. Recuperável fica para timeout, rede, `5xx` e corpo ilegível.
   - **NBS.** A Prefeitura tornou NBS obrigatório no sistema municipal (29/04/2026, `evidence.md`), e
     o `cNBS` é opcional no XSD 1.01. O perfil **já tem** `nbs_code`
     (`nfse.schema.ts:166`, `text not null default ''`): não há coluna nova. A DPS leva `cNBS` quando
     o perfil o tiver; a sonda T2.3b envia com `cNBS` preenchido e registra se a Sefin o cobra. Se
     cobrar, a API passa a exigir `nbs_code` não vazio no modo `national` (como o
     `nationalTaxationCode` da ADR-0098).
   - **Alternativa descartada:** ler na API ao congelar o payload — exigiria que a API abrisse o A1
     (decisão 3). A leitura por tentativa no worker é registrada e a reentrega da mesma tentativa
     reaproveita o valor já gravado, sem recalcular.

8. **Risco aberto: `aderenteEmissorNacional = 0`. A sonda T2.3b decide antes das Fases 1 e 3.**
   - Com a DPS montada e assinada (A1 vindo do arquivo local, senha digitada pelo usuário, nada em
     disco), um `POST /nfse` em produção restrita. Aceite fecha o risco para homologação; produção só
     a T4.2 prova.
   - **A sonda usa a série reservada `49999`** (decisão 4), nunca uma série que o perfil possa usar.
     A sonda preparada (`evidence.md` § "Sonda T2.3b") monta série 1 / `nDPS` 1 e precisa passar à
     série `49999` antes do envio (ação registrada na T2.3b). A sonda também envia `cNBS` (decisão 7)
     e registra o algoritmo de assinatura que a Sefin aceitou e o código da recusa de duplicidade, se
     aparecer (decisão 1).
   - **Se a Sefin recusar por convênio:** parar, registrar código e mensagem em `evidence.md` e voltar
     ao usuário. **Não há "regressão zero":** a produção está na **v2**, e a v2 já recusa a empresa
     (ADR-0098 § Consequências; `CLAUDE.md` da raiz) — ficar como está é não emitir NFS-e pelo
     sistema. **Plano B decidido pelo usuário em 08/10/2026: webservice ISS.Net no padrão nacional**
     (spec nova, a abrir se a sonda falhar; pode ter custo e contrato — a homologação do ISS.Net,
     segundo o fórum do ACBr, exige contrato). **Alternativa descartada por ora:** retomar a T6.2 da
     250 (virada para `v3`); ela segue suspensa e não é o plano B escolhido. Nenhuma migration da
     Fase 1 entra antes da sonda.

9. **Limites: limitador por processo reaproveitado, valor configurável e conservador.**
   - O `createRateLimitedFetch`
     (`apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-rate-limit.ts:11`) ganha uma
     instância nacional no composition root, como a v3 (`apps/worker-transportada/src/main.ts:512` e
     `:595`), compartilhada por emissão e status pull, com `NFSE_NATIONAL_MIN_INTERVAL_MILLISECONDS`
     no worker (padrão 1000). `429` e `503` são recuperáveis. Assume uma réplica do worker (ADR-0098
     §8). O pull custa até três `GET /nfse/{chave}` por nota (status, XML, PDF); memorizar o XML
     dentro de uma reconciliação é permitido ao adaptador.
   - Na T4.2b o limitador **fica** (renomeado sem `nota-rp`); sai só a instância da v3.
   - **Alternativa descartada:** sem limitador até medir. Sem fonte oficial, o primeiro sinal de limite
     seria bloqueio do CNPJ em produção; 1 req/s cabe no volume de uma transportadora.
   - XMLDSig: começar por c14n 1.0, RSA-SHA1 e SHA1 (o que a nota 74 traz — indício, porque ela saiu
     pela Nota RP) e confirmar na sonda; o selftest da sonda já verifica RSA-SHA1 e RSA-SHA256. O
     algoritmo fica em constante única do assinador, não espalhado.

## Consequências

- **Migrations aditivas** (todas com `rollback.sql`; `make migration-test`):
  - `digital_certificates_purpose_check` passa a aceitar `nfse`; `fiscal_sequences_model_check`
    passa a aceitar `nfse_dps`. O rollback restaura o check anterior e falha, guardado, se houver
    linha com o valor novo (após dados reais é roll-forward, ADR-0005).
  - `nfse_emission_profiles.dps_series` (inteiro, nulável, check 1–49998; `49999` reservada à
    sonda); exigido pela API só quando a versão for `national`.
  - `nfse_provider_credentials`: `provider` aceita `national`; `secret_envelope` e
    `callback_token_sha256` passam a nuláveis com check por provedor (decisão 3). O rollback falha,
    guardado, se houver linha `national`.
  - `nfse_issuance_attempts.dps_id` (`text`, nulável, check `^DPS[0-9]{42}$` quando presente) e
    `fiscal_sequence_reservation_id` (nulável, FK ao ledger). Sem índice único em `dps_id`: a
    reemissão ambígua o repete de propósito.
  - Parâmetros municipais e versão `national` vão no payload/`providerConfig` (jsonb), sem coluna.
- **Ordem:** worker com `NFSE_PROVIDER_VERSION_UNKNOWN` e com o ramo `national` no ar **antes** de a
  API gravar `national`; a troca da variável é passo de operação, não do PR (decisão 2).
- **API:** valor `national`, cadastro do A1 `nfse` com validade e alerta (upload único que sela `cte`
  e `nfse` opcional), credencial `national` sem segredo, reserva de `nDPS`, base do ADN no schema de
  env, guardas de staging e de endereço × ambiente; **a API não abre o A1**, `409 NFSE_REISSUE_CORRECTION_AMBIGUOUS`.
- **Worker:** leitura da parametrização do ADN na transmissão (único processo que abre o A1),
  `nfse-national.client.ts` + assinador (`xml-crypto` + `@xmldom/xmldom`, PKCS#12 por
  `node-forge`) + ramo `national` nos dois gateways, eventos `101101`, instância nacional do
  limitador, renderizador do DANFSe (`pdfkit` e `bwip-js` como dependências novas, justificadas pelo
  §13), guarda de endereço × ambiente, recusa `NFSE_PROVIDER_VERSION_UNKNOWN` desde já e
  `NFSE_PROVIDER_VERSION_RETIRED` depois da T4.2b.
- **Spec 250:** a T6.2 fica **suspensa** até a sonda; se a sonda falhar o plano B é o ISS.Net no
  padrão nacional (spec nova) e a T6.2 fica como alternativa descartada por ora.
- **Cron:** rotina de alerta de validade do A1; `cron-nfse` passa a subir em staging.
- **Painel:** tela do certificado/ambiente da NFS-e com validade e estado (Fase 3); a tela de emissão
  não muda.
- **Fora:** emissão por decisão judicial, NFS-e de tomador no exterior, intermediário, obra/evento,
  substituição (`105102`) e análise fiscal (`105104`); vínculo de nota emitida fora do sistema pela
  `chaveAcesso` (seguimento depois da T4.2b); limitador distribuído; outros municípios.

## Segurança

Nenhum segredo novo em claro: A1 e senha no envelope da ADR-0004 com finalidade própria. XML, DPS e
evento nunca em fila, log, auditoria ou erro (ADR-0006 §12). Rejeições logam código e mensagem
saneada. A guarda de boot de endereço × ambiente, a conferência de `tipoAmbiente` (falha terminal
com alerta) e a guarda de staging impedem nota de produção a partir de staging. O A1 `nfse` é aberto
em um só processo (o worker, para o ADN e para a Sefin): a superfície da chave não cresce.

## O que o `architect` precisa validar

1. `HEAD` antes de todo `POST` como única defesa de duplicidade, e `403` como `rejected`.
2. A divergência de alíquota ADN × perfil como `409` (e não ADN vence).
3. Finalidade `nfse` com reenvio do PFX, em vez de ler o certificado `cte`.
4. DANFSe renderizado no worker, e a ausência de DANFSe oficial como risco de leiaute aceito.

(Validado em 08/10/2026; o resultado e as mudanças estão na seção abaixo.)

## Revisão do architect (08/10/2026)

Revisão independente, veredito **aprovar com ajustes**. Cada caminho:linha citado foi reaberto no
código antes de mudar o texto.

1. **[alta] Ordem de publicação** — aceito. Confirmado `nfse-provider-api-version.policy.ts:22`
   (desconhecida → `v2`) e `deploy.yml:179-180`/`:248`/`:389` (API antes de `deploy-services`). Decisão
   2 ganha "worker primeiro, variável depois" e a recusa `NFSE_PROVIDER_VERSION_UNKNOWN` desde já
   (T2.0), não só a `RETIRED` da T4.2b.
2. **[alta] "Regressão zero" e T6.2** — aceito. Decisões 2 e 8 corrigidas: produção na v2, que já
   recusa a empresa; a T6.2 da 250 fica suspensa até a sonda. (Atualizado pelo usuário em 08/10/2026: o plano B é o ISS.Net no
   padrão nacional; a T6.2 é alternativa descartada por ora.)
   `spec.md` corrigido.
3. **[alta] Sonda × numeração** — aceito. Série `49999` reservada à sonda, perfil limitado a
   1–49998 (decisão 4, consequências); índice único confirmado em `nfse.schema.ts:387-389`. A sonda
   não foi editada: a troca de série é ação da T2.3b.
4. **[alta] Reemissão ambígua com correção** — aceito, opção "proibir", **confirmada
   pelo usuário em 08/10/2026**: `409 NFSE_REISSUE_CORRECTION_AMBIGUOUS` (decisão 1). Comparação no pull descartada com razão: detecta
   tarde e deixa nota `authorized` com payload que mente. Caminhos confirmados (`:28`; a correção é
   aplicada em `:195`).
5. **[alta] Corrida `HEAD 404` → `POST` duplicado** — aceito. Recusa de duplicidade → `GET /dps/{id}`
   → `accepted`. O código **não está** no `plan.md` nem no `evidence.md`: marcado "a localizar no
   Anexo I/na sonda".
6. **[média] 403 pelo corpo** — aceito. Classificação por `erros[].codigo`, sem código sintético
   (`NFSE_NATIONAL_CERTIFICATE_REJECTED` sai); `403` sem corpo → `error`; cada `rejected` é lacuna no
   ledger.
7. **[média] `tipoAmbiente` divergente** — aceito. Falha terminal com alerta, sem reemissão
   automática; guarda de boot endereço × `FISCAL_ENVIRONMENT` somada à decisão 5.
8. **[média] Qual alíquota compara** — aceito-com-mudança. Colunas confirmadas (`:165`/`:167`).
   Compara `iss_rate` só fora do Simples (marcador provisório: `simples_national_rate` nulo, a T1.3
   confere); no Simples grava sem bloquear; ADN `404` não é `503`. O ADN **exige** mTLS (evidência
   da T0.2 e leitura com A1). O architect propôs a API abrir o A1; **o usuário decidiu em 08/10/2026
   que só o worker abre o A1** (decisão 3), e a leitura do ADN foi para o worker (decisão 7).
9. **[média] Credencial no `national`** — aceito; **decidido pelo usuário em 08/10/2026**: linha de `nfse_provider_credentials`
   com `provider = national`, sem segredo nem callback (colunas nuláveis com check), sem FK ao
   certificado. Confirmado `NFSE_CREDENTIAL_MISSING` e `nfse.schema.ts:44`/`:281-282`.
10. **[média] Pré-condição da T4.2b** — aceito. Conta também v2/v3 em `failed` ambíguo.
11. **[média] cNBS** — aceito-com-mudança. A coluna **já existe** (`nbs_code`, `nfse.schema.ts:166`,
    `not null default ''`): não há coluna nova. A sonda envia `cNBS`; se a Sefin cobrar, a API passa
    a exigir.
12. **[média] Cancelamento** — aceito. De-para motivo → `cMotivo`/`xMotivo` (valores do XSD na
    T2.2), `201` → `accepted` e o pull confirma, `400`/`422` → `rejected`, retentativa consulta
    eventos antes de reenviar.
13. **[baixa] Bibliotecas e nota 74** — aceito. `xml-crypto` 6.3.x + `@xmldom/xmldom`; PKCS#12 por
    `node-forge` 1.3.x (o mesmo do pacote fiscal, conferido no `package.json` dele). Nota 74 rebaixada
    a indício no Contexto e na decisão 9.
14. **[baixa] Documento** — aceito. `verificationCode` (confirmado `:30`) = campo do XSD se houver,
    senão `chaveAcesso` (T2.2 confere); XML guardado descomprimido, sem reserializar, SHA sobre esses
    bytes; `bwip-js` (confirmado `package.json:53` da API) como segunda dependência do worker.
15. **[baixa] Upload único que sela `cte` e `nfse`** — aceito; **decidido pelo usuário em 08/10/2026**. Cada envelope é
    cifrado do texto claro com o próprio AAD; não atravessa finalidade e mantém rotação
    independente.
