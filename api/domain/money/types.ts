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
