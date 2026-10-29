import type { Octokit } from "@octokit/rest";

import { AppError, GitHubAPIError, toAppError, type ErrorContext } from "../errors/index.js";

import { withRetry, DEFAULT_RETRY, type RetryOptions } from "../utils/retry.js";

import type { CommitDTO, IssueDTO, RepoDTO, RepoInfo } from "../types.js";

import type { CreateIssueInput, ListRepositoriesInput } from "../schemas/index.js";



// ───────────────────────────────────────────────────────────── 

// Operaciones de GitHub (el "wrapper" de Octokit, Lectures 4, 5 y 6) 

// Las tools NO usan Octokit directo: usan esta interfaz. 

// Así en los tests le pasamos una versión falsa (mock) sin tocar la red. 

// ───────────────────────────────────────────────────────────── 



export interface GitHubOperations {

    listRepositories(input: ListRepositoriesInput): Promise<RepoDTO[]>;

    getRepository(owner: string, repo: string): Promise<RepoInfo>;

    createIssue(input: CreateIssueInput): Promise<IssueDTO>;

    createCommitWithFile(input: CommitFileInput): Promise<CommitDTO>;

}



export interface CommitFileInput {

    owner: string;

    repo: string;

    branch: string;

    path: string;

    content: string;

    message: string;

}



// En las escrituras que cambian algo VISIBLE (crear issue, mover la rama) solo reintentamos 

// el rate limit: GitHub rechazó la request, así que seguro no se creó nada. Un error de red, 

// en cambio, puede llegar DESPUÉS de que GitHub creó el issue: reintentar lo duplicaría. 

const soloRateLimit = (err: AppError) => err.retryable && (err.status === 403 || err.status === 429);



export function createGitHubOperations(octokit: Octokit, retry: RetryOptions = DEFAULT_RETRY): GitHubOperations {

    // Toda llamada pasa por acá: reintento responsable + traducción de errores 

    function call<T>(ctx: ErrorContext, fn: () => Promise<T>, retryOn?: (err: AppError) => boolean): Promise<T> {

        return withRetry(fn, (raw) => toAppError(raw, ctx), retry, retryOn);

    }



    return {

        async listRepositories({ type, sort, per_page }) {

            const { data } = await call({ operation: "listar tus repositorios" }, () =>

                octokit.rest.repos.listForAuthenticatedUser({ type, sort, per_page }),

            );

            return data.map((r) => ({

                full_name: r.full_name,

                owner: r.owner.login,

                name: r.name,

                private: r.private,

                description: r.description,

                html_url: r.html_url,

            }));

        },



        async getRepository(owner, repo) {

            const { data } = await call({ operation: "consultar el repositorio", owner, repo }, () =>

                octokit.rest.repos.get({ owner, repo }),

            );

            return { full_name: data.full_name, default_branch: data.default_branch, has_issues: data.has_issues };

        },



        async createIssue({ owner, repo, title, body, labels }) {

            const { data } = await call(

                { operation: "crear el issue", owner, repo },

                () => octokit.rest.issues.create({ owner, repo, title, ...(body ? { body } : {}), ...(labels ? { labels } : {}) }),

                soloRateLimit, // crear un issue NO es idempotente: no reintentamos errores de red 

            );

            return {

                number: data.number,

                title: data.title,

                state: data.state,

                html_url: data.html_url,

                labels: data.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),

            };

        },



        // ── El commit en 6 pasos (Lecture 6) ─────────────────────── 

        async createCommitWithFile({ owner, repo, branch, path, content, message }) {

            const ctx = { operation: "crear el commit", owner, repo, branch };



            // PASO 1 · getRef: ¿a qué commit apunta hoy la rama?               (solo lectura) 

            let baseCommitSha: string;

            try {

                const { data: ref } = await call(ctx, () => octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }));

                baseCommitSha = ref.object.sha;

            } catch (err) {

                if (err instanceof AppError && err.status === 404) {

                    throw new GitHubAPIError(`La rama ${branch} no existe en ${owner}/${repo}.`, {

                        status: 404,

                        hint: "Usá una rama que exista, o no mandes branch para usar la rama principal del repo.",

                        details: { step: "1/6 getRef" },

                    });

                }

                throw err;

            }



            // PASO 2 · getCommit: ¿qué tree (foto de archivos) tiene ese commit?  (solo lectura) 

            const { data: baseCommit } = await call(ctx, () =>

                octokit.rest.git.getCommit({ owner, repo, commit_sha: baseCommitSha }),

            );



            // PASO 3 · createBlob: subimos el CONTENIDO del archivo (en base64) 

            const { data: blob } = await call(

                ctx,

                () =>

                    octokit.rest.git.createBlob({

                        owner,

                        repo,

                        content: Buffer.from(content, "utf8").toString("base64"),

                        encoding: "base64",

                    }),

            );



            // PASO 4 · createTree: foto nueva = la anterior (base_tree) + nuestro archivo 

            const { data: tree } = await call(

                ctx,

                () =>

                    octokit.rest.git.createTree({

                        owner,

                        repo,

                        base_tree: baseCommit.tree.sha,

                        tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],

                    }),

            );



            // PASO 5 · createCommit: apunta al tree nuevo y su padre es el commit anterior 

            const { data: newCommit } = await call(

                ctx,

                () => octokit.rest.git.createCommit({ owner, repo, message, tree: tree.sha, parents: [baseCommitSha] }),

            );



            // PASO 6 · updateRef: movemos la rama. RECIÉN ACÁ el cambio se ve en GitHub. 

            // force: false → si otra persona commiteó mientras tanto, GitHub lo rechaza (422) y no pisamos nada. 

            try {

                await call(

                    ctx,

                    () => octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha, force: false }),

                    soloRateLimit,

                );

            } catch (err) {

                if (err instanceof AppError && err.status === 422) {

                    throw new GitHubAPIError(`La rama ${branch} cambió mientras se creaba el commit.`, {

                        status: 422,

                        hint: "Otra persona hizo un commit en esa rama. Volvé a ejecutar la tool: va a partir del commit nuevo.",

                        details: { step: "6/6 updateRef" },

                    });

                }

                throw err;

            }



            return {

                commit_sha: newCommit.sha,

                commit_url: newCommit.html_url,

                branch,

                path,

                file_url: `https://github.com/${owner}/${repo}/blob/${branch}/${path}`,

            };

        },

    };

} 