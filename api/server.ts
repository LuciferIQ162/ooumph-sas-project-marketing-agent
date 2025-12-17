import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';
import Redis from 'ioredis';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker, QueueScheduler } from 'bullmq';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
  environment: process.env.PINECONE_ENVIRONMENT!
});

const redis = new Redis(process.env.REDIS_URL!);

// BullMQ queues for agent orchestration
const agentQueue = new Queue('agent-tasks', { connection: redis });
const eventQueue = new Queue('events', { connection: redis });
const workflowQueue = new Queue('workflows', { connection: redis });

// Bull Board for monitoring queues
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(agentQueue),
    new BullMQAdapter(eventQueue),
    new BullMQAdapter(workflowQueue)
  ],
  serverAdapter
});

app.use('/admin/queues', serverAdapter.getRouter());

// Multi-tenant middleware
const requireTenant = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const { data: user, error } = await supabase
      .from('users')
      .select('*, tenants(*)')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    req.tenant = user.tenants;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, tenant_name } = req.body;
    
    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({ name: tenant_name, slug: tenant_name.toLowerCase().replace(/\s+/g, '-') })
      .select()
      .single();

    if (tenantError) throw tenantError;

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password: hashedPassword,
        name,
        tenant_id: tenant.id,
        role: 'tenant_admin'
      })
      .select()
      .single();

    if (userError) throw userError;

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({ user, token, tenant });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*, tenants(*)')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({ user, token, tenant: user.tenants });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Agent orchestration endpoints
app.post('/api/agents/branding/propose', requireTenant, async (req, res) => {
  try {
    const { goals, industry, competitors } = req.body;
    
    const job = await agentQueue.add('branding-propose', {
      tenant_id: req.tenant.id,
      user_id: req.user.id,
      goals,
      industry,
      competitors,
      timestamp: new Date().toISOString()
    });

    res.json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/content/generate', requireTenant, async (req, res) => {
  try {
    const { brand_core_id, personas, channels, content_types } = req.body;
    
    const job = await agentQueue.add('content-generate', {
      tenant_id: req.tenant.id,
      user_id: req.user.id,
      brand_core_id,
      personas,
      channels,
      content_types,
      timestamp: new Date().toISOString()
    });

    res.json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/campaigns/create', requireTenant, async (req, res) => {
  try {
    const { strategy, budget, channels, timeline } = req.body;
    
    const job = await workflowQueue.add('campaign-create', {
      tenant_id: req.tenant.id,
      user_id: req.user.id,
      strategy,
      budget,
      channels,
      timeline,
      timestamp: new Date().toISOString()
    });

    res.json({ jobId: job.id, status: 'queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Workflow orchestration
app.post('/api/workflows/create', requireTenant, async (req, res) => {
  try {
    const { name, description, steps, triggers } = req.body;
    
    const { data: workflow, error } = await supabase
      .from('workflows')
      .insert({
        tenant_id: req.tenant.id,
        name,
        description,
        steps,
        triggers,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;

    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics endpoints
app.get('/api/analytics/snapshots', requireTenant, async (req, res) => {
  try {
    const { start_date, end_date, dimension } = req.query;
    
    const { data, error } = await supabase
      .from('analytics_snapshots')
      .select('*')
      .eq('tenant_id', req.tenant.id)
      .gte('created_at', start_date)
      .lte('created_at', end_date)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Event tracking
app.post('/api/events/track', async (req, res) => {
  try {
    const { event_type, properties, context } = req.body;
    
    await eventQueue.add('track-event', {
      event_type,
      properties,
      context,
      timestamp: new Date().toISOString()
    });

    res.json({ status: 'tracked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      supabase: !!supabase,
      pinecone: !!pinecone,
      redis: redis.status
    }
  });
});

// Worker definitions
const brandingWorker = new Worker('agent-tasks', async (job) => {
  console.log(`Processing branding job ${job.id}`);
  // Implement branding agent logic here
}, { connection: redis });

const contentWorker = new Worker('agent-tasks', async (job) => {
  console.log(`Processing content job ${job.id}`);
  // Implement content generation logic here
}, { connection: redis });

const eventWorker = new Worker('events', async (job) => {
  console.log(`Processing event ${job.id}`);
  // Implement event tracking logic here
}, { connection: redis });

const workflowWorker = new Worker('workflows', async (job) => {
  console.log(`Processing workflow ${job.id}`);
  // Implement workflow orchestration logic here
}, { connection: redis });

app.listen(PORT, () => {
  console.log(`🚀 Agentic Marketing SaaS server running on port ${PORT}`);
  console.log(`📊 Queue monitoring available at http://localhost:${PORT}/admin/queues`);
});