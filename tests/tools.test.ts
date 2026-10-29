import { describe, it, expect } from "vitest";

import { CreateCommitSchema, CreateIssueSchema, ListRepositoriesSchema, toJsonSchema } from "../src/schemas/index.js";



// Tests de CONTRATO (Lecture 8): ¿el schema deja pasar lo válido y frena lo inválido? 

// Afirmamos sobre path y code del error, no sobre el texto exacto (que puede cambiar). 



describe("ListRepositoriesSchema", () => {

    it("acepta un input vacío y aplica los defaults", () => {

        const res = ListRepositoriesSchema.safeParse({});

        expect(res.success).toBe(true);

        expect(res.data).toEqual({ type: "all", sort: "updated", per_page: 30 });

    });



    it("rechaza un type que no está en el enum", () => {

        const res = ListRepositoriesSchema.safeParse({ type: "visible" });

        expect(res.success).toBe(false);

        expect(res.error?.issues[0]?.path).toEqual(["type"]);

        expect(res.error?.issues[0]?.code).toBe("invalid_value");

    });



    it("rechaza per_page mayor a 100", () => {

        const res = ListRepositoriesSchema.safeParse({ per_page: 500 });

        expect(res.success).toBe(false);

        expect(res.error?.issues[0]?.path).toEqual(["per_page"]);

    });

});



describe("CreateIssueSchema", () => {

    it("acepta el input mínimo (owner, repo y title)", () => {

        const res = CreateIssueSchema.safeParse({ owner: "octocat", repo: "Hello-World", title: "Bug en el login" });

        expect(res.success).toBe(true);

    });



    it("rechaza un título de menos de 3 caracteres", () => {

        const res = CreateIssueSchema.safeParse({ owner: "octocat", repo: "Hello-World", title: "x" });

        expect(res.success).toBe(false);

        expect(res.error?.issues[0]?.path).toEqual(["title"]);

        expect(res.error?.issues[0]?.code).toBe("too_small");

    });



    it("rechaza si falta owner", () => {

        const res = CreateIssueSchema.safeParse({ repo: "Hello-World", title: "Bug en el login" });

        expect(res.success).toBe(false);

        expect(res.error?.issues.some((i) => i.path[0] === "owner")).toBe(true);

    });

});



describe("CreateCommitSchema", () => {

    const base = { owner: "octocat", repo: "Hello-World", content: "hola", message: "Agrega notas" };



    it("acepta un path relativo y branch opcional", () => {

        expect(CreateCommitSchema.safeParse({ ...base, path: "docs/notas.md" }).success).toBe(true);

    });



    it("rechaza un path que empieza con /", () => {

        const res = CreateCommitSchema.safeParse({ ...base, path: "/notas.md" });

        expect(res.success).toBe(false);

        expect(res.error?.issues[0]?.path).toEqual(["path"]);

    });



    it("rechaza un path con ..", () => {

        expect(CreateCommitSchema.safeParse({ ...base, path: "../secreto.txt" }).success).toBe(false);

    });

});



describe("JSON Schema que ve el LLM", () => {

    it("expone las propiedades y los campos requeridos (no queda vacío)", () => {

        const json = toJsonSchema(CreateIssueSchema);

        expect(json.type).toBe("object");

        expect(json.required).toEqual(["owner", "repo", "title"]);

        expect(Object.keys(json.properties as object)).toContain("labels");

    });

}); 