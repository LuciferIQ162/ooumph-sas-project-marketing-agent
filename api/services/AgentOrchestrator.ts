import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface AgentTask {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_type: 'branding' | 'content' | 'campaign' | 'email' | 'ad' | 'influencer' | 'affiliate' | 'seo' | 'analytics';
  task_type: string;
  payload: any;
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: any;
  approval_required: boolean;
  approved_by?: string;
  approved_at?: string;
}

export interface AgentWorkflow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  status: 'active' | 'paused' | 'completed' | 'failed';
  created_by: string;
  created_at: string;
  last_run_at?: string;
}

export interface WorkflowStep {
  id: string;
  agent_type: string;
  task_config: any;
  dependencies: string[];
  approval_required: boolean;
  timeout_minutes: number;
  retry_count: number;
}

export interface WorkflowTrigger {
  type: 'manual' | 'scheduled' | 'event' | 'webhook';
  config: any;
}

export class AgentOrchestrator {
  private agentQueue: Queue;
  private workflowQueue: Queue;
  private eventQueue: Queue;
  private supabase: any;
  private pinecone: Pinecone;
  private openai: OpenAI;
  private anthropic: Anthropic;
  private redis: Redis;

  constructor(
    agentQueue: Queue,
    workflowQueue: Queue,
    eventQueue: Queue,
    supabase: any,
    pinecone: Pinecone,
    redis: Redis
  ) {
    this.agentQueue = agentQueue;
    this.workflowQueue = workflowQueue;
    this.eventQueue = eventQueue;
    this.supabase = supabase;
    this.pinecone = pinecone;
    this.redis = redis;
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!
    });
  }

  async createTask(task: Omit<AgentTask, 'id' | 'created_at' | 'status'>): Promise<AgentTask> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullTask: AgentTask = {
      ...task,
      id: taskId,
      created_at: now,
      status: 'pending'
    };

    // Store task in database
    const { data, error } = await this.supabase
      .from('agent_tasks')
      .insert({
        id: taskId,
        tenant_id: task.tenant_id,
        user_id: task.user_id,
        agent_type: task.agent_type,
        task_type: task.task_type,
        payload: task.payload,
        priority: task.priority,
        status: 'pending',
        approval_required: task.approval_required,
        created_at: now
      })
      .select()
      .single();

    if (error) throw error;

    // Queue the task
    await this.agentQueue.add(`agent-${task.agent_type}`, {
      taskId,
      tenant_id: task.tenant_id,
      user_id: task.user_id,
      agent_type: task.agent_type,
      task_type: task.task_type,
      payload: task.payload,
      priority: task.priority
    }, {
      priority: task.priority,
      delay: task.priority === 0 ? 0 : task.priority * 1000
    });

    return fullTask;
  }

  async executeWorkflow(workflowId: string, triggerData?: any): Promise<void> {
    const { data: workflow, error } = await this.supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (error || !workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const workflowRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create workflow run record
    await this.supabase
      .from('workflow_runs')
      .insert({
        id: workflowRunId,
        workflow_id: workflowId,
        tenant_id: workflow.tenant_id,
        status: 'running',
        trigger_data: triggerData,
        started_at: new Date().toISOString()
      });

    // Queue workflow execution
    await this.workflowQueue.add('execute-workflow', {
      workflowId,
      workflowRunId,
      tenant_id: workflow.tenant_id,
      steps: workflow.steps,
      triggerData
    });
  }

  async getTaskStatus(taskId: string): Promise<AgentTask | null> {
    const { data, error } = await this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error || !data) return null;
    return data as AgentTask;
  }

  async updateTaskStatus(taskId: string, status: AgentTask['status'], result?: any, error?: string): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'running') {
      updateData.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
      if (result) updateData.result = result;
      if (error) updateData.error = error;
    }

    await this.supabase
      .from('agent_tasks')
      .update(updateData)
      .eq('id', taskId);

    // Emit status change event
    await this.eventQueue.add('task-status-changed', {
      taskId,
      status,
      result,
      error,
      timestamp: new Date().toISOString()
    });
  }

  async requireApproval(taskId: string, userId: string): Promise<void> {
    await this.updateTaskStatus(taskId, 'pending');
    
    await this.supabase
      .from('agent_tasks')
      .update({
        approval_required: true,
        status: 'pending'
      })
      .eq('id', taskId);

    // Send notification for approval
    await this.eventQueue.add('approval-required', {
      taskId,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  async approveTask(taskId: string, approvedBy: string): Promise<void> {
    await this.supabase
      .from('agent_tasks')
      .update({
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        status: 'pending'
      })
      .eq('id', taskId);

    // Re-queue the task for execution
    const { data: task } = await this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (task) {
      await this.agentQueue.add(`agent-${task.agent_type}`, {
        taskId,
        tenant_id: task.tenant_id,
        user_id: task.user_id,
        agent_type: task.agent_type,
        task_type: task.task_type,
        payload: task.payload,
        priority: task.priority
      });
    }
  }

  async getAgentInsights(tenantId: string, agentType?: string): Promise<any> {
    let query = this.supabase
      .from('agent_tasks')
      .select('*')
      .eq('tenant_id', tenantId);

    if (agentType) {
      query = query.eq('agent_type', agentType);
    }

    const { data: tasks, error } = await query
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const insights = {
      total_tasks: tasks.length,
      completed_tasks: tasks.filter(t => t.status === 'completed').length,
      failed_tasks: tasks.filter(t => t.status === 'failed').length,
      pending_tasks: tasks.filter(t => t.status === 'pending').length,
      avg_completion_time: 0,
      success_rate: 0,
      tasks_by_type: {} as Record<string, number>,
      recent_failures: [] as any[]
    };

    if (tasks.length > 0) {
      const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_at && t.started_at);
      if (completedTasks.length > 0) {
        const totalTime = completedTasks.reduce((sum, task) => {
          const start = new Date(task.started_at).getTime();
          const end = new Date(task.completed_at).getTime();
          return sum + (end - start);
        }, 0);
        insights.avg_completion_time = Math.round(totalTime / completedTasks.length / 1000);
      }

      insights.success_rate = Math.round((insights.completed_tasks / tasks.length) * 100);

      tasks.forEach(task => {
        insights.tasks_by_type[task.task_type] = (insights.tasks_by_type[task.task_type] || 0) + 1;
      });

      insights.recent_failures = tasks
        .filter(t => t.status === 'failed')
        .slice(0, 5)
        .map(t => ({
          id: t.id,
          task_type: t.task_type,
          error: t.error,
          created_at: t.created_at
        }));
    }

    return insights;
  }

  async createVectorEmbedding(tenantId: string, content: string, metadata: any): Promise<string> {
    // Create embedding using OpenAI
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
      encoding_format: 'float'
    });

    const embedding = embeddingResponse.data[0].embedding;
    const vectorId = `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store in Pinecone
    const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!);
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: {
        ...metadata,
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      }
    }]);

    return vectorId;
  }

  async searchSimilarContent(tenantId: string, query: string, limit: number = 5): Promise<any[]> {
    // Create embedding for query
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float'
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Search in Pinecone
    const index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!);
    const searchResults = await index.query({
      vector: queryEmbedding,
      topK: limit,
      filter: { tenant_id: { $eq: tenantId } },
      includeMetadata: true
    });

    return searchResults.matches || [];
  }

  async processAgentTask(job: any): Promise<void> {
    const { taskId, tenant_id, user_id, agent_type, task_type, payload } = job.data;

    try {
      await this.updateTaskStatus(taskId, 'running');

      let result: any;

      switch (agent_type) {
        case 'branding':
          result = await this.processBrandingTask(tenant_id, user_id, task_type, payload);
          break;
        case 'content':
          result = await this.processContentTask(tenant_id, user_id, task_type, payload);
          break;
        case 'campaign':
          result = await this.processCampaignTask(tenant_id, user_id, task_type, payload);
          break;
        case 'email':
          result = await this.processEmailTask(tenant_id, user_id, task_type, payload);
          break;
        case 'ad':
          result = await this.processAdTask(tenant_id, user_id, task_type, payload);
          break;
        case 'influencer':
          result = await this.processInfluencerTask(tenant_id, user_id, task_type, payload);
          break;
        case 'affiliate':
          result = await this.processAffiliateTask(tenant_id, user_id, task_type, payload);
          break;
        case 'seo':
          result = await this.processSEOTask(tenant_id, user_id, task_type, payload);
          break;
        case 'analytics':
          result = await this.processAnalyticsTask(tenant_id, user_id, task_type, payload);
          break;
        default:
          throw new Error(`Unknown agent type: ${agent_type}`);
      }

      await this.updateTaskStatus(taskId, 'completed', result);

      // Track successful completion
      await this.eventQueue.add('agent-task-completed', {
        taskId,
        agent_type,
        task_type,
        tenant_id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Error processing agent task ${taskId}:`, error);
      await this.updateTaskStatus(taskId, 'failed', null, error.message);

      // Track failure
      await this.eventQueue.add('agent-task-failed', {
        taskId,
        agent_type,
        task_type,
        tenant_id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async processBrandingTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'propose':
        return await this.generateBrandProposal(tenantId, userId, payload);
      case 'analyze-competitors':
        return await this.analyzeCompetitors(tenantId, payload.competitors);
      case 'create-personas':
        return await this.createBuyerPersonas(tenantId, payload);
      default:
        throw new Error(`Unknown branding task type: ${taskType}`);
    }
  }

  private async processContentTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'generate':
        return await this.generateContent(tenantId, userId, payload);
      case 'optimize':
        return await this.optimizeContent(tenantId, payload.content_id, payload.optimizations);
      case 'schedule':
        return await this.scheduleContent(tenantId, payload.content_ids, payload.schedule);
      default:
        throw new Error(`Unknown content task type: ${taskType}`);
    }
  }

  private async processCampaignTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'create':
        return await this.createCampaign(tenantId, userId, payload);
      case 'optimize':
        return await this.optimizeCampaign(tenantId, payload.campaign_id, payload.optimizations);
      case 'schedule':
        return await this.scheduleCampaign(tenantId, payload.campaign_id, payload.schedule);
      default:
        throw new Error(`Unknown campaign task type: ${taskType}`);
    }
  }

  private async processEmailTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'send-bulk':
        return await this.sendBulkEmails(tenantId, payload);
      case 'create-sequence':
        return await this.createEmailSequence(tenantId, payload);
      case 'personalize':
        return await this.personalizeEmails(tenantId, payload.email_ids, payload.personalization);
      default:
        throw new Error(`Unknown email task type: ${taskType}`);
    }
  }

  private async processAdTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'create-campaign':
        return await this.createAdCampaign(tenantId, payload);
      case 'optimize-bids':
        return await this.optimizeAdBids(tenantId, payload.campaign_id);
      case 'create-audience':
        return await this.createAdAudience(tenantId, payload);
      default:
        throw new Error(`Unknown ad task type: ${taskType}`);
    }
  }

  private async processInfluencerTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'discover':
        return await this.discoverInfluencers(tenantId, payload.criteria);
      case 'create-campaign':
        return await this.createInfluencerCampaign(tenantId, payload);
      case 'track-performance':
        return await this.trackInfluencerPerformance(tenantId, payload.campaign_id);
      default:
        throw new Error(`Unknown influencer task type: ${taskType}`);
    }
  }

  private async processAffiliateTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'register-partner':
        return await this.registerAffiliatePartner(tenantId, payload);
      case 'create-links':
        return await this.createAffiliateLinks(tenantId, payload);
      case 'calculate-commissions':
        return await this.calculateAffiliateCommissions(tenantId, payload.period);
      default:
        throw new Error(`Unknown affiliate task type: ${taskType}`);
    }
  }

  private async processSEOTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'analyze-site':
        return await this.analyzeSEOSite(tenantId, payload.site_url);
      case 'optimize-content':
        return await this.optimizeSEOContent(tenantId, payload.content_id, payload.keywords);
      case 'build-backlinks':
        return await this.buildSEOBacklinks(tenantId, payload);
      default:
        throw new Error(`Unknown SEO task type: ${taskType}`);
    }
  }

  private async processAnalyticsTask(tenantId: string, userId: string, taskType: string, payload: any): Promise<any> {
    switch (taskType) {
      case 'generate-report':
        return await this.generateAnalyticsReport(tenantId, payload);
      case 'calculate-attribution':
        return await this.calculateAttribution(tenantId, payload.campaign_id);
      case 'create-snapshot':
        return await this.createAnalyticsSnapshot(tenantId, payload);
      default:
        throw new Error(`Unknown analytics task type: ${taskType}`);
    }
  }

  // Placeholder implementations for specific agent tasks
  private async generateBrandProposal(tenantId: string, userId: string, payload: any): Promise<any> {
    // This would integrate with AI services to generate brand proposals
    return {
      brand_positioning: 'Premium solution for modern businesses',
      tone_guidelines: 'Professional yet approachable',
      visual_direction: 'Clean, modern, trustworthy',
      target_audience: 'SMB owners and marketing managers',
      generated_at: new Date().toISOString()
    };
  }

  private async generateContent(tenantId: string, userId: string, payload: any): Promise<any> {
    // This would integrate with AI content generation
    return {
      content_id: `content_${Date.now()}`,
      title: 'Generated Content Title',
      content: 'Generated content body...',
      format: payload.format || 'blog_post',
      generated_at: new Date().toISOString()
    };
  }

  private async createCampaign(tenantId: string, userId: string, payload: any): Promise<any> {
    // This would create campaign records and trigger related tasks
    return {
      campaign_id: `campaign_${Date.now()}`,
      name: payload.name,
      status: 'created',
      budget: payload.budget,
      channels: payload.channels,
      created_at: new Date().toISOString()
    };
  }

  // Add more specific implementations as needed...
  private async analyzeCompetitors(tenantId: string, competitors: string[]): Promise<any> { return {}; }
  private async createBuyerPersonas(tenantId: string, payload: any): Promise<any> { return {}; }
  private async optimizeContent(tenantId: string, contentId: string, optimizations: any): Promise<any> { return {}; }
  private async scheduleContent(tenantId: string, contentIds: string[], schedule: any): Promise<any> { return {}; }
  private async optimizeCampaign(tenantId: string, campaignId: string, optimizations: any): Promise<any> { return {}; }
  private async scheduleCampaign(tenantId: string, campaignId: string, schedule: any): Promise<any> { return {}; }
  private async sendBulkEmails(tenantId: string, payload: any): Promise<any> { return {}; }
  private async createEmailSequence(tenantId: string, payload: any): Promise<any> { return {}; }
  private async personalizeEmails(tenantId: string, emailIds: string[], personalization: any): Promise<any> { return {}; }
  private async createAdCampaign(tenantId: string, payload: any): Promise<any> { return {}; }
  private async optimizeAdBids(tenantId: string, campaignId: string): Promise<any> { return {}; }
  private async createAdAudience(tenantId: string, payload: any): Promise<any> { return {}; }
  private async discoverInfluencers(tenantId: string, criteria: any): Promise<any> { return {}; }
  private async createInfluencerCampaign(tenantId: string, payload: any): Promise<any> { return {}; }
  private async trackInfluencerPerformance(tenantId: string, campaignId: string): Promise<any> { return {}; }
  private async registerAffiliatePartner(tenantId: string, payload: any): Promise<any> { return {}; }
  private async createAffiliateLinks(tenantId: string, payload: any): Promise<any> { return {}; }
  private async calculateAffiliateCommissions(tenantId: string, period: any): Promise<any> { return {}; }
  private async analyzeSEOSite(tenantId: string, siteUrl: string): Promise<any> { return {}; }
  private async optimizeSEOContent(tenantId: string, contentId: string, keywords: string[]): Promise<any> { return {}; }
  private async buildSEOBacklinks(tenantId: string, payload: any): Promise<any> { return {}; }
  private async generateAnalyticsReport(tenantId: string, payload: any): Promise<any> { return {}; }
  private async calculateAttribution(tenantId: string, campaignId: string): Promise<any> { return {}; }
  private async createAnalyticsSnapshot(tenantId: string, payload: any): Promise<any> { return {}; }
}