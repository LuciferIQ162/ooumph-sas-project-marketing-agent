import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'tenant_admin' | 'marketing_manager' | 'content_creator' | 'affiliate_partner' | 'influencer' | 'viewer';
  tenant_id: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export const authService = {
  async login(email: string, password: string): Promise<{ user: User; tenant: Tenant; token: string }> {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    
    // Store token in localStorage
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('tenant', JSON.stringify(data.tenant));
    
    return data;
  },

  async register(email: string, password: string, name: string, tenant_name: string): Promise<{ user: User; tenant: Tenant; token: string }> {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name, tenant_name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    
    // Store token in localStorage
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('tenant', JSON.stringify(data.tenant));
    
    return data;
  },

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },

  getUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getTenant(): Tenant | null {
    const tenantStr = localStorage.getItem('tenant');
    return tenantStr ? JSON.parse(tenantStr) : null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    return fetch(url, {
      ...options,
      headers,
    });
  },
};

// Role-based access control
export const hasRole = (user: User | null, roles: string[]): boolean => {
  if (!user) return false;
  return roles.includes(user.role);
};

export const hasPermission = (user: User | null, permission: string): boolean => {
  if (!user) return false;
  
  const rolePermissions: Record<string, string[]> = {
    tenant_admin: ['*'], // All permissions
    marketing_manager: [
      'view_dashboard',
      'manage_campaigns',
      'view_analytics',
      'manage_content',
      'manage_audience',
      'manage_workflows'
    ],
    content_creator: [
      'view_dashboard',
      'manage_content',
      'view_analytics'
    ],
    affiliate_partner: [
      'view_affiliate_dashboard',
      'manage_affiliate_links',
      'view_commissions'
    ],
    influencer: [
      'view_influencer_dashboard',
      'manage_campaigns',
      'view_analytics'
    ],
    viewer: [
      'view_dashboard',
      'view_analytics'
    ]
  };

  const permissions = rolePermissions[user.role] || [];
  return permissions.includes('*') || permissions.includes(permission);
};