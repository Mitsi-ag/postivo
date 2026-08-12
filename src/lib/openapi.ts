// Hand-written OpenAPI 3.1 spec for the public v1 agent API.
// Served at GET /api/v1/openapi.json (also reachable with a Bearer key).

export function openApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Postivo API',
      version: '1.0.0',
      description:
        'Public agent API for Postivo — schedule posts across social providers. ' +
        'Authenticate every request with `Authorization: Bearer pv_...` (create keys under Settings → API keys).',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key, format `pv_...`' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' }, upgrade: { type: 'boolean' } },
          required: ['error'],
        },
        ProviderField: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            secret: { type: 'boolean' },
            optional: { type: 'boolean' },
            placeholder: { type: 'string' },
          },
          required: ['key', 'label'],
        },
        ProviderMeta: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            icon: { type: 'string' },
            color: { type: 'string' },
            maxLength: { type: 'integer' },
            supportsMedia: { type: 'boolean' },
            supportsReply: { type: 'boolean' },
            supportsStats: { type: 'boolean' },
            fields: { type: 'array', items: { $ref: '#/components/schemas/ProviderField' } },
          },
        },
        Channel: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            provider: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string', enum: ['active', 'error'] },
            created_at: { type: 'string', format: 'date-time' },
            provider_meta: { $ref: '#/components/schemas/ProviderMeta' },
          },
        },
        PostComment: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            delayMin: { type: 'integer', minimum: 0, description: 'Minutes after the previous step to publish' },
          },
          required: ['content', 'delayMin'],
        },
        Target: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            channel_id: { type: 'string' },
            channel_name: { type: ['string', 'null'] },
            provider: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['pending', 'publishing', 'published', 'failed'] },
            published_at: { type: ['string', 'null'], format: 'date-time' },
            error: { type: ['string', 'null'] },
            retry_count: { type: 'integer' },
            next_retry_at: { type: ['string', 'null'], format: 'date-time' },
            external_url: { type: ['string', 'null'] },
            external_id: { type: ['string', 'null'] },
            stats: { type: 'object', additionalProperties: { type: 'number' } },
            content_override: { type: ['string', 'null'] },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            media: { type: 'array', items: { type: 'string' }, description: 'Media ids' },
            scheduled_at: { type: ['string', 'null'], format: 'date-time' },
            status: { type: 'string', enum: ['draft', 'scheduled', 'published', 'failed'] },
            comments: { type: 'array', items: { $ref: '#/components/schemas/PostComment' } },
            repeat_every_days: { type: ['integer', 'null'] },
            tags: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            targets: { type: 'array', items: { $ref: '#/components/schemas/Target' } },
          },
        },
        CreatePostRequest: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            media: { type: 'array', items: { type: 'string' }, description: 'Media ids from uploads' },
            channelIds: { type: 'array', items: { type: 'string' } },
            scheduled_at: { type: 'string', format: 'date-time', description: 'ISO datetime; omit to save a draft' },
            comments: { type: 'array', items: { $ref: '#/components/schemas/PostComment' } },
            repeat_every_days: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
            tags: { type: 'array', items: { type: 'string' } },
            overrides: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Per-channel content overrides, keyed by channel id',
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/api/v1/channels': {
        get: {
          operationId: 'listChannels',
          summary: 'List connected channels',
          responses: {
            '200': {
              description: 'Channels',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { channels: { type: 'array', items: { $ref: '#/components/schemas/Channel' } } },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/v1/posts': {
        get: {
          operationId: 'listPosts',
          summary: 'List posts',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'scheduled', 'published', 'failed'] } },
            { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Filter by tag' },
            { name: 'start', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'scheduled_at >= start' },
            { name: 'end', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'scheduled_at <= end' },
          ],
          responses: {
            '200': {
              description: 'Posts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { posts: { type: 'array', items: { $ref: '#/components/schemas/Post' } } },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        post: {
          operationId: 'createPost',
          summary: 'Create a post (draft or scheduled)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePostRequest' } } },
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { post: { $ref: '#/components/schemas/Post' } } },
                },
              },
            },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '402': { description: 'Plan limit reached', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/v1/posts/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          operationId: 'getPost',
          summary: 'Get a single post',
          responses: {
            '200': {
              description: 'Post',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { post: { $ref: '#/components/schemas/Post' } } },
                },
              },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          operationId: 'deletePost',
          summary: 'Delete a post and its targets',
          responses: {
            '200': {
              description: 'Deleted',
              content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        patch: {
          operationId: 'updatePost',
          summary: 'Update a post (content, schedule, channels, tags, status)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePostRequest' } } },
          },
          responses: {
            '200': {
              description: 'Updated post',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { post: { $ref: '#/components/schemas/Post' } } },
                },
              },
            },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '402': { description: 'Plan limit reached', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          operationId: 'getOpenApiSpec',
          summary: 'This OpenAPI document',
          security: [],
          responses: { '200': { description: 'OpenAPI 3.1 JSON document' } },
        },
      },
    },
  };
}
