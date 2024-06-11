// eslint-disable-next-line @dbos-inc/detect-nondeterministic-calls
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getRandomInt(max: number, noMatch?: number): number {
  while (true) {
    // eslint-disable-next-line @dbos-inc/detect-nondeterministic-calls
    const value = Math.floor(Math.random() * max);
    if (value !== noMatch) {
      return value;
    }
  }
}

function getNameSyllable(value: number): string {
  switch (value) {
    case 0:
      return "BAR";
    case 1:
      return "OUGHT";
    case 2:
      return "ABLE";
    case 3:
      return "PRI";
    case 4:
      return "PRES";
    case 5:
      return "ESE";
    case 6:
      return "ANTI";
    case 7:
      return "CALLY";
    case 8:
      return "ATION";
    case 9:
      return "EING";
    default:
      throw new Error(`Invalid value ${value}`);
  }
}

export function getCustomerName(): string {
  const one = getNameSyllable(getRandomInt(10));
  const two = getNameSyllable(getRandomInt(10));
  const three = getNameSyllable(getRandomInt(10));
  return `${one}${two}${three}`;
}
