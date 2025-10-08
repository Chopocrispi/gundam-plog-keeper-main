import { useState, useEffect } from 'react';
import { GundamModel } from '@/types/gundam';
import { GundamCard } from '@/components/GundamCard';
import { GundamForm } from '@/components/GundamForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, Grid, List, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const { toast } = useToast();
  const [models, setModels] = useState<GundamModel[]>([]);
  const [filteredModels, setFilteredModels] = useState<GundamModel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingModel, setEditingModel] = useState<GundamModel | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Load models from localStorage on component mount
  useEffect(() => {
    const savedModels = localStorage.getItem('gundam-models');
    if (savedModels) {
      try {
        const parsedModels = JSON.parse(savedModels);
        setModels(parsedModels);
        setFilteredModels(parsedModels);
      } catch (error) {
        console.error('Error parsing saved models:', error);
      }
    }
  }, []);

  // Save models to localStorage whenever models change
  useEffect(() => {
    localStorage.setItem('gundam-models', JSON.stringify(models));
  }, [models]);

  // Filter models based on search and filters
  useEffect(() => {
    let filtered = models;

    if (searchTerm) {
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.series.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())
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
    const newModel: GundamModel = {
      ...modelData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setModels(prev => [...prev, newModel]);
    setShowForm(false);
    toast({
      title: "Model Added",
      description: `${newModel.name} has been added to your collection.`,
    });
  };

  const handleEditModel = (modelData: Omit<GundamModel, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingModel) return;

    const updatedModel: GundamModel = {
      ...modelData,
      id: editingModel.id,
      createdAt: editingModel.createdAt,
      updatedAt: new Date().toISOString(),
    };

    setModels(prev => prev.map(model => 
      model.id === editingModel.id ? updatedModel : model
    ));
    setShowForm(false);
    setEditingModel(undefined);
    toast({
      title: "Model Updated",
      description: `${updatedModel.name} has been updated.`,
    });
  };

  const handleDeleteModel = (id: string) => {
    const model = models.find(m => m.id === id);
    setModels(prev => prev.filter(model => model.id !== id));
    setDeleteId(null);
    toast({
      title: "Model Deleted",
      description: `${model?.name || 'Model'} has been removed from your collection.`,
    });
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
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-gundam-red bg-clip-text text-transparent">
                Gundam Collection
              </h1>
              <p className="text-muted-foreground mt-1">
                Track and manage your Gunpla model kits
              </p>
            </div>
            <Button 
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-primary to-gundam-red hover:from-primary/90 hover:to-gundam-red/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Model
            </Button>
          </div>
        </div>
      </header>

      {/* Filters and Search */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={filterGrade} onValueChange={setFilterGrade}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
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
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">No Models Found</h3>
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
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "space-y-4"
          }>
            {filteredModels.map((model) => (
              <GundamCard
                key={model.id}
                model={model}
                onEdit={openEditForm}
                onDelete={setDeleteId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModel ? 'Edit Model' : 'Add New Model'}
            </DialogTitle>
          </DialogHeader>
          <GundamForm
            model={editingModel}
            onSubmit={editingModel ? handleEditModel : handleAddModel}
            onCancel={closeForm}
          />
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