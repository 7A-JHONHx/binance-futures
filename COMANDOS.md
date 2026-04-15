# Comandos do projeto

Este arquivo deixa os comandos principais documentados e prontos para uso.
Os exemplos abaixo assumem execucao no PowerShell, dentro da pasta do projeto.

## 1. Rodar o robo em modo real

Usa ordens reais na Binance Futures.
So rode quando suas chaves, ambiente e estrategia estiverem validados.

```powershell
npm start
```

## 2. Rodar em paper trading

Nao envia ordens reais.
Usa a mesma estrategia, mas simula entradas, saídas, saldo e taxas.

```powershell
npm run start:paper
```

## 3. Consultar snapshot atual para monitoramento

Mostra o JSON mais recente com estado, posicao, carteira paper e ultima analise.
Esse output ja pode servir de base para um painel web ou API futura.

```powershell
npm run status
```

## 4. Rodar backtest simples

Executa backtest usando candles historicos.
Por padrao usa as configuracoes do `.env` e os defaults do projeto.

```powershell
npm run backtest
```

## 5. Rodar backtest com parametros

Exemplo com simbolo, intervalo e quantidade de candles.

```powershell
node src/cli/backtest.js --symbol BTCUSDT --interval 5m --limit 1000
```

Exemplo com janela de datas:

```powershell
node src/cli/backtest.js --symbol BTCUSDT --interval 15m --start 2026-03-01 --end 2026-04-01
```

## 6. Artefatos gerados pelo robo

Historico de trades:

```text
data/history/trades.csv
```

Historico de analises:

```text
data/history/analyses.csv
```

Snapshot para monitoramento/painel:

```text
data/monitoring/bot-status.json
```

Metricas consolidadas:

```text
data/monitoring/metrics.json
```

Resultados de backtest:

```text
data/backtests/<run-id>/
```

## 7. Variaveis de ambiente uteis

Modo do robo:

```text
TRADING_MODE=live
TRADING_MODE=paper
```

Saldo inicial do paper trading:

```text
PAPER_START_BALANCE=1000
```

Taxa simulada no paper/backtest:

```text
PAPER_FEE_RATE=0.0004
```

Tempo entre snapshots para monitoramento:

```text
MONITORING_SNAPSHOT_INTERVAL_MS=5000
```

## 8. Observacao importante

O modo `paper` e o `backtest` existem para calibracao e validacao.
Antes de operar em modo real, vale comparar:

- win rate
- drawdown
- lucro liquido
- frequencia de trades
- comportamento em diferentes intervalos e ativos
