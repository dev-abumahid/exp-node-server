export const profileSwaggerDocs = {
  '/api/profile': {
    patch: {
      tags: ['profile'],
      summary: 'Update profile',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    fullName: { type: 'string' },
                  },
                },
                file: {
                  type: 'string',
                  format: 'binary',
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'profile updated successfully' },
        500: { description: 'Validation error or internal server error' },
      },
    },
  },
};
