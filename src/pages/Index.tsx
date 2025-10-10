import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GundamModel } from '@/types/gundam';
import { GundamCard } from '@/components/GundamCard';
import { GundamForm } from '@/components/GundamForm';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import OffersPanel from '@/components/OffersPanel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Grid, List, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import { useAuth } from '@/hooks/use-auth';
import supabase from '@/lib/supabase';
import { loadModels as dbLoadModels, insertModel as dbInsertModel, updateModel as dbUpdateModel, deleteModel as dbDeleteModel } from '@/utils/models';

const Index = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user, signedIn } = useAuth();
  const [models, setModels] = useState<GundamModel[]>([]);
  const [filteredModels, setFilteredModels] = useState<GundamModel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingModel, setEditingModel] = useState<GundamModel | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [offersModel, setOffersModel] = useState<GundamModel | null>(null);

  // Load models from DB (if signed in) on mount or auth change. Otherwise show nothing.
  useEffect(() => {
    (async () => {
      if (signedIn && user) {
        try {
          const mapped = await dbLoadModels(user.sub);
          setModels(mapped);
          setFilteredModels(mapped);
          return;
        } catch (e) {
          console.warn('Failed to load models from Supabase', e);
        }
      } else {
        // When not signed in, do not show any kits (privacy/require-login)
        setModels([]);
        setFilteredModels([]);
      }
    })();
  }, [signedIn, user]);

  // Save a local cache copy whenever models change (optional cache, not source of truth)
  useEffect(() => {
    (async () => {
      // always keep local copy for quick cache
      try { localStorage.setItem('gundam-models', JSON.stringify(models)); } catch (e) {}
    })();
  }, [models]);

  // Filter models based on search and filters
  useEffect(() => {
    let filtered = models;

    if (searchTerm) {
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.series.toLowerCase().includes(searchTerm.toLowerCase()) ||
        false
      );
    }

    if (filterGrade !== 'all') {
      filtered = filtered.filter(model => model.grade === filterGrade);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(model => model.buildStatus === filterStatus);
    }

    setFilteredModels(filtered);
  }, [models, searchTerm, filterGrade, filterStatus]);

  const handleAddModel = (modelData: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => {
    (async () => {
      const id = Date.now().toString();
      const now = new Date().toISOString();
      const newModel: GundamModel = { ...modelData, id, createdAt: now, updatedAt: now };

      // Update local state immediately for optimistic UI
      setModels(prev => [...prev, newModel]);
      setShowForm(false);

      if (signedIn && user) {
        try {
          const saved = await dbInsertModel(newModel, user.sub);
          setModels(prev => prev.map(m => m.id === id ? saved : m));
          toast({ title: 'Model Added', description: `${newModel.name} saved to your account.` });
        } catch (e) {
          console.warn('Failed to save model to Supabase', e);
          toast({ title: 'Saved locally', description: `${newModel.name} saved locally but failed to save to cloud.` });
        }
      } else {
        toast({ title: 'Model Added', description: `${newModel.name} has been added to your collection.` });
      }
    })();
  };

  const handleEditModel = (modelData: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingModel) return;
    (async () => {
      const updatedModel: GundamModel = { ...modelData, id: editingModel.id, createdAt: editingModel.createdAt, updatedAt: new Date().toISOString() };

      // Optimistic update
      setModels(prev => prev.map(model => model.id === editingModel.id ? updatedModel : model));
      setShowForm(false);
      setEditingModel(undefined);

      if (signedIn && user) {
        try {
          const saved = await dbUpdateModel(updatedModel, user.sub);
          setModels(prev => prev.map(m => m.id === updatedModel.id ? saved : m));
          toast({ title: 'Model Updated', description: `${updatedModel.name} saved to your account.` });
        } catch (e) {
          console.warn('Failed to update model in Supabase', e);
          toast({ title: 'Update failed', description: `${updatedModel.name} updated locally but failed to save to cloud.` });
        }
      } else {
        toast({ title: 'Model Updated', description: `${updatedModel.name} has been updated.` });
      }
    })();
  };

  const handleDeleteModel = (id: string) => {
    (async () => {
      const model = models.find(m => m.id === id);
      // Optimistic remove
      setModels(prev => prev.filter(model => model.id !== id));
      setDeleteId(null);

      if (signedIn && user) {
        try {
          await dbDeleteModel(id, user.sub);
          toast({ title: 'Model Deleted', description: `${model?.name || 'Model'} removed from your account.` });
        } catch (e) {
          console.warn('Failed to delete model from Supabase', e);
          toast({ title: 'Delete failed', description: `${model?.name || 'Model'} removed locally but failed to delete from cloud.` });
        }
      } else {
        toast({ title: 'Model Deleted', description: `${model?.name || 'Model'} has been removed from your collection.` });
      }
    })();
  };

  const openEditForm = (model: GundamModel) => {
    setEditingModel(model);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingModel(undefined);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-gundam-red bg-clip-text text-transparent">
                {t('app.title')}
              </h1>
            </div>
            {/* header actions (sign in, etc.) — floating Add Model button moved to bottom-left */}
            <div className="ml-4">
              <GoogleLoginButton />
            </div>
          </div>
        </div>
      </header>

      {/* Filters and Search */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('app.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={filterGrade} onValueChange={setFilterGrade}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('app.filterByGrade')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('app.allGrades')}</SelectItem>
              <SelectItem value="High Grade (HG)">High Grade (HG)</SelectItem>
              <SelectItem value="Real Grade (RG)">Real Grade (RG)</SelectItem>
              <SelectItem value="Master Grade (MG)">Master Grade (MG)</SelectItem>
              <SelectItem value="Perfect Grade (PG)">Perfect Grade (PG)</SelectItem>
              <SelectItem value="Super Deformed (SD)">Super Deformed (SD)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Unbuilt">Unbuilt</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Built">Built</SelectItem>
              <SelectItem value="Painted">Painted</SelectItem>
              <SelectItem value="Customized">Customized</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Models Grid/List */}
        {filteredModels.length === 0 ? (
          <div className="text-center py-10 sm:py-12">
            <div className="text-5xl sm:text-6xl mb-3 sm:mb-4">🤖</div>
            <h3 className="text-lg sm:text-xl font-semibold mb-2">No Models Found</h3>
            <p className="text-muted-foreground mb-4">
              {models.length === 0 
                ? "Start building your collection by adding your first Gundam model!"
                : "Try adjusting your search or filters to find what you're looking for."
              }
            </p>
            {models.length === 0 && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Model
              </Button>
            )}
          </div>
        ) : (
          <div className={
            viewMode === 'grid' 
              ? "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
              : "space-y-4"
          }>
            {filteredModels.map((model) => (
              <GundamCard
                key={model.id}
                model={model}
                onEdit={openEditForm}
                onDelete={setDeleteId}
                onOffers={setOffersModel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Form Dialog */}
  {/* Floating Add Model button (bottom-right) */}
      <div className="fixed right-4 bottom-4 z-50">
        <div className="relative h-14 w-14">
          <div className="floating-add-pulse" />
          <Button
            onClick={() => setShowForm(true)}
            aria-label="Add model"
            title="Add model"
            className="floating-add-btn absolute inset-0 h-14 w-14 rounded-full p-0 bg-gradient-to-r from-primary to-gundam-red hover:from-primary/90 hover:to-gundam-red/90 shadow-lg flex items-center justify-center"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModel ? 'Edit Model' : 'Add New Model'}
            </DialogTitle>
          </DialogHeader>
          <ErrorBoundary onRecover={closeForm}>
            <GundamForm
              model={editingModel}
              onSubmit={editingModel ? handleEditModel : handleAddModel}
              onCancel={closeForm}
            />
          </ErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* Offers Dialog */}
      <Dialog open={!!offersModel} onOpenChange={() => setOffersModel(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Store prices</DialogTitle>
          </DialogHeader>
          {offersModel && (
            <OffersPanel name={offersModel.name} grade={offersModel.grade as any} imageUrl={offersModel.imageUrl} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the model from your collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDeleteModel(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;