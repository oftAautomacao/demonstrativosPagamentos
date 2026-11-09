# Painel de Demonstrativos de Pagamento

Aplicação local que percorre automaticamente a pasta configurada, localiza arquivos `relatorio_*.txt`, elimina duplicidades e apresenta as informações financeiras em tela.

## Como iniciar

1. Tenha o Node.js 18 ou superior instalado.
2. Dê dois cliques em `Iniciar Painel.bat`.

Como alternativa, abra o PowerShell nesta pasta e execute `npm run dev`. O navegador será aberto automaticamente em `http://127.0.0.1:4173`.

Para visualizar os relatórios, não é necessário instalar pacotes do Node.js. Crie um arquivo local chamado `.reports-root` na raiz do projeto e informe nele o caminho completo da pasta de relatórios. Esse arquivo é ignorado pelo Git. Como alternativa, defina a variável `REPORTS_ROOT` antes de iniciar a aplicação.

Para usar a aba **Ajuste TUSS**, instale também Python 3.11 ou superior e execute uma vez:

```powershell
python -m pip install -r requirements.txt
```

## O que o painel exibe

- Aba **Tesouraria** com **Informações importadas** como página principal e **Importar extrato** como página secundária, acessadas pelas abas compactas do cabeçalho à direita;
- A página **Importar extrato** aceita selecionar ou arrastar vários arquivos de uma só vez, processando-os sequencialmente e atualizando a tabela ao final;
- Coluna **Creditado** com identificação visual do Bradesco ou Banco do Brasil usando as imagens locais do projeto;
- Extração de cada crédito `PGTO.SINISTRO AP/CERTIF.` como pagamento Bradesco, inclusive quando há vários créditos no mesmo dia;
- Reconhecimento das variações e nomes truncados dos convênios, mantendo `CX Assistência` sem tentar atribuí-la a um plano desconhecido;
- Consolidação por plano e data apenas quando o banco apresenta um mesmo pagamento fragmentado (Sulamerica e Intermédica/Notre Dame);
- Evidências encontradas no extrato para conferência de cada convênio identificado, sem armazenar o arquivo enviado;
- Salvamento automático dos pagamentos no Firebase Realtime Database em `/OFT/Faturamento/Tesouraria/{plano}/{aaaa-mm-dd}/{banco}/valorExtrato`; Bradesco e Banco do Brasil ficam como fontes complementares, enquanto o reenvio limpa e substitui somente os registros do mesmo banco e mês; quando há mais de um pagamento do mesmo plano, banco e data, são usados `valorExtrato2`, `valorExtrato3` e assim por diante;
- Carregamento automático, ao abrir a Tesouraria, de todos os pagamentos já armazenados no Firebase de teste;
- Na Tesouraria, todos os pagamentos exibem uma caneta para editar o nome do plano; o nome editado fica associado somente àquele pagamento no Firebase, sem alterar data, banco ou valor;
- Navegação de competência no cabeçalho, com mês e ano juntos e setas que percorrem somente os períodos encontrados nos relatórios;
- Os relatórios são carregados automaticamente na abertura da página, sem contador, caminho da pasta ou botão de atualização no menu lateral;
- Lista automática dos planos disponíveis na competência escolhida;
- Caberj e Caberj Integral são reconhecidos como convênios distintos, inclusive quando a pasta utiliza o nome `CaberjIntegral`;
- Fio Saúde é exibido de forma padronizada nas telas mesmo quando a pasta ou os controles utilizam `FioSaude` ou `Fio Saude`;
- Na aba **Demonstrativo**, a tabela **Descrição do Pagamento** aceita largura fixa, barras, caixas Unicode, ponto e vírgula e tabulação; se o alinhamento visual falhar, as colunas financeiras são corrigidas pelos valores monetários completos sem remover o parser original;
- Na aba **Configuração**, a coluna **Data Download Demonstrativo** é bloqueada e acompanha a `Data Desejada` sem permitir edição manual: Sulamerica no dia 18, Intermédica no dia 20, Fio Saúde/Itaú/Porto Seguro no dia 25 e Caberj/Caberj Integral no dia 1º do mês seguinte; os valores são salvos por convênio no Firebase de teste em `/faturamento/demonstrativos/painelControl/AbaConfiguracao/informacao1`;
- Lista suspensa de planos e configuração lateral da `Data Desejada`, organizadas em um único painel, com leitura e salvamento automático do mês/ano diretamente no campo `DATA DESEJADA:` do `Relatorio Controle.txt`, sem alterar o restante do arquivo;
- Nome do plano e relatório de demonstrativos de pagamento;
- Tela inicial simplificada com pagamentos agrupados por data e somatório total;
- Tabela de demonstrativos de conta médica como informação principal;
- Aba “Relatório completo” com análise automática local das seções e campos variáveis do TXT;
- Texto original do arquivo para conferência;
- Detecção de cópias idênticas do mesmo relatório.
- Aba “Ajuste TUSS” que compara `Ajuste Codigo Tuss.xslx` com todas as colunas `TUSS` dos demonstrativos XLSX, XLSM ou PDF da competência (a extensão convencional `.xlsx` também é aceita);
- Quando a tabela de ajuste possui a coluna `Valor`, a troca também exige coincidência com `Valor`, `Valor Informado` ou `Valor Liberado` na mesma linha do demonstrativo;
- Se `Valor` estiver vazio ou a coluna não existir na tabela de ajuste, a troca considera somente `Valor Atual` e `Novo Código`;
- Também são reconhecidos demonstrativos cuja pasta se chama `Demonstrativo XSLX`; nesses arquivos, a coluna `Valor` pode ser usada na comparação;
- Situação de cada arquivo na aba de ajuste: corrigido, pendente ou sem ajuste necessário;
- Criação de cópias com os nomes originais na pasta `TUSS Corrigidos`, sem alterar os demonstrativos de origem.

## Executável externo do Ajuste TUSS

O arquivo `Ajustar TUSS.exe` deve ficar na pasta raiz que contém todos os planos. Ao executá-lo, o programa:

1. Percorre automaticamente todos os planos e competências;
2. Processa somente os planos que possuem `Ajuste Codigo Tuss.xslx` (ou a variante `.xlsx`);
3. Ignora planos sem tabela de ajuste, sem criar arquivos ou apresentar erro;
4. Corrige os demonstrativos pendentes e preserva os originais;
5. Exibe uma mensagem com o resumo geral da operação.

O executável é autônomo: o Python e as dependências necessárias estão incluídos no próprio arquivo.

## Testes

Execute `npm test` para validar a leitura dos relatórios e a preservação das seções variáveis.
