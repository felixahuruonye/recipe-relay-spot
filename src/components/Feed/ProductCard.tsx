import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShoppingBag, Star, Crown, Package } from 'lucide-react';

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    description: string;
    price_ngn: number;
    images: string[];
    featured: boolean;
    seller_user_id: string;
    user_profiles?: {
      username: string;
      avatar_url: string;
      vip: boolean;
    };
  };
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const navigate = useNavigate();

  const handleBuyNow = () => {
    navigate(`/marketplace?product=${product.id}`);
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow border-2 border-primary/20">
      <div className="relative">
        <Badge className="absolute top-2 left-2 z-10 bg-primary">
          <ShoppingBag className="w-3 h-3 mr-1" />
          Marketplace
        </Badge>
        {product.featured && (
          <Badge className="absolute top-2 right-2 z-10 bg-yellow-500">
            <Star className="w-3 h-3 mr-1" />
            Featured
          </Badge>
        )}
        {product.images && product.images.length > 0 ? (
          <img 
            src={product.images[0]} 
            alt={product.title}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 bg-muted flex items-center justify-center">
            <Package className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Avatar className="w-6 h-6">
            <AvatarImage src={product.user_profiles?.avatar_url} />
            <AvatarFallback>{product.user_profiles?.username?.[0]}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground">{product.user_profiles?.username}</span>
          {product.user_profiles?.vip && <Crown className="w-3 h-3 text-yellow-500" />}
        </div>
        <h3 className="font-bold text-lg line-clamp-1">{product.title}</h3>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
        
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-primary">
            ₦{Number(product.price_ngn).toLocaleString()}
          </span>
          <Button onClick={handleBuyNow} className="neon-glow">
            <ShoppingBag className="w-4 h-4 mr-2" />
            Buy Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};