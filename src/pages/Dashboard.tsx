import React, { useEffect } from 'react';
import { useStore, generateMockKPIs, generateMockAgentStatuses, generateMockCampaigns, generateMockContent, generateMockLeads } from '../lib/store';
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  MinusIcon,
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon
} from '@heroicons/react/24/solid';

const Dashboard: React.FC = () => {
  const {
    kpis,
    agentStatuses,
    recentCampaigns,
    recentContent,
    recentLeads,
    setKPIs,
    setAgentStatuses,
    setRecentCampaigns,
    setRecentContent,
    setRecentLeads,
  } = useStore();

  useEffect(() => {
    // Load mock data on component mount
    setKPIs(generateMockKPIs());
    setAgentStatuses(generateMockAgentStatuses());
    setRecentCampaigns(generateMockCampaigns());
    setRecentContent(generateMockContent());
    setRecentLeads(generateMockLeads());
  }, [setKPIs, setAgentStatuses, setRecentCampaigns, setRecentContent, setRecentLeads]);

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return <ArrowUpIcon className="w-4 h-4" />;
      case 'down':
        return <ArrowDownIcon className="w-4 h-4" />;
      default:
        return <MinusIcon className="w-4 h-4" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return 'text-green-600 bg-green-100';
      case 'down':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getAgentStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayIcon className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <ExclamationCircleIcon className="w-5 h-5 text-red-500" />;
      case 'pending_approval':
        return <ClockIcon className="w-5 h-5 text-yellow-500" />;
      default:
        return <PauseIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      case 'pending_approval':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketing Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor your AI-powered marketing campaigns and performance</p>
        </div>
        <div className="flex space-x-3">
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            Create Campaign
          </button>
          <button className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Generate Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {kpis.map((kpi, index) => (
          <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{kpi.name}</p>
                <div className="mt-2">
                  <p className="text-2xl font-bold text-gray-900">
                    {typeof kpi.value === 'number' && kpi.name.includes('Rate') 
                      ? formatPercentage(kpi.value)
                      : typeof kpi.value === 'number' && kpi.name.includes('$')
                      ? formatCurrency(kpi.value)
                      : typeof kpi.value === 'number'
                      ? formatNumber(kpi.value)
                      : kpi.value}
                  </p>
                  {kpi.target && (
                    <p className="text-xs text-gray-500 mt-1">
                      Target: {typeof kpi.target === 'number' && kpi.name.includes('$') 
                        ? formatCurrency(kpi.target)
                        : formatNumber(kpi.target)}
                    </p>
                  )}
                </div>
              </div>
              <div className={`p-2 rounded-full ${getTrendColor(kpi.trend)}`}>
                {getTrendIcon(kpi.trend)}
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className={`font-medium ${
                kpi.trend === 'up' ? 'text-green-600' : 
                kpi.trend === 'down' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {kpi.change > 0 ? '+' : ''}{kpi.change.toFixed(1)}%
              </span>
              <span className="text-gray-500 ml-1">vs last period</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">AI Agent Status</h2>
            <p className="text-sm text-gray-600 mt-1">Real-time status of your marketing agents</p>
          </div>
          <div className="p-6 space-y-4">
            {agentStatuses.map((agent) => (
              <div key={agent.id} className={`p-4 rounded-lg border-2 ${getAgentStatusColor(agent.status)}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getAgentStatusIcon(agent.status)}
                    <div>
                      <p className="font-medium text-gray-900 capitalize">{agent.type.replace('_', ' ')} Agent</p>
                      {agent.current_task && (
                        <p className="text-sm text-gray-600 mt-1">{agent.current_task}</p>
                      )}
                    </div>
                  </div>
                  {agent.progress !== undefined && (
                    <div className="flex items-center space-x-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${agent.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{agent.progress}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Campaigns</h2>
              <p className="text-sm text-gray-600 mt-1">Your latest marketing campaigns</p>
            </div>
            <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        campaign.status === 'active' ? 'bg-green-500' :
                        campaign.status === 'draft' ? 'bg-yellow-500' :
                        campaign.status === 'paused' ? 'bg-red-500' :
                        'bg-gray-500'
                      }`}></div>
                      <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                      <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-full capitalize">
                        {campaign.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                      <span>Budget: {formatCurrency(campaign.budget)}</span>
                      <span>Spent: {formatCurrency(campaign.spent)}</span>
                      <span>Leads: {formatNumber(campaign.leads)}</span>
                      <span className="font-medium text-green-600">ROI: {campaign.roi}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Content */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Content</h2>
              <p className="text-sm text-gray-600 mt-1">Latest content generated by AI</p>
            </div>
            <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentContent.map((content) => (
                <div key={content.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-medium text-gray-900">{content.title}</h3>
                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full capitalize">
                        {content.type.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        content.status === 'published' ? 'bg-green-100 text-green-700' :
                        content.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                        content.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {content.status}
                      </span>
                    </div>
                    {content.performance_score && (
                      <div className="flex items-center mt-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full"
                            style={{ width: `${content.performance_score}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">{content.performance_score}% score</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Leads</h2>
              <p className="text-sm text-gray-600 mt-1">New leads from your campaigns</p>
            </div>
            <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentLeads.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {lead.name ? lead.name.charAt(0).toUpperCase() : '?'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{lead.name || lead.email}</h3>
                      <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                        {lead.company && <span>{lead.company}</span>}
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                          Score: {lead.score}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          lead.status === 'qualified' ? 'bg-green-100 text-green-700' :
                          lead.status === 'nurturing' ? 'bg-blue-100 text-blue-700' :
                          lead.status === 'converted' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {lead.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{lead.source}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;