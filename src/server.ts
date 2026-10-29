import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import type { McpTool } from "./types.js";

import { ValidationError, fail } from "./errors/index.js";

import { logger } from "./utils/logging.js";

import { createOctokit } from "./github/client.js";

import { createGitHubOperations } from "./github/operations.js";

import { listRepositoriesTool } from "./tools/list-repositories.js";

import { createIssueTool } from "./tools/create-issue.js";

import { createCommitTool } from "./tools/create-commit.js";



// ───────────────────────────────────────────────────────────── 

// Entry point del MCP Server (Lecture 2): responde tools/list y tools/call por stdio 

// ───────────────────────────────────────────────────────────── 

const SERVER_INFO = { name: "github-mcp-server", version: "1.0.0" };



// 1) El acceso a GitHub (Octokit + nuestras operaciones) 

const github = createGitHubOperations(createOctokit());



// 2) REGISTRO de tools: agregar una tool nueva = una línea acá 

const tools: McpTool[] = [

    listRepositoriesTool(github),

    createIssueTool(github),

    createCommitTool(github),

];



// 3) El server y sus dos handlers 

const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });



// tools/list → el catálogo: nombre, descripción y schema de cada tool 

server.setRequestHandler(ListToolsRequestSchema, async () => ({

    tools: tools.map((t) => t.definition),

}));



// tools/call → buscamos la tool por nombre y ejecutamos su handler 

server.setRequestHandler(CallToolRequestSchema, async (request) => {

    const { name, arguments: args } = request.params;

    logger.info("tool llamada", { tool: name, args: resumirArgs(args) }); // observabilidad (Lecture 7) 



    const tool = tools.find((t) => t.definition.name === name);

    if (!tool) {

        return fail(name, new ValidationError(`La tool ${name} no existe. Tools disponibles: ${tools.map((t) => t.definition.name).join(", ")}.`));

    }

    return tool.handler(args ?? {});

});



// Para el log: mostramos los argumentos pero recortamos textos largos (ej: el contenido de un archivo) 

function resumirArgs(args: unknown): unknown {

    if (!args || typeof args !== "object") return args;

    return Object.fromEntries(

        Object.entries(args).map(([k, v]) => [k, typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v]),

    );

}



// 4) Conectar por stdio y arrancar 

async function main() {

    if (!process.env.GITHUB_TOKEN) {

        logger.warn("GITHUB_TOKEN no está configurado: las tools van a responder AUTH_ERROR. Revisá el archivo .env");

    }

    await server.connect(new StdioServerTransport());

    logger.info("server iniciado", { ...SERVER_INFO, tools: tools.map((t) => t.definition.name) });

}



main().catch((err) => {

    logger.error("el server no pudo iniciar", { message: err instanceof Error ? err.message : String(err) });

    process.exit(1);

}); 