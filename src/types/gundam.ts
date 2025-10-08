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
  | 'Mega Size (MS)'
  | 'Super Deformed (SD)'
  | 'No Grade'
  | 'Other';

export type BuildStatus = 
  | 'Unbuilt'
  | 'In Progress'
  | 'Built'
  | 'Painted'
  | 'Customized';

export interface GunplaDBResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}