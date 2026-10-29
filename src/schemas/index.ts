import { z } from "zod";



// ───────────────────────────────────────────────────────────── 

// Contratos de entrada de cada tool (Lectures 3 y 5) 

// Un solo schema sirve para: validar en runtime, inferir el tipo TS 

// y generar el JSON Schema que lee el LLM. 

// ───────────────────────────────────────────────────────────── 



const owner = z.string().trim().min(1, "owner es requerido").describe("Dueño del repositorio: usuario u organización de GitHub. Ej: octocat");

const repo = z.string().trim().min(1, "repo es requerido").describe("Nombre del repositorio, sin el owner. Ej: Hello-World");



// ── list_repositories ────────────────────────────────────────── 

export const ListRepositoriesSchema = z.object({

    type: z.enum(["all", "public", "private"]).default("all").describe("Qué repos listar: todos, solo públicos o solo privados"),

    sort: z.enum(["created", "updated", "pushed", "full_name"]).default("updated").describe("Orden del listado"),

    per_page: z.number().int().min(1).max(100).default(30).describe("Cantidad de repos a devolver (1 a 100)"),

});



// ── create_issue ─────────────────────────────────────────────── 

export const CreateIssueSchema = z.object({

    owner,

    repo,

    title: z.string().trim().min(3, "title necesita al menos 3 caracteres").max(256, "title admite hasta 256 caracteres").describe("Título del issue"),

    body: z.string().max(65_000, "body es demasiado largo").optional().describe("Descripción del issue en markdown"),

    labels: z.array(z.string().min(1)).max(10, "máximo 10 labels").optional().describe("Etiquetas que YA existen en el repo. Ej: [\"bug\"]"),

});


// ── create_commit ────────────────────────────────────────────── 

export const CreateCommitSchema = z.object({

    owner,

    repo,

    path: z.string().trim().min(1, "path es requerido").refine((p) => !p.startsWith("/"), "path no puede empezar con /").refine((p) => !p.split("/").includes(".."), "path no puede contener ..").describe("Ruta del archivo dentro del repo, sin / al inicio. Ej: docs/notas.md"),

    content: z.string().describe("Contenido COMPLETO del archivo (texto). Si el archivo existe, se reemplaza entero"),

    message: z.string().trim().min(1, "message es requerido").max(500).describe("Mensaje del commit. Ej: Agrega notas de la reunión"),

    branch: z.string().trim().min(1).optional().describe("Rama donde commitear. Si no se indica, se usa la rama principal del repo"),

});

// Tipos inferidos: el schema es la única fuente de verdad (z.infer) 

export type ListRepositoriesInput = z.infer<typeof ListRepositoriesSchema>;

export type CreateIssueInput = z.infer<typeof CreateIssueSchema>;

export type CreateCommitInput = z.infer<typeof CreateCommitSchema>;



// El JSON Schema que va en tools/list. Usamos el conversor que trae Zod 4. 

// (zod-to-json-schema NO funciona con Zod 4: devuelve un schema vacío sin avisar) 

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {

    const { $schema: _ignorado, ...json } = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;

    return json;

} 