import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShoppingBag, Star, Crown, Package, Music2, Heart, MessageCircle, Bookmark } from 'lucide-react';

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
  // Background "sound" that plays while this specific card is the active
  // slide in the feed - same idea as a TikTok video having a sound
  // attached to it. Controlled entirely by the parent feed (isActive
  // tracks scroll position, isMuted mirrors the feed's global mute toggle).
  isActive?: boolean;
  isMuted?: boolean;
  soundUrl?: string;
  // Engagement - counts and this user's own like/bookmark state, all
  // fetched/stored in Supabase (product_likes, product_reviews as the
  // "comment" count, user_bookmarks). Cascade-deleted from the database
  // automatically if the product itself is deleted.
  likeCount?: number;
  reviewCount?: number;
  bookmarkCount?: number;
  isLiked?: boolean;
  isBookmarked?: boolean;
  onToggleLike?: () => void;
  onToggleBookmark?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product, isActive, isMuted, soundUrl,
  likeCount = 0, reviewCount = 0, bookmarkCount = 0,
  isLiked = false, isBookmarked = false,
  onToggleLike, onToggleBookmark,
}) => {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleBuyNow = () => {
    navigate(`/marketplace?product=${product.id}`);
  };

  // Comment icon opens the product's reviews on the Marketplace page -
  // there's no separate "comment" concept for products, reviews are it.
  const handleOpenReviews = () => {
    navigate(`/marketplace?product=${product.id}`);
  };

  // Play while this card is on screen, pause the moment it scrolls away -
  // the <audio loop> attribute already handles "start over automatically
  // if it ends", so a card that stays active for a while just keeps
  // looping its own track rather than falling silent.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isActive && !isMuted) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isActive, isMuted, soundUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !!isMuted;
  }, [isMuted]);

  const ActionButton = ({ icon: Icon, count, active, activeColor, onClick }: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="flex flex-col items-center gap-1"
    >
      <div className={`p-2.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 ${active ? activeColor : ''}`}>
        <Icon className={`w-5 h-5 text-white ${active ? 'fill-current' : ''}`} />
      </div>
      <span className="text-white text-xs font-semibold drop-shadow">{count}</span>
    </button>
  );

  return (
    <div className="relative">
      <Card className="product-card-glow overflow-hidden hover:shadow-lg transition-shadow border-2 border-primary/20">
        {soundUrl && <audio ref={audioRef} src={soundUrl} loop muted={isMuted} preload="auto" />}
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
          {soundUrl && (
            <Badge variant="outline" className="absolute bottom-2 left-2 z-10 bg-black/60 text-white border-none gap-1">
              <Music2 className="w-3 h-3" /> Sound on
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

          {/* Like / Review / Bookmark - left side, same style as the
              action buttons on a normal post, just mirrored to the left
              per request. */}
          <div className="absolute left-2 bottom-2 z-10 flex flex-col gap-3">
            <ActionButton icon={Heart} count={likeCount} active={isLiked} activeColor="!bg-red-500/70" onClick={onToggleLike} />
            <ActionButton icon={MessageCircle} count={reviewCount} onClick={handleOpenReviews} />
            <ActionButton icon={Bookmark} count={bookmarkCount} active={isBookmarked} activeColor="!bg-primary/70" onClick={onToggleBookmark} />
          </div>
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
    </div>
  );
};
