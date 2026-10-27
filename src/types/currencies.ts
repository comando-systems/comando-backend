import type { CurrencyMap, Money } from "./money";

const format = (money: Money) => (money.cents / 100).toFixed(2)
const formatInverseDot = (money: Money) => format(money).replace(".", ",");

const unformat = (text: string) => ({ cents: Math.round(Number(text.trim()) * 100), })
const unformatInverseDot = (text:string) => unformat(text.replace(".", ","))

export const currencies = {
  "pt-BR": {
    currency: "BRL",
    symbol: "R$",
    format: formatInverseDot,
    unformat: unformatInverseDot
  },
  "en-US": {
    currency: "USD",
    symbol: "$",
    format,
    unformat,
  },
  "de-DE": {
    currency: "EUR",
    symbol: "€",
    format: formatInverseDot,
    unformat: unformatInverseDot,
  },
} satisfies CurrencyMap;


