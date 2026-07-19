# Feature 004 — Empresa e configurações fiscais

## Problema e resultado

O TransportAdA possui apenas o shell de empresa necessário à identidade. Ainda
não existe um cadastro fiscal tenant-scoped, uma forma segura de receber e
armazenar certificado A1 ou uma sequência CT-e protegida contra concorrência.

O resultado desta feature é permitir que um administrador da empresa configure
o emitente, o ambiente e a série CT-e, substitua seu certificado A1 de forma
atômica e consulte somente metadados não sensíveis. A fundação de sequência
fiscal fica pronta para o worker reservar números posteriormente, sem emitir,
consultar ou cancelar documentos nesta fase.

## Premissas decididas

- a empresa já existe e o `companyId` vem exclusivamente do contexto
  autenticado entregue pela feature 003;
- somente a permissão company-scoped `settings.manage` altera dados nesta
  feature;
- `homologation` é o ambiente inicial; selecionar `production` não transmite
  documento, não habilita emissão e não testa a SEFAZ; o gate para emitir em
  produção será definido na feature de emissão;
- o CNPJ do certificado deve ser exatamente igual aos 14 dígitos canônicos do
  CNPJ da empresa; matriz, filial, procuração e exceções ficam fora do MVP;
- existe uma única credencial ativa por empresa e finalidade: a nova é validada
  antes da troca transacional e a anterior é aposentada;
- o PFX e sua senha formam um segredo cifrado e autenticado no PostgreSQL; a
  chave raiz permanece apenas em configuração confiável;
- no MVP local, o keyring é fornecido por configuração versionada com chaves de
  32 bytes em base64 e um identificador explícito da chave ativa; o envelope
  preserva versão e `keyId` para permitir rotação e futura adoção de KMS;
- a criptografia usada pela API e futuramente pelo worker será um package Bun
  independente, implementado e publicado em `adatechnology-packages`;
- `@adatechnology/fiscal-provider@0.1.0` é consumido somente por seus exports
  públicos e faz a validação local do A1;
- o certificado fornecido para desenvolvimento é fixture local: nunca será
  copiado, versionado, enviado ao Railway ou usado contra a SEFAZ.

## Fora do escopo

| Item                                                      | Motivo                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| Criar empresas e memberships pela plataforma              | exige fluxo próprio de onboarding                                |
| Emissão, cancelamento ou consulta CT-e                    | pertence às features 006 e 007                                   |
| Distribuição ou importação de NF-e                        | pertence à feature 005                                           |
| Teste de conexão ou smoke contra SEFAZ                    | somente após gateway mock e aprovação explícita de homologação   |
| DACTE, regras tributárias, CFOP, ICMS e modal             | dependem do documento e não da configuração base                 |
| Inutilização ou política legal para lacunas de numeração  | será especificada junto da emissão                               |
| RabbitMQ, exchanges, filas e DLQ                          | não há efeito externo ou job assíncrono nesta feature            |
| KMS gerenciado, Railway e rotação operacional em produção | entram no hardening; o formato já deve identificar chave/versão  |
| Expor, baixar ou recuperar senha/PFX pela API             | segredo é write-only e disponível só aos adaptadores autorizados |

## Histórias priorizadas

### P1 — Manter o cadastro fiscal da empresa

**História:** Como administrador da transportadora, quero registrar os dados do
emitente e a configuração CT-e para preparar o fluxo fiscal da minha empresa.

**Critérios de aceite:**

1. **WHEN** um usuário com `settings.manage` consulta as configurações **THEN**
   a API **SHALL** retornar somente a empresa obtida do contexto autenticado.
2. **WHEN** o cadastro é atualizado com dados válidos **THEN** a API **SHALL**
   persistir razão social, nome fantasia, CNPJ, inscrições, CRT, RNTRC,
   endereço, município, UF, código IBGE e contato no tenant ativo.
3. **WHEN** o cliente envia `companyId` em body, query ou header **THEN** a API
   **SHALL** ignorá-lo como autoridade e manter o tenant autenticado.
4. **WHEN** CNPJ, UF, código IBGE, CEP, ambiente, série ou próximo número são
   inválidos **THEN** a API **SHALL** responder `400` estruturado sem persistir
   alteração parcial.
5. **WHEN** uma atualização equivalente é repetida com a mesma chave
   idempotente **THEN** a API **SHALL** retornar o mesmo resultado sem duplicar
   registros ou efeitos.

**Teste independente:** dois tenants atualizam e consultam configurações com
valores distintos; tentativas de selecionar o outro tenant não alteram nem
retornam seus dados.

### P1 — Substituir o certificado A1 com segurança

**História:** Como administrador da transportadora, quero carregar o PFX e a
senha sem que o material privado possa ser recuperado pela interface ou pelos
logs.

**Critérios de aceite:**

1. **WHEN** PFX e senha chegam à API **THEN** o conteúdo **SHALL** permanecer
   somente em memória até validação e cifragem, sem arquivo temporário.
2. **WHEN** `validateCertificate` rejeita senha, formato, validade, ICP-Brasil,
   chave privada ou capacidade de assinatura **THEN** a API **SHALL** responder
   com código seguro e preservar o certificado ativo anterior.
3. **WHEN** o CNPJ validado do certificado difere do CNPJ da empresa **THEN** a
   API **SHALL** rejeitar a substituição sem revelar o identificador encontrado.
4. **WHEN** o certificado é aceito **THEN** a API **SHALL** cifrar PFX e senha
   com AEAD associado a empresa e finalidade antes de persistir.
5. **WHEN** a substituição é confirmada **THEN** a API **SHALL** ativar uma
   única versão, aposentar a anterior e manter somente metadados históricos não
   secretos para auditoria.
6. **WHEN** qualquer resposta ou log é produzido **THEN** PFX, senha, chave
   raiz, plaintext, ciphertext e detalhes internos do provider **SHALL NOT**
   aparecer.

**Teste independente:** um certificado efêmero válido é aceito, senha incorreta
e CNPJ cruzado são rejeitados, e varreduras de banco/resposta/log confirmam que
não existe plaintext.

### P1 — Reservar numeração CT-e sob concorrência

**História:** Como processo fiscal, quero reservar um número CT-e exclusivo por
empresa, ambiente e série para que consumidores concorrentes não dupliquem
documentos.

**Critérios de aceite:**

1. **WHEN** a configuração fiscal é criada **THEN** a sequência **SHALL** ser
   única por `(companyId, environment, model, series)`.
2. **WHEN** múltiplas transações reservam números simultaneamente **THEN** cada
   chamada **SHALL** receber um número distinto e monotônico.
3. **WHEN** outra empresa, ambiente ou série reserva um número **THEN** sua
   sequência **SHALL** permanecer independente.
4. **WHEN** uma configuração tenta reduzir ou reutilizar um número já reservado
   **THEN** a operação **SHALL** falhar com `409`.
5. **WHEN** a primeira reserva já ocorreu **THEN** série e próximo número
   **SHALL NOT** ser editáveis por endpoint genérico.
6. **WHEN** um número reservado não chega à transmissão futura **THEN** ele
   **SHALL NOT** ser reutilizado; o tratamento fiscal da lacuna permanece fora
   desta feature.
7. **WHEN** não há emissão nesta feature **THEN** reservar números **SHALL** ser
   acessível apenas por uma porta interna testada, não por endpoint público.

**Teste independente:** integrações PostgreSQL concorrentes reservam pelo menos
20 números em dois tenants sem duplicidade ou interferência.

### P1 — Auditar mudanças sem segredos

**História:** Como responsável de segurança, quero identificar quem alterou
configuração ou certificado sem armazenar o material sensível.

**Critérios de aceite:**

1. **WHEN** cadastro, ambiente, série ou certificado muda **THEN** a transação
   **SHALL** registrar ator, empresa, ação, correlation ID e timestamp.
2. **WHEN** a mudança contém segredo **THEN** a auditoria **SHALL** registrar
   somente identificador da versão e metadados permitidos.
3. **WHEN** a persistência da auditoria falha **THEN** a alteração sensível
   **SHALL** sofrer rollback.

**Teste independente:** cada caso de uso deixa exatamente um evento tenant-
scoped e nenhum campo auditado contém senha, PFX ou payload cifrado.

### P2 — Configurar pela SPA

**História:** Como administrador da transportadora, quero editar o cadastro e
substituir o certificado em uma tela responsiva com feedback seguro.

**Critérios de aceite:**

1. **WHEN** o usuário não possui `settings.manage` **THEN** a SPA **SHALL NOT**
   exibir controles de alteração e a API **SHALL** continuar negando por padrão.
2. **WHEN** um PFX é selecionado **THEN** o frontend **SHALL** enviá-lo somente
   no submit, não persistir arquivo/senha e limpar ambos após sucesso ou erro.
3. **WHEN** a API aceita a substituição **THEN** a SPA **SHALL** mostrar somente
   status, validade e versão não sensíveis.
4. **WHEN** a tela opera em 375, 768 ou 1280 pixels **THEN** a interface
   **SHALL** permanecer utilizável e sem overflow horizontal.

**Teste independente:** Playwright atualiza dados em homologação, substitui uma
fixture efêmera e confirma ausência de segredo em storages, cache e DOM.

## Requisitos funcionais e de segurança

| ID      | Requisito                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------- |
| CFS-001 | Toda query e mutação usa `companyId` do `CompanyContext`; nenhum campo livre seleciona tenant.        |
| CFS-002 | Leitura retorna perfil, configuração e metadados do certificado, nunca PFX, senha ou ciphertext.      |
| CFS-003 | Escrita exige `settings.manage`, valida entrada estritamente e é idempotente.                         |
| CFS-004 | Perfil 1:1 separado do shell de identidade contém os dados necessários ao futuro `CteConfig`.         |
| CFS-005 | Ambiente da aplicação é `homologation` ou `production`, com mapeamento explícito para o provider Ada. |
| CFS-006 | Série e próximo número são inteiros positivos; após a primeira reserva não são editáveis/reusáveis.   |
| CFS-007 | `validateCertificate` é chamado pelo gateway sobre o export público da versão exata instalada.        |
| CFS-008 | Certificado válido precisa ter CNPJ igual ao cadastro, chave privada e capacidade de assinatura.      |
| CFS-009 | Segredo usa AES-256-GCM, nonce de 96 bits e AAD com versão, empresa, certificado e finalidade.        |
| CFS-010 | A chave raiz vem de configuração confiável, falha fechada e nunca é armazenada junto ao ciphertext.   |
| CFS-011 | Keyring identifica chave ativa/anteriores; rotação mantém um ativo e histórico apenas não secreto.    |
| CFS-012 | Reserva fiscal é atômica e única por empresa, ambiente, modelo e série.                               |
| CFS-013 | Alterações sensíveis e de configuração geram auditoria na mesma transação, sem segredos.              |
| CFS-014 | API usa erros estáveis `400`, `401`, `403`, `409` e `500`, sem detalhes criptográficos/fiscais.       |
| CFS-015 | Frontend não persiste PFX, senha ou resposta sensível em storage, cache, service worker ou DOM.       |
| CFS-016 | Fixture PFX real permanece fora do repositório e só pode ser usada por gate local explícito.          |

## Dados e constraints mínimos

- `company_fiscal_profiles` 1:1 com `companies`, CNPJ único e canônico, sem
  alargar ou sobrescrever o shell criado pela identidade;
- perfil contém os campos necessários ao futuro `CteConfig`, `company_id`
  obrigatório, timestamps UTC e versão para concorrência otimista;
- certificado com `company_id`, status, versão, envelope cifrado, key ID,
  validade e metadados permitidos;
- ao aposentar uma credencial, remover seu envelope secreto e preservar somente
  os metadados de auditoria permitidos;
- índice unique parcial garantindo uma versão ativa por empresa;
- `fiscal_sequences(company_id, environment, model, series)` unique, com
  incremento atômico por `UPDATE ... RETURNING`;
- auditoria append-only ligada a `company_id` e ao ator autenticado;
- nenhuma coluna se chama `password`, `pfx`, `private_key` ou sugere plaintext;
- migration aditiva, rollback manual versionado e startup sem migration.

## Casos extremos

- upload ausente, vazio, acima do limite ou que não seja PFX;
- senha vazia, incorreta ou excessiva;
- certificado expirado, ainda não válido, sem chave privada, sem CNPJ,
  não ICP-Brasil ou incapaz de assinatura;
- CNPJ do certificado pertencente a outro tenant;
- duas substituições simultâneas do certificado;
- duas atualizações concorrentes com versão obsoleta;
- duas reservas simultâneas na mesma sequência;
- tentativa de mudar série ou próximo número após a primeira reserva;
- mesmo número inicial em empresas, ambientes ou séries diferentes;
- chave raiz ausente, inválida ou não correspondente ao key ID do envelope;
- ciphertext, nonce, tag ou AAD adulterados;
- repetição da mesma chave idempotente com payload diferente;
- usuário autenticado sem membership ativa ou sem `settings.manage`.

## Rastreabilidade

| Requisito | História                   | Status    |
| --------- | -------------------------- | --------- |
| CFS-001   | Cadastro/isolamento        | Specified |
| CFS-002   | Certificado/consulta       | Specified |
| CFS-003   | Cadastro/autorização       | Specified |
| CFS-004   | Cadastro fiscal            | Specified |
| CFS-005   | Configuração fiscal        | Specified |
| CFS-006   | Configuração fiscal        | Specified |
| CFS-007   | Certificado/provider Ada   | Specified |
| CFS-008   | Certificado/tenant         | Specified |
| CFS-009   | Certificado/criptografia   | Specified |
| CFS-010   | Certificado/key management | Specified |
| CFS-011   | Certificado/rotação        | Specified |
| CFS-012   | Sequência concorrente      | Specified |
| CFS-013   | Auditoria                  | Specified |
| CFS-014   | Erros seguros              | Specified |
| CFS-015   | SPA segura                 | Specified |
| CFS-016   | Fixture local              | Specified |

Cobertura nesta fase: 16 requisitos especificados; mapeamento para design e
tasks será preenchido após aprovação da spec.

## Critérios de sucesso

- dois tenants atualizam e consultam configurações sem vazamento cruzado;
- plaintext de PFX/senha não aparece em banco, respostas, logs ou auditoria;
- certificado inválido ou de outro CNPJ não substitui o anterior;
- 20 reservas concorrentes na mesma sequência são únicas e monotônicas;
- uma versão ativa por empresa é garantida também pelo PostgreSQL;
- frontend autenticado conclui o fluxo responsivo sem persistir segredo;
- frozen install, typecheck, lint, contratos, integrações, migration/rollback,
  smoke local e revisão Sol ficam verdes antes de qualquer deploy.

## Decisões fechadas e pendências não bloqueantes

- igualdade exata de CNPJ, um certificado ativo por finalidade, perfil fiscal
  separado do shell e configuração somente da empresa corrente estão decididos;
- esta feature não cria CRUD platform-scoped de empresas;
- `settings.manage` pode preparar o valor `production`, mas não autoriza nem
  habilita uma emissão; esse gate será decidido antes da feature 006;
- limites fiscais máximos de série/número, inutilização, KMS gerenciado e
  chamadas SEFAZ permanecem fora do escopo e não serão inventados aqui.
