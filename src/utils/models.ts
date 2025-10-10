import supabase from '@/lib/supabase';
import type { GundamModel } from '@/types/gundam';

// Allow overriding the table name via env; default to 'models'
const MODELS_TABLE = (import.meta as unknown as { env?: { VITE_MODELS_TABLE?: string } }).env?.VITE_MODELS_TABLE || 'models';

type DbRow = {
  id: string;
  user_id: string;
  name: string;
  grade: string;
  series?: string | null;
  scale?: string | null;
  release_date?: string | null;
  price?: number | null;
  build_status: string;
  rating?: number | null;
  notes?: string | null;
  image_url?: string | null;
  purchase_date?: string | null;
  completion_date?: string | null;
  created_at: string;
  updated_at: string;
};

export function mapRowToModel(r: DbRow): GundamModel {
  return {
    id: r.id,
    name: r.name,
  grade: r.grade as GundamModel['grade'],
    series: r.series || '',
    scale: r.scale || undefined,
    releaseDate: r.release_date || undefined,
    price: r.price ?? undefined,
    buildStatus: (r.build_status as GundamModel['buildStatus']) || 'Unbuilt',
    rating: r.rating ?? undefined,
    notes: r.notes ?? undefined,
    imageUrl: r.image_url ?? undefined,
    purchaseDate: r.purchase_date ?? undefined,
    completionDate: r.completion_date ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapModelToRow(m: GundamModel, userId: string): DbRow {
  return {
    id: m.id,
    user_id: userId,
    name: m.name,
    grade: m.grade,
    series: m.series || null,
    scale: m.scale || null,
    release_date: m.releaseDate || null,
    price: m.price ?? null,
    build_status: m.buildStatus,
    rating: m.rating ?? null,
    notes: m.notes ?? null,
    image_url: m.imageUrl ?? null,
    purchase_date: m.purchaseDate ?? null,
    completion_date: m.completionDate ?? null,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  } as DbRow;
}

export async function loadModels(userId: string): Promise<GundamModel[]> {
  const { data, error } = await supabase
    .from(MODELS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRowToModel as (r: any) => GundamModel);
}

export async function insertModel(m: GundamModel, userId: string): Promise<GundamModel> {
  const { data, error } = await supabase
    .from(MODELS_TABLE)
    .insert([mapModelToRow(m, userId)])
    .select()
    .single();
  if (error) throw error;
  return mapRowToModel(data as any);
}

export async function updateModel(m: GundamModel, userId: string): Promise<GundamModel> {
  const { data, error } = await supabase
    .from(MODELS_TABLE)
    .update({
      name: m.name,
      grade: m.grade,
      series: m.series || null,
      scale: m.scale || null,
      release_date: m.releaseDate || null,
      price: m.price ?? null,
      build_status: m.buildStatus,
      rating: m.rating ?? null,
      notes: m.notes ?? null,
      image_url: m.imageUrl ?? null,
      purchase_date: m.purchaseDate ?? null,
      completion_date: m.completionDate ?? null,
      updated_at: m.updatedAt,
    })
    .eq('id', m.id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return mapRowToModel(data as any);
}

export async function deleteModel(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from(MODELS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export { MODELS_TABLE };
