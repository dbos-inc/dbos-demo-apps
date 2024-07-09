import { Transaction, TransactionContext} from '@dbos-inc/dbos-sdk';
import { Knex } from 'knex';

type KnexTransactionContext = TransactionContext<Knex>;

export enum OrderStatus {
  PENDING = 0,
  FULFILLED = 1,
  CANCELLED = -1,
}

export interface Packer {
  packer_name: string;
  order_id: number;
  expiration?: Date;
}

export interface OrderPacker {
  order_id: number;
  order_status: number;
  product_id: number;
  product: string;
  packer_name: string;
}

export interface OrderWithProduct {
  order_id: number;
  order_status: number;
  last_update_time: Date;
  product_id: number;
  product: string;
}

export const PRODUCT_ID = 1;

export class FulfillUtilities {
}
