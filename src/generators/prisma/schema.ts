import { toPascalCase } from "../../lib/strings.js";

export const prismaSchemaGenerator = (name: string): string => `model ${toPascalCase(name)} {
    id        String   @id @default(uuid())
    // example field, keep it in sync with ${name}.validation.ts
    name      String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`;
