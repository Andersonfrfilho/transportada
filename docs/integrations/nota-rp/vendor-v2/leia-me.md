# INSTRUÇÕES INICIAIS PARA INTEGRAÇÃO NOTA RP

1. Crie sua conta e se associe as empresas que desejar emitir, consultar e cancelar NFS-e na Nota RP.
2. O token para integração pode ser gerado ou revogado no próprio site, através do link: [https://www.notarp.com.br/painel/integracao].
3. Importe o arquivo "API Nota RP (v2).postman_collection.json" para dentro do software Postman (v10.10.0 ou maior) para consultar a documentação.
4. Clique para editar a Coleção importada e vá até a aba de Variáveis
    - 4.1. Substitua o token recebido no passo 2 na variável "token" (na coluna de Valor Atual)
    - 4.2.  Substitua a Inscrição Municipal da empresa que for integrar na variável "inscricao_municipal" (na coluna de Valor Atual)
    - 4.3. (Opcional) Preencha uma URL de callback na variável "CallbackUrl" (para testes, aconselhamos o uso do site https://webhook.site/)
    * Tais variáveis serão usadas para preencher os cabeçalhos "X-AUTH-USER-TOKEN" e "X-AUTH-IM", assim como o campo "CallbackUrl" no serviço de emissão.
5. Realize os testes para conhecer a API e opcionalmente use a opção do Postman para gerar um código de exemplo na linguagem de seu interesse.

# AUTENTICAÇÃO NAS REQUISIÇÕES

Serão usados os campos X-AUTH-USER-TOKEN e o X-AUTH-IM no cabeçalho das requisições para que seja identificado qual é a conta (token) e qual é a empresa (inscrição municipal). Caso você informe qualquer um destes campos incorretamente, você não conseguirá realizar com sucesso as requisições. Basta ler a mensagem de erro para entender o que está informado incorretamente.

# RESPOSTAS GERAIS DA API

1. Respostas de sucesso: terão o campo "success" = true e o status code 200.
2. Respostas de erro: terão o campo "success" = false, um campo "message" com a descrição do erro e o status code 200.
3. Qualquer requisição que não retornar o status code 200 deverá ser tratada como uma falha de pedido / requisição na comunicação entre os servidores.

# INSTRUÇÕES REFERENTES AO PEDIDO DE EMISSÃO DE NOTA

Emitir notas fiscais é uma atividade assíncrona. Ou seja, é obrigatório informar uma URL de Retorno (campo CallbackUrl) que utilize um protocolo seguro (https).
Nesta URL de retorno você receberá no máximo duas mensagens que conterão informações a respeito do andamento da emissão da nota solicitada.

Ao fazer o pedido de emissão (/emitir), você receberá na resposta um campo chamado "id_nota", o qual você deverá armazenar no banco de dados de seu sistema para fazer a vinculação/associação quando receber mensagens na sua URL de Retorno.

Caso a nota não seja emitida por qualquer motivo que seja, ela será alterada para o Status "Falha" e você então poderá corrigir as informações da nota utilizando o mesmo endpoint (/emitir), porém, informando junto o campo "id_nota" na requisição. Ao corrigir, automaticamente será feito novamente um novo pedido de emissão da NFS-e e você receberá novamente a resposta em sua URL de retorno.

# INSTRUÇÕES REFERENTES AO PEDIDO DE SUBSTITUIÇÃO DE NOTA

Substituir notas fiscais é uma atividade síncrona. Ou seja, você saberá o resultado do seu pedido no mesmo momento. No retorno, você receberá os campos id_nota e id_nota_substituida. Opcionalmente, você poderá checar os dados das notas usando o endpoint "/notas?id_nota=xxx".

# URL DE RETORNO - POLÍTICA DE USO

Caso sua URL de Retorno esteja indisponível (status code diferente de 200), nosso sistema fará o reenvio da mensagem de retorno até que seu servidor retorne o status code 200, sendo limitada as tentativas dentro dos limites definidos abaixo.

## Retornos

- 1 tentativa a cada 30 segundos (repete 20 vezes)
- 1 tentativa a cada 5 minutos (repete 22 vezes)
- 1 tentativa a cada hora (repete 10 vezes)

Caso você não receba um retorno dentro do limite definido, você pode usar o endpoint "/notas?id_nota=xxx" para consultar o Status da nota em questão.

Caso você utilize URLs de retorno inválidas, indisponíveis ou que não correspondam a um endereço de seu serviço, você estará sujeito a suspensão da sua integração por mau uso do recurso. Desta forma, é importante que você faça corretamente a utilização deste campo.
