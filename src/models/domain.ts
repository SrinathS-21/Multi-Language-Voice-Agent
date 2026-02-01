/**
 * Domain-specific models and configurations
 */

export enum DomainType {
  HEALTHCARE = 'healthcare',
  ECOMMERCE = 'ecommerce',
  CUSTOMER_SERVICE = 'customer-service',
  EDUCATION = 'education',
  GENERAL = 'general',
}

export enum HandlerType {
  HTTP = 'http',
  WEBHOOK = 'webhook',
  INTERNAL = 'internal',
  VECTOR_SEARCH = 'vector_search',
  CONVEX_QUERY = 'convex_query',
  STATIC = 'static',
}

export interface FunctionTemplate {
  name: string;
  description: string;
  handler: HandlerType;
  handlerType?: HandlerType;
  handlerConfig?: any;
  parameters?: Record<string, any>;
  schema?: Record<string, any>;
}

export interface DomainConfig {
  type: DomainType;
  name: string;
  description: string;
  defaultLanguages: string[];
  specializedTerms?: Record<string, string>;
  contextPrompts?: string[];
  getDomain?: (type: DomainType) => DomainConfig | undefined;
  detectDomain?: (text: string) => DomainType;
  getDefaultFunctions?: (type: DomainType) => FunctionTemplate[];
}

export interface DomainRegistry extends DomainConfig {
  [key: string]: any;
}

const domainRegistry: DomainRegistry = {
  type: DomainType.GENERAL,
  name: 'Domain Registry',
  description: 'Registry of all available domains',
  defaultLanguages: ['en-IN'],
  
  getDomain(type: DomainType): DomainConfig | undefined {
    const configs: Record<string, DomainConfig> = {
      [DomainType.HEALTHCARE]: {
        type: DomainType.HEALTHCARE,
        name: 'Healthcare',
        description: 'Medical and healthcare services',
        defaultLanguages: ['en-IN', 'hi-IN'],
        specializedTerms: {
          appointment: 'बुकिंग',
          prescription: 'नुस्खा',
          doctor: 'डॉक्टर',
        },
        contextPrompts: ['Maintain HIPAA compliance', 'Use medical terminology carefully'],
      },
      [DomainType.ECOMMERCE]: {
        type: DomainType.ECOMMERCE,
        name: 'E-Commerce',
        description: 'Online shopping and retail',
        defaultLanguages: ['en-IN', 'hi-IN', 'ta-IN'],
        contextPrompts: ['Focus on product details', 'Help with order tracking'],
      },
      [DomainType.CUSTOMER_SERVICE]: {
        type: DomainType.CUSTOMER_SERVICE,
        name: 'Customer Service',
        description: 'General customer support',
        defaultLanguages: ['en-IN', 'hi-IN'],
        contextPrompts: ['Be empathetic', 'Provide clear solutions'],
      },
      [DomainType.EDUCATION]: {
        type: DomainType.EDUCATION,
        name: 'Education',
        description: 'Educational services and tutoring',
        defaultLanguages: ['en-IN', 'hi-IN'],
        contextPrompts: ['Be patient and encouraging', 'Explain concepts clearly'],
      },
      [DomainType.GENERAL]: {
        type: DomainType.GENERAL,
        name: 'General Purpose',
        description: 'General conversation and assistance',
        defaultLanguages: ['en-IN'],
      },
    };
    return configs[type];
  },

  detectDomain(text: string): DomainType {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('doctor') || lowerText.includes('medical') || lowerText.includes('health')) {
      return DomainType.HEALTHCARE;
    }
    if (lowerText.includes('order') || lowerText.includes('product') || lowerText.includes('cart')) {
      return DomainType.ECOMMERCE;
    }
    if (lowerText.includes('learn') || lowerText.includes('study') || lowerText.includes('education')) {
      return DomainType.EDUCATION;
    }
    if (lowerText.includes('support') || lowerText.includes('help') || lowerText.includes('issue')) {
      return DomainType.CUSTOMER_SERVICE;
    }
    return DomainType.GENERAL;
  },

  getDefaultFunctions(type: DomainType): FunctionTemplate[] {
    const functionsByDomain: Record<string, FunctionTemplate[]> = {
      [DomainType.HEALTHCARE]: [
        {
          name: 'book_appointment',
          description: 'Book a medical appointment',
          handler: HandlerType.INTERNAL,
          parameters: { doctorId: 'string', dateTime: 'string' },
        },
      ],
      [DomainType.ECOMMERCE]: [
        {
          name: 'track_order',
          description: 'Track order status',
          handler: HandlerType.HTTP,
          parameters: { orderId: 'string' },
        },
      ],
      [DomainType.CUSTOMER_SERVICE]: [
        {
          name: 'create_ticket',
          description: 'Create support ticket',
          handler: HandlerType.INTERNAL,
          parameters: { issue: 'string', priority: 'string' },
        },
      ],
    };
    return functionsByDomain[type] || [];
  },
};

export function getDomainRegistry(): DomainRegistry {
  return domainRegistry;
}

export function getDomainConfig(domainType: DomainType): DomainConfig | undefined {
  return domainRegistry.getDomain?.(domainType);
}
