export type ThemeMode = 'museum' | 'minimalist';

export interface ThemeConfig {
  name: ThemeMode;
  colors: {
    bg: string;
    text: string;
    textMuted: string;
    accent: string;
    accentBg: string; // for pill backgrounds vs underline borders
    border: string;
    borderHeavy: string;
    paperBg: string;
  };
  typography: {
    fontBody: string;
    fontHeading: string;
    fontMono: string;
    dropCap: string;
    watermark: string;
  };
  layout: {
    docContainer: string;
    sidebarActive: string;
    sidebarHover: string;
  };
  interactive: {
    linkBase: string;
    linkActive: string;
    linkHover: string;
  };
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  museum: {
    name: 'museum',
    colors: {
      bg: 'bg-[#F9F7F2]',
      text: 'text-[#000000]',
      textMuted: 'text-[#000000]/70',
      accent: 'text-[#A52A2A]',
      accentBg: 'bg-[#A52A2A]',
      border: 'border-[#000000]/30',
      borderHeavy: 'border-[#000000]',
      paperBg: 'bg-[#F9F7F2]',
    },
    typography: {
      fontBody: 'font-serif',
      fontHeading: 'font-serif font-black',
      fontMono: 'font-mono',
      dropCap: 'first-letter:text-5xl md:first-letter:text-7xl first-letter:font-black first-letter:text-[#A52A2A] first-letter:float-left first-letter:mr-3 first-letter:mt-1',
      watermark: 'font-serif font-black text-[#A52A2A]/10 italic',
    },
    layout: {
      docContainer: 'bg-[#F9F7F2] border-double border-[6px] border-[#000000]/40 relative',
      sidebarActive: 'bg-[#F9F7F2]',
      sidebarHover: 'hover:bg-[#F9F7F2]',
    },
    interactive: {
      linkBase: 'underline decoration-transparent underline-offset-4 transition-colors',
      linkActive: 'underline decoration-[#A52A2A] decoration-2 underline-offset-4 font-bold text-[#000000]',
      linkHover: 'hover:underline hover:decoration-[#A52A2A] hover:text-[#A52A2A]',
    }
  },
  minimalist: {
    name: 'minimalist',
    colors: {
      bg: 'bg-zinc-50',
      text: 'text-zinc-900',
      textMuted: 'text-zinc-500',
      accent: 'text-blue-600',
      accentBg: 'bg-blue-600',
      border: 'border-zinc-200',
      borderHeavy: 'border-zinc-800',
      paperBg: 'bg-white',
    },
    typography: {
      fontBody: 'font-sans',
      fontHeading: 'font-sans font-medium tracking-tight',
      fontMono: 'font-mono',
      dropCap: '', // No drop cap in minimalist
      watermark: 'hidden', // No watermark in minimalist
    },
    layout: {
      docContainer: 'bg-white border rounded-lg border-zinc-200 relative shadow-sm',
      sidebarActive: 'bg-zinc-100',
      sidebarHover: 'hover:bg-zinc-100/50',
    },
    interactive: {
      linkBase: 'transition-colors',
      linkActive: 'text-blue-600 font-medium',
      linkHover: 'hover:text-blue-600',
    }
  }
};
