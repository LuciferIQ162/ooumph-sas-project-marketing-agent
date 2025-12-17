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
      Campaign goals: ${request.campaign_goals?.join(', ') || 'lead generation, conversions'}
      Keywords: ${contentType.specifications?.keywords?.join(', ') || 'marketing automation, business growth'}
      
      Create ad copy for:
      - Google Ads (headlines and descriptions)
      - Facebook/Instagram Ads
      - LinkedIn Ads
      - Twitter Ads
      
      Requirements:
      - Platform-specific character limits
      - Include target keywords naturally
      - Strong value propositions
      - Clear calls-to-action
      - A/B test variations
      - Consider different ad formats
      
      Make the copy persuasive and conversion-focused.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a paid advertising expert who creates high-performing ad copy that maximizes click-through rates and conversions while maintaining platform compliance.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1200
    });

    return {
      content: response.choices[0].message.content,
      title: 'Multi-Platform Ad Copy'
    };
  }

  private async generateLandingPage(request: ContentRequest, contentType: any): Promise<any> {
    const prompt = `
      Create a high-converting landing page.
      
      Audience: ${request.personas[0]?.name || 'business professionals'}
      Campaign goals: ${request.campaign_goals?.join(', ') || 'lead generation, conversions'}
      Call-to-action: ${contentType.specifications?.call_to_action || 'Start free trial'}
      
      Include:
      - Compelling headline
      - Subheadline with value proposition
      - Benefits and features
      - Social proof elements
      - Clear call-to-action sections
      - Trust indicators
      - FAQ section
      - Multiple CTA placements
      
      Focus on conversion optimization and user experience.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a conversion rate optimization expert who creates landing pages that maximize conversions through persuasive copy, clear value propositions, and psychological triggers.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content;
    const meta_description = await this.generateMetaDescription(content);

    return {
      content,
      title: 'Landing Page - Marketing Automation Platform',
      meta_description
    };
  }

  private async generateContentVariants(type: string, originalContent: string, originalTitle: string): Promise<any[]> {
    const prompt = `
      Create 2-3 alternative versions of this ${type} for A/B testing.
      
      Original title: ${originalTitle}
      Original content preview: ${originalContent.substring(0, 300)}...
      
      Generate variations that test:
      - Different headlines/titles
      - Varying content structure
      - Different calls-to-action
      - Alternative value propositions
      - Different emotional appeals
      
      Provide the reason for each variation and what hypothesis it tests.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an A/B testing expert who creates strategic content variations that test specific hypotheses to improve conversion rates and engagement.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1000
    });

    // Parse the response to extract variants
    return [
      {
        id: `variant_${Date.now()}_1`,
        title: `${originalTitle} - Version B`,
        content: originalContent, // This would be parsed from the response
        reason: 'Testing more direct value proposition'
      }
    ];
  }

  private async calculateSEOScore(content: string, seoRequirements?: any): Promise<number> {
    // Simple SEO scoring based on keyword density, meta tags, etc.
    let score = 50; // Base score

    if (seoRequirements?.primary_keywords) {
      const keywordDensity = this.calculateKeywordDensity(content, seoRequirements.primary_keywords);
      if (keywordDensity > 0.01 && keywordDensity < 0.03) {
        score += 20;
      }
    }

    // Check for heading structure
    const headings = (content.match(/^#{1,6}\s+.+$/gm) || []).length;
    if (headings >= 3) score += 10;

    // Check for internal linking opportunities (simplified)
    if (content.includes('http')) score += 5;

    // Check for image alt text suggestions
    if (content.includes('![')) score += 5;

    return Math.min(score, 100);
  }

  private calculateKeywordDensity(content: string, keywords: string[]): number {
    const words = content.toLowerCase().split(/\s+/);
    const totalWords = words.length;
    
    let keywordCount = 0;
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      keywordCount += words.filter(word => word.includes(keywordLower)).length;
    });

    return keywordCount / totalWords;
  }

  private async generateMultimediaSuggestions(content: string, contentType: string): Promise<any> {
    const prompt = `
      Suggest relevant multimedia content for this ${contentType}:
      
      Content preview: ${content.substring(0, 500)}...
      
      Recommend:
      1. Image types and concepts
      2. Video content ideas
      3. Infographic topics
      4. Interactive elements
      5. Charts or graphs needed
      
      Make suggestions specific and actionable.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a multimedia content strategist who suggests complementary visual and interactive elements that enhance content engagement and comprehension.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    return {
      images: ['Professional business team', 'Marketing dashboard screenshot', 'Success metrics chart'],
      videos: ['Product demo video', 'Customer testimonial', 'How-to tutorial'],
      infographics: ['Marketing funnel visualization', 'ROI calculation guide', 'Industry statistics']
    };
  }

  private async createDistributionStrategy(contentType: string, channels: string[]): Promise<any> {
    const strategies: Record<string, any> = {
      'blog_post': {
        channels: ['Company blog', 'LinkedIn', 'Medium', 'Email newsletter'],
        timing: ['Publish immediately', 'Share on social 2 hours later', 'Email digest weekly'],
        frequency: 'Weekly'
      },
      'social_media': {
        channels: channels,
        timing: ['Post during peak hours', 'Engage with comments within 2 hours', 'Boost after 24 hours'],
        frequency: 'Daily'
      },
      'email': {
        channels: ['Email marketing platform'],
        timing: ['Send Tuesday-Thursday, 10am-2pm', 'Follow-up after 1 week'],
        frequency: 'Weekly'
      }
    };

    return strategies[contentType] || {
      channels: channels,
      timing: ['Publish immediately'],
      frequency: 'As needed'
    };
  }

  private async generateMetaDescription(content: string): Promise<string> {
    const prompt = `
      Create a compelling meta description (150-160 characters) for this content:
      
      ${content.substring(0, 1000)}...
      
      The meta description should:
      - Accurately summarize the content
      - Include relevant keywords
      - Encourage clicks
      - Stay within character limit
      - Be compelling and actionable
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an SEO expert who creates compelling meta descriptions that improve click-through rates from search results.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 100
    });

    return response.choices[0].message.content.substring(0, 160);
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - in a real implementation, you'd use more sophisticated NLP
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq: Record<string, number> = {};
    
    words.forEach(word => {
      if (word.length > 4 && !this.isStopWord(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'];
    return stopWords.includes(word);
  }

  async optimizeContent(content: string, optimizations: {
    seo_improvements?: boolean;
    readability_enhancements?: boolean;
    engagement_boosters?: boolean;
    brand_alignment?: boolean;
  }): Promise<{
    optimized_content: string;
    improvements: string[];
    before_score: number;
    after_score: number;
  }> {
    const improvements: string[] = [];
    let optimizedContent = content;

    if (optimizations.seo_improvements) {
      // Add SEO improvements
      optimizedContent = await this.addSEOImprovements(optimizedContent);
      improvements.push('Added SEO optimizations');
    }

    if (optimizations.readability_enhancements) {
      // Improve readability
      optimizedContent = await this.improveReadability(optimizedContent);
      improvements.push('Enhanced readability');
    }

    if (optimizations.engagement_boosters) {
      // Add engagement elements
      optimizedContent = await this.addEngagementBoosters(optimizedContent);
      improvements.push('Added engagement boosters');
    }

    if (optimizations.brand_alignment) {
      // Align with brand voice
      optimizedContent = await this.alignWithBrandVoice(optimizedContent);
      improvements.push('Aligned with brand voice');
    }

    return {
      optimized_content: optimizedContent,
      improvements,
      before_score: 70, // This would be calculated
      after_score: 85   // This would be calculated
    };
  }

  private async addSEOImprovements(content: string): Promise<string> {
    // Add meta descriptions, optimize headings, etc.
    return content; // Implementation would add actual SEO improvements
  }

  private async improveReadability(content: string): Promise<string> {
    // Simplify complex sentences, add transitions, etc.
    return content; // Implementation would improve readability
  }

  private async addEngagementBoosters(content: string): Promise<string> {
    // Add questions, interactive elements, etc.
    return content; // Implementation would add engagement elements
  }

  private async alignWithBrandVoice(content: string): Promise<string> {
    // Adjust tone, terminology, etc.
    return content; // Implementation would align with brand voice
  }
}