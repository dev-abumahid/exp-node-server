import { configs } from './app/configs/index.js';
import { accountSwaggerDocs } from './app/modules/account/account.swagger.js';
import { profileSwaggerDocs } from './app/modules/profile/profile.swagger.js';

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Doc - Build with exp-node-server',
      version: '1.0.0',
      description: 'Express + Mongoose API with auto-generated Swagger docs',
    },
    paths: {
      ...accountSwaggerDocs,
      ...profileSwaggerDocs,
    },
    servers:
      configs.env === 'production'
        ? [
            { url: configs.swagger_config.production_base_url },
            { url: configs.swagger_config.development_base_url },
          ]
        : [
            { url: configs.swagger_config.development_base_url },
            { url: configs.swagger_config.production_base_url },
          ],
    components: {
      securitySchemes: {
        AuthorizationToken: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Put your accessToken here ',
        },
      },
    },
    security: [
      {
        AuthorizationToken: [],
      },
    ],
  },
  apis: [],
};
