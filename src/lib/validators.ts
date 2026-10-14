/**
 * Normalizes a module name: lowercases it and turns spaces/dashes into
 * underscores. Returns `null` if the result isn't a valid identifier.
 *
 * "Order Item" -> "order_item"
 */
export function validateModuleName(name: string | undefined): string | null {
    if (!name) return null;

    const normalized = name
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, "_");

    // must be usable as a JS identifier and a URL segment
    return /^[a-z][a-z_]*$/.test(normalized) ? normalized : null;
}

/**
 * Normalizes a project (folder / npm package) name: lowercases it and turns
 * spaces into dashes. Returns `null` if the result isn't valid.
 *
 * "My API" -> "my-api"
 */
export function validateProjectName(name: string | undefined): string | null {
    if (!name) return null;

    const normalized = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

    return /^[a-z0-9][a-z0-9-]*$/.test(normalized) ? normalized : null;
}
