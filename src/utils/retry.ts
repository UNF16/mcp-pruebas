import { AppError } from "../errors/index.js";
import { logger } from "./logging.js";



// ───────────────────────────────────────────────────────────── 

// Retry responsable con exponential backoff (Lectures 4 y 9) 

// Solo reintenta errores TRANSITORIOS (retryable: rate limit, red, 5xx). 

// Nunca reintenta 401, 404, 422 ni errores de validación. 

// ───────────────────────────────────────────────────────────── 



export interface RetryOptions {

    maxRetries: number; // cuántas veces reintentar como máximo (nunca infinito) 

    baseDelayMs: number; // primera espera; después se duplica: 1s, 2s, 4s... 

    maxDelayMs: number; // tope de cada espera 

}



export const DEFAULT_RETRY: RetryOptions = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 10_000 };



const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));



export async function withRetry<T>(

    fn: () => Promise<T>,

    toError: (err: unknown) => AppError,

    opts: RetryOptions = DEFAULT_RETRY,

    retryOn: (err: AppError) => boolean = (err) => err.retryable,

): Promise<T> {

    for (let attempt = 0; ; attempt++) {

        try {

            return await fn();

        } catch (raw) {

            const err = toError(raw); // traducimos el error crudo a nuestro AppError 

            if (!retryOn(err) || attempt >= opts.maxRetries) throw err;



            // Si GitHub dice cuánto esperar (header retry-after), le hacemos caso. Si no, backoff. 

            const retryAfter = Number(err.details?.["retryAfter"]);

            const backoff = opts.baseDelayMs * 2 ** attempt;

            const waitMs = Math.min(retryAfter > 0 ? retryAfter * 1000 : backoff, opts.maxDelayMs);

            logger.warn("reintentando request", { attempt: attempt + 1, waitMs, code: err.code, status: err.status });

            await sleep(waitMs);

        }

    }

} 