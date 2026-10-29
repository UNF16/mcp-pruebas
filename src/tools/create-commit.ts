import type { McpTool } from "../types.js";

import type { GitHubOperations } from "../github/operations.js";

import { CreateCommitSchema, toJsonSchema } from "../schemas/index.js";

import { fromZodError, fail } from "../errors/index.js";



// Tool de alto nivel: el agente ve "crear archivo + commit"; los 6 pasos de Git quedan escondidos (Lecture 6) 

export function createCommitTool(github: GitHubOperations): McpTool {

    return {

        definition: {

            name: "create_commit",

            description:

                "Crea o modifica UN archivo de texto en un repositorio haciendo un commit (por ejemplo README.md o docs/notas.md). " +

                "Si el archivo ya existe, lo REEMPLAZA completo con el contenido nuevo. " +

                "Requiere owner, repo, path, content y message; branch es opcional (por defecto, la rama principal). " +

                "Escribe en GitHub: el commit queda en el historial. No sirve para crear issues ni repositorios.",

            inputSchema: toJsonSchema(CreateCommitSchema),

        },



        async handler(args) {

            const parsed = CreateCommitSchema.safeParse(args);

            if (!parsed.success) return fail("create_commit", fromZodError(parsed.error));

            const { owner, repo, branch } = parsed.data;



            try {

                // PREFLIGHT: confirma que el repo existe y nos da su rama principal (main, master...) 

                const info = await github.getRepository(owner, repo);

                const commit = await github.createCommitWithFile({ ...parsed.data, branch: branch ?? info.default_branch });

                // Éxito: el JSON como texto (para el LLM) y como structuredContent (para programas) 

                const data = { commit };

                return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };

            } catch (err) {

                return fail("create_commit", err);

            }

        },

    };

} 