export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
    securitySchemes: Record<string, any>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
}

export function getOpenAPISpec(): OpenAPISpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CycloneDX Assessors Studio API',
      version: '0.1.0',
      description: 'API for managing security assessments, evidence, and compliance attestations',
    },
    servers: [
      {
        url: '/api',
        description: 'API v1 Server',
      },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          operationId: 'getHealth',
          description: 'Unauthenticated callers receive simple status. Authenticated callers receive detailed system metrics.',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      {
                        type: 'object',
                        properties: {
                          status: { type: 'string', example: 'healthy' },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                        required: ['status', 'timestamp'],
                      },
                      {
                        type: 'object',
                        properties: {
                          status: { type: 'string', example: 'healthy' },
                          uptime: { type: 'string' },
                          version: { type: 'string' },
                          environment: { type: 'string' },
                          memory: {
                            type: 'object',
                            properties: {
                              heapUsed: { type: 'string' },
                              heapUsedPercent: { type: 'string' },
                              rss: { type: 'string' },
                            },
                          },
                          system: {
                            type: 'object',
                            properties: {
                              platform: { type: 'string' },
                              memory: {
                                type: 'object',
                                properties: {
                                  usedPercent: { type: 'string' },
                                  alert: { type: 'string', nullable: true },
                                },
                              },
                              loadavg: {
                                type: 'object',
                                properties: {
                                  '1min': { type: 'string' },
                                  alert: { type: 'string', nullable: true },
                                },
                              },
                            },
                          },
                          disk: {
                            type: 'object',
                            properties: {
                              total: { type: 'string' },
                              used: { type: 'string' },
                              free: { type: 'string' },
                            },
                          },
                        },
                        required: ['status', 'uptime', 'version'],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      '/v1/setup/status': {
        get: {
          tags: ['Setup'],
          summary: 'Check setup status',
          operationId: 'getSetupStatus',
          responses: {
            '200': {
              description: 'Setup status retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      isSetup: { type: 'boolean' },
                      adminExists: { type: 'boolean' },
                      standardsImported: { type: 'boolean' },
                    },
                    required: ['isSetup'],
                  },
                },
              },
            },
          },
        },
      },
      '/v1/setup': {
        post: {
          tags: ['Setup'],
          summary: 'Complete initial setup',
          operationId: 'setupSystem',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    adminName: { type: 'string' },
                    adminEmail: { type: 'string', format: 'email' },
                    adminPassword: { type: 'string', minLength: 8 },
                  },
                  required: ['adminName', 'adminEmail', 'adminPassword'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'System setup completed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '400': {
              description: 'Invalid setup request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/setup/standards-feed': {
        get: {
          tags: ['Setup'],
          summary: 'Get available standards feed',
          operationId: 'getStandardsFeed',
          responses: {
            '200': {
              description: 'Standards feed retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        version: { type: 'string' },
                        description: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/setup/import-standard': {
        post: {
          tags: ['Setup'],
          summary: 'Import standard during setup',
          operationId: 'importStandardSetup',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    standardId: { type: 'string' },
                    standardName: { type: 'string' },
                    standardVersion: { type: 'string' },
                  },
                  required: ['standardId', 'standardName'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Standard imported',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Standard' },
                },
              },
            },
            '400': {
              description: 'Invalid standard import request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'User login',
          operationId: 'login',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                  required: ['email', 'password'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/User' },
                      token: { type: 'string' },
                    },
                    required: ['user', 'token'],
                  },
                },
              },
            },
            '401': {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'User registration',
          operationId: 'register',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                  },
                  required: ['name', 'email', 'password'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '400': {
              description: 'Invalid registration request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'User logout',
          operationId: 'logout',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Logout successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user',
          operationId: 'getCurrentUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Current user retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/change-password': {
        put: {
          tags: ['Auth'],
          summary: 'Change password',
          operationId: 'changePassword',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string' },
                  },
                  required: ['currentPassword', 'newPassword'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Password changed',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/profile': {
        put: {
          tags: ['Auth'],
          summary: 'Update profile',
          operationId: 'updateProfile',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    displayName: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Profile updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/logout-all': {
        post: {
          tags: ['Auth'],
          summary: 'Logout from all sessions',
          operationId: 'logoutAll',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Logged out from all sessions',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/auth/complete-onboarding': {
        post: {
          tags: ['Auth'],
          summary: 'Mark onboarding as complete',
          operationId: 'completeOnboarding',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Onboarding completed',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/projects': {
        get: {
          tags: ['Projects'],
          summary: 'List projects',
          operationId: 'listProjects',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
            {
              name: 'state',
              in: 'query',
              schema: { type: 'string', enum: ['active', 'archived', 'all'] },
            },
          ],
          responses: {
            '200': {
              description: 'Projects retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Project' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Projects'],
          summary: 'Create project',
          operationId: 'createProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    standardId: { type: 'string' },
                  },
                  required: ['name', 'standardId'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Project created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Project' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/projects/{id}': {
        get: {
          tags: ['Projects'],
          summary: 'Get project detail',
          operationId: 'getProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Project retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Project' },
                },
              },
            },
            '404': {
              description: 'Project not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Projects'],
          summary: 'Update project',
          operationId: 'updateProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Project updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Project' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Project not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Projects'],
          summary: 'Delete project',
          operationId: 'deleteProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'Project deleted',
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Project not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/projects/{id}/archive': {
        post: {
          tags: ['Projects'],
          summary: 'Archive project',
          operationId: 'archiveProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Project archived',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/projects/{id}/export/summary': {
        get: {
          tags: ['Projects'],
          summary: 'Get project summary',
          operationId: 'getProjectSummary',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Project summary',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards': {
        get: {
          tags: ['Standards'],
          summary: 'List standards',
          operationId: 'listStandards',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Standards retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Standard' },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}': {
        get: {
          tags: ['Standards'],
          summary: 'Get standard detail',
          operationId: 'getStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Standard retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Standard' },
                },
              },
            },
            '404': {
              description: 'Standard not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Standards'],
          summary: 'Update standard',
          operationId: 'updateStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Standard updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Standards'],
          summary: 'Delete standard',
          operationId: 'deleteStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Standard deleted',
            },
          },
        },
      },
      '/v1/standards/{id}/submit': {
        post: {
          tags: ['Standards'],
          summary: 'Submit standard for review',
          operationId: 'submitStandardForReview',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Standard submitted',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}/approve': {
        post: {
          tags: ['Standards'],
          summary: 'Approve standard',
          operationId: 'approveStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Standard approved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}/reject': {
        post: {
          tags: ['Standards'],
          summary: 'Reject standard',
          operationId: 'rejectStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Standard rejected',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}/duplicate': {
        post: {
          tags: ['Standards'],
          summary: 'Duplicate standard',
          operationId: 'duplicateStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '201': {
              description: 'Standard duplicated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}/retire': {
        post: {
          tags: ['Standards'],
          summary: 'Retire standard',
          operationId: 'retireStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Standard retired',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{id}/requirements': {
        post: {
          tags: ['Standards'],
          summary: 'Create standard requirement',
          operationId: 'createStandardRequirement',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Requirement created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/standards/{standardId}/requirements/{reqId}': {
        put: {
          tags: ['Standards'],
          summary: 'Update standard requirement',
          operationId: 'updateStandardRequirement',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'standardId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'reqId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Requirement updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Standards'],
          summary: 'Delete standard requirement',
          operationId: 'deleteStandardRequirement',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'standardId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'reqId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Requirement deleted',
            },
          },
        },
      },
      '/v1/standards/import': {
        post: {
          tags: ['Standards'],
          summary: 'Import standard',
          operationId: 'importStandard',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    standardId: { type: 'string' },
                    standardName: { type: 'string' },
                    standardVersion: { type: 'string' },
                  },
                  required: ['standardId', 'standardName'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Standard imported',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Standard' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments': {
        get: {
          tags: ['Assessments'],
          summary: 'List assessments',
          operationId: 'listAssessments',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
            {
              name: 'state',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['draft', 'in-progress', 'completed', 'all'],
              },
            },
            {
              name: 'projectId',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Assessments retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Assessment' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Assessments'],
          summary: 'Create assessment',
          operationId: 'createAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    projectId: { type: 'string' },
                    standardId: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    dueDate: { type: 'string', format: 'date' },
                  },
                  required: ['projectId', 'standardId', 'name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Assessment created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Assessment' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}': {
        get: {
          tags: ['Assessments'],
          summary: 'Get assessment detail',
          operationId: 'getAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Assessment retrieved with requirements, assessors, and assessees',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      assessment: { $ref: '#/components/schemas/Assessment' },
                      requirements: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                      assessors: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                      assessees: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                    },
                    required: [
                      'assessment',
                      'requirements',
                      'assessors',
                      'assessees',
                    ],
                  },
                },
              },
            },
            '404': {
              description: 'Assessment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Assessments'],
          summary: 'Update assessment',
          operationId: 'updateAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    dueDate: { type: 'string', format: 'date' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Assessment updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Assessment' },
                },
              },
            },
            '404': {
              description: 'Assessment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Assessments'],
          summary: 'Delete assessment',
          operationId: 'deleteAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Assessment deleted',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '404': {
              description: 'Assessment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/start': {
        post: {
          tags: ['Assessments'],
          summary: 'Start assessment',
          operationId: 'startAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Assessment started',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Assessment' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Assessment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/complete': {
        post: {
          tags: ['Assessments'],
          summary: 'Complete assessment',
          operationId: 'completeAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Assessment completed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Assessment' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Assessment not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/requirements/{requirementId}': {
        put: {
          tags: ['Assessments'],
          summary: 'Update requirement result',
          operationId: 'updateRequirementResult',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'requirementId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    result: { type: 'string', enum: ['pass', 'fail', 'pending'] },
                    notes: { type: 'string' },
                    evidenceIds: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['result'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Requirement result updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '404': {
              description: 'Assessment or requirement not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/requirements/{requirementId}/evidence': {
        get: {
          tags: ['Assessments'],
          summary: 'Get evidence for requirement',
          operationId: 'getRequirementEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'requirementId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Evidence retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/evidence': {
        get: {
          tags: ['Assessments'],
          summary: 'Get all evidence for assessment',
          operationId: 'getAssessmentEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Evidence retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/requirements/{requirementId}/notes': {
        get: {
          tags: ['Assessments'],
          summary: 'Get notes for requirement',
          operationId: 'getRequirementNotes',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'requirementId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Notes retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Assessments'],
          summary: 'Add note to requirement',
          operationId: 'addRequirementNote',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'requirementId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                  },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Note created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/assessments/{id}/notes': {
        get: {
          tags: ['Assessments'],
          summary: 'Get all notes for assessment',
          operationId: 'getAssessmentNotes',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Notes retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/evidence': {
        get: {
          tags: ['Evidence'],
          summary: 'List evidence',
          operationId: 'listEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Evidence retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Evidence' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Evidence'],
          summary: 'Create evidence',
          operationId: 'createEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    type: { type: 'string' },
                    assessmentId: { type: 'string' },
                    tags: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['title', 'type'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Evidence created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Evidence' },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}': {
        get: {
          tags: ['Evidence'],
          summary: 'Get evidence detail',
          operationId: 'getEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Evidence retrieved with notes, attachments, and tags',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      evidence: { $ref: '#/components/schemas/Evidence' },
                      notes: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                      attachments: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                      tags: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Tag' },
                      },
                    },
                    required: ['evidence', 'notes', 'attachments', 'tags'],
                  },
                },
              },
            },
            '404': {
              description: 'Evidence not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Evidence'],
          summary: 'Update evidence',
          operationId: 'updateEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    tags: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Evidence updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Evidence' },
                },
              },
            },
            '404': {
              description: 'Evidence not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/notes': {
        post: {
          tags: ['Evidence'],
          summary: 'Add note to evidence',
          operationId: 'addEvidenceNote',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                  },
                  required: ['content'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Note added',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '404': {
              description: 'Evidence not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/link': {
        post: {
          tags: ['Evidence'],
          summary: 'Link evidence to assessment',
          operationId: 'linkEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Evidence linked',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/unlink': {
        delete: {
          tags: ['Evidence'],
          summary: 'Unlink evidence from assessment',
          operationId: 'unlinkEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Evidence unlinked',
            },
          },
        },
      },
      '/v1/evidence/{id}/submit-for-review': {
        post: {
          tags: ['Evidence'],
          summary: 'Submit evidence for review',
          operationId: 'submitEvidenceForReview',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Evidence submitted',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/approve': {
        post: {
          tags: ['Evidence'],
          summary: 'Approve evidence',
          operationId: 'approveEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Evidence approved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/reject': {
        post: {
          tags: ['Evidence'],
          summary: 'Reject evidence',
          operationId: 'rejectEvidence',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Evidence rejected',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/attachments': {
        post: {
          tags: ['Evidence'],
          summary: 'Upload evidence attachment',
          operationId: 'uploadEvidenceAttachment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Attachment uploaded',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/attachments/{attachmentId}/download': {
        get: {
          tags: ['Evidence'],
          summary: 'Download evidence attachment',
          operationId: 'downloadEvidenceAttachment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Attachment file',
              content: {
                'application/octet-stream': {},
              },
            },
          },
        },
      },
      '/v1/evidence/{id}/attachments/{attachmentId}': {
        delete: {
          tags: ['Evidence'],
          summary: 'Delete evidence attachment',
          operationId: 'deleteEvidenceAttachment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Attachment deleted',
            },
          },
        },
      },
      '/v1/claims': {
        get: {
          tags: ['Claims'],
          summary: 'List claims',
          operationId: 'listClaims',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Claims retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Claim' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Claims'],
          summary: 'Create claim',
          operationId: 'createClaim',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requirementId: { type: 'string' },
                    assessmentId: { type: 'string' },
                    statement: { type: 'string' },
                    evidence: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['requirementId', 'statement'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Claim created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Claim' },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/claims/{id}': {
        get: {
          tags: ['Claims'],
          summary: 'Get claim detail',
          operationId: 'getClaim',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Claim retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Claim' },
                },
              },
            },
            '404': {
              description: 'Claim not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Claims'],
          summary: 'Update claim',
          operationId: 'updateClaim',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    statement: { type: 'string' },
                    evidence: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Claim updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Claim' },
                },
              },
            },
            '404': {
              description: 'Claim not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Claims'],
          summary: 'Delete claim',
          operationId: 'deleteClaim',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'Claim deleted',
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Claim not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/entities': {
        get: {
          tags: ['Entities'],
          summary: 'List entities',
          operationId: 'listEntities',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Entities retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' } },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Entities'],
          summary: 'Create entity',
          operationId: 'createEntity',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    entityType: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['name', 'entityType'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Entity created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/relationship-graph': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity relationship graph',
          operationId: 'getEntityRelationshipGraph',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Entity relationship graph',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      entities: { type: 'array' },
                      edges: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity detail',
          operationId: 'getEntity',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Entities'],
          summary: 'Update entity',
          operationId: 'updateEntity',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Entity updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Entities'],
          summary: 'Delete entity',
          operationId: 'deleteEntity',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Entity deleted',
            },
          },
        },
      },
      '/v1/entities/{id}/children': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity children',
          operationId: 'getEntityChildren',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity children retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/assessments': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity assessments',
          operationId: 'getEntityAssessments',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity assessments retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/history': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity history',
          operationId: 'getEntityHistory',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity history retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/relationship-graph': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity relationship graph',
          operationId: 'getEntityRelationshipGraphById',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity relationship graph',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/relationships': {
        post: {
          tags: ['Entities'],
          summary: 'Create entity relationship',
          operationId: 'createEntityRelationship',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Relationship created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/relationships/{relId}': {
        delete: {
          tags: ['Entities'],
          summary: 'Delete entity relationship',
          operationId: 'deleteEntityRelationship',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'relId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Relationship deleted',
            },
          },
        },
      },
      '/v1/entities/{id}/policies': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity policies',
          operationId: 'getEntityPolicies',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity policies retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Entities'],
          summary: 'Create entity policy',
          operationId: 'createEntityPolicy',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Policy created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/entities/{id}/policies/{policyId}': {
        put: {
          tags: ['Entities'],
          summary: 'Update entity policy',
          operationId: 'updateEntityPolicy',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'policyId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Policy updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Entities'],
          summary: 'Delete entity policy',
          operationId: 'deleteEntityPolicy',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'policyId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Policy deleted',
            },
          },
        },
      },
      '/v1/entities/{id}/progress': {
        get: {
          tags: ['Entities'],
          summary: 'Get entity assessment progress',
          operationId: 'getEntityProgress',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Entity progress retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/attestations': {
        get: {
          tags: ['Attestations'],
          summary: 'List attestations',
          operationId: 'listAttestations',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Attestations retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Attestation' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Attestations'],
          summary: 'Create attestation',
          operationId: 'createAttestation',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    assessmentId: { type: 'string' },
                    claims: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    bomRef: { type: 'string' },
                  },
                  required: ['assessmentId', 'claims'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Attestation created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Attestation' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/attestations/{id}': {
        get: {
          tags: ['Attestations'],
          summary: 'Get attestation detail',
          operationId: 'getAttestation',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Attestation retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Attestation' },
                },
              },
            },
            '404': {
              description: 'Attestation not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Attestations'],
          summary: 'Update attestation',
          operationId: 'updateAttestation',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    claims: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Attestation updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Attestation' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Attestation not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/attestations/{id}/requirements': {
        get: {
          tags: ['Attestations'],
          summary: 'Get attestation requirements',
          operationId: 'getAttestationRequirements',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Requirements retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Attestations'],
          summary: 'Add requirement to attestation',
          operationId: 'addAttestationRequirement',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Requirement added',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/attestations/{id}/requirements/{requirementId}': {
        put: {
          tags: ['Attestations'],
          summary: 'Update attestation requirement',
          operationId: 'updateAttestationRequirement',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'requirementId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Requirement updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/attestations/{id}/sign': {
        post: {
          tags: ['Attestations'],
          summary: 'Sign attestation',
          operationId: 'signAttestation',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Attestation signed',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/users': {
        get: {
          tags: ['Users'],
          summary: 'List users',
          operationId: 'listUsers',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 50 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Users retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['data', 'pagination'],
                  },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Users'],
          summary: 'Create user',
          operationId: 'createUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    roleId: { type: 'string' },
                  },
                  required: ['name', 'email', 'password'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/users/assignable': {
        get: {
          tags: ['Users'],
          summary: 'Get assignable users',
          operationId: 'getAssignableUsers',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Assignable users retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/users/{id}': {
        get: {
          tags: ['Users'],
          summary: 'Get user detail',
          operationId: 'getUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'User retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Users'],
          summary: 'Update user',
          operationId: 'updateUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    roleId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'User updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/users/{id}/activate': {
        put: {
          tags: ['Users'],
          summary: 'Activate user',
          operationId: 'activateUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'User activated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/users/{id}/deactivate': {
        put: {
          tags: ['Users'],
          summary: 'Deactivate user',
          operationId: 'deactivateUser',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'User deactivated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'User not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/roles': {
        get: {
          tags: ['Roles'],
          summary: 'List roles',
          operationId: 'listRoles',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Roles retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Role' },
                  },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Roles'],
          summary: 'Create role',
          operationId: 'createRole',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['name', 'permissions'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Role created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Role' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/roles/permissions': {
        get: {
          tags: ['Roles'],
          summary: 'List all permissions',
          operationId: 'listPermissions',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Permissions retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        category: { type: 'string' },
                      },
                      required: ['id', 'name'],
                    },
                  },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/roles/{id}': {
        get: {
          tags: ['Roles'],
          summary: 'Get role detail',
          operationId: 'getRole',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Role retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Role' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Role not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Roles'],
          summary: 'Update role',
          operationId: 'updateRole',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Role updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Role' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Role not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Roles'],
          summary: 'Delete role',
          operationId: 'deleteRole',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'Role deleted',
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Role not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/tags': {
        get: {
          tags: ['Tags'],
          summary: 'List tags',
          operationId: 'listTags',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Tags retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Tag' },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Tags'],
          summary: 'Create tag',
          operationId: 'createTag',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Tag created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Tag' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/tags/autocomplete': {
        get: {
          tags: ['Tags'],
          summary: 'Get tags autocomplete',
          operationId: 'getTagsAutocomplete',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Tags autocomplete results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/tags/{id}': {
        put: {
          tags: ['Tags'],
          summary: 'Update tag',
          operationId: 'updateTag',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    color: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tag updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Tag' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Tag not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Tags'],
          summary: 'Delete tag',
          operationId: 'deleteTag',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'Tag deleted',
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'Tag not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/apikeys': {
        get: {
          tags: ['API Keys'],
          summary: 'List API keys',
          operationId: 'listApiKeys',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'API keys retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        prefix: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        lastUsedAt: {
                          type: 'string',
                          format: 'date-time',
                          nullable: true,
                        },
                      },
                      required: ['id', 'name', 'prefix', 'createdAt'],
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
        post: {
          tags: ['API Keys'],
          summary: 'Create API key',
          operationId: 'createApiKey',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                  },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'API key created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      key: { type: 'string' },
                      prefix: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                    required: ['id', 'name', 'key', 'prefix', 'createdAt'],
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/apikeys/{id}': {
        delete: {
          tags: ['API Keys'],
          summary: 'Delete API key',
          operationId: 'deleteApiKey',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'API key deleted',
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '404': {
              description: 'API key not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/stats': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard statistics',
          operationId: 'getDashboardStats',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Dashboard stats retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalProjects: { type: 'integer' },
                      totalAssessments: { type: 'integer' },
                      totalEvidence: { type: 'integer' },
                      totalAttestations: { type: 'integer' },
                      activeAssessments: { type: 'integer' },
                      completedAssessments: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/recent-assessments': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get recent assessments',
          operationId: 'getRecentAssessments',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Recent assessments retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Assessment' },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/upcoming-due-dates': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get upcoming due dates',
          operationId: 'getUpcomingDueDates',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Upcoming due dates retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        assessmentId: { type: 'string' },
                        name: { type: 'string' },
                        dueDate: { type: 'string', format: 'date' },
                        daysRemaining: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/compliance-coverage': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get compliance coverage',
          operationId: 'getComplianceCoverage',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Compliance coverage retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalRequirements: { type: 'integer' },
                      satisfiedRequirements: { type: 'integer' },
                      coveragePercentage: { type: 'number' },
                      byStandard: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            standardId: { type: 'string' },
                            standardName: { type: 'string' },
                            covered: { type: 'integer' },
                            total: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/assessment-distribution': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get assessment distribution',
          operationId: 'getAssessmentDistribution',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Assessment distribution retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      draft: { type: 'integer' },
                      inProgress: { type: 'integer' },
                      completed: { type: 'integer' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/evidence-health': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get evidence health',
          operationId: 'getEvidenceHealth',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Evidence health retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalEvidence: { type: 'integer' },
                      linkedEvidence: { type: 'integer' },
                      orphanedEvidence: { type: 'integer' },
                      averageEvidencePerAssessment: { type: 'number' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Not authenticated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/conformance-breakdown': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get conformance breakdown',
          operationId: 'getConformanceBreakdown',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Conformance breakdown',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/risk-insights': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get risk insights',
          operationId: 'getRiskInsights',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Risk insights',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/project-health': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get project health',
          operationId: 'getProjectHealth',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Project health',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/configs': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard configs',
          operationId: 'getDashboardConfigs',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Dashboard configs',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Dashboard'],
          summary: 'Create dashboard config',
          operationId: 'createDashboardConfig',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Dashboard config created',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/dashboard/configs/{id}': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard config',
          operationId: 'getDashboardConfig',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Dashboard config',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        put: {
          tags: ['Dashboard'],
          summary: 'Update dashboard config',
          operationId: 'updateDashboardConfig',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Dashboard config updated',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        delete: {
          tags: ['Dashboard'],
          summary: 'Delete dashboard config',
          operationId: 'deleteDashboardConfig',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '204': {
              description: 'Dashboard config deleted',
            },
          },
        },
      },
      '/v1/import/attestation': {
        post: {
          tags: ['Import'],
          summary: 'Import attestation',
          operationId: 'importAttestation',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    bomData: { type: 'object' },
                    projectId: { type: 'string' },
                  },
                  required: ['bomData', 'projectId'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Attestation imported',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Attestation' },
                },
              },
            },
            '400': {
              description: 'Invalid import data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
            '403': {
              description: 'Insufficient permissions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' },
                },
              },
            },
          },
        },
      },
      '/v1/audit': {
        get: {
          tags: ['Audit'],
          summary: 'Get audit logs',
          operationId: 'getAuditLogs',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'entityType', in: 'query', schema: { type: 'string' } },
            { name: 'entityId', in: 'query', schema: { type: 'string' } },
            { name: 'userId', in: 'query', schema: { type: 'string' } },
            { name: 'action', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Audit logs retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/audit/entity/{entityType}/{entityId}': {
        get: {
          tags: ['Audit'],
          summary: 'Get entity audit logs',
          operationId: 'getEntityAuditLogs',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'entityType', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'entityId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Entity audit logs retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/notifications': {
        get: {
          tags: ['Notifications'],
          summary: 'List notifications',
          operationId: 'listNotifications',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            '200': {
              description: 'Notifications retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/notifications/{id}/read': {
        put: {
          tags: ['Notifications'],
          summary: 'Mark notification as read',
          operationId: 'markNotificationAsRead',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Notification marked as read',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/notifications/read-all': {
        put: {
          tags: ['Notifications'],
          summary: 'Mark all notifications as read',
          operationId: 'markAllNotificationsAsRead',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'All notifications marked as read',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/notifications/count': {
        get: {
          tags: ['Notifications'],
          summary: 'Get unread notification count',
          operationId: 'getUnreadNotificationCount',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          responses: {
            '200': {
              description: 'Unread count retrieved',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/export/assessment/{assessmentId}': {
        get: {
          tags: ['Export'],
          summary: 'Export assessment',
          operationId: 'exportAssessment',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'assessmentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Assessment exported',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/export/assessment/{assessmentId}/pdf': {
        get: {
          tags: ['Export'],
          summary: 'Export assessment as PDF',
          operationId: 'exportAssessmentPdf',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'assessmentId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Assessment PDF',
              content: {
                'application/pdf': {},
              },
            },
          },
        },
      },
      '/v1/export/project/{projectId}': {
        get: {
          tags: ['Export'],
          summary: 'Export project',
          operationId: 'exportProject',
          security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Project exported',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/v1/setup/seed-demo': {
        post: {
          tags: ['Setup'],
          summary: 'Seed demo data',
          operationId: 'seedDemoData',
          responses: {
            '201': {
              description: 'Demo data seeded',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            roleId: { type: 'string', nullable: true },
            role: { $ref: '#/components/schemas/Role' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'email', 'isActive', 'createdAt', 'updatedAt'],
        },
        Role: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
            isBuiltIn: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'permissions', 'isBuiltIn', 'createdAt', 'updatedAt'],
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            standardId: { type: 'string' },
            standard: { $ref: '#/components/schemas/Standard' },
            state: { type: 'string', enum: ['active', 'archived'] },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'standardId', 'state', 'createdAt', 'updatedAt'],
        },
        Standard: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            version: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            requirementCount: { type: 'integer', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'createdAt', 'updatedAt'],
        },
        Assessment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            standardId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            state: {
              type: 'string',
              enum: ['draft', 'in-progress', 'completed', 'archived'],
            },
            dueDate: { type: 'string', format: 'date', nullable: true },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'projectId', 'standardId', 'name', 'state', 'createdAt', 'updatedAt'],
        },
        Evidence: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            type: { type: 'string' },
            assessmentId: { type: 'string', nullable: true },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'title', 'type', 'createdAt', 'updatedAt'],
        },
        Claim: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            requirementId: { type: 'string' },
            assessmentId: { type: 'string', nullable: true },
            statement: { type: 'string' },
            evidence: {
              type: 'array',
              items: { type: 'string' },
            },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'requirementId', 'statement', 'createdAt', 'updatedAt'],
        },
        Attestation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            assessmentId: { type: 'string' },
            claims: {
              type: 'array',
              items: { type: 'string' },
            },
            bomRef: { type: 'string', nullable: true },
            state: { type: 'string', enum: ['draft', 'published', 'archived'] },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'assessmentId', 'claims', 'state', 'createdAt', 'updatedAt'],
        },
        Tag: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            color: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'name', 'createdAt', 'updatedAt'],
        },
        Pagination: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            total: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
          required: ['limit', 'offset', 'total', 'hasMore'],
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string', nullable: true },
            code: { type: 'string', nullable: true },
          },
          required: ['error'],
        },
      },
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
          description: 'Session cookie authentication',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Api-Key',
          description: 'API key authentication via X-Api-Key header',
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Setup',
        description: 'System setup and initialization',
      },
      {
        name: 'Auth',
        description: 'Authentication and user session management',
      },
      {
        name: 'Projects',
        description: 'Project management',
      },
      {
        name: 'Standards',
        description: 'Compliance standards management',
      },
      {
        name: 'Assessments',
        description: 'Security assessment management',
      },
      {
        name: 'Evidence',
        description: 'Evidence and documentation',
      },
      {
        name: 'Claims',
        description: 'Compliance claims',
      },
      {
        name: 'Attestations',
        description: 'Attestation and CycloneDX declarations',
      },
      {
        name: 'Users',
        description: 'User management (admin only)',
      },
      {
        name: 'Roles',
        description: 'Role and permission management (admin only)',
      },
      {
        name: 'Tags',
        description: 'Tag management',
      },
      {
        name: 'API Keys',
        description: 'API key management',
      },
      {
        name: 'Dashboard',
        description: 'Dashboard and analytics',
      },
      {
        name: 'Import',
        description: 'Import external data',
      },
    ],
  };
}
