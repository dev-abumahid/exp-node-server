import { describe, expect, it } from "vitest";
import { validateModuleName, validateProjectName } from "../src/lib/validators.js";

describe("validateModuleName", () => {
    it.each([
        ["order", "order"],
        ["Order", "order"],
        ["order item", "order_item"],
        ["order-item", "order_item"],
        ["  Order  Item ", "order_item"],
    ])("normalizes %j -> %j", (input, expected) => {
        expect(validateModuleName(input)).toBe(expected);
    });

    it.each([undefined, "", "   ", "order1", "_order", "order.item", "../etc"])("rejects %j", (input) => {
        expect(validateModuleName(input)).toBeNull();
    });
});

describe("validateProjectName", () => {
    it.each([
        ["my-api", "my-api"],
        ["My API", "my-api"],
        ["api2", "api2"],
    ])("normalizes %j -> %j", (input, expected) => {
        expect(validateProjectName(input)).toBe(expected);
    });

    it.each([undefined, "", "-api", "my_api", "../api", "my/api", "."])("rejects %j", (input) => {
        expect(validateProjectName(input)).toBeNull();
    });
});
