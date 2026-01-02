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
          description: 'Standard error response format',
          required: ['code', 'message', 'request_id', 'timestamp'],
          properties: {
            code: {
              type: 'string',
              description: 'Error code identifier',
              example: 'AUTH_INVALID_API_KEY',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Invalid API key',
            },
            details: {
              nullable: true,
              description: 'Additional error details (object or array)',
              oneOf: [
                {
                  type: 'object',
                  additionalProperties: true,
                },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                  },
                },
              ],
            },
            request_id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique request identifier for tracking',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 timestamp of the error',
              example: '2025-12-02T10:30:00.000Z',
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
                code: 'AUTH_INVALID_API_KEY',
                message: 'Invalid API key',
                request_id: '123e4567-e89b-12d3-a456-426614174000',
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
                code: 'CLIENT_ACCESS_DENIED',
                message: 'Access denied to this client',
                request_id: '123e4567-e89b-12d3-a456-426614174000',
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
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded, please try again later',
                request_id: '123e4567-e89b-12d3-a456-426614174000',
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
                code: 'VALIDATION_FAILED',
                message: 'Validation failed',
                details: [
                  {
                    path: 'client_id',
                    message: 'Invalid UUID format',
                  },
                ],
                request_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                code: 'NOT_FOUND',
                message: 'Resource not found',
                request_id: '123e4567-e89b-12d3-a456-426614174000',
                timestamp: '2025-12-02T10:30:00.000Z',
              },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
                request_id: '123e4567-e89b-12d3-a456-426614174000',
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

