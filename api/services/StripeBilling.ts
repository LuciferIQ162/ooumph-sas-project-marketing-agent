import Stripe from 'stripe';
import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    campaigns: number;
    content: number;
    emails: number;
    adSpend: number;
    agents: number;
    storage: number;
  };
}

export interface UsageMetrics {
  campaigns: number;
  content: number;
  emails: number;
  adSpend: number;
  storage: number;
  agents: number;
}

export class StripeBillingService {
  private readonly CACHE_TTL = 3600; // 1 hour

  async createCustomer(tenantId: string, email: string, name: string) {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          tenantId,
        },
      });

      await supabase
        .from('tenants')
        .update({ stripe_customer_id: customer.id })
        .eq('id', tenantId);

      logger.info('Stripe customer created', { tenantId, customerId: customer.id });
      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', { tenantId, error });
      throw error;
    }
  }

  async createSubscription(tenantId: string, planId: string, priceId: string) {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('stripe_customer_id')
        .eq('id', tenantId)
        .single();

      if (!tenant?.stripe_customer_id) {
        throw new Error('Customer not found');
      }

      const subscription = await stripe.subscriptions.create({
        customer: tenant.stripe_customer_id,
        items: [{ price: priceId }],
        metadata: {
          tenantId,
          planId,
        },
      });

      await supabase.from('subscriptions').insert({
        tenant_id: tenantId,
        stripe_subscription_id: subscription.id,
        plan_id: planId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      });

      logger.info('Subscription created', { tenantId, subscriptionId: subscription.id });
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { tenantId, planId, error });
      throw error;
    }
  }

  async updateSubscription(tenantId: string, newPlanId: string, newPriceId: string) {
    try {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (!subscription?.stripe_subscription_id) {
        throw new Error('Active subscription not found');
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(
        subscription.stripe_subscription_id
      );

      const updatedSubscription = await stripe.subscriptions.update(
        subscription.stripe_subscription_id,
        {
          items: [{
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          }],
          metadata: {
            tenantId,
            planId: newPlanId,
          },
        }
      );

      await supabase
        .from('subscriptions')
        .update({
          plan_id: newPlanId,
          status: updatedSubscription.status,
          updated_at: new Date(),
        })
        .eq('tenant_id', tenantId);

      logger.info('Subscription updated', { tenantId, newPlanId });
      return updatedSubscription;
    } catch (error) {
      logger.error('Failed to update subscription', { tenantId, newPlanId, error });
      throw error;
    }
  }

  async cancelSubscription(tenantId: string) {
    try {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (!subscription?.stripe_subscription_id) {
        throw new Error('Active subscription not found');
      }

      const canceledSubscription = await stripe.subscriptions.cancel(
        subscription.stripe_subscription_id
      );

      await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: new Date(),
          updated_at: new Date(),
        })
        .eq('tenant_id', tenantId);

      logger.info('Subscription canceled', { tenantId });
      return canceledSubscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', { tenantId, error });
      throw error;
    }
  }

  async trackUsage(tenantId: string, metric: string, value: number = 1) {
    try {
      const key = `usage:${tenantId}:${metric}:${new Date().toISOString().slice(0, 7)}`;
      
      await redis.incrby(key, value);
      await redis.expire(key, 2592000); // 30 days

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_id, current_period_start, current_period_end')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (subscription) {
        await this.checkUsageLimits(tenantId, subscription.plan_id);
      }

      logger.info('Usage tracked', { tenantId, metric, value });
    } catch (error) {
      logger.error('Failed to track usage', { tenantId, metric, value, error });
      throw error;
    }
  }

  async checkUsageLimits(tenantId: string, planId: string) {
    try {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('limits')
        .eq('id', planId)
        .single();

      if (!plan?.limits) return;

      const currentMonth = new Date().toISOString().slice(0, 7);
      const usage = await this.getCurrentUsage(tenantId, currentMonth);

      const overages: string[] = [];

      if (usage.campaigns > plan.limits.campaigns) {
        overages.push('campaigns');
      }
      if (usage.content > plan.limits.content) {
        overages.push('content');
      }
      if (usage.emails > plan.limits.emails) {
        overages.push('emails');
      }
      if (usage.agents > plan.limits.agents) {
        overages.push('agents');
      }
      if (usage.storage > plan.limits.storage) {
        overages.push('storage');
      }

      if (overages.length > 0) {
        await this.handleOverage(tenantId, overages, usage, plan.limits);
      }
    } catch (error) {
      logger.error('Failed to check usage limits', { tenantId, planId, error });
      throw error;
    }
  }

  async getCurrentUsage(tenantId: string, period: string): Promise<UsageMetrics> {
    try {
      const keys = [
        `usage:${tenantId}:campaigns:${period}`,
        `usage:${tenantId}:content:${period}`,
        `usage:${tenantId}:emails:${period}`,
        `usage:${tenantId}:ad_spend:${period}`,
        `usage:${tenantId}:storage:${period}`,
        `usage:${tenantId}:agents:${period}`,
      ];

      const values = await redis.mget(...keys);

      return {
        campaigns: parseInt(values[0] || '0'),
        content: parseInt(values[1] || '0'),
        emails: parseInt(values[2] || '0'),
        adSpend: parseFloat(values[3] || '0'),
        storage: parseInt(values[4] || '0'),
        agents: parseInt(values[5] || '0'),
      };
    } catch (error) {
      logger.error('Failed to get current usage', { tenantId, period, error });
      throw error;
    }
  }

  async handleOverage(tenantId: string, overages: string[], usage: UsageMetrics, limits: any) {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('email, name')
        .eq('id', tenantId)
        .single();

      const overageDetails = overages.map(metric => ({
        metric,
        used: usage[metric as keyof UsageMetrics],
        limit: limits[metric],
        overage: (usage[metric as keyof UsageMetrics] as number) - limits[metric],
      }));

      await supabase.from('usage_overages').insert({
        tenant_id: tenantId,
        overage_details: overageDetails,
        created_at: new Date(),
      });

      logger.warn('Usage overages detected', { tenantId, overages, usage, limits });
    } catch (error) {
      logger.error('Failed to handle overage', { tenantId, overages, error });
      throw error;
    }
  }

  async createPaymentIntent(tenantId: string, amount: number, currency: string = 'usd') {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('stripe_customer_id')
        .eq('id', tenantId)
        .single();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        customer: tenant?.stripe_customer_id,
        metadata: {
          tenantId,
        },
      });

      logger.info('Payment intent created', { tenantId, amount, paymentIntentId: paymentIntent.id });
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create payment intent', { tenantId, amount, error });
      throw error;
    }
  }

  async handleWebhook(payload: Buffer, signature: string) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      logger.info('Stripe webhook received', { type: event.type });

      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        default:
          logger.info('Unhandled webhook event', { type: event.type });
      }

      return { received: true };
    } catch (error) {
      logger.error('Webhook error', { error });
      throw error;
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata.tenantId;
    if (!tenantId) return;

    logger.info('Subscription created via webhook', { tenantId, subscriptionId: subscription.id });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata.tenantId;
    if (!tenantId) return;

    await supabase
      .from('subscriptions')
      .update({
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000),
        current_period_end: new Date(subscription.current_period_end * 1000),
        updated_at: new Date(),
      })
      .eq('tenant_id', tenantId);

    logger.info('Subscription updated via webhook', { tenantId, subscriptionId: subscription.id });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata.tenantId;
    if (!tenantId) return;

    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date(),
        updated_at: new Date(),
      })
      .eq('tenant_id', tenantId);

    logger.info('Subscription canceled via webhook', { tenantId, subscriptionId: subscription.id });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const tenantId = invoice.metadata?.tenantId;
    if (!tenantId) return;

    await supabase.from('payments').insert({
      tenant_id: tenantId,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: 'succeeded',
      created_at: new Date(),
    });

    logger.info('Payment succeeded via webhook', { tenantId, invoiceId: invoice.id });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const tenantId = invoice.metadata?.tenantId;
    if (!tenantId) return;

    await supabase.from('payments').insert({
      tenant_id: tenantId,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      status: 'failed',
      created_at: new Date(),
    });

    logger.warn('Payment failed via webhook', { tenantId, invoiceId: invoice.id });
  }

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      const cacheKey = 'subscription_plans';
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('active', true)
        .order('price', { ascending: true });

      if (plans) {
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(plans));
      }

      return plans || [];
    } catch (error) {
      logger.error('Failed to get subscription plans', { error });
      throw error;
    }
  }

  async getSubscriptionStatus(tenantId: string) {
    try {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_plans (*)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .single();

      if (!subscription) {
        return { status: 'inactive' };
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      const usage = await this.getCurrentUsage(tenantId, currentMonth);

      return {
        status: subscription.status,
        plan: subscription.subscription_plans,
        currentPeriod: {
          start: subscription.current_period_start,
          end: subscription.current_period_end,
        },
        usage,
      };
    } catch (error) {
      logger.error('Failed to get subscription status', { tenantId, error });
      throw error;
    }
  }
}

export const stripeBilling = new StripeBillingService();