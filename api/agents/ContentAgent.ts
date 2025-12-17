import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

export interface ContentRequest {
  brand_core_id: string;
  personas: Array<{
    id: string;
    name: string;
    characteristics: string[];
  }>;
  channels: string[];
  content_types: Array<{
    type: 'blog_post' | 'social_media' | 'video_script' | 'email' | 'ad_copy' | 'landing_page';
    count: number;
    specifications?: {
      length?: string;
      tone?: string;
      keywords?: string[];
      call_to_action?: string;
    };
  }>;
  topics?: string[];
  campaign_goals?: string[];
  seo_requirements?: {
    primary_keywords: string[];
    secondary_keywords: string[];
    meta_description?: string;
  };
}

export interface GeneratedContent {
  id: string;
  type: string;
  title: string;
  content: string;
  excerpt?: string;
  meta_description?: string;
  tags: string[];
  seo_score?: number;
  engagement_score?: number;
  variants?: Array<{
    id: string;
    title: string;
    content: string;
    reason: string;
  }>;
  multimedia_suggestions?: {
    images: string[];
    videos: string[];
    infographics: string[];
  };
  distribution_strategy?: {
    channels: string[];
    timing: string[];
    frequency: string;
  };
}

export class ContentAgent {
  private openai: OpenAI;
  private pinecone: Pinecone;
  private indexName: string;

  constructor(openai: OpenAI, pinecone: Pinecone, indexName: string) {
    this.openai = openai;
    this.pinecone = pinecone;
    this.indexName = indexName;
  }

  async generateContent(request: ContentRequest): Promise<GeneratedContent[]> {
    const generatedContent: GeneratedContent[] = [];

    for (const contentType of request.content_types) {
      for (let i = 0; i < contentType.count; i++) {
        const content = await this.generateContentPiece(request, contentType);
        generatedContent.push(content);
      }
    }

    return generatedContent;
  }

  private async generateContentPiece(request: ContentRequest, contentType: any): Promise<GeneratedContent> {
    const contentId = `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let prompt = '';
    let content = '';
    let title = '';
    let meta_description = '';

    switch (contentType.type) {
      case 'blog_post':
        const blogResult = await this.generateBlogPost(request, contentType);
        content = blogResult.content;
        title = blogResult.title;
        meta_description = blogResult.meta_description;
        break;
      
      case 'social_media':
        const socialResult = await this.generateSocialMediaPost(request, contentType);
        content = socialResult.content;
        title = socialResult.title;
        break;
      
      case 'email':
        const emailResult = await this.generateEmail(request, contentType);
        content = emailResult.content;
        title = emailResult.title;
        break;
      
      case 'ad_copy':
        const adResult = await this.generateAdCopy(request, contentType);
        content = adResult.content;
        title = adResult.title;
        break;
      
      case 'landing_page':
        const landingResult = await this.generateLandingPage(request, contentType);
        content = landingResult.content;
        title = landingResult.title;
        meta_description = landingResult.meta_description;
        break;
      
      default:
        content = 'Content generation for this type is not implemented yet.';
        title = 'Generated Content';
    }

    // Generate content variants for A/B testing
    const variants = await this.generateContentVariants(contentType.type, content, title);

    // Calculate SEO score if applicable
    const seo_score = contentType.type === 'blog_post' || contentType.type === 'landing_page' 
      ? await this.calculateSEOScore(content, request.seo_requirements)
      : undefined;

    // Generate multimedia suggestions
    const multimedia_suggestions = await this.generateMultimediaSuggestions(content, contentType.type);

    // Create distribution strategy
    const distribution_strategy = await this.createDistributionStrategy(contentType.type, request.channels);

    return {
      id: contentId,
      type: contentType.type,
      title,
      content,
      excerpt: content.substring(0, 200) + '...',
      meta_description,
      tags: this.extractKeywords(content),
      seo_score,
      variants,
      multimedia_suggestions,
      distribution_strategy
    };
  }

  private async generateBlogPost(request: ContentRequest, contentType: any): Promise<any> {
    const prompt = `
      Create a comprehensive blog post for a ${request.personas[0]?.name || 'business professional'} audience.
      
      Industry context: ${request.campaign_goals?.join(', ') || 'marketing automation'}
      Target personas: ${request.personas.map(p => p.name).join(', ')}
      Topics: ${request.topics?.join(', ') || 'marketing best practices'}
      Keywords: ${request.seo_requirements?.primary_keywords.join(', ') || 'marketing automation, business growth'}
      
      Specifications:
      - Length: ${contentType.specifications?.length || '1500-2000 words'}
      - Tone: ${contentType.specifications?.tone || 'professional, informative, engaging'}
      - Include relevant statistics and examples
      - Add clear subheadings and structure
      - Include a compelling introduction and conclusion
      - Add call-to-action at the end
      
      Make the content valuable, actionable, and optimized for search engines while maintaining readability.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert content writer who creates engaging, SEO-optimized blog posts that provide genuine value to readers while maintaining brand consistency and driving engagement.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content;
    
    // Extract title from the first heading or generate one
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : 'Marketing Automation Best Practices';
    
    // Generate meta description
    const meta_description = await this.generateMetaDescription(content);

    return {
      content,
      title,
      meta_description
    };
  }

  private async generateSocialMediaPost(request: ContentRequest, contentType: any): Promise<any> {
    const prompt = `
      Create engaging social media content for multiple platforms.
      
      Audience: ${request.personas[0]?.name || 'business professionals'}
      Topics: ${request.topics?.join(', ') || 'marketing automation'}
      Campaign goals: ${request.campaign_goals?.join(', ') || 'brand awareness, lead generation'}
      
      Create content for these platforms: ${request.channels.join(', ')}
      
      Requirements:
      - Platform-appropriate format and tone
      - Include relevant hashtags
      - Add engaging questions or calls-to-action
      - Consider character limits for each platform
      - Make content shareable and engaging
      - Include visual content suggestions
      
      Provide separate versions for each platform.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a social media marketing expert who creates platform-specific content that maximizes engagement and reach while maintaining brand consistency.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1000
    });

    return {
      content: response.choices[0].message.content,
      title: 'Social Media Campaign Content'
    };
  }

  private async generateEmail(request: ContentRequest, contentType: any): Promise<any> {
    const prompt = `
      Create a compelling marketing email.
      
      Audience: ${request.personas[0]?.name || 'business professionals'}
      Campaign goals: ${request.campaign_goals?.join(', ') || 'lead nurturing, conversion'}
      Call-to-action: ${contentType.specifications?.call_to_action || 'Schedule a demo'}
      
      Requirements:
      - Attention-grabbing subject line
      - Personalized greeting
      - Clear value proposition
      - Social proof or testimonials
      - Strong call-to-action
      - Professional yet friendly tone
      - Mobile-friendly formatting
      - Include P.S. section
      
      Make the email persuasive and actionable.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an email marketing expert who creates high-converting email campaigns that nurture leads and drive sales while maintaining authenticity and value.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return {
      content: response.choices[0].message.content,
      title: 'Marketing Email Campaign'
    };
  }

  private async generateAdCopy(request: ContentRequest, contentType: any): Promise<any> {
    const prompt = `
      Create compelling ad copy for multiple platforms.
      
      Audience: ${request.personas[0]?.name || 'business professionals'}
      Campaign goals: ${