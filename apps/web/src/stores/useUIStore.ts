import { create } from 'zustand';
import i18n from '@/i18n';
import type { UserRole } from '@/types/domain';

export type ThemeMode = 'light' | 'dark';
export type LangCode = 'vi' | 'en';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}

interface UIState {
  theme: ThemeMode;
  lang: LangCode;
  previewRole: UserRole;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toasts: ToastMessage[];
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setLang: (lang: LangCode) => void;
  toggleLang: () => void;
  setPreviewRole: (role: UserRole) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const getInitialTheme = (): ThemeMode => {
  try {
    return localStorage.getItem('we-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const getInitialLang = (): LangCode => {
  try {
    return localStorage.getItem('we-lang') === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
};

const applyThemeToDom = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem('we-theme', theme);
  } catch {
    // ignore storage errors
  }
};

export const useUIStore = create<UIState>((set, get) => ({
  theme: getInitialTheme(),
  lang: getInitialLang(),
  previewRole: 'student',
  sidebarCollapsed: false,
  mobileNavOpen: false,
  toasts: [],

  setTheme: (theme) => {
    applyThemeToDom(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
    applyThemeToDom(next);
    set({ theme: next });
  },

  setLang: (lang) => {
    void i18n.changeLanguage(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', lang);
    }
    try {
      localStorage.setItem('we-lang', lang);
    } catch {
      // ignore
    }
    set({ lang });
  },

  toggleLang: () => {
    const next: LangCode = get().lang === 'vi' ? 'en' : 'vi';
    get().setLang(next);
  },

  setPreviewRole: (previewRole) => set({ previewRole }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),

  pushToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4200);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((item) => item.id !== id) })),
}));
