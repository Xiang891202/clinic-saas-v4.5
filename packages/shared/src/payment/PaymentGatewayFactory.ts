// packages/shared/src/payment/PaymentGatewayFactory.ts
import { IPaymentGateway } from './IPaymentGateway.js';
import { StripeAdapter, StripeAdapterOptions } from './StripeAdapter.js';
import { ECPayAdapter, ECPayAdapterOptions } from './ECPayAdapter.js';
import { ManualBankTransferAdapter } from './ManualBankTransferAdapter.js';

export type GatewayType = 'stripe' | 'ecpay' | 'bank_transfer';

export interface PaymentGatewayFactoryOptions {
  stripe?: StripeAdapterOptions;
  ecpay?: ECPayAdapterOptions;
  defaultGateway?: GatewayType;
}

export class PaymentGatewayFactory {
  private options: PaymentGatewayFactoryOptions;

  constructor(options: PaymentGatewayFactoryOptions) {
    this.options = options;
  }

  create(gateway: GatewayType): IPaymentGateway {
    switch (gateway) {
      case 'stripe':
        if (!this.options.stripe) {
          throw new Error('Stripe 設定未提供');
        }
        return new StripeAdapter(this.options.stripe);
      case 'ecpay':
        if (!this.options.ecpay) {
          throw new Error('ECPay 設定未提供');
        }
        return new ECPayAdapter(this.options.ecpay);
      case 'bank_transfer':
        return new ManualBankTransferAdapter();
      default:
        throw new Error(`不支援的金流類型: ${gateway}`);
    }
  }

  createDefault(): IPaymentGateway {
    const defaultType = this.options.defaultGateway || 'stripe';
    return this.create(defaultType);
  }
}