import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthResponse } from '../types';
import { apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (roles: string[]) => boolean;
  updateUser: (updatedFields: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('lms_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('lms_access_token');
      if (token) {
        try {
          const res = await apiClient.get('/auth/me');
          if (res.data.success && res.data.data.user) {
            setUser((prev) => ({ ...prev, ...res.data.data.user }));
            localStorage.setItem('lms_user', JSON.stringify({ ...user, ...res.data.data.user }));
          }
        } catch (e) {
          console.error('Session expired or invalid:', e);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await apiClient.post<{ success: boolean; data: AuthResponse }>('/auth/login', {
      usernameOrEmail,
      password,
    });

    if (res.data.success) {
      const { accessToken, refreshToken, user: loggedInUser } = res.data.data;
      localStorage.setItem('lms_access_token', accessToken);
      localStorage.setItem('lms_refresh_token', refreshToken);
      localStorage.setItem('lms_user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
    }
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('lms_refresh_token');
      await apiClient.post('/auth/logout', { refreshToken });
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem('lms_access_token');
      localStorage.removeItem('lms_refresh_token');
      localStorage.removeItem('lms_user');
      setUser(null);
    }
  };

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.role === 'ROLE_SUPER_ADMIN') return true;
    return user.permissions?.includes(permission) || false;
  };

  const hasRole = (roles: string[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const updateUser = (updatedFields: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('lms_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasPermission, hasRole, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
