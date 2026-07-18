nome do projeto: TransportAdA

# Prompt de Desenvolvimento — TMS Multiempresa para Transportadoras

## 1. Instrução

Projete e implemente uma aplicação **TMS — Transportation Management System** completa, modular, multiempresa e preparada para distribuição como produto SaaS ou instalação dedicada.

A aplicação será utilizada inicialmente pela **Transportadora Fernandes**, porém não poderá conter regras, nomes, CNPJs, logotipos ou configurações fixas dessa empresa no código.

Todo o sistema deverá ser genérico, parametrizável e adaptável para outras transportadoras.

O desenvolvimento deverá ser dividido em etapas.

Nesta primeira etapa, implemente apenas o núcleo necessário para:

1. importar NF-e;
2. armazenar os dados das NF-e;
3. organizar as notas em lotes;
4. calcular automaticamente o valor do frete;
5. emitir CT-e em lote;
6. armazenar os documentos fiscais emitidos;
7. selecionar CT-e para faturamento;
8. gerar faturas;
9. acompanhar o processamento e os erros de cada documento.

A emissão dos documentos fiscais deverá utilizar a biblioteca interna:

```text
adatechnology-packages
```

Antes de criar qualquer implementação fiscal duplicada, analise os contratos, funções, serviços, DTOs, tipos e recursos já oferecidos por essa biblioteca.

Não recrie dentro da aplicação funcionalidades que já existam na `adatechnology-packages`.

---

# 2. Contexto do Projeto

A empresa precisa de uma plataforma para gerenciar as operações fiscais e logísticas relacionadas ao transporte de mercadorias.

No fluxo inicial, a transportadora deverá conseguir:

1. obter NF-e vinculadas ao seu CNPJ;
2. importar os XMLs das NF-e;
3. selecionar as notas que serão transportadas;
4. agrupar as notas em lotes;
5. calcular o frete de cada nota;
6. gerar um CT-e para cada NF-e selecionada;
7. transmitir os CT-e;
8. acompanhar autorizações e rejeições;
9. selecionar CT-e autorizados;
10. gerar uma fatura a partir dos CT-e selecionados;
11. exportar ou enviar os documentos gerados.

Exemplo de regra comercial:

```text
Valor do frete = 3,5% do valor total da NF-e
```

Essa regra é apenas um exemplo e não poderá ser fixa no código.

A aplicação deverá permitir que cada empresa configure suas próprias regras de cálculo.

Exemplos:

```text
Percentual sobre o valor da NF-e
Valor fixo por documento
Valor por peso
Valor por volume
Valor por quilômetro
Valor mínimo de frete
Valor máximo de frete
Adicional por região
Adicional por tipo de carga
Adicional por seguro
Adicional por pedágio
Combinação de múltiplas regras
```

Toda regra de cálculo deverá ser persistida no banco de dados, possuir vigência e registrar qual configuração foi utilizada na emissão do CT-e.

---

# 3. Objetivo do MVP

O MVP deverá entregar um fluxo funcional de ponta a ponta:

```text
Importação da NF-e
→ Validação
→ Persistência
→ Criação do lote
→ Simulação do frete
→ Aprovação do lote
→ Emissão do CT-e
→ Consulta do processamento
→ Seleção de CT-e autorizados
→ Geração da fatura
```

Nesta primeira etapa, não implemente integralmente:

- cadastro operacional de motoristas;
- cadastro operacional de veículos;
- averbação de seguros;
- manifesto MDF-e;
- controle de entregas;
- aplicativo PWA do motorista;
- integração com WhatsApp;
- portal de rastreamento do cliente;
- leitura de código de barras;
- baixa física de mercadorias;
- roteirização avançada.

Entretanto, a arquitetura deverá permitir a inclusão desses módulos posteriormente sem reescrever o núcleo do sistema.

---

# 4. Princípios Obrigatórios

A solução deverá seguir os seguintes princípios:

- arquitetura modular;
- separação entre domínio, aplicação e infraestrutura;
- multiempresa;
- isolamento de dados por empresa;
- processamento em lote;
- idempotência;
- rastreabilidade;
- auditoria;
- segurança;
- observabilidade;
- tratamento estruturado de erros;
- processamento assíncrono para operações fiscais;
- interface simples e moderna;
- regras comerciais configuráveis;
- ausência de informações empresariais fixas no código;
- suporte aos ambientes de homologação e produção;
- possibilidade de reprocessamento seguro;
- integração fiscal centralizada pela `adatechnology-packages`.

---

# 5. Multiempresa

O sistema deverá suportar múltiplas transportadoras.

Cada empresa deverá possuir suas próprias configurações:

```text
Razão social
Nome fantasia
CNPJ
Inscrição estadual
Inscrição municipal
Regime tributário
Endereço
Telefone
E-mail
Logotipo
Cores da interface
Certificado digital
Senha do certificado
Ambiente fiscal
Série dos documentos
Numeração dos documentos
Configurações de CT-e
Configurações de NFS-e
Configurações de faturamento
Regras de cálculo de frete
Templates de e-mail
Configurações de integrações
```

O isolamento deverá ser realizado por uma propriedade semelhante a:

```text
tenantId
companyId
organizationId
```

Escolha uma nomenclatura única e utilize-a em todas as entidades que pertençam a uma empresa.

Nenhuma consulta poderá retornar dados de outra empresa.

Não confiar apenas em filtros enviados pelo frontend. O contexto da empresa deverá ser obtido da autenticação do usuário.

---

# 6. Configurações e Variáveis de Ambiente

As variáveis de ambiente deverão ser utilizadas para configurações de infraestrutura e segurança.

Exemplos:

```env
APP_NAME=
APP_ENV=
APP_PORT=

DATABASE_URL=
RABBITMQ_URL=

JWT_SECRET=
ENCRYPTION_KEY=

QUEUE_PREFIX=

STORAGE_PROVIDER=
STORAGE_BUCKET=
STORAGE_REGION=
STORAGE_ENDPOINT=

EMAIL_PROVIDER=
EMAIL_FROM=

FISCAL_DEFAULT_ENVIRONMENT=homologation
```

Dados comerciais de cada transportadora não deverão ficar exclusivamente em variáveis de ambiente.

Informações como percentual de frete, série fiscal, numeração e regras de cobrança deverão ser armazenadas no banco de dados por empresa.

As variáveis de ambiente deverão definir somente:

- infraestrutura;
- credenciais globais;
- segredos;
- comportamento da aplicação;
- recursos habilitados;
- valores padrão de instalação.

---

# 7. Módulos do MVP

## 7.1. Autenticação e Autorização

Criar autenticação segura e autorização por perfis.

Perfis iniciais:

```text
Administrador da plataforma
Administrador da transportadora
Financeiro
Fiscal
Operador
Consulta
```

Exemplos de permissões:

```text
companies.manage
users.manage
invoices.import
invoices.read
batches.create
batches.approve
freight.simulate
cte.issue
cte.cancel
cte.read
billing.create
billing.cancel
billing.read
settings.manage
audit.read
```

As permissões deverão ser verificadas no backend.

---

## 7.2. Empresas

Criar o cadastro das transportadoras que utilizarão o sistema.

A empresa deverá possuir configurações fiscais e comerciais próprias.

O sistema deverá permitir:

- cadastrar empresa;
- editar empresa;
- ativar ou desativar empresa;
- configurar ambiente de homologação ou produção;
- cadastrar certificado digital;
- configurar séries;
- configurar regras de cálculo;
- configurar dados de cobrança;
- configurar identidade visual.

Os dados sensíveis deverão ser criptografados.

---

## 7.3. Importação de NF-e

As NF-e poderão entrar no sistema por duas origens.

### Origem 1 — Consulta online

Criar uma abstração para consultar documentos fiscais vinculados ao CNPJ da transportadora.

Não presumir que todos os estados, provedores ou serviços oferecem o mesmo processo.

A implementação deverá utilizar contratos, permitindo múltiplos provedores:

```ts
interface NfeDistributionProvider {
  fetchDocuments(
    input: FetchNfeDocumentsInput,
  ): Promise<FetchNfeDocumentsResult>;
}
```

Registrar:

- empresa;
- provedor utilizado;
- NSU inicial;
- NSU final;
- último NSU consultado;
- data da consulta;
- quantidade encontrada;
- quantidade importada;
- erros;
- status do processamento.

### Origem 2 — Upload de XML

Permitir o envio de:

- um XML;
- vários XMLs;
- arquivo ZIP contendo XMLs.

A importação deverá:

1. validar o tipo do arquivo;
2. extrair os XMLs;
3. validar a estrutura;
4. identificar a chave de acesso;
5. verificar duplicidade;
6. validar o CNPJ relacionado;
7. extrair os dados principais;
8. armazenar o XML original;
9. persistir os dados normalizados;
10. registrar erros individualmente.

Não duplicar uma NF-e já existente para a mesma empresa.

A chave de acesso deverá possuir restrição única combinada com a empresa.

Exemplo:

```text
UNIQUE(company_id, access_key)
```

---

## 7.4. Dados da NF-e

Persistir pelo menos:

```text
Empresa proprietária do registro
Chave de acesso
Número
Série
Data de emissão
Natureza da operação
Tipo de operação
Valor total
Valor dos produtos
Valor do frete
Valor do seguro
Desconto
Outras despesas
Peso bruto
Peso líquido
Quantidade de volumes
Espécie dos volumes
CNPJ e dados do emitente
CNPJ e dados do destinatário
CNPJ e dados do remetente
CNPJ e dados do expedidor
CNPJ e dados do recebedor
Endereço de origem
Endereço de destino
Município de origem
Município de destino
UF de origem
UF de destino
Produtos
CFOP
NCM
Informações adicionais
Protocolo de autorização
Status da NF-e
Origem da importação
XML original
Data de importação
Usuário responsável
```

Os dados do XML original deverão ser preservados.

Não depender somente dos dados normalizados para operações fiscais futuras.

---

## 7.5. Importações e Processamentos

Cada importação deverá gerar um registro de processamento.

Exemplo de estados:

```text
PENDING
PROCESSING
PARTIALLY_PROCESSED
COMPLETED
FAILED
CANCELLED
```

Cada documento do processamento deverá possuir seu próprio estado:

```text
PENDING
VALIDATING
IMPORTED
DUPLICATED
INVALID
REJECTED
FAILED
```

Uma falha em uma NF-e não deverá interromper toda a importação.

Ao final, apresentar um resumo:

```text
Total recebido
Total processado
Total importado
Total duplicado
Total inválido
Total com erro
```

---

## 7.6. Lotes de NF-e

A emissão deverá acontecer em lote.

O usuário deverá poder selecionar várias NF-e e criar um lote de emissão.

O lote deverá conter:

```text
Código
Empresa
Descrição
Data de criação
Criado por
Quantidade de documentos
Valor total das NF-e
Valor total estimado de frete
Regra de cálculo utilizada
Status
Observações
```

Estados sugeridos:

```text
DRAFT
CALCULATING
CALCULATED
PENDING_APPROVAL
APPROVED
PROCESSING
PARTIALLY_PROCESSED
COMPLETED
FAILED
CANCELLED
```

Cada NF-e deverá ter sua própria linha dentro do lote, com:

```text
NF-e
Valor da NF-e
Peso
Volumes
Regra aplicada
Percentual aplicado
Valor base
Adicionais
Descontos
Valor calculado do frete
Status
Motivo de erro
CT-e gerado
```

---

# 8. Motor de Cálculo de Frete

Criar um motor de regras desacoplado da emissão fiscal.

O motor deverá receber dados da empresa, da NF-e e da regra vigente.

Exemplo de entrada:

```ts
interface CalculateFreightInput {
  companyId: string;
  invoiceId: string;
  issueDate: Date;
  invoiceValue: number;
  weight?: number;
  volumeQuantity?: number;
  originCityCode?: string;
  destinationCityCode?: string;
  originState?: string;
  destinationState?: string;
}
```

Exemplo de saída:

```ts
interface CalculateFreightResult {
  baseAmount: number;
  additions: Array<{
    type: string;
    description: string;
    amount: number;
  }>;
  discounts: Array<{
    type: string;
    description: string;
    amount: number;
  }>;
  totalAmount: number;
  ruleId: string;
  ruleVersion: number;
  calculationDetails: Record<string, unknown>;
}
```

## 8.1. Regra inicial

Implementar inicialmente a regra:

```text
Frete = percentual configurado × valor total da NF-e
```

Exemplo:

```text
Percentual configurado: 3,5%
Valor da NF-e: R$ 10.000,00
Frete calculado: R$ 350,00
```

Representar o percentual de forma segura.

Evitar cálculos monetários utilizando diretamente `number` com ponto flutuante.

Utilizar:

- tipo decimal do banco;
- biblioteca de precisão decimal; ou
- valores monetários em centavos.

## 8.2. Configuração da regra

A regra deverá possuir:

```text
Nome
Descrição
Tipo
Percentual
Valor fixo
Valor mínimo
Valor máximo
Data inicial de vigência
Data final de vigência
Prioridade
Ativa ou inativa
Filtros de origem
Filtros de destino
Filtros por cliente
Filtros por tipo de carga
Versão
```

## 8.3. Snapshot da regra

Quando um lote for calculado ou aprovado, salvar um snapshot da regra aplicada.

Alterações futuras na configuração não poderão modificar o valor histórico de documentos já emitidos.

## 8.4. Simulação

O usuário deverá conseguir simular o valor do frete antes da emissão.

A interface deverá mostrar:

```text
Valor da NF-e
Base de cálculo
Percentual
Adicionais
Descontos
Valor mínimo
Valor máximo
Valor final
```

---

# 9. Emissão de CT-e

A emissão deverá utilizar a `adatechnology-packages`.

Criar um adaptador de aplicação para impedir que o domínio dependa diretamente da implementação da biblioteca.

Exemplo:

```ts
interface CteFiscalGateway {
  issue(input: IssueCteInput): Promise<IssueCteResult>;
  query(input: QueryCteInput): Promise<QueryCteResult>;
  cancel(input: CancelCteInput): Promise<CancelCteResult>;
}
```

A implementação concreta deverá encapsular a biblioteca:

```text
AdaTechnologyCteGateway
```

## 9.1. Fluxo de emissão

Para cada NF-e do lote:

1. validar se a NF-e está apta;
2. validar a configuração fiscal da empresa;
3. validar certificado;
4. validar série e numeração;
5. calcular o frete;
6. construir o payload;
7. salvar o documento como pendente;
8. enviar para a fila;
9. transmitir utilizando a biblioteca;
10. armazenar requisição e resposta;
11. salvar XML assinado;
12. salvar protocolo;
13. atualizar o status;
14. disponibilizar o DACTE quando autorizado.

## 9.2. Estados do CT-e

Utilizar estados explícitos:

```text
DRAFT
PENDING
QUEUED
PROCESSING
AUTHORIZED
REJECTED
DENIED
CANCEL_PENDING
CANCELLED
FAILED
```

## 9.3. Idempotência

O sistema não poderá emitir dois CT-e para a mesma operação por reenvio acidental.

Criar uma chave de idempotência considerando elementos como:

```text
Empresa
NF-e
Tipo de operação
Série
Ambiente
Lote
```

Toda tentativa deverá ser registrada.

## 9.4. Numeração

A numeração deverá ser controlada por:

```text
Empresa
Ambiente
Modelo
Série
```

O controle deverá ser transacional para impedir números duplicados em processamentos concorrentes.

## 9.5. Erros

Separar:

```text
Erro de validação interna
Erro de configuração
Erro de certificado
Erro de comunicação
Rejeição da SEFAZ
Denegação
Timeout
Erro inesperado
```

As rejeições deverão armazenar:

```text
Código
Mensagem
Payload relacionado
Data
Tentativa
Possibilidade de reprocessamento
```

---

# 10. Processamento Assíncrono

Utilizar filas para tarefas demoradas ou sujeitas a instabilidade externa.

Filas sugeridas:

```text
nfe-import
nfe-distribution
freight-calculation
cte-issuance
cte-query
cte-cancellation
billing-generation
notification-email
```

Cada job deverá possuir:

- identificador;
- empresa;
- usuário solicitante;
- correlação;
- número da tentativa;
- data de criação;
- status;
- erro estruturado;
- resultado;
- timestamps.

Implementar:

- retry com backoff;
- limite de tentativas;
- dead-letter ou fila de falhas;
- idempotência;
- logs;
- rastreamento;
- reprocessamento manual.

Não realizar a transmissão fiscal diretamente dentro de uma requisição HTTP longa.

A API deverá iniciar o processamento e retornar um identificador para acompanhamento.

---

# 11. Faturamento

Depois que os CT-e forem autorizados, o usuário deverá poder selecioná-los para gerar uma fatura.

O sistema deverá permitir filtros por:

```text
Cliente
Tomador
Período
Lote
Número do CT-e
Status
Origem
Destino
Data de emissão
```

## 11.1. Criação da fatura

A fatura deverá possuir:

```text
Empresa emissora
Cliente
Número
Série
Data de emissão
Data de vencimento
Competência
CT-e vinculados
Subtotal
Descontos
Adicionais
Valor total
Status
Observações
Condições de pagamento
Criado por
Data de criação
```

Estados sugeridos:

```text
DRAFT
OPEN
ISSUED
PARTIALLY_PAID
PAID
OVERDUE
CANCELLED
```

## 11.2. Regras

Não permitir que um CT-e seja faturado duas vezes em faturas ativas.

Utilizar transação e restrição de integridade.

Caso uma fatura seja cancelada, definir explicitamente se os CT-e poderão voltar a ser faturados.

## 11.3. Documento de faturamento

Gerar inicialmente:

- visualização em tela;
- PDF da fatura;
- relatório dos CT-e vinculados;
- opção de exportação;
- opção de envio por e-mail.

A emissão de NFS-e poderá ser preparada arquiteturalmente, porém sua implementação integral poderá ficar para uma etapa posterior, pois varia conforme município e provedor.

Criar contrato futuro:

```ts
interface ServiceInvoiceGateway {
  issue(input: IssueServiceInvoiceInput): Promise<IssueServiceInvoiceResult>;
  query(input: QueryServiceInvoiceInput): Promise<QueryServiceInvoiceResult>;
  cancel(input: CancelServiceInvoiceInput): Promise<CancelServiceInvoiceResult>;
}
```

---

# 12. Armazenamento de Arquivos

Os documentos deverão ser armazenados em um serviço de arquivos abstrato.

Criar contrato:

```ts
interface StorageProvider {
  upload(input: UploadFileInput): Promise<StoredFile>;
  download(input: DownloadFileInput): Promise<Buffer>;
  delete(input: DeleteFileInput): Promise<void>;
  getSignedUrl(input: GetSignedUrlInput): Promise<string>;
}
```

Arquivos possíveis:

```text
XML original da NF-e
XML processado
XML do CT-e
XML assinado
Protocolo
DACTE
PDF da fatura
Relatórios
Certificados
Anexos de ocorrências
```

Não salvar arquivos grandes diretamente em colunas do banco sem justificar a decisão.

O banco deverá armazenar:

```text
Provider
Bucket
Caminho
Nome original
MIME type
Tamanho
Hash
Data de criação
Empresa
Tipo do documento
```

---

# 13. Modelo de Dados Inicial

Crie entidades semelhantes a:

```text
Company
CompanySetting
FiscalEnvironment
DigitalCertificate
FiscalSequence
User
Role
Permission
UserCompany

NfeImport
NfeImportItem
NfeDocument
NfeParty
NfeAddress
NfeProduct
StoredFile

FreightRule
FreightRuleVersion
FreightCalculation
FreightCalculationItem

CteBatch
CteBatchItem
CteDocument
CteEvent
CteTransmissionAttempt

BillingInvoice
BillingInvoiceItem
BillingEvent

ProcessingJob
AuditLog
```

Defina:

- chaves primárias;
- chaves estrangeiras;
- índices;
- restrições únicas;
- campos de auditoria;
- campos de empresa;
- exclusão lógica onde fizer sentido;
- controle de versão;
- timestamps.

Todas as entidades financeiras deverão utilizar tipos monetários seguros.

---

# 14. APIs do MVP

Crie APIs REST ou uma arquitetura equivalente, mantendo contratos documentados.

## 14.1. Empresas e configurações

```http
POST   /companies
GET    /companies
GET    /companies/:id
PATCH  /companies/:id

GET    /company-settings
PATCH  /company-settings

POST   /digital-certificates
GET    /digital-certificates
DELETE /digital-certificates/:id

GET    /freight-rules
POST   /freight-rules
GET    /freight-rules/:id
PATCH  /freight-rules/:id
POST   /freight-rules/:id/activate
POST   /freight-rules/:id/deactivate
```

## 14.2. Importação de NF-e

```http
POST /nfe-imports/xml
POST /nfe-imports/distribution
GET  /nfe-imports
GET  /nfe-imports/:id
GET  /nfe-imports/:id/items
POST /nfe-imports/:id/reprocess
```

## 14.3. NF-e

```http
GET /nfe-documents
GET /nfe-documents/:id
GET /nfe-documents/:id/xml
GET /nfe-documents/:id/eligibility
```

## 14.4. Lotes

```http
POST   /cte-batches
GET    /cte-batches
GET    /cte-batches/:id
PATCH  /cte-batches/:id
POST   /cte-batches/:id/items
DELETE /cte-batches/:id/items/:itemId
POST   /cte-batches/:id/simulate
POST   /cte-batches/:id/approve
POST   /cte-batches/:id/issue
POST   /cte-batches/:id/reprocess
POST   /cte-batches/:id/cancel
```

## 14.5. CT-e

```http
GET  /cte-documents
GET  /cte-documents/:id
GET  /cte-documents/:id/xml
GET  /cte-documents/:id/dacte
POST /cte-documents/:id/query
POST /cte-documents/:id/reprocess
POST /cte-documents/:id/cancel
```

## 14.6. Faturamento

```http
GET    /billing/eligible-cte
POST   /billing-invoices
GET    /billing-invoices
GET    /billing-invoices/:id
PATCH  /billing-invoices/:id
POST   /billing-invoices/:id/issue
POST   /billing-invoices/:id/cancel
GET    /billing-invoices/:id/pdf
POST   /billing-invoices/:id/send-email
```

## 14.7. Processamentos

```http
GET  /processing-jobs
GET  /processing-jobs/:id
POST /processing-jobs/:id/retry
```

---

# 15. Frontend

Criar um painel web responsivo, moderno, simples e focado em produtividade.

O design deverá evitar excesso de elementos visuais.

Utilizar:

- boa hierarquia;
- formulários claros;
- tabelas com filtros;
- ações em lote;
- feedback de processamento;
- status visuais;
- acessibilidade;
- responsividade;
- navegação consistente.

## 15.1. Páginas do MVP

```text
Login
Dashboard
Importações de NF-e
Nova importação
Detalhes da importação
Lista de NF-e
Detalhes da NF-e
Lotes de emissão
Criação de lote
Simulação do lote
Detalhes do lote
CT-e emitidos
Detalhes do CT-e
Faturamento
Criação de fatura
Detalhes da fatura
Regras de frete
Configurações fiscais
Certificados
Usuários e permissões
Auditoria
```

## 15.2. Dashboard inicial

Exibir:

```text
NF-e importadas no período
NF-e aguardando processamento
Lotes em rascunho
Lotes em processamento
CT-e autorizados
CT-e rejeitados
Valor total de frete
CT-e aguardando faturamento
Faturas abertas
Últimos erros
```

## 15.3. Tela de lote

A tela deverá permitir:

- pesquisar NF-e;
- selecionar várias NF-e;
- criar lote;
- visualizar o cálculo por nota;
- editar parâmetros permitidos;
- recalcular;
- aprovar;
- iniciar emissão;
- acompanhar o progresso;
- filtrar sucessos e erros;
- reprocessar documentos com erro.

Exemplo de tabela:

```text
Seleção
Chave da NF-e
Número
Emitente
Destinatário
Origem
Destino
Valor da NF-e
Peso
Percentual
Frete calculado
Status
CT-e
Erro
```

---

# 16. Atualização de Processamento

O frontend deverá acompanhar o processamento sem realizar consultas excessivas.

Utilizar uma estratégia como:

```text
SSE
WebSocket
Polling controlado
```

Para o MVP, escolha a alternativa mais simples e confiável para exibir:

- progresso da importação;
- progresso do lote;
- CT-e autorizados;
- CT-e rejeitados;
- erros;
- conclusão do processamento.

A API deverá continuar funcionando mesmo que o usuário feche a tela.

---

# 17. Auditoria

Registrar ações relevantes:

```text
Login
Alteração de configuração
Cadastro de certificado
Criação de regra
Alteração de regra
Importação de XML
Criação de lote
Alteração de lote
Simulação
Aprovação
Emissão
Reprocessamento
Cancelamento
Criação de fatura
Cancelamento de fatura
Download de documento fiscal
```

Cada log deverá conter:

```text
Empresa
Usuário
Ação
Entidade
Identificador
Dados anteriores
Dados posteriores
IP
User-Agent
Correlation ID
Data e hora
```

Nunca registrar senha, chave privada ou conteúdo sensível sem proteção.

---

# 18. Segurança

Implementar:

- autenticação;
- autorização por permissão;
- isolamento por empresa;
- validação de entrada;
- proteção contra upload malicioso;
- limite de tamanho de arquivos;
- validação de XML;
- criptografia de segredos;
- hash de arquivos;
- URLs temporárias para download;
- rate limiting;
- proteção contra acesso indevido a documentos;
- logs de auditoria;
- rotação de credenciais;
- controle de ambiente fiscal;
- mascaramento de dados sensíveis.

O certificado digital e sua senha deverão ser armazenados criptografados.

A aplicação não deverá expor:

- senha do certificado;
- conteúdo privado do certificado;
- tokens;
- segredos;
- credenciais fiscais.

---

# 19. Observabilidade

Implementar:

- logs estruturados;
- correlation ID;
- métricas;
- rastreamento;
- health checks;
- readiness;
- liveness;
- registro de duração das operações;
- quantidade de documentos por status;
- falhas por código de rejeição;
- tentativas por processamento;
- tamanho das filas;
- tempo médio de emissão.

Todos os logs deverão incluir, quando aplicável:

```text
companyId
userId
requestId
correlationId
batchId
invoiceId
cteId
jobId
```

---

# 20. Testes

Criar testes para os fluxos críticos.

## 20.1. Testes unitários

Cobrir:

- cálculo percentual;
- valor mínimo;
- valor máximo;
- snapshots de regra;
- validação de duplicidade;
- seleção de regra vigente;
- elegibilidade da NF-e;
- construção do payload do CT-e;
- controle de numeração;
- totalização da fatura;
- prevenção de faturamento duplicado.

## 20.2. Testes de integração

Cobrir:

- importação de XML;
- persistência dos documentos;
- criação de lote;
- simulação;
- processamento da fila;
- emissão fiscal mockada;
- autorização;
- rejeição;
- reprocessamento;
- criação da fatura;
- isolamento entre empresas.

## 20.3. Testes end-to-end

Criar o cenário:

```text
Cadastrar empresa
→ Configurar certificado de homologação
→ Configurar regra de 3,5%
→ Importar várias NF-e
→ Criar lote
→ Simular frete
→ Aprovar lote
→ Emitir CT-e
→ Autorizar documentos
→ Selecionar CT-e
→ Gerar fatura
→ Gerar PDF
```

---

# 21. Módulos Futuros

A arquitetura deverá prever os módulos abaixo.

## 21.1. Bipagem de notas

Permitir:

- leitura de chave de acesso;
- código de barras;
- QR Code;
- associação com carga;
- associação com rota;
- conferência de entrada;
- conferência de saída;
- registro de divergências.

## 21.2. Motoristas

Dados futuros:

```text
Nome
CPF
CNH
Categoria
Validade
Telefone
Endereço
Status
Documentos
Vínculo com empresa
```

## 21.3. Veículos

Dados futuros:

```text
Placa
RENAVAM
Tipo
Modelo
Marca
Ano
Capacidade
Tara
Proprietário
ANTT
Status
Documentos
```

## 21.4. Seguros

Prever:

- seguradora;
- apólice;
- vigência;
- limite;
- averbação;
- carga;
- veículo;
- motorista;
- documentos.

## 21.5. Rotas e cargas

Prever:

```text
Carga
Rota
Paradas
NF-e
CT-e
Motorista
Veículo
Previsão
Saída
Chegada
Status
Ocorrências
```

## 21.6. MDF-e

O sistema deverá futuramente permitir MDF-e fiscal e controles operacionais não fiscais.

Não misturar o documento MDF-e com uma simples rota operacional.

Criar contextos separados:

```text
Manifesto fiscal
Carga operacional
Rota de entrega
```

## 21.7. Aplicativo PWA

O PWA deverá futuramente permitir:

- login do motorista;
- visualização da rota;
- início da viagem;
- atualização de status;
- registro de ocorrência;
- foto;
- assinatura;
- geolocalização;
- comprovante de entrega;
- funcionamento offline;
- sincronização posterior.

## 21.8. Ocorrências

Tipos futuros:

```text
Cliente ausente
Endereço não localizado
Recusa
Avaria
Extravio
Entrega parcial
Reagendamento
Documento pendente
Entrega concluída
Outro
```

A ocorrência poderá gerar e-mail utilizando templates parametrizados.

## 21.9. E-mails

Criar futuramente um sistema de templates com:

```text
Assunto
Corpo HTML
Corpo texto
Variáveis
Empresa
Tipo de evento
Ativo ou inativo
```

Exemplos de variáveis:

```text
{{customerName}}
{{invoiceNumber}}
{{cteNumber}}
{{routeCode}}
{{occurrenceType}}
{{occurrenceDescription}}
{{deliveryStatus}}
{{trackingUrl}}
```

## 21.10. WhatsApp

Preparar contratos para integração com provedores de WhatsApp.

Exemplo:

```ts
interface MessagingProvider {
  sendText(input: SendTextInput): Promise<SendMessageResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendMessageResult>;
  sendDocument(input: SendDocumentInput): Promise<SendMessageResult>;
}
```

Não acoplar o domínio diretamente à API da Meta ou a um único fornecedor.

## 21.11. Portal do cliente

O portal deverá futuramente permitir:

- autenticação;
- visualização das entregas;
- consulta por NF-e;
- consulta por CT-e;
- consulta por pedido;
- acompanhamento da rota;
- previsão de entrega;
- ocorrências;
- comprovante de entrega;
- download de documentos;
- abertura de solicitação.

O cliente somente poderá acessar documentos associados ao seu cadastro.

---

# 22. Requisitos Não Funcionais

A solução deverá:

- suportar processamento de grandes lotes;
- permitir escalabilidade horizontal;
- impedir duplicidade;
- possuir reprocessamento seguro;
- manter histórico;
- operar em homologação e produção;
- permitir troca de provedores;
- possuir contratos documentados;
- utilizar migrations;
- fornecer dados iniciais mínimos;
- possuir documentação de instalação;
- possuir documentação de arquitetura;
- possuir documentação das variáveis de ambiente;
- possuir documentação das filas;
- possuir documentação dos estados;
- possuir documentação dos fluxos fiscais.

---

# 23. Estrutura Arquitetural Esperada

Organizar a aplicação por módulos de negócio.

Exemplo:

```text
apps/
  api/
  web/
  worker/

packages/
  shared/
  config/
  database/
  observability/
  authentication/
  authorization/
  storage/
  queue/
  fiscal-adapters/
  ui/

modules/
  companies/
  users/
  nfe-imports/
  nfe-documents/
  freight-rules/
  freight-calculations/
  cte-batches/
  cte-documents/
  billing/
  notifications/
  audit/
```

Dentro de cada módulo, separar responsabilidades.

Exemplo:

```text
domain/
application/
infrastructure/
presentation/
```

Não obrigar todos os módulos a utilizarem estruturas excessivamente complexas quando não houver necessidade.

Priorizar clareza, testabilidade e manutenção.

---

# 24. Decisões Técnicas

Antes de iniciar a implementação, apresente as tecnologias recomendadas para:

```text
Backend
Frontend
Banco de dados
ORM
Filas
Cache
Armazenamento
Autenticação
Documentação da API
Validação
Logs
Observabilidade
Testes
Deploy
```

Para cada escolha, informe:

- tecnologia;
- motivo;
- vantagens;
- riscos;
- alternativas;
- impacto no projeto.

Considere que o sistema possui:

- processamento fiscal;
- tarefas assíncronas;
- arquivos XML e PDF;
- lotes;
- multiempresa;
- integrações externas;
- necessidade de auditoria;
- alta exigência de consistência.

---

# 25. Regras de Implementação

Não:

- inventar métodos da `adatechnology-packages`;
- ocultar trechos importantes com comentários como “implementar depois”;
- salvar percentuais e valores monetários de forma imprecisa;
- colocar CNPJ fixo no código;
- colocar percentual de 3,5% fixo no código;
- emitir documentos fiscais dentro de loops sem controle;
- executar lotes grandes inteiramente em memória;
- misturar entidades de NF-e, CT-e e fatura;
- confiar em `companyId` enviado livremente pelo frontend;
- emitir o mesmo CT-e novamente sem idempotência;
- reutilizar numeração fiscal de maneira insegura;
- perder o XML original;
- interromper todo o lote por erro em um único item;
- expor certificados ou segredos;
- acoplar o domínio a um único provedor;
- implementar módulos futuros antes de concluir o MVP.

Sempre:

- validar os contratos existentes da biblioteca;
- criar adaptadores;
- usar transações;
- registrar auditoria;
- salvar snapshots;
- controlar concorrência;
- criar índices;
- retornar erros estruturados;
- documentar decisões;
- criar testes;
- manter separação por empresa;
- permitir reprocessamento;
- registrar cada tentativa fiscal.

---

# 26. Critérios de Aceite do MVP

O MVP será considerado concluído quando for possível:

1. cadastrar uma transportadora;
2. configurar o ambiente de homologação;
3. cadastrar um certificado digital;
4. configurar uma regra de frete de 3,5%;
5. importar um lote de XMLs de NF-e;
6. identificar documentos duplicados;
7. visualizar as notas importadas;
8. selecionar várias notas;
9. criar um lote;
10. simular o frete de cada nota;
11. visualizar o total do lote;
12. aprovar o lote;
13. enviar os documentos para processamento;
14. emitir um CT-e para cada NF-e elegível;
15. acompanhar autorizações e rejeições;
16. reprocessar itens com falha;
17. baixar XML e DACTE dos CT-e autorizados;
18. selecionar CT-e autorizados;
19. gerar uma fatura;
20. impedir o faturamento duplicado;
21. gerar o PDF da fatura;
22. consultar o histórico de auditoria;
23. comprovar o isolamento dos dados entre empresas.

---

# 27. Formato de Saída Esperado

Entregue a resposta em Markdown, seguindo esta ordem:

## 1. Resumo da solução

Explique o funcionamento geral da plataforma.

## 2. Premissas

Liste as premissas adotadas.

## 3. Dúvidas e riscos fiscais

Identifique pontos que dependem de:

- regras da SEFAZ;
- certificado;
- distribuição de documentos;
- CT-e;
- NFS-e;
- particularidades por estado ou município.

Não invente regras fiscais.

## 4. Arquitetura recomendada

Apresente:

- diagrama geral;
- aplicações;
- módulos;
- serviços;
- filas;
- banco;
- storage;
- integrações.

Utilize Mermaid.

## 5. Fluxos

Crie diagramas Mermaid para:

```text
Importação de NF-e
Criação do lote
Cálculo do frete
Emissão de CT-e
Reprocessamento
Faturamento
```

## 6. Tecnologias

Apresente uma tabela com tecnologia, finalidade, justificativa e alternativa.

## 7. Modelo de dados

Apresente:

- entidades;
- relacionamentos;
- índices;
- restrições;
- campos relevantes.

Inclua um diagrama ER em Mermaid.

## 8. Estados

Apresente as máquinas de estado para:

```text
Importação
Item da importação
Lote
CT-e
Fatura
Processamento
```

## 9. APIs

Defina:

- rotas;
- payloads;
- respostas;
- validações;
- erros;
- permissões.

## 10. Filas

Defina:

- nome;
- responsabilidade;
- payload;
- retry;
- backoff;
- idempotência;
- falhas.

## 11. Integração com `adatechnology-packages`

Explique:

- como analisar a biblioteca;
- quais adaptadores criar;
- como evitar acoplamento;
- como testar;
- como lidar com erros;
- como lidar com versões.

Não invente funções que não tenham sido verificadas.

## 12. Estrutura de pastas

Apresente a estrutura completa recomendada.

## 13. Plano de implementação

Divida em fases pequenas e executáveis.

Para cada fase, apresente:

```text
Objetivo
Tarefas
Dependências
Entregáveis
Critérios de aceite
Testes
```

## 14. Backlog

Crie épicos, histórias e tarefas técnicas.

## 15. Estratégia de testes

Detalhe testes unitários, integração, contrato e end-to-end.

## 16. Segurança

Detalhe autenticação, autorização, certificados, storage e isolamento multiempresa.

## 17. Observabilidade

Detalhe logs, métricas, traces e alertas.

## 18. Docker e execução local

Forneça uma estratégia para executar:

```text
API
Frontend
Worker
Banco
RabbitMQ
Storage local
Mail local
Mocks fiscais
```

## 19. Variáveis de ambiente

Crie um `.env.example` sem dados sensíveis reais.

## 20. Roadmap futuro

Organize os módulos futuros sem implementá-los no MVP.

---

# 28. Resultado Esperado

O resultado deverá ser suficientemente detalhado para que uma equipe de desenvolvimento consiga iniciar o projeto sem precisar interpretar requisitos vagos.

Quando houver alguma decisão não definida:

1. apresente a decisão recomendada;
2. explique o motivo;
3. registre a premissa;
4. mantenha a solução configurável;
5. não invente regras fiscais ou legais.

Priorize inicialmente um MVP confiável para:

```text
Importar NF-e
→ Calcular frete
→ Emitir CT-e
→ Gerar fatura
```

Somente depois da estabilização desse fluxo deverão ser implementados os módulos logísticos, PWA, WhatsApp, MDF-e, ocorrências, rotas, motoristas, veículos, seguros e portal do cliente.
