import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import SwaggerParser from '@apidevtools/swagger-parser';

import { createOpenApiDocument } from '../src/docs/openapi.js';

const artifactPath = fileURLToPath(new URL('../../../docs/api/openapi.json', import.meta.url));
const document = createOpenApiDocument();
const expectedArtifact = `${JSON.stringify(document, null, 2)}\n`;
const committedArtifact = await readFile(artifactPath, 'utf8');

if (committedArtifact !== expectedArtifact) {
  throw new Error('docs/api/openapi.json is stale. Run npm run openapi:generate.');
}

await SwaggerParser.validate(artifactPath);
console.log(`OpenAPI ${document.openapi} contract is valid and synchronized.`);
