import type { McpTool } from "../types.js";
import type { GitHubOperations } from "../github/operations.js";
import { ListRepositoriesSchema, toJsonSchema } from "../schemas/index.js";
import { fromZodError, fail } from "../errors/index.js";

// Tool de LECTURA: el patrón completo de una tool en su versión más simple 

export function listRepositoriesTool(github: GitHubOperations): McpTool {
    return {
        // 1) CONTRATO: lo único que ve el LLM para decidir si usarla 

        definition: {
            name: "list_repositories",
            description:
                "Lista los repositorios del usuario dueño del token (el usuario autenticado). " +
                "Usala para descubrir qué repos existen y obtener el owner y el nombre exactos " +
                "antes de crear issues o commits. Solo lectura. No lista repos de otros usuarios ni muestra issues.",
            inputSchema: toJsonSchema(ListRepositoriesSchema),

        },


        async handler(args) {

            // 2) VALIDAR antes de tocar la red 

            const parsed = ListRepositoriesSchema.safeParse(args);
            if (!parsed.success) return fail("list_repositories", fromZodError(parsed.error));

            // 3) LLAMAR a GitHub (a través del wrapper) y 4) RESPONDER con DTOs chicos 

            try {

                const repositories = await github.listRepositories(parsed.data);
                // Éxito: el JSON como texto (para el LLM) y como structuredContent (para programas) 
                const data = { count: repositories.length, repositories };

                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };

            } catch (err) {

                return fail("list_repositories", err);

            }

        },

    };

} 