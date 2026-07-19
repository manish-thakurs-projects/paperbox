import { useMemo } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';

export type PaperColors = {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  secondary: string;
  border: string;
  muted: string;
  inverse: string;
  accent: string;
  destructive: string;
};

const light: PaperColors = { background:'#FFFFFF', surface:'#F5F5F5', elevated:'#FFFFFF', text:'#000000', secondary:'#666666', border:'#E5E5E5', muted:'#CCCCCC', inverse:'#000000', accent:'#2563EB', destructive:'#D14343' };
const dark: PaperColors = { background:'#000000', surface:'#171717', elevated:'#111111', text:'#FFFFFF', secondary:'#CCCCCC', border:'#3A3A3A', muted:'#666666', inverse:'#FFFFFF', accent:'#7BB4FF', destructive:'#FF7B7B' };

export function getPaperColors(theme: 'light'|'dark') { return theme === 'dark' ? dark : light; }
export function usePaperTheme() {
  const selectedTheme = useSettingsStore((s) => s.theme);
  const mode = selectedTheme;
  return useMemo(() => ({ mode, colors: getPaperColors(mode) }), [mode]);
}
