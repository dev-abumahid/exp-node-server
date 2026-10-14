import { PRINT_WIDTH } from "./format.js";

export interface RouteOptions {
    /** Require a signed-in user on every route. */
    auth?: boolean;
}

/** `router.<method>(...)`, on one line if it fits, otherwise one argument per line (like prettier). */
const routeCall = (method: string, args: string[]): string => {
    const oneLine = `router.${method}(${args.join(", ")});`;
    if (oneLine.length <= PRINT_WIDTH) return oneLine;
    return `router.${method}(\n${args.map((arg) => `  ${arg},`).join("\n")}\n);`;
};

export const routeGenerator = (name: string, { auth = false }: RouteOptions = {}): string => {
    // the middlewares in front of every handler
    const guard = auth ? ["auth()"] : [];
    const validate = (schema: string) => `RequestValidator(${name}_validations.${schema}_${name})`;
    const handler = (fn: string) => `${name}_controller.${fn}_${name}`;

    const header = auth
        ? `import auth from '../../middlewares/auth.js';\n`
        : "";
    const note = auth
        ? `// every route needs a signed-in user; use auth('ADMIN') to allow admins only`
        : `// public routes: protect them with auth() from '../../middlewares/auth.js', e.g.\n// router.post('/', auth('ADMIN'), ...), or generate the module with --auth`;

    return `import { Router } from 'express';
${header}import RequestValidator from '../../middlewares/request_validator.js';
import { ${name}_controller } from './${name}.controller.js';
import { ${name}_validations } from './${name}.validation.js';

const router = Router();

${note}
${routeCall("get", ["'/'", ...guard, handler("get_all")])}
${routeCall("post", ["'/'", ...guard, validate("create"), handler("create")])}
${routeCall("get", ["'/:id'", ...guard, handler("get_single")])}
${routeCall("patch", ["'/:id'", ...guard, validate("update"), handler("update")])}
${routeCall("delete", ["'/:id'", ...guard, handler("delete")])}

export default router;
`;
};
