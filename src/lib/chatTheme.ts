export type ChatTheme = {
  key: string;
  /** background of the message scroll area */
  bg: string;
  /** my bubble background */
  mine: string;
  /** my bubble text colour */
  mineText: string;
  /** partner bubble background */
  theirs: string;
  theirsText: string;
};

const T = (
  key: string,
  bg: string,
  mine: string,
  theirs: string,
  mineText = '#ffffff',
  theirsText = 'inherit'
): ChatTheme => ({ key, bg, mine, theirs, mineText, theirsText });

export const CHAT_THEMES: ChatTheme[] = [
  T('Default', 'transparent', 'hsl(var(--primary))', 'hsl(var(--muted))', 'hsl(var(--primary-foreground))', 'inherit'),
  T('Supergirl', 'linear-gradient(180deg,#1b0b12,#2b0f1a)', 'linear-gradient(135deg,#e11d48,#7c3aed)', 'rgba(255,255,255,0.08)'),
  T('Avatar: The Last Airbender', 'linear-gradient(180deg,#07161c,#0b2530)', 'linear-gradient(135deg,#0ea5e9,#14b8a6)', 'rgba(255,255,255,0.08)'),
  T('Olivia Rodrigo', 'linear-gradient(180deg,#1d0f1a,#2a1030)', 'linear-gradient(135deg,#a855f7,#ec4899)', 'rgba(255,255,255,0.08)'),
  T('Backrooms', 'linear-gradient(180deg,#1a1a0d,#26260f)', 'linear-gradient(135deg,#ca8a04,#a16207)', 'rgba(255,255,255,0.08)'),
  T('Deli Boys', 'linear-gradient(180deg,#0d1a12,#0f2618)', 'linear-gradient(135deg,#16a34a,#065f46)', 'rgba(255,255,255,0.08)'),
  T('Maluma', 'linear-gradient(180deg,#1a0f07,#2a1509)', 'linear-gradient(135deg,#f97316,#dc2626)', 'rgba(255,255,255,0.08)'),
  T('The Mandalorian & Grogu', 'linear-gradient(180deg,#0f1114,#171a1f)', 'linear-gradient(135deg,#475569,#94a3b8)', 'rgba(255,255,255,0.08)'),
  T('The Devil Wears Prada 2', 'linear-gradient(180deg,#12100e,#1d1a16)', 'linear-gradient(135deg,#111827,#b45309)', 'rgba(255,255,255,0.08)'),
  T('Pixel Dreamscape', 'linear-gradient(180deg,#0b1020,#141c3a)', 'linear-gradient(135deg,#6366f1,#22d3ee)', 'rgba(255,255,255,0.08)'),
];

export const getChatTheme = (key?: string | null): ChatTheme =>
  CHAT_THEMES.find((t) => t.key === key) || CHAT_THEMES[0];

export const DISAPPEARING_OPTIONS = [
  { v: 'off', l: 'Off' },
  { v: '5m', l: '5 minutes' },
  { v: '1h', l: '1 hour' },
  { v: '6h', l: '6 hours' },
  { v: '24h', l: '24 hours' },
  { v: '7d', l: '7 days' },
];

export const disappearingLabel = (v?: string | null) =>
  DISAPPEARING_OPTIONS.find((o) => o.v === (v || 'off'))?.l || 'Off';
