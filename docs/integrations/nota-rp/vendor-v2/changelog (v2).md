# CHANGELOG

- Mudança na URL base da api, de "/v1" para "/v2"
- Mudança no endpoint "/atualizar-dados-cadastrais" e "/dados-cadastrais"
  - O campo "dados_cadastrais" foi removido
  - O campo "cadastro" contém uma nova estrutura com os dados cadastrais da empresa
- Correção no endpoint "/tributacao-municipio"
  - Havíamos feito um update no passado que havia quebrado esta funcionalidade
- Mudanças no endpoint "/emitir"
  - Campos desativados:
    - NaturezaOperacao
  - Campos renomeados:
    - De MunicipioPrestacaoServico para CodigoMunicipio
  - Novos campos:
    - ExigibilidadeISS (consultar valores disponíveis através dos dados cadastrais -> campo operacoes_permitidas)
    - MunicipioIncidencia (preencher código IBGE da cidade em que incide o ISS)
    - NumeroProcesso (apenas se exigibilidade for 6 ou 7)
    - NIF (se exterior)
    - Pais (se exterior)
    - EnderecoCompletoExterior (se exterior)
    - SubstituirNfse (instruções à seguir)
- Nova opção para "Substituir NFS-e" através do serviço "/emitir"
  - Basta enviar o campo "SubstituirNfse" com o número da nota fiscal à ser substituída
  - Importante ressaltar que o serviço de SubstituirNfse é síncrono, diferentemente da emissão comum
  - Ao substituir com sucesso, você receberá os campos id_nota (nota emitida) e id_nota_substituida na resposta
- Novo serviço "/paises-ibge" para consultar o código do País (quando emissão para exterior)
- Mudança no endpoint "/cancelar-nota"
  - Novo campo obrigatório chamado "motivo" com os seguintes valores possíveis: 1, 2 e 4, sendo:
    * 1 - Erro na emissão (retornará pedindo para usar o serviço de substituir NFS-e)
    * 2 - Serviço não prestado
    * 4 - Nota duplicada
- Mudança no endpoint "/item-servico"
  - Agora o texto de descrição de cada serviço está formatando o código do "ItemListaServico" no formato "00.00"
    - Exemplo:
      * Antes: "108 - Planejamento, confecção, manutenção e atualização de páginas eletrônicas"
      * Depois: "01.08 - Planejamento, confecção, manutenção e atualização de páginas eletrônicas"
  - Os ids/códigos permanecem o mesmo, não sendo necessário mudar a formatação na hora de preencher o campo "ItemListaServico" no serviço "/emitir"
- Novo endpoint "/xml"
  - Para receber o XML da nota em base64
- Novo endpoint "/pdf"
  - Para receber o PDF da nota em base64 (layout da Nota RP)
- Mudanças no postback de tipo "protocolo-nota" (callback)
  - O campo "InscricaoMunicipal" foi adicionado
  - O campo "EnviarLoteRpsEnvio" foi removido
  - Quando erros acontecem, agora o ListagemMensagemRetorno->MensagemRetorno é uma array com um ou mais erros
- Mudanças no postback de tipo "situacao-lote" (callback)
  - O campo "Protocolo" foi adicionado
  - O campo "InscricaoMunicipal" foi adicionado
  - O campo "ConsultarSituacaoLoteRpsEnvio" foi removido
  - O campo "ConsultarSituacaoLoteRpsResposta" foi renomeado para "ConsultarLoteRpsResposta"
  - Quando erros acontecem, agora o ListagemMensagemRetorno->MensagemRetorno é uma array com um ou mais erros
  - Quando é recebido "Situação = 4", dados da nota fiscal emitida são enviados em ListaNfse->CompNfse[0] (não precisa mais consultar a nota em outro request)
- Adicionado campo "CodigoNbs" no endpoint "/emitir"