import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createOpenApiDocument } from '../src/docs/openapi.js';

const outputPath = fileURLToPath(new URL('../../../docs/api/openapi.json', import.meta.url));
const serializedDocument = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;

await writeFile(outputPath, serializedDocument, 'utf8');
console.log(`OpenAPI document exported to ${outputPath}`);
