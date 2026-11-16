import type { BankTemplate } from '../../lib/templateBank/package';
import { SOCIAL } from './social';
import { OUTDOOR } from './outdoor';
import { EVENTS } from './events';

export const BANK_V1_NAME = 'NowOpen Creative Template Bank';
export const BANK_V1_VERSION = '1.0.0';

export const BANK_V1: BankTemplate[] = [...SOCIAL, ...OUTDOOR, ...EVENTS];
