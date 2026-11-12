import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";
function load(path, require = () => {}) {
  const context = { exports: {}, URL, crypto: webcrypto, require };
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
const model = load("../src/lib/lesson-materials.ts");
function setup({ uploadFail = false, saveFail = false } = {}) {
  const calls = [];
  const bucket = {
    upload: async (path, file, options) => {
      calls.push(["upload", path, options]);
      return {
        error:
          uploadFail && file.name === "second.pdf"
            ? new Error("upload failed")
            : null,
      };
    },
    remove: async (paths) => {
      calls.push(["remove", Array.from(paths)]);
      return { error: null };
    },
    createSignedUrl: async (...args) => {
      calls.push(["sign", ...args]);
      return {
        data: { signedUrl: "https://storage.example/signed" },
        error: null,
      };
    },
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "teacher" } }, error: null }),
    },
    storage: { from: () => bucket },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: saveFail ? null : "lesson-id",
        error: saveFail ? new Error("database unavailable") : null,
      };
    },
  };
  const store = load("../src/lib/lesson-store.ts", (name) =>
    name === "@/lib/supabase" ? { getSupabase: () => client } : model,
  );
  const presentations = ["first.pdf", "second.pdf"].map((name) => ({
    id: name,
    title: name,
    kind: "file",
    url: null,
    storage_path: null,
    file_name: name,
    mime_type: "application/pdf",
    size_bytes: 100,
    file: { name, size: 100 },
  }));
  const draft = {
    lesson_date: "2026-11-12",
    title: "Тема",
    body: "",
    homework: "",
    homework_due: "",
    published: true,
    revision: 1,
    presentations,
  };
  return { store, calls, draft };
}
test("uploads finish before lesson publication, local File objects stay out of RPC and old files are removed only after save", async () => {
  const { store, calls, draft } = setup();
  const progress = [];
  assert.equal(
    await store.saveLesson(draft, [{ storage_path: "old.pdf" }], (...args) =>
      progress.push(args),
    ),
    "lesson-id",
  );
  const saveIndex = calls.findIndex(
    ([name]) => name === "save_lesson_materials",
  );
  assert.equal(saveIndex, 2);
  assert.equal(calls[saveIndex + 1][0], "remove");
  assert.deepEqual(calls[saveIndex + 1][1], ["old.pdf"]);
  assert.equal(progress.length, 2);
  assert.equal(
    calls[saveIndex][1].presentations.every(
      (item) => !item.file && item.storage_path.startsWith("teacher/"),
    ),
    true,
  );
  assert.equal(
    calls
      .filter(([name]) => name === "upload")
      .every(
        ([, , options]) =>
          options.upsert === false && options.contentType === "application/pdf",
      ),
    true,
  );
});
test("failed uploads never publish partial materials; database errors clean only newly uploaded paths", async () => {
  for (const options of [{ uploadFail: true }, { saveFail: true }]) {
    const { store, calls, draft } = setup(options);
    await assert.rejects(
      store.saveLesson(draft, [{ storage_path: "old.pdf" }], () => {}),
    );
    if (options.uploadFail)
      assert.equal(
        calls.some(([name]) => name === "save_lesson_materials"),
        false,
      );
    const removals = calls
      .filter(([name]) => name === "remove")
      .flatMap(([, paths]) => paths);
    assert.equal(removals.length, 2);
    assert.equal(removals.includes("old.pdf"), false);
  }
});
test("presentation URLs are short-lived and PPTX uses download mode", async () => {
  const { store, calls } = setup();
  await store.lessonPresentationUrl({
    kind: "file",
    storage_path: "private.pdf",
    mime_type: "application/pdf",
  });
  await store.lessonPresentationUrl({
    kind: "file",
    storage_path: "private.pptx",
    mime_type: "presentation",
    file_name: "Урок.pptx",
  });
  assert.equal(calls[0][2], 300);
  assert.equal(calls[0][3], undefined);
  assert.equal(calls[1][3].download, "Урок.pptx");
});
