import type { GundamModel } from '@/types/gundam';
import { getHobbyGundamUSAPrice } from './hobbygundamusa';
import { getGeosanBattlePrice } from './geosanbattle';
import { getGunplaEsPrice } from './gunplaes';
import { getGundamPlaceStorePrice } from './gundamplacestore';
import { getMechaUniversePrice } from './mechauniverse';

export type StorePrice = { price: number; currency: 'USD' | 'EUR'; url?: string };
export type StoreFetcher = (model: GundamModel) => Promise<StorePrice | null>;

// Register real-store fetchers here. To add a new store, import and append.
export const STORE_FETCHERS: Array<{ id: string; name: string; fetcher: StoreFetcher }> = [
  { id: 'hgusa', name: 'Hobby Gundam USA', fetcher: getHobbyGundamUSAPrice },
  { id: 'geosan', name: 'Geosan Battle', fetcher: getGeosanBattlePrice },
  { id: 'gunplaes', name: 'Gunpla.es', fetcher: getGunplaEsPrice },
  { id: 'gplacestore', name: 'Gundam Place Store', fetcher: getGundamPlaceStorePrice },
  { id: 'mechauniverse', name: 'MechaUniverse', fetcher: getMechaUniversePrice },
];
