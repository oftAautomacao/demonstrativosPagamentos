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

- Navegação lateral com seleção de mês e ano;
- Lista automática dos planos disponíveis na competência escolhida;
- Nome do plano e relatório de demonstrativos de pagamento;
- Tela inicial simplificada com pagamentos agrupados por data e somatório total;
- Tabela de demonstrativos de conta médica como informação principal;
- Aba “Relatório completo” com análise automática local das seções e campos variáveis do TXT;
- Texto original do arquivo para conferência;
- Detecção de cópias idênticas do mesmo relatório.
- Aba “Ajuste TUSS” que compara `Ajuste Codigo TUSS.xlsx` com todas as colunas `TUSS` dos demonstrativos XLSX, XLSM ou PDF da competência;
- Prévia por arquivo, confirmação antes da correção e criação de cópias na pasta `TUSS Corrigidos`, sem alterar os originais;
- Registro JSON de auditoria com cada arquivo gerado e a quantidade de substituições.

## Testes

Execute `npm test` para validar a leitura dos relatórios e a preservação das seções variáveis.
