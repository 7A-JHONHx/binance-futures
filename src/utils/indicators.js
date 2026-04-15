function createSeededArray(size) {
  return Array.from({ length: size }, () => null);
}

export function calculateSMA(values, period) {
  const result = createSeededArray(values.length);

  if (period <= 0 || values.length < period) {
    return result;
  }

  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];

    if (index >= period) {
      sum -= values[index - period];
    }

    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }

  return result;
}

export function calculateEMA(values, period) {
  const result = createSeededArray(values.length);

  if (period <= 0 || values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = seed;

  for (let index = period; index < values.length; index += 1) {
    result[index] = (values[index] - result[index - 1]) * multiplier + result[index - 1];
  }

  return result;
}

export function calculateRSI(values, period) {
  const result = createSeededArray(values.length);

  if (period <= 0 || values.length <= period) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;

    if (averageLoss === 0) {
      result[index] = 100;
      continue;
    }

    const relativeStrength = averageGain / averageLoss;
    result[index] = 100 - 100 / (1 + relativeStrength);
  }

  return result;
}

export function calculateMACD(values, fastPeriod, slowPeriod, signalPeriod) {
  const fast = calculateEMA(values, fastPeriod);
  const slow = calculateEMA(values, slowPeriod);
  const macdLine = createSeededArray(values.length);

  for (let index = 0; index < values.length; index += 1) {
    if (fast[index] === null || slow[index] === null) {
      continue;
    }

    macdLine[index] = fast[index] - slow[index];
  }

  const filteredMacd = macdLine.filter((value) => value !== null);
  const signalSlice = calculateEMA(filteredMacd, signalPeriod);
  const signalLine = createSeededArray(values.length);
  const histogram = createSeededArray(values.length);
  let signalIndex = 0;

  for (let index = 0; index < macdLine.length; index += 1) {
    if (macdLine[index] === null) {
      continue;
    }

    signalLine[index] = signalSlice[signalIndex];

    if (signalLine[index] !== null) {
      histogram[index] = macdLine[index] - signalLine[index];
    }

    signalIndex += 1;
  }

  return {
    macdLine,
    signalLine,
    histogram,
  };
}

export function calculateATR(candles, period) {
  const result = createSeededArray(candles.length);

  if (period <= 0 || candles.length <= period) {
    return result;
  }

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  let rollingAtr =
    trueRanges.slice(1, period + 1).reduce((sum, value) => sum + value, 0) / period;
  result[period] = rollingAtr;

  for (let index = period + 1; index < candles.length; index += 1) {
    rollingAtr = (rollingAtr * (period - 1) + trueRanges[index]) / period;
    result[index] = rollingAtr;
  }

  return result;
}
