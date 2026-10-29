import type { McpTool } from "../types.js";
import type { GitHubOperations } from "../github/operations.js";
import { CreateIssueSchema, toJsonSchema } from "../schemas/index.js";
import { fromZodError, GitHubAPIError, fail } from "../errors/index.js";

// Tool de ESCRITURA con preflight (Lecture 5) 

export function createIssueTool(github: GitHubOperations): McpTool {

    return {

        definition: {

            name: "create_issue",

            description:

                "Crea un issue NUEVO en un repositorio de GitHub. Requiere owner, repo y title. " +

                "Si no sabés el owner o el nombre exacto del repo, usá list_repositories primero. " +

                "Escribe en GitHub: el issue queda publicado. No sirve para modificar ni cerrar issues existentes.",

            inputSchema: toJsonSchema(CreateIssueSchema),

        },



        async handler(args) {

            const parsed = CreateIssueSchema.safeParse(args);

            if (!parsed.success) return fail("create_issue", fromZodError(parsed.error));

            const { owner, repo } = parsed.data;



            try {

                // PREFLIGHT: antes de escribir, verificamos que el repo exista y acepte issues 

                const info = await github.getRepository(owner, repo);

                if (!info.has_issues) {

                    throw new GitHubAPIError(`El repositorio ${owner}/${repo} tiene los issues desactivados.`, {

                        hint: "Activalos en GitHub: Settings → General → Features → Issues.",

                    });

                }



                const issue = await github.createIssue(parsed.data);

                // Éxito: el JSON como texto (para el LLM) y como structuredContent (para programas) 

                const data = { issue };

                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };

            } catch (err) {

                return fail("create_issue", err);

            }

        },

    };

} 