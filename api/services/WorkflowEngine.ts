import { Queue } from 'bullmq';
import { AgentOrchestrator } from './AgentOrchestrator';

export interface WorkflowExecutionContext {
  workflowId: string;
  workflowRunId: string;
  tenant_id: string;
  steps: any[];
  triggerData?: any;
  completedSteps: Set<string>;
  failedSteps: Set<string>;
  stepResults: Map<string, any>;
  currentStepIndex: number;
}

export class WorkflowEngine {
  private agentOrchestrator: AgentOrchestrator;
  private workflowQueue: Queue;
  private activeExecutions: Map<string, WorkflowExecutionContext>;

  constructor(agentOrchestrator: AgentOrchestrator, workflowQueue: Queue) {
    this.agentOrchestrator = agentOrchestrator;
    this.workflowQueue = workflowQueue;
    this.activeExecutions = new Map();
  }

  async executeWorkflow(workflowId: string, workflowRunId: string, tenantId: string, steps: any[], triggerData?: any): Promise<void> {
    const context: WorkflowExecutionContext = {
      workflowId,
      workflowRunId,
      tenant_id: tenantId,
      steps,
      triggerData,
      completedSteps: new Set(),
      failedSteps: new Set(),
      stepResults: new Map(),
      currentStepIndex: 0
    };

    this.activeExecutions.set(workflowRunId, context);

    try {
      await this.processWorkflowSteps(context);
      
      // Mark workflow as completed
      await this.agentOrchestrator.supabase
        .from('workflow_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowRunId);

      this.activeExecutions.delete(workflowRunId);

    } catch (error) {
      console.error(`Workflow execution failed: ${workflowRunId}`, error);
      
      await this.agentOrchestrator.supabase
        .from('workflow_runs')
        .update({
          status: 'failed',
          error: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', workflowRunId);

      this.activeExecutions.delete(workflowRunId);
      throw error;
    }
  }

  private async processWorkflowSteps(context: WorkflowExecutionContext): Promise<void> {
    for (let i = 0; i < context.steps.length; i++) {
      const step = context.steps[i];
      context.currentStepIndex = i;

      // Check if step dependencies are met
      if (!await this.checkStepDependencies(step, context)) {
        console.log(`Step ${step.id} dependencies not met, skipping`);
        continue;
      }

      try {
        await this.executeStep(step, context);
        context.completedSteps.add(step.id);
        
        // Record step completion
        await this.recordStepCompletion(context, step, 'success');

      } catch (error) {
        console.error(`Step ${step.id} failed:`, error);
        context.failedSteps.add(step.id);
        
        await this.recordStepCompletion(context, step, 'failed', error.message);

        // Handle step failure based on workflow configuration
        if (step.continue_on_failure) {
          console.log(`Continuing workflow despite step ${step.id} failure`);
          continue;
        } else {
          throw new Error(`Workflow step ${step.id} failed: ${error.message}`);
        }
      }

      // Add delay between steps if configured
      if (step.delay_seconds) {
        await this.sleep(step.delay_seconds * 1000);
      }
    }
  }

  private async executeStep(step: any, context: WorkflowExecutionContext): Promise<any> {
    console.log(`Executing workflow step: ${step.id} (${step.agent_type}.${step.task_type})`);

    // Create agent task for this step
    const task = await this.agentOrchestrator.createTask({
      tenant_id: context.tenant_id,
      user_id: context.triggerData?.user_id || 'system',
      agent_type: step.agent_type,
      task_type: step.task_type,
      payload: {
        ...step.task_config,
        workflow_run_id: context.workflowRunId,
        step_id: step.id,
        previous_step_results: this.getPreviousStepResults(step, context)
      },
      priority: step.priority || 1,
      approval_required: step.approval_required || false
    });

    // Wait for task completion
    const result = await this.waitForTaskCompletion(task.id);
    
    // Store step result
    context.stepResults.set(step.id, result);
    
    return result;
  }

  private async checkStepDependencies(step: any, context: WorkflowExecutionContext): Promise<boolean> {
    if (!step.dependencies || step.dependencies.length === 0) {
      return true;
    }

    for (const dependency of step.dependencies) {
      if (!context.completedSteps.has(dependency)) {
        return false;
      }
    }

    return true;
  }

  private getPreviousStepResults(step: any, context: WorkflowExecutionContext): any {
    const results: any = {};
    
    if (step.dependencies) {
      for (const dep of step.dependencies) {
        if (context.stepResults.has(dep)) {
          results[dep] = context.stepResults.get(dep);
        }
      }
    }

    return results;
  }

  private async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const task = await this.agentOrchestrator.getTaskStatus(taskId);
      
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      switch (task.status) {
        case 'completed':
          return task.result;
        case 'failed':
          throw new Error(`Task failed: ${task.error}`);
        case 'cancelled':
          throw new Error('Task was cancelled');
        case 'pending':
          if (task.approval_required && !task.approved_by) {
            throw new Error('Task requires approval');
          }
          break;
      }

      await this.sleep(1000); // Check every second
    }

    throw new Error(`Task timeout after ${timeoutMs}ms`);
  }

  private async recordStepCompletion(context: WorkflowExecutionContext, step: any, status: string, error?: string): Promise<void> {
    await this.agentOrchestrator.supabase
      .from('workflow_step_runs')
      .insert({
        workflow_run_id: context.workflowRunId,
        step_id: step.id,
        step_name: step.name,
        status,
        error,
        completed_at: new Date().toISOString()
      });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async pauseWorkflow(workflowRunId: string): Promise<void> {
    const context = this.activeExecutions.get(workflowRunId);
    if (!context) {
      throw new Error(`Workflow execution ${workflowRunId} not found`);
    }

    // Update database status
    await this.agentOrchestrator.supabase
      .from('workflow_runs')
      .update({ status: 'paused' })
      .eq('id', workflowRunId);

    // Note: In a real implementation, you'd need to handle the actual pausing logic
    // This might involve cancelling queued tasks, etc.
  }

  async resumeWorkflow(workflowRunId: string): Promise<void> {
    const context = this.activeExecutions.get(workflowRunId);
    if (!context) {
      throw new Error(`Workflow execution ${workflowRunId} not found`);
    }

    // Update database status
    await this.agentOrchestrator.supabase
      .from('workflow_runs')
      .update({ status: 'running' })
      .eq('id', workflowRunId);

    // Resume from current step
    await this.processWorkflowSteps(context);
  }

  async cancelWorkflow(workflowRunId: string): Promise<void> {
    const context = this.activeExecutions.get(workflowRunId);
    if (!context) {
      throw new Error(`Workflow execution ${workflowRunId} not found`);
    }

    // Update database status
    await this.agentOrchestrator.supabase
      .from('workflow_runs')
      .update({ 
        status: 'cancelled',
        completed_at: new Date().toISOString()
      })
      .eq('id', workflowRunId);

    // Remove from active executions
    this.activeExecutions.delete(workflowRunId);

    // Cancel any pending tasks (implementation would depend on your task system)
  }

  getWorkflowStatus(workflowRunId: string): any {
    const context = this.activeExecutions.get(workflowRunId);
    if (!context) {
      return null;
    }

    return {
      workflowRunId,
      currentStepIndex: context.currentStepIndex,
      totalSteps: context.steps.length,
      completedSteps: Array.from(context.completedSteps),
      failedSteps: Array.from(context.failedSteps),
      progress: Math.round((context.completedSteps.size / context.steps.length) * 100)
    };
  }
}