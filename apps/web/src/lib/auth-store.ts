import { create } from 'zustand';

export type Membership = {
  status: string;
  tenant: { id: string; name: string; slug: string; status: string; currency: string; timezone: string; locale: string };
  roles: { code: string; name: string }[];
};

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  tenantId: string | null;
  currentTenant: Membership['tenant'] | null;
  roles: { code: string; name: string }[];
  memberships: Membership[];
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  profile: Profile | null;
  setSession: (accessToken: string, refreshToken: string, profile: Profile) => void;
  clear: () => void;
};

const stored = localStorage.getItem('refurbicon.auth');
const initial = stored ? (JSON.parse(stored) as Pick<AuthState, 'accessToken' | 'refreshToken' | 'profile'>) : null;

export function useApiReady() {
  const token = useAuth((s) => s.accessToken);
  const tenantId = useAuth((s) => s.profile?.tenantId);
  return { token, tenantId, enabled: Boolean(token && tenantId) };
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: initial?.accessToken ?? null,
  refreshToken: initial?.refreshToken ?? null,
  profile: initial?.profile ?? null,
  setSession: (accessToken, refreshToken, profile) => {
    const next = { accessToken, refreshToken, profile };
    localStorage.setItem('refurbicon.auth', JSON.stringify(next));
    set(next);
  },
  clear: () => {
    localStorage.removeItem('refurbicon.auth');
    set({ accessToken: null, refreshToken: null, profile: null });
  },
}));
