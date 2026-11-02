// Public barrel for the money domain module; values are always integer cents.

/** Wire/API money representation. */
export interface Money {
  cents: number;
}

export type Currency = "BRL" | "USD" | "EUR";
export type SupportedLanguage = "pt-BR" | "en-US" | "de-DE";

export interface CurrencyOpts {
  format(money: Money): string;
  unformat(text: string): Money;
  currency: Currency;
  symbol: string;
}

export type CurrencyMap = Record<SupportedLanguage, CurrencyOpts>;

export * from "./money";
export * from "./currencies";
