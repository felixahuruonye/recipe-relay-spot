import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SettingsRow: React.FC<{
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}> = ({ icon, label, hint, right, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-4 py-3.5 border-b border-border/60 text-left hover:bg-accent/50 transition',
      danger && 'text-destructive'
    )}
  >
    {icon ? <div className="w-6 h-6 flex items-center justify-center opacity-80">{icon}</div> : null}
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate">{label}</div>
      {hint ? <div className="text-xs text-muted-foreground truncate">{hint}</div> : null}
    </div>
    {right ?? (onClick ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : null)}
  </button>
);

export const SettingsHeader: React.FC<{ title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }> = ({ title, subtitle, onBack, right }) => (
  <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b flex items-center gap-3 px-2 py-3">
    <button onClick={onBack} aria-label="Back" className="p-2 rounded hover:bg-accent">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
    </button>
    <div className="flex-1 min-w-0">
      <div className="font-semibold truncate">{title}</div>
      {subtitle ? <div className="text-xs text-muted-foreground truncate">{subtitle}</div> : null}
    </div>
    {right}
  </header>
);
