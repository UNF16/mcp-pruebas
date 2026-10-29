import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";



// ───────────────────────────────────────────────────────────── 

// Configuración de Octokit (Lecture 4) 

// ───────────────────────────────────────────────────────────── 



// Cargamos el .env de la RAÍZ del proyecto con ruta absoluta. 

// ¿Por qué? Antigravity lanza el server desde OTRA carpeta: con dotenv.config() a secas 

// no encontraría el .env y todas las tools fallarían con 401. 

const raizDelProyecto = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: resolve(raizDelProyecto, ".env"), quiet: true });



export function createOctokit(): Octokit {

    return new Octokit({

        auth: process.env.GITHUB_TOKEN, // el token NUNCA va escrito en el código 

        userAgent: "github-mcp-server/1.0.0",

    });

} 