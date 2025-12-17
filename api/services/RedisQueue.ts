import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { EventStream, MarketingEvent } from './EventStream';

export interface QueueJob {
  id?: string;
  tenant_id: string;
  user_id: string;
  agent_type: string;
  task_type: string;
  payload: any;
  priority: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

export interface QueueConfig {
  name: string;
  concurrency?: number;
  defaultJobOptions?: {
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    attempts?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
  };
}

export class RedisQueue {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private eventStream: EventStream;

  constructor(redis: Redis, eventStream: EventStream) {
    this.redis = redis;
    this.eventStream = eventStream;
  }

  async createQueue(config: QueueConfig): Promise<Queue> {
    const queue = new Queue(config.name, {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        ...config.defaultJobOptions,
      },
    });

    this.queues.set(config.name, queue);
    return queue;
  }

  async createWorker(queueName: string, processor: (job: Job) => Promise<any>, concurrency: number = 5): Promise<Worker> {
    const worker = new Worker(queueName, processor, {
      connection: this.redis,
      concurrency,
    });

    // Set up event listeners
    worker.on('completed', async (job: Job) => {
      console.log(`Job ${job.id} completed`);
      
      // Track completion event
      await this.eventStream.trackEvent({
        tenant_id: job.data.tenant_id,
        event_type: 'job_completed',
        user_id: job.data.user_id,
        properties: {
          job_id: job.id,
          queue_name: queueName,
          agent_type: job.data.agent_type,
          task_type: job.data.task_type,
          processing_time: Date.now() - job.timestamp,
        },
        context: {
          timestamp: new Date().toISOString(),
        },
        occurred_at: new Date().toISOString(),
      });
    });

    worker.on('failed', async (job: Job | undefined, err: Error) => {
      console.error(`Job ${job?.id} failed:`, err);
      
      if (job) {
        // Track failure event
        await this.eventStream.trackEvent({
          tenant_id: job.data.tenant_id,
          event_type: 'job_failed',
          user_id: job.data.user_id,
          properties: {
            job_id: job.id,
            queue_name: queueName,
            agent_type: job.data.agent_type,
            task_type: job.data.task_type,
            error: err.message,
            attempts: job.attemptsMade,
          },
          context: {
            timestamp: new Date().toISOString(),
          },
          occurred_at: new Date().toISOString(),
        });
      }
    });

    worker.on('progress', async (job: Job, progress: number | object) => {
      console.log(`Job ${job.id} progress:`, progress);
      
      // Track progress event
      await this.eventStream.trackEvent({
        tenant_id: job.data.tenant_id,
        event_type: 'job_progress',
        user_id: job.data.user_id,
        properties: {
          job_id: job.id,
          queue_name: queueName,
          agent_type: job.data.agent_type,
          task_type: job.data.task_type,
          progress,
        },
        context: {
          timestamp: new Date().toISOString(),
        },
        occurred_at: new Date().toISOString(),
      });
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  async addJob(queueName: string, jobData: QueueJob, options: any = {}): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobData.task_type, jobData, {
      priority: jobData.priority,
      delay: jobData.delay,
      attempts: jobData.attempts,
      backoff: jobData.backoff,
      ...options,
    });

    // Track job creation event
    await this.eventStream.trackEvent({
      tenant_id: jobData.tenant_id,
      event_type: 'job_created',
      user_id: jobData.user_id,
      properties: {
        job_id: job.id,
        queue_name: queueName,
        agent_type: jobData.agent_type,
        task_type: jobData.task_type,
        priority: jobData.priority,
        delay: jobData.delay,
      },
      context: {
        timestamp: new Date().toISOString(),
      },
      occurred_at: new Date().toISOString(),
    });

    return job;
  }

  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      status: job.status,
      data: job.data,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      finishedAt: job.finishedAt,
      failedReason: job.failedReason,
    };
  }

  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
  }

  async cleanQueue(queueName: string, status: 'completed' | 'failed' | 'waiting' | 'delayed', limit: number = 100): Promise<string[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    return await queue.clean(limit, status);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }

  async getAllJobs(queueName: string, status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'): Promise<Job[]> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    switch (status) {
      case 'waiting':
        return await queue.getWaiting();
      case 'active':
        return await queue.getActive();
      case 'completed':
        return await queue.getCompleted();
      case 'failed':
        return await queue.getFailed();
      case 'delayed':
        return await queue.getDelayed();
      case 'paused':
        return await queue.getPaused();
      default:
        return [];
    }
  }

  async getQueueMetrics(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const stats = await this.getQueueStats(queueName);
    const jobs = await queue.getJobs(['completed', 'failed'], 0, 100);
    
    const processingTimes = jobs
      .filter(job => job.finishedAt && job.processedAt)
      .map(job => job.finishedAt!.getTime() - job.processedAt!.getTime());
    
    const avgProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0;

    return {
      ...stats,
      avgProcessingTime,
      successRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      failureRate: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0,
    };
  }

  async close(): Promise<void> {
    // Close all workers
    const workerPromises = Array.from(this.workers.values()).map(worker => worker.close());
    await Promise.all(workerPromises);

    // Close all queues
    const queuePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(queuePromises);
  }

  // Agent-specific queue methods
  async createAgentTask(agentType: string, taskData: QueueJob): Promise<Job> {
    const queueName = `agent-${agentType}`;
    
    // Create queue if it doesn't exist
    if (!this.queues.has(queueName)) {
      await this.createQueue({
        name: queueName,
        concurrency: 5,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });
    }

    return await this.addJob(queueName, taskData);
  }

  async getAgentMetrics(agentType: string, tenantId: string): Promise<any> {
    const queueName = `agent-${agentType}`;
    const stats = await this.getQueueStats(queueName);
    
    // Get tenant-specific metrics from Redis
    const tenantMetrics = await this.redis.hgetall(`agent_metrics:${tenantId}:${agentType}`);
    
    return {
      queueStats: stats,
      tenantMetrics: {
        totalTasks: parseInt(tenantMetrics.total_tasks) || 0,
        completedTasks: parseInt(tenantMetrics.completed_tasks) || 0,
        failedTasks: parseInt(tenantMetrics.failed_tasks) || 0,
        avgProcessingTime: parseFloat(tenantMetrics.avg_processing_time) || 0,
        successRate: parseFloat(tenantMetrics.success_rate) || 0,
        lastActivity: tenantMetrics.last_activity,
      },
    };
  }

  async updateAgentMetrics(agentType: string, tenantId: string, metrics: any): Promise<void> {
    const key = `agent_metrics:${tenantId}:${agentType}`;
    const pipeline = this.redis.pipeline();
    
    Object.entries(metrics).forEach(([field, value]) => {
      pipeline.hset(key, field, String(value));
    });
    
    pipeline.hset(key, 'last_updated', new Date().toISOString());
    pipeline.expire(key, 86400 * 30); // Keep for 30 days
    
    await pipeline.exec();
  }
}