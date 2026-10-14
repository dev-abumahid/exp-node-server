import { toPascalCase } from "../../lib/strings.js";

export const prismaSchemaGenerator = (name: string): string => `model ${toPascalCase(name)} {
    id        String   @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`;
