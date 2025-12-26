// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'De Bedrijfsfiscalist API',
      version: '1.0.0',
      description:
        'Backend API for De Bedrijfsfiscalist - Tax Calendar & Document Management System',
      contact: {
        name: 'API Support',
        email: 'support@debedrijfsfiscalist.nl',
      },
    },
    servers: [
      {
        url:
          env.nodeEnv === 'production'
            ? 'https://api.debedrijfsfiscalist.nl'
            : `http://localhost:${env.port}`,
        description:
          env.nodeEnv === 'production'
            ? 'Production'
            : env.nodeEnv === 'staging'
              ? 'Staging'
              : 'Development',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API Key for authentication',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from Supabase authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Unauthorized',
            },
            message: {
              type: 'string',
              example: 'Invalid or missing API key',
            },
            statusCode: {
              type: 'number',
              example: 401,
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AuthUser: {
          type: 'object',
          properties: {
            sub: {
              type: 'string',
              description: 'User ID',
            },
            role: {
              type: 'string',
              enum: ['admin', 'client'],
            },
            client_id: {
              type: 'string',
              description: 'Client ID (required for client role)',
            },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            name: {
              type: 'string',
            },
            slug: {
              type: 'string',
              nullable: true,
            },
            country: {
              type: 'string',
              nullable: true,
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AppUser: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            full_name: {
              type: 'string',
              nullable: true,
            },
            role: {
              type: 'string',
              enum: ['admin', 'client'],
            },
            is_active: {
              type: 'boolean',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            client_id: {
              type: 'string',
              format: 'uuid',
              nullable: true,
            },
          },
        },
        ClientWithUsers: {
          allOf: [
            {
              $ref: '#/components/schemas/Client',
            },
            {
              type: 'object',
              properties: {
                users: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/AppUser',
                  },
                },
                users_count: {
                  type: 'integer',
                },
              },
            },
          ],
        },
        TaxCalendarEntry: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            client_id: {
              type: 'string',
              format: 'uuid',
            },
            deadline: {
              type: 'string',
              format: 'date',
            },
            tax_type: {
              type: 'string',
            },
            jurisdiction: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Document: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            client_id: {
              type: 'string',
              format: 'uuid',
            },
            source: {
              type: 'string',
            },
            kind: {
              type: 'string',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Unauthorized',
                message: 'Invalid or missing API key',
                statusCode: 401,
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Access forbidden',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Forbidden',
                message: 'You do not have access to this client',
                statusCode: 403,
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
        RateLimitError: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Too Many Requests',
                message: 'API rate limit exceeded, please try again later',
                statusCode: 429,
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: 'Bad Request',
                message: 'Invalid clientId format',
                statusCode: 400,
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.routes.js'],
};

export const swaggerSpec = swaggerJsdoc(options);

