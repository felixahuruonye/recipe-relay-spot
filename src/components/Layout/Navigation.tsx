import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, MessageCircle, ShoppingBag, User, Users, Bell, Settings, TrendingUp } from 'lucide-react';

const Navigation = () => {
  const location = useLocation();
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: Users, label: 'Groups', path: '/groups' },
    { icon: TrendingUp, label: 'Explore', path: '/explore' },
    { icon: MessageCircle, label: 'Chat', path: '/chat' },
    { icon: Bell, label: 'Notifications', path: '/notifications' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16 px-4">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs mt-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;
