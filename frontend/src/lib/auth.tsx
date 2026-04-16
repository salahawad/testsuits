import { create } from "zustand";
import { api } from "./api";

export type Company = { id: string; name: string; slug: string };
export type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "TESTER" | "VIEWER";
  hasAvatar?: boolean;
  company: Company;
};

type AuthState = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, companyName: string) => Promise<void>;
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
  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    set({ user: data.user, token: data.token });
  },
  signup: async (email, password, name, companyName) => {
    const { data } = await api.post("/auth/signup", { email, password, name, companyName });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    set({ user: data.user, token: data.token });
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
