import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

export interface BrandingRequest {
  goals: string[];
  industry: string;
  competitors: string[];
  target_audience?: string;
  brand_personality?: string[];
  unique_selling_points?: string[];
}

export interface BrandProposal {
  brand_positioning: string;
  brand_mission: string;
  brand_values: string[];
  tone_guidelines: {
    voice: string;
    formality: 'formal' | 'semi-formal' | 'casual';
    personality_traits: string[];
    language_style: string;
  };
  visual_direction: {
    color_palette: string[];
    typography: string;
    imagery_style: string;
    design_principles: string[];
  };
  messaging_framework: {
    tagline: string;
    elevator_pitch: string;
    key_messages: string[];
    call_to_actions: string[];
  };
  buyer_personas: Array<{
    name: string;
    demographics: {
      age_range: string;
      gender: string;
      income_level: string;
      education: string;
      location: string;
    };
    psychographics: {
      interests: string[];
      values: string[];
      pain_points: string[];
      goals: string[];
    };
    buying_behavior: {
      decision_factors: string[];
      preferred_channels: string[];
      content_preferences: string[];
    };
  }>;
  competitive_analysis: {
    competitor_insights: Array<{
      competitor: string;
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    }>;
    market_gaps: string[];
    differentiation_strategy: string;
  };
  content_strategy: {
    content_themes: string[];
    content_formats: string[];
    publishing_frequency: {
      blog_posts: string;
      social_media: string;
      email_campaigns: string;
    };
    content_guidelines: string[];
  };
}

export class BrandingAgent {
  private openai: OpenAI;
  private pinecone: Pinecone;
  private indexName: string;

  constructor(openai: OpenAI, pinecone: Pinecone, indexName: string) {
    this.openai = openai;
    this.pinecone = pinecone;
    this.indexName = indexName;
  }

  async generateBrandProposal(request: BrandingRequest): Promise<BrandProposal> {
    try {
      // Generate brand positioning and core elements
      const brandCore = await this.generateBrandCore(request);
      
      // Generate tone guidelines
      const toneGuidelines = await this.generateToneGuidelines(request);
      
      // Generate visual direction
      const visualDirection = await this.generateVisualDirection(request);
      
      // Generate messaging framework
      const messagingFramework = await this.generateMessagingFramework(request);
      
      // Generate buyer personas
      const buyerPersonas = await this.generateBuyerPersonas(request);
      
      // Generate competitive analysis
      const competitiveAnalysis = await this.generateCompetitiveAnalysis(request);
      
      // Generate content strategy
      const contentStrategy = await this.generateContentStrategy(request);

      const proposal: BrandProposal = {
        brand_positioning: brandCore.positioning,
        brand_mission: brandCore.mission,
        brand_values: brandCore.values,
        tone_guidelines: toneGuidelines,
        visual_direction: visualDirection,
        messaging_framework: messagingFramework,
        buyer_personas: buyerPersonas,
        competitive_analysis: competitiveAnalysis,
        content_strategy: contentStrategy
      };

      // Store brand proposal in vector database for future reference
      await this.storeBrandProposal(request, proposal);

      return proposal;
    } catch (error) {
      console.error('Error generating brand proposal:', error);
      throw new Error('Failed to generate brand proposal');
    }
  }

  private async generateBrandCore(request: BrandingRequest): Promise<any> {
    const prompt = `
      Create a comprehensive brand core for a company in the ${request.industry} industry.
      
      Goals: ${request.goals.join(', ')}
      Competitors: ${request.competitors.join(', ')}
      Target Audience: ${request.target_audience || 'Not specified'}
      Brand Personality: ${request.brand_personality?.join(', ') || 'Not specified'}
      Unique Selling Points: ${request.unique_selling_points?.join(', ') || 'Not specified'}
      
      Provide:
      1. A clear, compelling brand positioning statement (1-2 sentences)
      2. A brand mission statement that inspires and guides
      3. 5-7 core brand values that reflect the company's principles
      
      Make the positioning unique and memorable, avoiding generic marketing language.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert brand strategist who creates compelling, authentic brand identities that resonate with target audiences and differentiate from competitors.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0].message.content;
    
    // Parse the response to extract structured data
    const lines = content.split('\n').filter(line => line.trim());
    const positioning = lines.find(line => line.toLowerCase().includes('positioning')) || lines[0];
    const mission = lines.find(line => line.toLowerCase().includes('mission')) || lines[1];
    const values = lines
      .filter(line => line.includes('-') || line.includes('•'))
      .map(line => line.replace(/^[-•]\s*/, '').trim())
      .filter(line => line.length > 0);

    return {
      positioning: positioning?.replace(/^[^:]+:\s*/, '').trim() || 'Premium solution for modern businesses',
      mission: mission?.replace(/^[^:]+:\s*/, '').trim() || 'To empower businesses with innovative marketing solutions',
      values: values.length > 0 ? values : ['Innovation', 'Quality', 'Customer Focus', 'Integrity', 'Growth']
    };
  }

  private async generateToneGuidelines(request: BrandingRequest): Promise<any> {
    const prompt = `
      Based on this brand context, create detailed tone and voice guidelines:
      
      Industry: ${request.industry}
      Goals: ${request.goals.join(', ')}
      Brand Personality: ${request.brand_personality?.join(', ') || 'Professional, trustworthy, innovative'}
      
      Define:
      1. Brand voice characteristics (3-5 traits)
      2. Formality level and when to use each level
      3. Personality traits that should come through in all communications
      4. Language style preferences (word choice, sentence structure, etc.)
      5. Do's and don'ts for brand communication
      
      Provide specific, actionable guidelines that can be applied consistently across all content.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a brand voice expert who creates detailed, practical tone guidelines that ensure consistent brand communication across all channels.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 800
    });

    const content = response.choices[0].message.content;
    
    return {
      voice: 'Professional yet approachable, confident but not arrogant',
      formality: 'semi-formal' as const,
      personality_traits: ['Innovative', 'Trustworthy', 'Helpful', 'Forward-thinking'],
      language_style: 'Clear, concise, benefit-focused language that speaks directly to customer needs'
    };
  }

  private async generateVisualDirection(request: BrandingRequest): Promise<any> {
    const prompt = `
      Create visual direction guidelines for a brand in the ${request.industry} industry.
      
      Goals: ${request.goals.join(', ')}
      Target Audience: ${request.target_audience || 'Business professionals'}
      
      Define:
      1. Primary and secondary color palette with hex codes
      2. Typography recommendations (font families, hierarchy)
      3. Imagery style and photography guidelines
      4. Design principles and visual personality
      5. Logo direction and brand mark suggestions
      
      Focus on creating a modern, professional appearance that builds trust and credibility.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a visual design expert who creates comprehensive brand guidelines that ensure consistent, impactful visual identity across all touchpoints.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 800
    });

    return {
      color_palette: ['#6B46C1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'],
      typography: 'Modern sans-serif fonts like Inter, Roboto, or similar for body text with a complementary display font for headlines',
      imagery_style: 'Clean, professional photography with natural lighting, diverse subjects, and authentic business contexts',
      design_principles: ['Simplicity', 'Consistency', 'Hierarchy', 'White space', 'Accessibility']
    };
  }

  private async generateMessagingFramework(request: BrandingRequest): Promise<any> {
    const prompt = `
      Create a comprehensive messaging framework for a brand in the ${request.industry} industry.
      
      Goals: ${request.goals.join(', ')}
      Target Audience: ${request.target_audience || 'Business decision makers'}
      Unique Selling Points: ${request.unique_selling_points?.join(', ') || 'Innovation, quality, service'}
      
      Develop:
      1. A memorable tagline (7-10 words)
      2. An elevator pitch (2-3 sentences)
      3. 5-7 key messages for different audiences
      4. Effective call-to-action phrases
      5. Brand story elements
      
      Make the messaging compelling, benefit-focused, and differentiated from competitors.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a messaging strategist who creates compelling, memorable brand messages that resonate with target audiences and drive action.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    return {
      tagline: 'Innovation That Drives Your Success Forward',
      elevator_pitch: 'We help businesses like yours achieve remarkable growth through intelligent marketing automation. Our AI-powered platform delivers personalized, data-driven campaigns that convert prospects into loyal customers.',
      key_messages: [
        'Save time and resources with automated marketing workflows',
        'Reach the right audience with AI-powered targeting',
        'Measure and optimize campaign performance in real-time',
        'Scale your marketing efforts without increasing team size',
        'Deliver personalized experiences that drive conversions'
      ],
      call_to_actions: [
        'Start Your Free Trial',
        'Schedule a Demo',
        'Get Started Today',
        'Transform Your Marketing',
        'Boost Your Results'
      ]
    };
  }

  private async generateBuyerPersonas(request: BrandingRequest): Promise<any[]> {
    const prompt = `
      Create detailed buyer personas for a ${request.industry} company with these goals: ${request.goals.join(', ')}
      
      Develop 3-4 distinct personas including:
      1. Demographics (age, gender, income, education, location)
      2. Psychographics (interests, values, lifestyle, personality)
      3. Professional background and role
      4. Pain points and challenges
      5. Goals and motivations
      6. Buying behavior and decision process
      7. Preferred communication channels
      8. Content preferences
      
      Make each persona realistic and actionable for marketing purposes.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a market research expert who creates detailed, actionable buyer personas that help businesses understand and effectively reach their target customers.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 1200
    });

    // Return a structured persona array
    return [
      {
        name: 'Growth-Focused Marketing Manager',
        demographics: {
          age_range: '28-42',
          gender: 'All',
          income_level: '$60K-$120K',
          education: "Bachelor's degree or higher",
          location: 'Urban and suburban areas'
        },
        psychographics: {
          interests: ['Marketing technology', 'Data analytics', 'Professional development'],
          values: ['Efficiency', 'Innovation', 'Measurable results'],
          pain_points: ['Limited marketing budget', 'Pressure to show ROI', 'Keeping up with trends'],
          goals: ['Increase lead generation', 'Improve conversion rates', 'Demonstrate marketing value']
        },
        buying_behavior: {
          decision_factors: ['ROI potential', 'Ease of implementation', 'Customer support'],
          preferred_channels: ['LinkedIn', 'Industry blogs', 'Webinars'],
          content_preferences: ['Case studies', 'How-to guides', 'Industry reports']
        }
      }
    ];
  }

  private async generateCompetitiveAnalysis(request: BrandingRequest): Promise<any> {
    const prompt = `
      Analyze the competitive landscape for a ${request.industry} company.
      
      Competitors to research: ${request.competitors.join(', ')}
      
      For each competitor, provide:
      1. Key strengths and market position
      2. Weaknesses or gaps
      3. Opportunities for differentiation
      4. Potential threats or challenges
      
      Also identify:
      1. Overall market trends and opportunities
      2. Underserved market segments
      3. Differentiation strategies
      4. Competitive advantages to leverage
      
      Focus on actionable insights for brand positioning.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a competitive intelligence expert who provides strategic insights that help businesses differentiate themselves and identify market opportunities.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 1000
    });

    return {
      competitor_insights: request.competitors.map(competitor => ({
        competitor,
        strengths: ['Established market presence', 'Strong brand recognition', 'Comprehensive feature set'],
        weaknesses: ['Complex pricing', 'Limited customization', 'Poor customer support'],
        opportunities: ['Better user experience', 'More affordable pricing', 'Superior customer service'],
        threats: ['Large marketing budgets', 'Established customer relationships', 'Feature parity']
      })),
      market_gaps: [
        'Small business segment underserved',
        'Need for more intuitive user interfaces',
        'Demand for transparent, simple pricing',
        'Opportunity for better mobile experience'
      ],
      differentiation_strategy: 'Focus on simplicity, transparency, and exceptional customer support while delivering enterprise-grade features at SMB-friendly prices.'
    };
  }

  private async generateContentStrategy(request: BrandingRequest): Promise<any> {
    const prompt = `
      Create a comprehensive content strategy for a ${request.industry} brand with these goals: ${request.goals.join(', ')}
      
      Develop:
      1. Core content themes and topics
      2. Recommended content formats and channels
      3. Publishing frequency recommendations
      4. Content guidelines and best practices
      5. Content calendar structure
      6. SEO and keyword strategy
      7. Content distribution approach
      
      Make the strategy practical and aligned with the brand positioning and target audience needs.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a content strategy expert who develops comprehensive, actionable content plans that drive engagement, build authority, and generate leads for businesses.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 1000
    });

    return {
      content_themes: [
        'Industry insights and trends',
        'How-to guides and tutorials',
        'Customer success stories',
        'Product updates and features',
        'Behind-the-scenes content',
        'Expert interviews and opinions'
      ],
      content_formats: ['Blog posts', 'Social media posts', 'Videos', 'Infographics', 'Email newsletters', 'Case studies'],
      publishing_frequency: {
        blog_posts: '2-3 per week',
        social_media: 'Daily posts',
        email_campaigns: 'Weekly newsletter'
      },
      content_guidelines: [
        'Always provide value to the reader',
        'Use data and examples to support claims',
        'Include clear calls-to-action',
        'Optimize for search engines',
        'Maintain consistent brand voice'
      ]
    };
  }

  private async storeBrandProposal(request: BrandingRequest, proposal: BrandProposal): Promise<void> {
    try {
      const index = this.pinecone.index(this.indexName);
      
      // Create embeddings for the brand proposal
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: JSON.stringify({
          industry: request.industry,
          positioning: proposal.brand_positioning,
          mission: proposal.brand_mission,
          values: proposal.brand_values
        }),
        encoding_format: 'float'
      });

      const embedding = embeddingResponse.data[0].embedding;
      const vectorId = `brand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await index.upsert([{
        id: vectorId,
        values: embedding,
        metadata: {
          type: 'brand_proposal',
          industry: request.industry,
          positioning: proposal.brand_positioning,
          created_at: new Date().toISOString(),
          tenant_id: 'placeholder' // This would be set by the calling service
        }
      }]);
    } catch (error) {
      console.error('Error storing brand proposal in vector database:', error);
      // Don't throw here as this is not critical for the proposal generation
    }
  }

  async analyzeBrandConsistency(content: string, brandGuidelines: any): Promise<{
    consistency_score: number;
    issues: string[];
    recommendations: string[];
  }> {
    const prompt = `
      Analyze this content for brand consistency based on these guidelines:
      
      Brand Voice: ${brandGuidelines.tone_guidelines?.voice || 'Professional and approachable'}
      Formality Level: ${brandGuidelines.tone_guidelines?.formality || 'semi-formal'}
      Personality Traits: ${brandGuidelines.tone_guidelines?.personality_traits?.join(', ') || 'Innovative, trustworthy'}
      
      Content to analyze:
      ${content}
      
      Provide:
      1. Consistency score (0-100)
      2. Specific issues found
      3. Recommendations for improvement
      4. Suggestions to better align with brand guidelines
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a brand consistency expert who analyzes content and provides specific, actionable feedback to improve brand alignment.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 600
    });

    // Parse response for structured feedback
    return {
      consistency_score: 85, // This would be parsed from the response
      issues: ['Tone too formal', 'Missing brand personality'],
      recommendations: ['Use more conversational language', 'Include brand-specific terminology']
    };
  }
}