import { GundamModel } from '@/types/gundam';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Edit, Trash2, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GundamCardProps {
  model: GundamModel;
  onEdit: (model: GundamModel) => void;
  onDelete: (id: string) => void;
}

const statusColors = {
  'Unbuilt': 'bg-muted text-muted-foreground',
  'In Progress': 'bg-warning text-warning-foreground',
  'Built': 'bg-success text-success-foreground',
  'Painted': 'bg-gundam-blue text-white',
  'Customized': 'bg-primary text-primary-foreground',
};

export function GundamCard({ model, onEdit, onDelete }: GundamCardProps) {
  const renderStars = () => {
    if (!model.rating) return null;
    
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= model.rating! ? "fill-gundam-yellow text-gundam-yellow" : "text-muted-foreground"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-gradient-to-br from-card to-card/80">
      <CardHeader className="p-0">
        <div className="aspect-square relative overflow-hidden bg-muted/20">
          {model.imageUrl ? (
            <img
              src={model.imageUrl}
              alt={model.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.svg';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gradient-to-br from-muted/20 to-muted/40">
              <div className="text-center">
                <div className="text-4xl mb-2">🤖</div>
                <div className="text-sm">No Image</div>
              </div>
            </div>
          )}
          <div className="absolute top-3 right-3">
            <Badge className={cn("text-xs font-medium", statusColors[model.buildStatus])}>
              {model.buildStatus}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-lg leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {model.name}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <Badge variant="outline" className="text-xs">
              {model.grade}
            </Badge>
            {renderStars()}
          </div>
        </div>
        
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>{model.series}</div>
          <div className="flex items-center justify-between">
            {model.price && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                <span>${model.price}</span>
              </div>
            )}
            {model.completionDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{new Date(model.completionDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
        
        {model.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {model.notes}
          </p>
        )}
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(model)}
          className="flex-1 hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          <Edit className="h-4 w-4 mr-1" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(model.id)}
          className="flex-1 hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}