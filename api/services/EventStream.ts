import Redis from 'ioredis';

export interface MarketingEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  user_id?: string;
  session_id?: string;
  campaign_id?: string;
  content_id?: string;
  lead_id?: string;
  properties: Record<string, any>;
  context: {
    user_agent?: string;
    ip_address?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    device_type?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    timestamp: string;
  };
  occurred_at: string;
}

export interface EventAggregation {
  tenant_id: string;
  event_type: string;
  time_bucket: string;
  count: number;
  unique_users: number;
  revenue?: number;
  conversion_rate?: number;
  avg_value?: number;
  metadata: Record<string, any>;
}

export class EventStream {
  private redis: Redis;
  private streamKey: string = 'marketing_events';
  private consumerGroup: string = 'event_processors';
  private consumerId: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.consumerId = `consumer_${process.pid}_${Date.now()}`;
    this.initializeConsumerGroup();
  }

  private async initializeConsumerGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', this.streamKey, this.consumerGroup, '0', 'MKSTREAM');
    } catch (error) {
      if (!error.message.includes('BUSYGROUP')) {
        console.error('Error creating consumer group:', error);
      }
    }
  }

  async trackEvent(event: Omit<MarketingEvent, 'id'>): Promise<string> {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEvent: MarketingEvent = {
      ...event,
      id: eventId,
      occurred_at: event.occurred_at || new Date().toISOString()
    };

    try {
      // Add to Redis stream
      await this.redis.xadd(
        this.streamKey,
        '*',
        'event', JSON.stringify(fullEvent),
        'tenant_id', event.tenant_id,
        'event_type', event.event_type,
        'timestamp', fullEvent.occurred_at
      );

      // Store in time-series data for real-time analytics
      await this.storeTimeSeriesData(fullEvent);

      // Update counters and aggregations
      await this.updateEventCounters(fullEvent);

      return eventId;
    } catch (error) {
      console.error('Error tracking event:', error);
      throw error;
    }
  }

  private async storeTimeSeriesData(event: MarketingEvent): Promise<void> {
    const minuteKey = `events:minute:${event.tenant_id}:${this.getTimeBucket('minute', event.occurred_at)}`;
    const hourKey = `events:hour:${event.tenant_id}:${this.getTimeBucket('hour', event.occurred_at)}`;
    const dayKey = `events:day:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`;

    // Increment counters
    const pipeline = this.redis.pipeline();
    
    // Minute-level data
    pipeline.hincrby(minuteKey, 'total_events', 1);
    pipeline.hincrby(minuteKey, `${event.event_type}_count`, 1);
    pipeline.expire(minuteKey, 86400 * 7); // Keep for 7 days

    // Hour-level data
    pipeline.hincrby(hourKey, 'total_events', 1);
    pipeline.hincrby(hourKey, `${event.event_type}_count`, 1);
    pipeline.expire(hourKey, 86400 * 30); // Keep for 30 days

    // Day-level data
    pipeline.hincrby(dayKey, 'total_events', 1);
    pipeline.hincrby(dayKey, `${event.event_type}_count`, 1);
    pipeline.expire(dayKey, 86400 * 365); // Keep for 1 year

    // Track unique users
    if (event.user_id) {
      const userKey = `users:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`;
      pipeline.sadd(userKey, event.user_id);
      pipeline.expire(userKey, 86400 * 365);
    }

    await pipeline.exec();
  }

  private async updateEventCounters(event: MarketingEvent): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    // Update tenant-level counters
    pipeline.hincrby(`counters:${event.tenant_id}`, 'total_events', 1);
    pipeline.hincrby(`counters:${event.tenant_id}`, `${event.event_type}_events`, 1);
    
    // Update campaign counters if campaign_id is present
    if (event.campaign_id) {
      pipeline.hincrby(`campaign:${event.campaign_id}`, 'total_events', 1);
      pipeline.hincrby(`campaign:${event.campaign_id}`, `${event.event_type}_events`, 1);
    }

    // Update content counters if content_id is present
    if (event.content_id) {
      pipeline.hincrby(`content:${event.content_id}`, 'total_events', 1);
      pipeline.hincrby(`content:${event.content_id}`, `${event.event_type}_events`, 1);
    }

    await pipeline.exec();
  }

  async processEvents(batchSize: number = 100): Promise<MarketingEvent[]> {
    try {
      const events = await this.redis.xreadgroup(
        'GROUP',
        this.consumerGroup,
        this.consumerId,
        'COUNT',
        batchSize,
        'BLOCK',
        5000,
        'STREAMS',
        this.streamKey,
        '>'
      );

      if (!events || events.length === 0) {
        return [];
      }

      const processedEvents: MarketingEvent[] = [];
      
      for (const [stream, messages] of events) {
        for (const [messageId, fields] of messages) {
          try {
            const eventData = fields.find(field => field === 'event');
            if (eventData) {
              const eventIndex = fields.indexOf('event');
              const eventJson = fields[eventIndex + 1];
              const event: MarketingEvent = JSON.parse(eventJson);
              
              // Process the event
              await this.processEvent(event);
              
              // Acknowledge the message
              await this.redis.xack(this.streamKey, this.consumerGroup, messageId);
              
              processedEvents.push(event);
            }
          } catch (error) {
            console.error('Error processing event:', error);
            // Could implement retry logic or dead letter queue here
          }
        }
      }

      return processedEvents;
    } catch (error) {
      console.error('Error reading from stream:', error);
      return [];
    }
  }

  private async processEvent(event: MarketingEvent): Promise<void> {
    // Process different event types
    switch (event.event_type) {
      case 'page_view':
        await this.processPageView(event);
        break;
      case 'form_submit':
        await this.processFormSubmit(event);
        break;
      case 'email_open':
        await this.processEmailOpen(event);
        break;
      case 'email_click':
        await this.processEmailClick(event);
        break;
      case 'campaign_conversion':
        await this.processConversion(event);
        break;
      case 'ad_click':
        await this.processAdClick(event);
        break;
      case 'content_engagement':
        await this.processContentEngagement(event);
        break;
      case 'lead_qualification':
        await this.processLeadQualification(event);
        break;
      default:
        console.log(`Processing generic event: ${event.event_type}`);
    }
  }

  private async processPageView(event: MarketingEvent): Promise<void> {
    // Track page views for analytics
    const pageUrl = event.properties.url || 'unknown';
    const referrer = event.context.referrer || 'direct';
    
    await this.redis.hincrby(
      `pageviews:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      pageUrl,
      1
    );

    // Track referrer data
    if (referrer !== 'direct') {
      await this.redis.hincrby(
        `referrers:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
        referrer,
        1
      );
    }

    // Update session data
    if (event.session_id) {
      await this.redis.hincrby(
        `sessions:${event.tenant_id}:${event.session_id}`,
        'page_views',
        1
      );
      
      await this.redis.expire(`sessions:${event.tenant_id}:${event.session_id}`, 3600); // 1 hour
    }
  }

  private async processFormSubmit(event: MarketingEvent): Promise<void> {
    // Track form submissions
    const formId = event.properties.form_id || 'unknown';
    const conversionValue = event.properties.value || 0;
    
    await this.redis.hincrby(
      `form_submissions:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      formId,
      1
    );

    // Track conversion value
    if (conversionValue > 0) {
      await this.redis.hincrbyfloat(
        `conversions:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
        'total_value',
        conversionValue
      );
    }

    // Create or update lead record
    if (event.lead_id) {
      await this.updateLeadRecord(event.lead_id, {
        status: 'new',
        source: event.properties.source || 'form',
        submitted_at: event.occurred_at,
        form_data: event.properties
      });
    }
  }

  private async processEmailOpen(event: MarketingEvent): Promise<void> {
    const emailId = event.properties.email_id || 'unknown';
    const campaignId = event.campaign_id || 'unknown';
    
    await this.redis.hincrby(
      `email_opens:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      emailId,
      1
    );

    if (campaignId !== 'unknown') {
      await this.redis.hincrby(
        `campaign_opens:${campaignId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'opens',
        1
      );
    }

    // Track unique opens
    if (event.user_id) {
      const uniqueOpenKey = `unique_opens:${emailId}:${event.user_id}`;
      const wasSet = await this.redis.setnx(uniqueOpenKey, '1');
      if (wasSet) {
        await this.redis.expire(uniqueOpenKey, 86400 * 30); // 30 days
        await this.redis.hincrby(
          `unique_opens:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
          emailId,
          1
        );
      }
    }
  }

  private async processEmailClick(event: MarketingEvent): Promise<void> {
    const emailId = event.properties.email_id || 'unknown';
    const campaignId = event.campaign_id || 'unknown';
    const linkUrl = event.properties.link_url || 'unknown';
    
    await this.redis.hincrby(
      `email_clicks:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      emailId,
      1
    );

    await this.redis.hincrby(
      `link_clicks:${emailId}:${this.getTimeBucket('day', event.occurred_at)}`,
      linkUrl,
      1
    );

    if (campaignId !== 'unknown') {
      await this.redis.hincrby(
        `campaign_clicks:${campaignId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'clicks',
        1
      );
    }
  }

  private async processConversion(event: MarketingEvent): Promise<void> {
    const conversionValue = event.properties.value || 0;
    const campaignId = event.campaign_id || 'unknown';
    const contentId = event.content_id || 'unknown';
    
    // Track conversion value
    await this.redis.hincrbyfloat(
      `conversions:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      'total_value',
      conversionValue
    );

    await this.redis.hincrby(
      `conversions:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      'count',
      1
    );

    // Update campaign performance
    if (campaignId !== 'unknown') {
      await this.redis.hincrby(
        `campaign_conversions:${campaignId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'conversions',
        1
      );
      
      await this.redis.hincrbyfloat(
        `campaign_revenue:${campaignId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'revenue',
        conversionValue
      );
    }

    // Update content performance
    if (contentId !== 'unknown') {
      await this.redis.hincrby(
        `content_conversions:${contentId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'conversions',
        1
      );
    }

    // Update lead status
    if (event.lead_id) {
      await this.updateLeadRecord(event.lead_id, {
        status: 'converted',
        converted_at: event.occurred_at,
        conversion_value: conversionValue
      });
    }
  }

  private async processAdClick(event: MarketingEvent): Promise<void> {
    const adId = event.properties.ad_id || 'unknown';
    const campaignId = event.campaign_id || 'unknown';
    const cost = event.properties.cost || 0;
    
    await this.redis.hincrby(
      `ad_clicks:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      adId,
      1
    );

    // Track ad spend
    if (cost > 0) {
      await this.redis.hincrbyfloat(
        `ad_spend:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
        adId,
        cost
      );
    }

    if (campaignId !== 'unknown') {
      await this.redis.hincrby(
        `campaign_clicks:${campaignId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'clicks',
        1
      );
    }
  }

  private async processContentEngagement(event: MarketingEvent): Promise<void> {
    const contentId = event.content_id || 'unknown';
    const engagementType = event.properties.engagement_type || 'view';
    const engagementTime = event.properties.engagement_time || 0;
    
    await this.redis.hincrby(
      `content_engagement:${event.tenant_id}:${this.getTimeBucket('day', event.occurred_at)}`,
      `${contentId}:${engagementType}`,
      1
    );

    // Track engagement time
    if (engagementTime > 0) {
      await this.redis.hincrbyfloat(
        `content_engagement_time:${contentId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'total_time',
        engagementTime
      );
      
      await this.redis.hincrby(
        `content_engagement_time:${contentId}:${this.getTimeBucket('day', event.occurred_at)}`,
        'count',
        1
      );
    }
  }

  private async processLeadQualification(event: MarketingEvent): Promise<void> {
    const leadId = event.lead_id;
    const qualificationScore = event.properties.qualification_score || 0;
    const qualificationReason = event.properties.qualification_reason || '';
    
    if (leadId) {
      await this.updateLeadRecord(leadId, {
        qualification_score: qualificationScore,
        qualification_reason: qualificationReason,
        qualified_at: event.occurred_at,
        status: qualificationScore > 70 ? 'qualified' : 'nurturing'
      });
    }
  }

  private async updateLeadRecord(leadId: string, updates: Record<string, any>): Promise<void> {
    const leadKey = `lead:${leadId}`;
    const pipeline = this.redis.pipeline();
    
    Object.entries(updates).forEach(([field, value]) => {
      if (typeof value === 'object') {
        pipeline.hset(leadKey, field, JSON.stringify(value));
      } else {
        pipeline.hset(leadKey, field, String(value));
      }
    });
    
    pipeline.expire(leadKey, 86400 * 365); // Keep for 1 year
    
    await pipeline.exec();
  }

  async getEventMetrics(tenantId: string, timeRange: 'hour' | 'day' | 'week' | 'month'): Promise<EventAggregation[]> {
    const aggregations: EventAggregation[] = [];
    const now = new Date();
    const timeBuckets = this.generateTimeBuckets(timeRange, now);

    for (const bucket of timeBuckets) {
      const key = `events:${timeRange}:${tenantId}:${bucket}`;
      const data = await this.redis.hgetall(key);
      
      if (Object.keys(data).length > 0) {
        aggregations.push({
          tenant_id: tenantId,
          event_type: 'all',
          time_bucket: bucket,
          count: parseInt(data.total_events) || 0,
          unique_users: await this.redis.scard(`users:${tenantId}:${bucket}`),
          metadata: data
        });
      }
    }

    return aggregations;
  }

  async getCampaignMetrics(campaignId: string, timeRange: 'day' | 'week' | 'month'): Promise<any> {
    const metrics = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      ctr: 0,
      conversion_rate: 0,
      roas: 0
    };

    const timeBuckets = this.generateTimeBuckets(timeRange, new Date());

    for (const bucket of timeBuckets) {
      // Get campaign events
      const campaignData = await this.redis.hgetall(`campaign:${campaignId}:${bucket}`);
      const conversionData = await this.redis.hgetall(`campaign_conversions:${campaignId}:${bucket}`);
      const revenueData = await this.redis.hgetall(`campaign_revenue:${campaignId}:${bucket}`);

      metrics.impressions += parseInt(campaignData.impressions) || 0;
      metrics.clicks += parseInt(campaignData.clicks) || 0;
      metrics.conversions += parseInt(conversionData.conversions) || 0;
      metrics.revenue += parseFloat(revenueData.revenue) || 0;
    }

    // Calculate rates
    if (metrics.impressions > 0) {
      metrics.ctr = (metrics.clicks / metrics.impressions) * 100;
    }
    
    if (metrics.clicks > 0) {
      metrics.conversion_rate = (metrics.conversions / metrics.clicks) * 100;
    }

    return metrics;
  }

  private getTimeBucket(granularity: 'minute' | 'hour' | 'day' | 'week' | 'month', timestamp: string): string {
    const date = new Date(timestamp);
    
    switch (granularity) {
      case 'minute':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
      case 'hour':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
      case 'day':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }

  private generateTimeBuckets(range: 'hour' | 'day' | 'week' | 'month', endDate: Date): string[] {
    const buckets: string[] = [];
    const startDate = new Date(endDate);
    
    switch (range) {
      case 'hour':
        startDate.setHours(endDate.getHours() - 24);
        for (let i = 0; i < 24; i++) {
          const date = new Date(startDate);
          date.setHours(startDate.getHours() + i);
          buckets.push(this.getTimeBucket('hour', date.toISOString()));
        }
        break;
      case 'day':
        startDate.setDate(endDate.getDate() - 30);
        for (let i = 0; i < 30; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + i);
          buckets.push(this.getTimeBucket('day', date.toISOString()));
        }
        break;
      case 'week':
        startDate.setDate(endDate.getDate() - 84); // 12 weeks
        for (let i = 0; i < 12; i++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + (i * 7));
          buckets.push(this.getTimeBucket('week', date.toISOString()));
        }
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 12);
        for (let i = 0; i < 12; i++) {
          const date = new Date(startDate);
          date.setMonth(startDate.getMonth() + i);
          buckets.push(this.getTimeBucket('month', date.toISOString()));
        }
        break;
    }
    
    return buckets;
  }

  async createRealtimeStream(callback: (event: MarketingEvent) => void): Promise<void> {
    // Create a pub/sub channel for real-time events
    const subscriber = this.redis.duplicate();
    
    subscriber.subscribe('realtime_events', (err) => {
      if (err) {
        console.error('Error subscribing to realtime events:', err);
        return;
      }
    });

    subscriber.on('message', (channel, message) => {
      try {
        const event: MarketingEvent = JSON.parse(message);
        callback(event);
      } catch (error) {
        console.error('Error processing realtime event:', error);
      }
    });
  }

  async publishRealtimeEvent(event: MarketingEvent): Promise<void> {
    await this.redis.publish('realtime_events', JSON.stringify(event));
  }
}