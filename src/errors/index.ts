import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logging.js";



// ───────────────────────────────────────────────────────────── 

// Jerarquía de errores del server (Lecture 9) 

// Cada error dice QUÉ pasó (message) y QUÉ HACER (action + hint). 

// ───────────────────────────────────────────────────────────── 



export type ErrorCode =

    | "VALIDATION_ERROR" // el input no cumple el contrato (lo detecta Zod, NO se llamó a GitHub) 

    | "AUTH_ERROR" // token ausente, inválido o vencido (401) 

    | "GITHUB_API_ERROR" // GitHub respondió con un rechazo (403, 404, 409, 422, 5xx...) 

    | "NETWORK_ERROR" // no hubo respuesta: sin internet, timeout, DNS 

    | "UNKNOWN_ERROR"; // cualquier otra cosa (un bug nuestro) 



export type ErrorAction =

    | "FIX_INPUT" // corregir los datos y volver a llamar 

    | "ADD_CREDENTIALS" // configurar o renovar el token 

    | "WAIT_AND_RETRY" // esperar y reintentar 

    | "CHECK_RESOURCE" // revisar que owner/repo/rama existan 

    | "CONTACT_SUPPORT"; // revisar los logs del server 



interface AppErrorOptions {

    code: ErrorCode;

    message: string;

    action: ErrorAction;

    hint: string;

    status?: number;

    retryable?: boolean;

    details?: Record<string, unknown>;

}



// Clase base: todos nuestros errores tienen la misma forma. 

export class AppError extends Error {

    readonly code: ErrorCode;

    readonly action: ErrorAction;

    readonly hint: string;

    readonly status: number | undefined;

    readonly retryable: boolean;

    readonly details: Record<string, unknown> | undefined;



    constructor(opts: AppErrorOptions) {

        super(opts.message);

        this.name = "AppError";

        this.code = opts.code;

        this.action = opts.action;

        this.hint = opts.hint;

        this.status = opts.status;

        this.retryable = opts.retryable ?? false;

        this.details = opts.details;

    }

}



export class ValidationError extends AppError {

    constructor(message: string, details?: Record<string, unknown>) {

        super({

            code: "VALIDATION_ERROR",

            message,

            status: 400,

            action: "FIX_INPUT",

            hint: "Corregí los campos indicados en details y volvé a llamar a la tool.",

            ...(details ? { details } : {}),

        });

        this.name = "ValidationError";

    }

}



export class AuthenticationError extends AppError {

    constructor(message = "El token de GitHub es inválido, venció o no está configurado.") {

        super({

            code: "AUTH_ERROR",

            message,

            status: 401,

            action: "ADD_CREDENTIALS",

            hint: "Revisá GITHUB_TOKEN en el archivo .env (que exista y no haya vencido) y reiniciá el server.",

        });

        this.name = "AuthenticationError";

    }

}



export class NetworkError extends AppError {

    constructor(message = "No se pudo conectar con GitHub.", details?: Record<string, unknown>) {

        super({

            code: "NETWORK_ERROR",

            message,

            status: 503,

            retryable: true,

            action: "WAIT_AND_RETRY",

            hint: "Revisá tu conexión a internet y volvé a intentar en unos segundos.",

            ...(details ? { details } : {}),

        });

        this.name = "NetworkError";

    }

}



export class GitHubAPIError extends AppError {

    constructor(

        message: string,

        opts: { status?: number; retryable?: boolean; hint: string; details?: Record<string, unknown> },

    ) {

        super({

            code: "GITHUB_API_ERROR",

            message,

            action: opts.retryable ? "WAIT_AND_RETRY" : "CHECK_RESOURCE",

            hint: opts.hint,

            retryable: opts.retryable ?? false,

            ...(opts.status !== undefined ? { status: opts.status } : {}),

            ...(opts.details ? { details: opts.details } : {}),

        });

        this.name = "GitHubAPIError";

    }

}



// ───────────────────────────────────────────────────────────── 

// Traducción: error crudo de Octokit → nuestro AppError 

// ───────────────────────────────────────────────────────────── 



// Dónde estábamos cuando falló (para armar mensajes con nombres reales) 

export interface ErrorContext {

    operation: string; // ej: "crear el issue" 

    owner?: string;

    repo?: string;

    branch?: string;

}



interface OctokitLikeError {

    status?: number;

    message?: string;

    response?: {

        headers?: Record<string, string | number | undefined>;

        data?: { message?: string; errors?: unknown };

    };

}



export function isRateLimit(status: number | undefined, headers: Record<string, string | number | undefined>) {

    return (status === 403 || status === 429) && (String(headers["x-ratelimit-remaining"]) === "0" || headers["retry-after"] !== undefined);

}



export function toAppError(err: unknown, ctx: ErrorContext): AppError {

    if (err instanceof AppError) return err; // ya está traducido 



    const e = (err ?? {}) as OctokitLikeError;

    const status = e.status;

    const headers = e.response?.headers ?? {};

    const repoName = ctx.owner && ctx.repo ? `${ctx.owner}/${ctx.repo}` : "indicado";



    // Sin "response" = la request nunca llegó a GitHub (Octokit lo reporta como status 500) 

    if (status === undefined || (status === 500 && !e.response)) {

        return new NetworkError("No se pudo conectar con GitHub para " + ctx.operation + ".", { cause: e.message ?? "desconocido" });

    }



    if (status === 401) return new AuthenticationError();



    if (isRateLimit(status, headers)) {

        const reset = Number(headers["x-ratelimit-reset"]);

        const hora = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toLocaleTimeString() : "en unos minutos";

        return new GitHubAPIError("Se alcanzó el límite de requests de GitHub (rate limit).", {

            status,

            retryable: true,

            hint: `Esperá y volvé a intentar (el límite se renueva a las ${hora}).`,

            details: { retryAfter: headers["retry-after"], reset: headers["x-ratelimit-reset"] },

        });

    }



    if (status === 403) {

        return new GitHubAPIError(`Tu token no tiene permiso para ${ctx.operation} en el repositorio ${repoName}.`, {

            status,

            hint: "Revisá que el token tenga el scope repo y que tengas acceso de escritura a ese repositorio.",

        });

    }



    if (status === 404) {

        return new GitHubAPIError(`El repositorio ${repoName} no fue encontrado. Verifica el nombre e intenta de nuevo.`, {

            status,

            hint: "Revisá owner y repo (mayúsculas y guiones). Si el repo es privado, el token tiene que tener acceso.",

        });

    }



    if (status === 409) {

        return new GitHubAPIError(`El repositorio ${repoName} está vacío (todavía no tiene commits).`, {

            status,

            hint: "Creá un primer archivo (por ejemplo un README) desde GitHub y volvé a intentar.",

        });

    }



    if (status === 410) {

        return new GitHubAPIError(`El repositorio ${repoName} tiene los issues desactivados.`, {

            status,

            hint: "Activalos en GitHub: Settings → General → Features → Issues.",

        });

    }



    if (status === 422) {

        return new GitHubAPIError(`GitHub rechazó los datos al ${ctx.operation}: ${e.response?.data?.message ?? "Validation Failed"}.`, {

            status,

            hint: "Revisá los campos enviados (ver details). Por ejemplo: un label o un usuario que no existe.",

            details: { errors: e.response?.data?.errors },

        });

    }



    if (status >= 500) {

        return new GitHubAPIError("GitHub tuvo un error interno.", {

            status,

            retryable: true,

            hint: "Es un problema temporal de GitHub. Volvé a intentar en unos segundos.",

        });

    }



    return new AppError({

        code: "UNKNOWN_ERROR",

        message: `Error inesperado al ${ctx.operation}.`,

        action: "CONTACT_SUPPORT",

        hint: "Revisá los logs del server (stderr) para ver el detalle.",

        status,

    });

}



// ───────────────────────────────────────────────────────────── 

// Lo que VE el agente cuando una tool falla: siempre la misma forma 

// ───────────────────────────────────────────────────────────── 

export interface ToolErrorPayload {

    code: ErrorCode;

    message: string;

    retryable: boolean;

    action: ErrorAction;

    hint: string;

    details?: Record<string, unknown>;

}



export function formatToolError(err: unknown): ToolErrorPayload {

    if (err instanceof AppError) {

        return {

            code: err.code,

            message: err.message,

            retryable: err.retryable,

            action: err.action,

            hint: err.hint,

            ...(err.details ? { details: err.details } : {}),

        };

    }

    // Nunca devolvemos el stack ni el error crudo: puede filtrar datos internos 

    return {

        code: "UNKNOWN_ERROR",

        message: "Error inesperado en el server.",

        retryable: false,

        action: "CONTACT_SUPPORT",

        hint: "Revisá los logs del server (stderr) para ver el detalle.",

    };

}



// Zod rechazó el input → ValidationError con el detalle de cada campo 

export function fromZodError(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ValidationError {

    const issues = error.issues.map((i) => ({ path: i.path.map(String).join(".") || "input", message: i.message }));

    const resumen = issues.map((i) => `${i.path}: ${i.message}`).join(" · ");

    return new ValidationError(`Input inválido: ${resumen}. No se llamó a GitHub.`, { issues });

}



// La respuesta de error de una tool: isError: true + el payload estándar 

export function fail(tool: string, err: unknown): CallToolResult {

    const payload = formatToolError(err);

    logger.error("la tool falló", { tool, code: payload.code, message: payload.message });

    return {

        isError: true,

        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],

    };

} 