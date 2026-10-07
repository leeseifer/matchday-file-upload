import { rollup } from "rollup";
import lwc from "@lwc/rollup-plugin";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
await mkdir(resolve(here, "dist"), { recursive: true });
const bundle = await rollup({
  input: resolve(here, "main.js"),
  plugins: [
    {
      name: "local-runtime",
      resolveId(id) {
        if (id === "lwc")
          return resolve(root, "node_modules/@lwc/engine-dom/dist/index.js");
      }
    },
    lwc({
      rootDir: root,
      modules: [
        {
          name: "c/penaltyFileUpload",
          path: resolve(
            root,
            "force-app/main/default/lwc/penaltyFileUpload/penaltyFileUpload.js"
          )
        }
      ],
      apiVersion: 67
    }),
    {
      name: "production-mode",
      transform(code, id) {
        if (id.includes("node_modules"))
          return {
            code: code.replaceAll("process.env.NODE_ENV", '"production"'),
            map: null
          };
      }
    }
  ]
});
await bundle.write({
  file: resolve(here, "dist/app.js"),
  format: "iife",
  sourcemap: true
});
await bundle.close();
await copyFile(resolve(here, "index.html"), resolve(here, "dist/index.html"));
const html = await readFile(resolve(here, "index.html"), "utf8");
const script = (await readFile(resolve(here, "dist/app.js"), "utf8"))
  .replace(/<\/script/gi, "<\\/script")
  .replace(/\/\/# sourceMappingURL=.*$/m, "");
await writeFile(
  resolve(here, "dist/Matchday-preview.html"),
  html.replace(
    '<script src="app.js" defer></script>',
    () => `<script>${script}</script>`
  )
);
console.log(
  "Built actual penaltyFileUpload LWC → prototypes/penalty-file-upload/dist"
);
