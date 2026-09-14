import React, { useEffect, useRef, useState } from 'react';
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
  const [imgReady, setImgReady] = useState(false);

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

  const ActionButton = ({ icon: Icon, count, label, active, activeColor, onClick }: any) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/60 hover:bg-muted transition-colors"
    >
      <Icon className={`w-5 h-5 ${active ? `${activeColor} fill-current` : 'text-muted-foreground'}`} />
      <span className="text-sm font-semibold">{count}</span>
      <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
    </button>
  );

  return (
    // Wrapper carries the glow + padding, Card sits inset from its edges.
    // (Putting the glow directly on the Card doesn't work - the Card's
    // own overflow-hidden, needed to round off the product image corners,
    // clips the glow ring away completely.)
    <div className="product-card-glow rounded-2xl p-[3px]">
      <Card className="overflow-hidden hover:shadow-lg transition-shadow rounded-2xl">
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
            <>
              {!imgReady && (
                <div className="w-full h-48 bg-muted flex items-center justify-center absolute inset-0 z-0">
                  <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground animate-spin" />
                </div>
              )}
              <img
                src={product.images[0]}
                alt={product.title}
                onLoad={() => setImgReady(true)}
                onError={() => setImgReady(true)}
                className={`w-full h-48 object-cover relative z-10 transition-opacity ${imgReady ? 'opacity-100' : 'opacity-0'}`}
              />
            </>
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

          {/* Like / Review / Bookmark - moved below the card content
              where there's real room, instead of cramped over the image. */}
          <div className="flex items-center justify-between pt-2 border-t">
            <ActionButton icon={Heart} count={likeCount} label="Likes" active={isLiked} activeColor="text-red-500" onClick={onToggleLike} />
            <ActionButton icon={MessageCircle} count={reviewCount} label="Reviews" onClick={handleOpenReviews} />
            <ActionButton icon={Bookmark} count={bookmarkCount} label="Saved" active={isBookmarked} activeColor="text-primary" onClick={onToggleBookmark} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
