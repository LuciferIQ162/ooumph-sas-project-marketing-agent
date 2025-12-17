import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Tenant } from './auth';

export interface AgentStatus {
  id: string;
  type: 'branding' | 'content' | 'campaign' | 'email' | 'ad' | 'influencer' | 'affiliate' | 'seo' | 'analytics';
  status: 'idle' | 'running' | 'completed' | 'failed' | 'pending_approval';
  current_task?: string;
  progress?: number;
  last_activity: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
  budget: number;
  spent: number;
  leads: number;
  conversions: number;
  roi: number;
  created_at: string;
}

export interface ContentAsset {
  id: string;
  title: string;
  type: 'blog_post' | 'social_media' | 'video' | 'ad_copy' | 'email' | 'landing_page';
  status: 'draft' | 'approved' | 'published' | 'archived';
  created_at: string;
  performance_score?: number;
}

export interface Lead {
  id: string;
  email: string;
  name?: string;
  company?: string;
  score: number;
  status: 'new' | 'qualified' | 'nurturing' | 'converted' | 'lost';
  source: string;
  created_at: string;
}

export interface KPI {
  name: string;
  value: number | string;
  change: number;
  trend: 'up' | 'down' | 'neutral';
  target?: number;
}

interface AppState {
  // Auth
  user: User | null;
  tenant: Tenant | null;
  
  // Dashboard
  kpis: KPI[];
  agentStatuses: AgentStatus[];
  recentCampaigns: Campaign[];
  recentContent: ContentAsset[];
  recentLeads: Lead[];
  
  // UI State
  sidebarCollapsed: boolean;
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
  }>;
  
  // Actions
  setUser: (user: User | null) => void;
  setTenant: (tenant: Tenant | null) => void;
  setKPIs: (kpis: KPI[]) => void;
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setRecentCampaigns: (campaigns: Campaign[]) => void;
  setRecentContent: (content: ContentAsset[]) => void;
  setRecentLeads: (leads: Lead[]) => void;
  toggleSidebar: () => void;
  addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      tenant: null,
      kpis: [],
      agentStatuses: [],
      recentCampaigns: [],
      recentContent: [],
      recentLeads: [],
      sidebarCollapsed: false,
      notifications: [],
      
      // Actions
      setUser: (user) => set({ user }),
      setTenant: (tenant) => set({ tenant }),
      setKPIs: (kpis) => set({ kpis }),
      setAgentStatuses: (agentStatuses) => set({ agentStatuses }),
      setRecentCampaigns: (recentCampaigns) => set({ recentCampaigns }),
      setRecentContent: (recentContent) => set({ recentContent }),
      setRecentLeads: (recentLeads) => set({ recentLeads }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              read: false,
            },
            ...state.notifications,
          ],
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((notif) =>
            notif.id === id ? { ...notif, read: true } : notif
          ),
        })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: 'agentic-marketing-store',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// Mock data generators
export const generateMockKPIs = (): KPI[] => [
  { name: 'Total Leads', value: 1247, change: 12.5, trend: 'up', target: 1500 },
  { name: 'Conversion Rate', value: '3.2%', change: 0.8, trend: 'up', target: 4.0 },
  { name: 'Campaign ROI', value: '285%', change: 15, trend: 'up' },
  { name: 'Content Engagement', value: '68%', change: -2.1, trend: 'down' },
  { name: 'Email Open Rate', value: '24.7%', change: 1.2, trend: 'up' },
  { name: 'Ad Spend', value: '$12,450', change: 8.3, trend: 'up', target: 15000 },
];

export const generateMockAgentStatuses = (): AgentStatus[] => [
  {
    id: 'agent_1',
    type: 'branding',
    status: 'running',
    current_task: 'Analyzing competitor positioning',
    progress: 65,
    last_activity: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'agent_2',
    type: 'content',
    status: 'completed',
    current_task: 'Generated 12 blog posts',
    progress: 100,
    last_activity: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'agent_3',
    type: 'campaign',
    status: 'running',
    current_task: 'Optimizing ad bids',
    progress: 40,
    last_activity: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'agent_4',
    type: 'email',
    status: 'pending_approval',
    current_task: 'Email sequence needs approval',
    progress: 80,
    last_activity: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'agent_5',
    type: 'analytics',
    status: 'idle',
    last_activity: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

export const generateMockCampaigns = (): Campaign[] => [
  {
    id: 'campaign_1',
    name: 'Summer Product Launch',
    status: 'active',
    budget: 15000,
    spent: 8750,
    leads: 342,
    conversions: 28,
    roi: 285,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'campaign_2',
    name: 'Email Nurture Sequence',
    status: 'active',
    budget: 5000,
    spent: 3200,
    leads: 156,
    conversions: 12,
    roi: 180,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'campaign_3',
    name: 'Influencer Partnership',
    status: 'draft',
    budget: 25000,
    spent: 0,
    leads: 0,
    conversions: 0,
    roi: 0,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const generateMockContent = (): ContentAsset[] => [
  {
    id: 'content_1',
    title: '10 Marketing Automation Tips for 2024',
    type: 'blog_post',
    status: 'published',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    performance_score: 85,
  },
  {
    id: 'content_2',
    title: 'Product Demo Video',
    type: 'video',
    status: 'approved',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    performance_score: 92,
  },
  {
    id: 'content_3',
    title: 'Social Media Campaign Graphics',
    type: 'social_media',
    status: 'published',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    performance_score: 78,
  },
];

export const generateMockLeads = (): Lead[] => [
  {
    id: 'lead_1',
    email: 'john.doe@company.com',
    name: 'John Doe',
    company: 'Tech Corp',
    score: 85,
    status: 'qualified',
    source: 'LinkedIn Campaign',
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead_2',
    email: 'jane.smith@startup.io',
    name: 'Jane Smith',
    company: 'Startup IO',
    score: 72,
    status: 'nurturing',
    source: 'Content Download',
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead_3',
    email: 'mike.wilson@enterprise.com',
    name: 'Mike Wilson',
    company: 'Enterprise Solutions',
    score: 91,
    status: 'new',
    source: 'Google Ads',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];