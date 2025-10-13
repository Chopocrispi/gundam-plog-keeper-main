export interface GundamModel {
  id: string;
  name: string;
  grade: GundamGrade;
  series: string;
  scale?: string;
  releaseDate?: string;
  price?: number;
  buildStatus: BuildStatus;
  rating?: number;
  notes?: string;
  imageUrl?: string;
  purchaseDate?: string;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type GundamGrade = 
  | 'High Grade (HG)'
  | 'Real Grade (RG)'
  | 'Master Grade (MG)'
  | 'Perfect Grade (PG)'
  | 'Full Mechanics (FM)'
  | 'Entry Grade (EG)'
  | 'First Grade (FG)'
  | 'High Resolution Model (HiRM)'
  | 'MGSD (MGSD)'
  | 'Limited Model (LM)'
  | 'HY2M (HY2M)'
  | 'Mega Size (MS)'
  | 'Super Deformed (SD)'
  | 'No Grade'
  | 'Other';

export type BuildStatus = 
  | 'Unbuilt'
  | 'In Progress'
  | 'Built'
  | 'Painted'
  | 'Customized'
  | 'toBuy';

export interface GunplaDBResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

// Store offer types (for showing prices inside a kit entry)
export interface Offer {
  store: string; // short store name, e.g., "HobbyGundamUSA"
  title: string; // product title at the store
  url: string; // product URL
  price: number; // numeric price
  currency: string; // e.g., "USD", "EUR"
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
}

export interface OffersIndex {
  // key is a normalized query like "hg gundam aerial"
  [normalizedQuery: string]: Offer[];
}