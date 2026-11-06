import type { GetSalesSummaryUseCase } from '@/app/use-cases/reports/get-sales-summary';

export {
  type GetSalesSummaryInput,
  GetSalesSummaryUseCase,
  type SalesSummaryResult,
} from '@/app/use-cases/reports/get-sales-summary';

export interface ReportsUseCases {
  readonly salesSummary: GetSalesSummaryUseCase;
}
