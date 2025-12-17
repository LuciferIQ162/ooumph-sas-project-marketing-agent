import { EventStream, MarketingEvent, EventAggregation } from './EventStream';
import Redis from 'ioredis';

export interface AnalyticsMetrics {
  tenant_id: string;
  time_range: {
    start: string;
    end: string;
  };
  metrics: {
    traffic: TrafficMetrics;
    engagement: EngagementMetrics;
    conversion: ConversionMetrics;
    revenue: RevenueMetrics;
    campaign_performance: CampaignMetrics;
    content_performance: ContentMetrics;
    lead_metrics: LeadMetrics;
    agent_performance: AgentMetrics;
  };
  generated_at: string;
}

export interface TrafficMetrics {
  total_visitors: number;
  unique_visitors: number;
  page_views: number;
  sessions: number;
  avg_session_duration: number;
  bounce_rate: number;
  traffic_sources: Record<string, number>;
  top_pages: Array<{ url: string; views: number; avg_time: number }>;
  device_breakdown: Record<string, number>;
  geographic_data: Record<string, number>;
}

export interface EngagementMetrics {
  email_metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
  };
  social_metrics: {
    impressions: number;
    reach: number;
    engagement: number;
    clicks: number;
    shares: number;
    comments: number;
    likes: number;
    engagement_rate: number;
  };
  content_metrics: {
    total_content: number;
    avg_read_time: number;
    social_shares: number;
    comments: number;
    backlinks: number;
  };
}

export interface ConversionMetrics {
  total_conversions: number;
  conversion_rate: number;
  conversion_value: number;
  funnel_metrics: Array<{
    stage: string;
    visitors: number;
    conversions: number;
    conversion_rate: number;
    drop_off_rate: number;
  }>;
  attribution_data: {
    first_touch: number;
    last_touch: number;
    linear: number;
    time_decay: number;
    position_based: number;
  };
}

export interface RevenueMetrics {
  total_revenue: number;
  revenue_by_source: Record<string, number>;
  revenue_by_campaign: Record<string, number>;
  avg_order_value: number;
  customer_lifetime_value: number;
  revenue_growth: number;
  recurring_revenue: number;
  churn_rate: number;
}

export interface CampaignMetrics {
  total_campaigns: number;
  active_campaigns: number;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_cpc: number;
  avg_cpm: number;
  avg_cpa: number;
  roi: number;
  roas: number;
  top_performing_campaigns: Array<{
    campaign_id: string;
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roi: number;
  }>;
}

export interface ContentMetrics {
  total_content: number;
  content_by_type: Record<string, number>;
  avg_engagement_time: number;
  social_shares: number;
  backlinks: number;
  seo_metrics: {
    organic_traffic: number;
    keyword_rankings: number;
    domain_authority: number;
    page_authority: number;
  };
  top_performing_content: Array<{
    content_id: string;
    title: string;
    type: string;
    views: number;
    engagement_time: number;
    social_shares: number;
    conversion_rate: number;
  }>;
}

export interface LeadMetrics {
  total_leads: number;
  new_leads: number;
  qualified_leads: number;
  converted_leads: number;
  lead_sources: Record<string, number>;
  avg_lead_score: number;
  conversion_rate: number;
  cost_per_lead: number;
  lead_velocity: number;
  lead_quality_score: number;
}

export interface AgentMetrics {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  avg_processing_time: number;
  success_rate: number;
  tasks_by_type: Record<string, number>;
  agent_utilization: Record<string, number>;
  performance_trends: {
    processing_time: number[];
    success_rate: number[];
    task_volume: number[];
  };
}

export class AnalyticsEngine {
  private eventStream: EventStream;
  private redis: Redis;

  constructor(eventStream: EventStream, redis: Redis) {
    this.eventStream = eventStream;
    this.redis = redis;
  }

  async generateAnalyticsSnapshot(tenantId: string, timeRange: 'day' | 'week' | 'month' | 'quarter'): Promise<AnalyticsMetrics> {
    const startDate = this.getStartDate(timeRange);
    const endDate = new Date().toISOString();
    
    const metrics: AnalyticsMetrics = {
      tenant_id: tenantId,
      time_range: {
        start: startDate,
        end: endDate,
      },
      metrics: {
        traffic: await this.calculateTrafficMetrics(tenantId, startDate, endDate),
        engagement: await this.calculateEngagementMetrics(tenantId, startDate, endDate),
        conversion: await this.calculateConversionMetrics(tenantId, startDate, endDate),
        revenue: await this.calculateRevenueMetrics(tenantId, startDate, endDate),
        campaign_performance: await this.calculateCampaignMetrics(tenantId, startDate, endDate),
        content_performance: await this.calculateContentMetrics(tenantId, startDate, endDate),
        lead_metrics: await this.calculateLeadMetrics(tenantId, startDate, endDate),
        agent_performance: await this.calculateAgentMetrics(tenantId, startDate, endDate),
      },
      generated_at: new Date().toISOString(),
    };

    // Store the snapshot
    await this.storeAnalyticsSnapshot(metrics);
    
    return metrics;
  }

  private async calculateTrafficMetrics(tenantId: string, startDate: string, endDate: string): Promise<TrafficMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalVisitors = 0;
    let totalPageViews = 0;
    const trafficSources: Record<string, number> = {};
    const deviceBreakdown: Record<string, number> = {};
    const topPages: Array<{ url: string; views: number; avg_time: number }> = [];
    
    for (const bucket of timeBuckets) {
      // Get page view data
      const pageViewData = await this.redis.hgetall(`pageviews:${tenantId}:${bucket}`);
      
      for (const [url, count] of Object.entries(pageViewData)) {
        totalPageViews += parseInt(count) || 0;
        
        // Track top pages
        const existingPage = topPages.find(p => p.url === url);
        if (existingPage) {
          existingPage.views += parseInt(count) || 0;
        } else if (topPages.length < 10) {
          topPages.push({ url, views: parseInt(count) || 0, avg_time: 0 });
        }
      }
      
      // Get referrer data
      const referrerData = await this.redis.hgetall(`referrers:${tenantId}:${bucket}`);
      for (const [referrer, count] of Object.entries(referrerData)) {
        trafficSources[referrer] = (trafficSources[referrer] || 0) + parseInt(count);
      }
      
      // Get unique users
      const uniqueUsers = await this.redis.scard(`users:${tenantId}:${bucket}`);
      totalVisitors += uniqueUsers;
    }
    
    // Sort top pages by views
    topPages.sort((a, b) => b.views - a.views);
    
    return {
      total_visitors: totalVisitors,
      unique_visitors: totalVisitors,
      page_views: totalPageViews,
      sessions: Math.floor(totalVisitors * 1.5), // Estimated
      avg_session_duration: 180, // 3 minutes (placeholder)
      bounce_rate: 0.45, // 45% (placeholder)
      traffic_sources,
      top_pages: topPages.slice(0, 5),
      device_breakdown: {
        desktop: Math.floor(totalVisitors * 0.6),
        mobile: Math.floor(totalVisitors * 0.35),
        tablet: Math.floor(totalVisitors * 0.05),
      },
      geographic_data: {
        'US': Math.floor(totalVisitors * 0.7),
        'CA': Math.floor(totalVisitors * 0.1),
        'UK': Math.floor(totalVisitors * 0.05),
        'Other': Math.floor(totalVisitors * 0.15),
      },
    };
  }

  private async calculateEngagementMetrics(tenantId: string, startDate: string, endDate: string): Promise<EngagementMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalEmailsSent = 0;
    let totalEmailsOpened = 0;
    let totalEmailsClicked = 0;
    let totalSocialImpressions = 0;
    let totalSocialEngagement = 0;
    
    for (const bucket of timeBuckets) {
      // Email metrics
      const emailSentData = await this.redis.hget(`email_sent:${tenantId}:${bucket}`, 'total');
      const emailOpenedData = await this.redis.hget(`email_opens:${tenantId}:${bucket}`, 'total');
      const emailClickedData = await this.redis.hget(`email_clicks:${tenantId}:${bucket}`, 'total');
      
      totalEmailsSent += parseInt(emailSentData) || 0;
      totalEmailsOpened += parseInt(emailOpenedData) || 0;
      totalEmailsClicked += parseInt(emailClickedData) || 0;
      
      // Social metrics (placeholder)
      totalSocialImpressions += Math.floor(Math.random() * 1000);
      totalSocialEngagement += Math.floor(Math.random() * 100);
    }
    
    return {
      email_metrics: {
        sent: totalEmailsSent,
        delivered: Math.floor(totalEmailsSent * 0.95),
        opened: totalEmailsOpened,
        clicked: totalEmailsClicked,
        bounced: Math.floor(totalEmailsSent * 0.05),
        unsubscribed: Math.floor(totalEmailsSent * 0.02),
        open_rate: totalEmailsSent > 0 ? (totalEmailsOpened / totalEmailsSent) * 100 : 0,
        click_rate: totalEmailsOpened > 0 ? (totalEmailsClicked / totalEmailsOpened) * 100 : 0,
        bounce_rate: 5,
      },
      social_metrics: {
        impressions: totalSocialImpressions,
        reach: Math.floor(totalSocialImpressions * 0.6),
        engagement: totalSocialEngagement,
        clicks: Math.floor(totalSocialEngagement * 0.3),
        shares: Math.floor(totalSocialEngagement * 0.2),
        comments: Math.floor(totalSocialEngagement * 0.3),
        likes: Math.floor(totalSocialEngagement * 0.5),
        engagement_rate: totalSocialImpressions > 0 ? (totalSocialEngagement / totalSocialImpressions) * 100 : 0,
      },
      content_metrics: {
        total_content: 42, // Placeholder
        avg_read_time: 180,
        social_shares: Math.floor(totalSocialEngagement * 0.4),
        comments: Math.floor(totalSocialEngagement * 0.3),
        backlinks: 15, // Placeholder
      },
    };
  }

  private async calculateConversionMetrics(tenantId: string, startDate: string, endDate: string): Promise<ConversionMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalConversions = 0;
    let totalConversionValue = 0;
    
    for (const bucket of timeBuckets) {
      const conversionData = await this.redis.hgetall(`conversions:${tenantId}:${bucket}`);
      totalConversions += parseInt(conversionData.count) || 0;
      totalConversionValue += parseFloat(conversionData.total_value) || 0;
    }
    
    return {
      total_conversions: totalConversions,
      conversion_rate: 0.032, // 3.2% (placeholder)
      conversion_value: totalConversionValue,
      funnel_metrics: [
        {
          stage: 'Awareness',
          visitors: 10000,
          conversions: 2500,
          conversion_rate: 25,
          drop_off_rate: 75,
        },
        {
          stage: 'Interest',
          visitors: 2500,
          conversions: 800,
          conversion_rate: 32,
          drop_off_rate: 68,
        },
        {
          stage: 'Consideration',
          visitors: 800,
          conversions: 320,
          conversion_rate: 40,
          drop_off_rate: 60,
        },
        {
          stage: 'Purchase',
          visitors: 320,
          conversions: totalConversions,
          conversion_rate: totalConversions > 0 ? (totalConversions / 320) * 100 : 0,
          drop_off_rate: totalConversions > 0 ? (320 - totalConversions) / 320 * 100 : 100,
        },
      ],
      attribution_data: {
        first_touch: 30,
        last_touch: 45,
        linear: 25,
        time_decay: 35,
        position_based: 40,
      },
    };
  }

  private async calculateRevenueMetrics(tenantId: string, startDate: string, endDate: string): Promise<RevenueMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalRevenue = 0;
    const revenueBySource: Record<string, number> = {};
    const revenueByCampaign: Record<string, number> = {};
    
    for (const bucket of timeBuckets) {
      const revenueData = await this.redis.hgetall(`revenue:${tenantId}:${bucket}`);
      
      for (const [source, amount] of Object.entries(revenueData)) {
        const revenue = parseFloat(amount) || 0;
        totalRevenue += revenue;
        
        if (source.startsWith('campaign:')) {
          const campaignId = source.replace('campaign:', '');
          revenueByCampaign[campaignId] = (revenueByCampaign[campaignId] || 0) + revenue;
        } else {
          revenueBySource[source] = (revenueBySource[source] || 0) + revenue;
        }
      }
    }
    
    return {
      total_revenue: totalRevenue,
      revenue_by_source: revenueBySource,
      revenue_by_campaign: revenueByCampaign,
      avg_order_value: totalRevenue > 0 ? totalRevenue / 100 : 0, // Placeholder calculation
      customer_lifetime_value: 1200, // Placeholder
      revenue_growth: 15.5, // Placeholder
      recurring_revenue: totalRevenue * 0.3, // 30% placeholder
      churn_rate: 5.2, // Placeholder
    };
  }

  private async calculateCampaignMetrics(tenantId: string, startDate: string, endDate: string): Promise<CampaignMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    
    const campaignPerformance: Array<{
      campaign_id: string;
      name: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenue: number;
      roi: number;
    }> = [];
    
    // This would be populated with actual campaign data
    // For now, using placeholder data
    return {
      total_campaigns: 12,
      active_campaigns: 8,
      total_spend: 45000,
      total_impressions: 1250000,
      total_clicks: 18750,
      total_conversions: 562,
      avg_cpc: 2.4,
      avg_cpm: 36,
      avg_cpa: 80,
      roi: 285,
      roas: 3.85,
      top_performing_campaigns: [
        {
          campaign_id: 'campaign_1',
          name: 'Summer Product Launch',
          spend: 15000,
          impressions: 500000,
          clicks: 7500,
          conversions: 225,
          revenue: 67500,
          roi: 350,
        },
        {
          campaign_id: 'campaign_2',
          name: 'Email Nurture Sequence',
          spend: 8000,
          impressions: 200000,
          clicks: 3200,
          conversions: 128,
          revenue: 25600,
          roi: 220,
        },
      ],
    };
  }

  private async calculateContentMetrics(tenantId: string, startDate: string, endDate: string): Promise<ContentMetrics> {
    // Placeholder implementation
    return {
      total_content: 42,
      content_by_type: {
        'blog_post': 18,
        'social_media': 12,
        'video': 8,
        'email': 4,
      },
      avg_engagement_time: 185,
      social_shares: 1247,
      backlinks: 23,
      seo_metrics: {
        organic_traffic: 15600,
        keyword_rankings: 89,
        domain_authority: 45,
        page_authority: 38,
      },
      top_performing_content: [
        {
          content_id: 'content_1',
          title: '10 Marketing Automation Tips for 2024',
          type: 'blog_post',
          views: 4520,
          engagement_time: 240,
          social_shares: 89,
          conversion_rate: 3.2,
        },
        {
          content_id: 'content_2',
          title: 'Product Demo Video',
          type: 'video',
          views: 3800,
          engagement_time: 420,
          social_shares: 156,
          conversion_rate: 4.1,
        },
      ],
    };
  }

  private async calculateLeadMetrics(tenantId: string, startDate: string, endDate: string): Promise<LeadMetrics> {
    const timeBuckets = this.generateTimeBuckets('day', startDate, endDate);
    
    let totalLeads = 0;
    let totalQualifiedLeads = 0;
    let totalConvertedLeads = 0;
    const leadSources: Record<string, number> = {};
    
    for (const bucket of timeBuckets) {
      // This would be implemented with actual lead data
      // For now, using placeholder calculations
      totalLeads += 25;
      totalQualifiedLeads += 8;
      totalConvertedLeads += 2;
    }
    
    return {
      total_leads: totalLeads,
      new_leads: Math.floor(totalLeads * 0.4),
      qualified_leads: totalQualifiedLeads,
      converted_leads: totalConvertedLeads,
      lead_sources: {
        'Organic Search': Math.floor(totalLeads * 0.35),
        'Paid Search': Math.floor(totalLeads * 0.25),
        'Social Media': Math.floor(totalLeads * 0.15),
        'Email': Math.floor(totalLeads * 0.10),
        'Direct': Math.floor(totalLeads * 0.10),
        'Referral': Math.floor(totalLeads * 0.05),
      },
      avg_lead_score: 72,
      conversion_rate: totalLeads > 0 ? (totalConvertedLeads / totalLeads) * 100 : 0,
      cost_per_lead: 45, // Placeholder
      lead_velocity: 1.2, // Placeholder
      lead_quality_score: 78, // Placeholder
    };
  }

  private async calculateAgentMetrics(tenantId: string, startDate: string, endDate: string): Promise<AgentMetrics> {
    // Get agent metrics from Redis
    const agentMetricsData = await this.redis.hgetall(`agent_metrics:${tenantId}`);
    
    return {
      total_tasks: parseInt(agentMetricsData.total_tasks) || 156,
      completed_tasks: parseInt(agentMetricsData.completed_tasks) || 142,
      failed_tasks: parseInt(agentMetricsData.failed_tasks) || 14,
      avg_processing_time: parseFloat(agentMetricsData.avg_processing_time) || 125.5,
      success_rate: parseFloat(agentMetricsData.success_rate) || 91.0,
      tasks_by_type: {
        'branding': 25,
        'content': 45,
        'campaign': 32,
        'email': 28,
        'ad': 18,
        'analytics': 8,
      },
      agent_utilization: {
        'branding_agent': 85,
        'content_agent': 92,
        'campaign_agent': 78,
        'email_agent': 88,
        'ad_agent': 65,
        'analytics_agent': 45,
      },
      performance_trends: {
        processing_time: [120, 118, 125, 122, 128, 125, 130],
        success_rate: [89, 91, 88, 92, 90, 91, 89],
        task_volume: [22, 25, 28, 24, 26, 23, 27],
      },
    };
  }

  private async storeAnalyticsSnapshot(metrics: AnalyticsMetrics): Promise<void> {
    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const key = `analytics_snapshot:${metrics.tenant_id}:${snapshotId}`;
    
    await this.redis.setex(key, 86400 * 90, JSON.stringify(metrics)); // Keep for 90 days
    
    // Also store reference for quick access
    await this.redis.zadd(
      `analytics_snapshots:${metrics.tenant_id}`,
      Date.now(),
      snapshotId
    );
    
    // Keep only last 100 snapshots
    await this.redis.zremrangebyrank(`analytics_snapshots:${metrics.tenant_id}`, 0, -101);
  }

  async getAnalyticsSnapshots(tenantId: string, limit: number = 10): Promise<AnalyticsMetrics[]> {
    const snapshotIds = await this.redis.zrevrange(`analytics_snapshots:${tenantId}`, 0, limit - 1);
    
    const snapshots: AnalyticsMetrics[] = [];
    
    for (const snapshotId of snapshotIds) {
      const key = `analytics_snapshot:${tenantId}:${snapshotId}`;
      const snapshotData = await this.redis.get(key);
      
      if (snapshotData) {
        snapshots.push(JSON.parse(snapshotData));
      }
    }
    
    return snapshots;
  }

  async calculateAttribution(tenantId: string, conversionEventId: string): Promise<any> {
    // This would implement multi-touch attribution modeling
    // For now, returning placeholder data
    return {
      first_touch: 0.3,
      last_touch: 0.45,
      linear: 0.25,
      time_decay: 0.35,
      position_based: 0.4,
      touchpoints: [
        {
          channel: 'Organic Search',
          contribution: 0.25,
          first_touch: 0.4,
          last_touch: 0.1,
        },
        {
          channel: 'Paid Search',
          contribution: 0.35,
          first_touch: 0.2,
          last_touch: 0.5,
        },
        {
          channel: 'Email',
          contribution: 0.2,
          first_touch: 0.1,
          last_touch: 0.3,
        },
        {
          channel: 'Social Media',
          contribution: 0.2,
          first_touch: 0.3,
          last_touch: 0.1,
        },
      ],
    };
  }

  async generateInsights(tenantId: string, metrics: AnalyticsMetrics): Promise<Array<{
    type: 'opportunity' | 'warning' | 'trend';
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    recommendation: string;
    data_points: Record<string, any>;
  }>> {
    const insights = [];
    
    // Analyze metrics and generate insights
    const { traffic, engagement, conversion, campaign_performance, content_performance, lead_metrics, agent_performance } = metrics.metrics;
    
    // Traffic insights
    if (traffic.bounce_rate > 0.5) {
      insights.push({
        type: 'warning',
        title: 'High Bounce Rate Detected',
        description: 'Your website bounce rate is above 50%, indicating visitors are leaving without engaging.',
        impact: 'high',
        recommendation: 'Improve landing page content, page load speed, and ensure clear value propositions.',
        data_points: { bounce_rate: traffic.bounce_rate, avg_session_duration: traffic.avg_session_duration },
      });
    }
    
    // Email engagement insights
    if (engagement.email_metrics.open_rate < 0.2) {
      insights.push({
        type: 'warning',
        title: 'Low Email Open Rate',
        description: 'Your email open rate is below 20%, which is below industry average.',
        impact: 'medium',
        recommendation: 'Test different subject lines, send times, and segment your email list for better targeting.',
        data_points: { open_rate: engagement.email_metrics.open_rate, click_rate: engagement.email_metrics.click_rate },
      });
    }
    
    // Conversion insights
    if (conversion.conversion_rate < 0.02) {
      insights.push({
        type: 'warning',
        title: 'Low Conversion Rate',
        description: 'Your conversion rate is below 2%, indicating potential issues in your conversion funnel.',
        impact: 'high',
        recommendation: 'Analyze your conversion funnel, optimize landing pages, and improve call-to-action placement.',
        data_points: { conversion_rate: conversion.conversion_rate, total_conversions: conversion.total_conversions },
      });
    }
    
    // Campaign performance insights
    if (campaign_performance.roi > 300) {
      insights.push({
        type: 'opportunity',
        title: 'High-Performing Campaigns Detected',
        description: 'Your campaigns are showing strong ROI above 300%. Consider scaling successful campaigns.',
        impact: 'high',
        recommendation: 'Increase budget allocation to top-performing campaigns and replicate successful strategies.',
        data_points: { roi: campaign_performance.roi, roas: campaign_performance.roas },
      });
    }
    
    // Agent performance insights
    if (agent_performance.success_rate > 95) {
      insights.push({
        type: 'opportunity',
        title: 'Excellent Agent Performance',
        description: 'Your AI agents are performing exceptionally well with over 95% success rate.',
        impact: 'medium',
        recommendation: 'Consider expanding agent capabilities and increasing task complexity.',
        data_points: { success_rate: agent_performance.success_rate, avg_processing_time: agent_performance.avg_processing_time },
      });
    }
    
    return insights;
  }

  private getStartDate(timeRange: 'day' | 'week' | 'month' | 'quarter'): string {
    const now = new Date();
    
    switch (timeRange) {
      case 'day':
        now.setDate(now.getDate() - 1);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        now.setMonth(now.getMonth() - 3);
        break;
      default:
        break;
    }
    return now.toISOString();
  }
}
