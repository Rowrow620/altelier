import type { AtelierApi } from '../shared/contracts';

export type * from '../shared/contracts';

declare global {
  interface Window {
    atelierApi?: AtelierApi;
  }
}
