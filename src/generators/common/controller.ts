// the templates' prettier `printWidth`
const PRINT_WIDTH = 100;

/** `const result = await <service call>`, wrapped after `=` when too long (like prettier). */
const callService = (name: string, fn: string): string => {
    const call = `await ${name}_service.${fn}(req);`;
    const oneLine = `  const result = ${call}`;
    return oneLine.length <= PRINT_WIDTH ? oneLine : `  const result =\n    ${call}`;
};

export const controllerGenerator = (name: string): string => `import catchAsync from '../../utils/catch_async.js';
import manageResponse from '../../utils/manage_response.js';
import { ${name}_service } from './${name}.service.js';

const get_all_${name} = catchAsync(async (req, res) => {
${callService(name, `get_all_${name}_from_db`)}
  manageResponse(res, {
    success: true,
    statusCode: 200,
    message: 'All ${name} fetched successfully.',
    data: result,
    meta: {},
  });
});

const get_single_${name} = catchAsync(async (req, res) => {
${callService(name, `get_single_${name}_from_db`)}
  manageResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Single ${name} fetched successfully.',
    data: result,
    meta: {},
  });
});

const create_${name} = catchAsync(async (req, res) => {
${callService(name, `create_${name}_into_db`)}
  manageResponse(res, {
    success: true,
    statusCode: 201,
    message: '${name} created successfully.',
    data: result,
    meta: {},
  });
});

const update_${name} = catchAsync(async (req, res) => {
${callService(name, `update_${name}_into_db`)}
  manageResponse(res, {
    success: true,
    statusCode: 200,
    message: '${name} updated successfully.',
    data: result,
    meta: {},
  });
});

const delete_${name} = catchAsync(async (req, res) => {
${callService(name, `delete_${name}_from_db`)}
  manageResponse(res, {
    success: true,
    statusCode: 200,
    message: '${name} deleted successfully.',
    data: result,
    meta: {},
  });
});

export const ${name}_controller = {
  get_all_${name},
  get_single_${name},
  create_${name},
  update_${name},
  delete_${name},
};
`;
