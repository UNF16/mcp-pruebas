import { describe, it, expect } from "vitest";

import { fromZodError, formatToolError, toAppError } from "../src/errors/index.js";

import { CreateIssueSchema } from "../src/schemas/index.js";



// Tests de la TRADUCCIÓN de errores (Lecture 9): error crudo de Octokit → mensaje accionable 

const ctx = { operation: "crear el issue", owner: "octocat", repo: "no-existe" };

const githubError = (status: number, headers: Record<string, string> = {}) => ({

    status,

    message: "error de GitHub",

    response: { headers, data: { message: "error de GitHub" } },

});



describe("toAppError", () => {

    it("traduce un 404 a lenguaje natural con el nombre del repo", () => {

        const err = toAppError(githubError(404), ctx);

        expect(err.code).toBe("GITHUB_API_ERROR");

        expect(err.message).toBe("El repositorio octocat/no-existe no fue encontrado. Verifica el nombre e intenta de nuevo.");

        expect(err.action).toBe("CHECK_RESOURCE");

    });



    it("traduce un 401 a AUTH_ERROR y no es reintentable", () => {

        const err = toAppError(githubError(401), ctx);

        expect(err.code).toBe("AUTH_ERROR");

        expect(err.retryable).toBe(false);

        expect(err.action).toBe("ADD_CREDENTIALS");

    });



    it("detecta el rate limit (403 + x-ratelimit-remaining: 0) y lo marca reintentable", () => {

        const err = toAppError(githubError(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1900000000" }), ctx);

        expect(err.retryable).toBe(true);

        expect(err.action).toBe("WAIT_AND_RETRY");

    });



    it("distingue un 403 de permisos (sin rate limit): no es reintentable", () => {

        const err = toAppError(githubError(403, { "x-ratelimit-remaining": "4000" }), ctx);

        expect(err.retryable).toBe(false);

        expect(err.message).toContain("no tiene permiso");

    });



    it("un fallo de red (sin response) se traduce a NETWORK_ERROR", () => {

        const err = toAppError({ status: 500, message: "fetch failed" }, ctx);

        expect(err.code).toBe("NETWORK_ERROR");

        expect(err.retryable).toBe(true);

    });

});



describe("formatToolError", () => {

    it("un error desconocido NO filtra el mensaje ni el stack originales", () => {

        const payload = formatToolError(new Error("password=1234 en /home/secreto"));

        expect(payload.code).toBe("UNKNOWN_ERROR");

        expect(JSON.stringify(payload)).not.toContain("1234");

    });



    it("un error de Zod se convierte en VALIDATION_ERROR con el campo que falló", () => {

        const res = CreateIssueSchema.safeParse({ owner: "octocat", repo: "r", title: "x" });

        const payload = formatToolError(fromZodError(res.error!));

        expect(payload.code).toBe("VALIDATION_ERROR");

        expect(payload.action).toBe("FIX_INPUT");

        expect(payload.message).toContain("title");

    });

}); 