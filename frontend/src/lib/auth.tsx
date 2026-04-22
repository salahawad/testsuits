import { create } from "zustand";
import { api } from "./api";

export type Company = { id: string; name: string; slug: string };
export type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";
  hasAvatar?: boolean;
  jiraAccountId?: string | null;
  jiraDisplayName?: string | null;
  company: Company;
};

export type LoginResult =
  | { kind: "session"; token: string; user: User }
  | { kind: "2fa"; challengeToken: string; rememberMe?: boolean };

type AuthState = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  signup: (email: string, password: string, name: string, companyName: string) => Promise<{ devToken?: string }>;
  setSession: (token: string, user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
};

const storedUser = (() => {
  try {
    return JSON.parse(localStorage.getItem("user") ?? "null") as User | null;
  } catch {
    return null;
  }
})();

export const useAuth = create<AuthState>((set) => ({
  user: storedUser,
  token: localStorage.getItem("token"),
  login: async (email, password, rememberMe) => {
    const { data } = await api.post("/auth/login", { email, password, rememberMe: !!rememberMe }, { silent: true });
    if (data.requires2fa) {
      return { kind: "2fa", challengeToken: data.challengeToken, rememberMe: data.rememberMe };
    }
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    set({ user: data.user, token: data.token });
    return { kind: "session", token: data.token, user: data.user };
  },
  signup: async (email, password, name, companyName) => {
    const { data } = await api.post("/auth/signup", { email, password, name, companyName }, { silent: true });
    return { devToken: data.devToken };
  },
  setSession: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, token });
  },
  updateUser: (patch) => {
    set((s) => {
      const user = s.user ? { ...s.user, ...patch } : null;
      if (user) localStorage.setItem("user", JSON.stringify(user));
      return { user };
    });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ user: null, token: null });
  },
}));
