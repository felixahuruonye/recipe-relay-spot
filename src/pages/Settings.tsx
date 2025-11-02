import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="gradient-text">App Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between glass-card p-4 rounded-lg">
            <div className="flex items-center space-x-3">
              {isDark ? (
                <Moon className="h-5 w-5 text-primary" />
              ) : (
                <Sun className="h-5 w-5 text-primary" />
              )}
              <div>
                <Label htmlFor="theme-toggle" className="text-base font-semibold">
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {isDark 
                    ? 'Experience beautiful 3D designs and figma styles' 
                    : 'Switch to dark mode for enhanced visuals'}
                </p>
              </div>
            </div>
            <Switch
              id="theme-toggle"
              checked={isDark}
              onCheckedChange={toggleTheme}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Additional Settings */}
          <div className="glass-card p-4 rounded-lg space-y-3">
            <h3 className="font-semibold">About Dark Mode</h3>
            <p className="text-sm text-muted-foreground">
              Dark mode provides a stunning visual experience with 3D effects, 
              glass morphism, and figma-inspired designs. Perfect for extended 
              browsing sessions and content creation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;