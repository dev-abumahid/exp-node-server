const idParam = `{
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }`;

export const swaggerGenerator = (name: string): string => `export const ${name}SwaggerDocs = {
  '/api/${name}': {
    post: {
      tags: ['${name}'],
      summary: 'Create new ${name}',
      description: '',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({ name: 'Example ${name}' }),
          },
        },
      },
      responses: {
        201: { description: '${name} created successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
    get: {
      tags: ['${name}'],
      summary: 'Get all ${name}',
      description: '',
      parameters: [
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'number' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'number' },
        },
      ],
      responses: {
        200: { description: '${name} fetched successfully' },
        401: { description: 'unauthorized' },
      },
    },
  },

  '/api/${name}/{id}': {
    get: {
      tags: ['${name}'],
      summary: 'Get single ${name}',
      description: '',
      parameters: [
        ${idParam},
      ],
      responses: {
        200: { description: '${name} fetched successfully' },
        401: { description: 'unauthorized' },
      },
    },
    patch: {
      tags: ['${name}'],
      summary: 'Update ${name}',
      description: '',
      parameters: [
        ${idParam},
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            example: JSON.stringify({ name: 'Example ${name}' }),
          },
        },
      },
      responses: {
        200: { description: '${name} updated successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
    delete: {
      tags: ['${name}'],
      summary: 'Delete ${name}',
      description: '',
      parameters: [
        ${idParam},
      ],
      responses: {
        200: { description: '${name} deleted successfully' },
        401: { description: 'unauthorized' },
      },
    },
  },
};
`;
