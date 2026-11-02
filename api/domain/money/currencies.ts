// Locale-aware formatting helpers for the supported currencies.
import { centsToDecimal, decimalToCents } from "./money";
import type { CurrencyMap, Money } from ".";

// API money is always integer cents; only presentation is decimal/localized.
const format = (money: Money) => centsToDecimal(money.cents);
const formatInverseDot = (money: Money) => format(money).replace(".", ",");

// Parsing accepts the localized decimal separator and returns integer cents.
const unformat = (text: string) => ({
  cents: decimalToCents(text.replace(",", ".")),
});

export const currencies = {
  "pt-BR": {
    currency: "BRL",
    symbol: "R$",
    format: formatInverseDot,
    unformat,
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
    unformat,
  },
} satisfies CurrencyMap;
