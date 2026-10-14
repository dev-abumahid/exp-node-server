import { PRINT_WIDTH } from "./format.js";

/** `router.<method>(...)`, on one line if it fits, otherwise one argument per line (like prettier). */
const routeCall = (method: string, args: string[]): string => {
    const oneLine = `router.${method}(${args.join(", ")});`;
    if (oneLine.length <= PRINT_WIDTH) return oneLine;
    return `router.${method}(\n${args.map((arg) => `  ${arg},`).join("\n")}\n);`;
};

export const routeGenerator = (name: string): string => `import { Router } from 'express';
import RequestValidator from '../../middlewares/request_validator.js';
import { ${name}_controller } from './${name}.controller.js';
import { ${name}_validations } from './${name}.validation.js';

const router = Router();

${routeCall("get", ["'/'", `${name}_controller.get_all_${name}`])}
${routeCall("post", ["'/'", `RequestValidator(${name}_validations.create_${name})`, `${name}_controller.create_${name}`])}
${routeCall("get", ["'/:id'", `${name}_controller.get_single_${name}`])}
${routeCall("patch", ["'/:id'", `RequestValidator(${name}_validations.update_${name})`, `${name}_controller.update_${name}`])}
${routeCall("delete", ["'/:id'", `${name}_controller.delete_${name}`])}

export default router;
`;
