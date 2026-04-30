#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const options = parseArgs(process.argv.slice(2));
const packagePath = path.resolve(rootPath, options.packagePath);
const packageJsonPath = path.join(packagePath, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const packageName = assertString(packageJson.name, "package.json name");
const packageVersion = assertString(
  packageJson.version,
  "package.json version",
);
const npmAuth = await prepareNpmAuth();

if (options.version && options.version !== packageVersion) {
  throw new Error(
    `Requested version ${options.version} does not match ${packageJsonPath} version ${packageVersion}.`,
  );
}

console.log(`Release candidate: ${packageName}@${packageVersion}`);
console.log(`Dist tag: ${options.tag}`);
console.log(`Publish: ${options.publish ? "yes" : "no"}`);

if (!options.skipWorkspaceGates) {
  await run("pnpm", ["build"], rootPath);
  await run("pnpm", ["test"], rootPath);
  await run("pnpm", ["lint"], rootPath);
}

if (packageName === "@agent-atlas/cli") {
  await runCliWorkspaceSmoke();
}

const tarballPath = await packPackage(packagePath);
try {
  await assertPackageShape(packageName, tarballPath);
  await runCleanInstallSmoke(packageName, tarballPath);

  if (options.publish) {
    await run(
      "npm",
      ["publish", "--access", "public", "--tag", options.tag],
      packagePath,
    );
    await run(
      "npm",
      [
        "view",
        `${packageName}@${packageVersion}`,
        "version",
        "dist-tags",
        "--json",
      ],
      rootPath,
    );
  } else {
    console.log(
      "Dry run complete. Re-run with --publish to publish this package.",
    );
  }
} finally {
  if (!options.keepTarball) {
    await rm(tarballPath, { force: true });
  }
  await npmAuth.cleanup();
}

function parseArgs(args) {
  const parsed = {
    packagePath: "packages/cli",
    tag: "preview",
    version: undefined,
    publish: false,
    keepTarball: false,
    skipWorkspaceGates: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--package") {
      parsed.packagePath = requireValue(args, (index += 1), arg);
    } else if (arg === "--tag") {
      parsed.tag = requireValue(args, (index += 1), arg);
    } else if (arg === "--version") {
      parsed.version = requireValue(args, (index += 1), arg);
    } else if (arg === "--publish") {
      parsed.publish = true;
    } else if (arg === "--keep-tarball") {
      parsed.keepTarball = true;
    } else if (arg === "--skip-workspace-gates") {
      parsed.skipWorkspaceGates = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/release-package.mjs [options]

Options:
  --package <path>          Package directory to release. Defaults to packages/cli.
  --version <version>       Assert the package version before release.
  --tag <tag>               npm dist-tag. Defaults to preview.
  --publish                 Publish after all gates pass. Omit for a dry run.
  --keep-tarball            Keep the generated npm pack tarball.
  --skip-workspace-gates    Skip root build/test/lint gates for local iteration.
`);
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
  return value;
}

async function runCliWorkspaceSmoke() {
  const cliPath = path.join(rootPath, "packages", "cli", "dist", "index.js");
  await run("node", [cliPath, "doctor", "--path", "."], rootPath);
  await run(
    "node",
    [cliPath, "validate", ".", "--profile", "public"],
    rootPath,
  );
  await run(
    "node",
    [cliPath, "boundary-check", ".", "--profile", "public"],
    rootPath,
  );
  await run(
    "node",
    [
      cliPath,
      "generate",
      "markdown",
      ".",
      "--output",
      "docs/agents",
      "--profile",
      "public",
      "--check",
    ],
    rootPath,
  );
  await run(
    "node",
    [
      cliPath,
      "mcp",
      "smoke-test",
      "--path",
      ".",
      "--profile",
      "public",
      "--resolve-path",
      "packages/cli/src/index.ts",
    ],
    rootPath,
  );
}

async function packPackage(pkgPath) {
  const output = await runCapture("npm", ["pack", "--json"], pkgPath);
  const parsed = JSON.parse(extractJsonArray(output));
  const filename = parsed[0]?.filename;
  if (typeof filename !== "string") {
    throw new Error(`Could not parse npm pack output: ${output}`);
  }
  return path.join(pkgPath, filename);
}

async function assertPackageShape(packageName, tarballPath) {
  const listing = await runCapture("tar", ["-tf", tarballPath], rootPath);
  const files = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  const forbidden = files.filter(
    (file) =>
      file.includes("/src/") ||
      file.includes("/test") ||
      file.endsWith(".map") ||
      file.endsWith("/tsconfig.json") ||
      file.includes("/.agent-atlas/") ||
      file.includes("/.runtime/"),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Packed package contains forbidden files:\n${forbidden.join("\n")}`,
    );
  }

  if (packageName === "@agent-atlas/cli") {
    const expected = [
      "package/LICENSE",
      "package/README.md",
      "package/dist/index.js",
      "package/package.json",
    ];
    const unexpected = files.filter((file) => !expected.includes(file));
    const missing = expected.filter((file) => !files.includes(file));
    if (unexpected.length > 0 || missing.length > 0) {
      throw new Error(
        `Unexpected @agent-atlas/cli package shape.\nMissing:\n${missing.join("\n") || "(none)"}\nUnexpected:\n${unexpected.join("\n") || "(none)"}`,
      );
    }
  }
}

async function runCleanInstallSmoke(packageName, tarballPath) {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "agent-atlas-package-smoke-"),
  );
  try {
    await writeFile(
      path.join(tempRoot, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    await run("npm", ["install", tarballPath], tempRoot);

    if (packageName === "@agent-atlas/cli") {
      await run("npx", ["atlas", "--help"], tempRoot);
      await writeMinimalAtlasRepo(tempRoot);
      await run(
        "npx",
        ["atlas", "validate", ".", "--profile", "public"],
        tempRoot,
      );
      await run(
        "npx",
        ["atlas", "boundary-check", ".", "--profile", "public"],
        tempRoot,
      );
      await run(
        "npx",
        [
          "atlas",
          "generate",
          "markdown",
          ".",
          "--output",
          "docs/agents",
          "--profile",
          "public",
        ],
        tempRoot,
      );
      await run(
        "npx",
        [
          "atlas",
          "generate",
          "markdown",
          ".",
          "--output",
          "docs/agents",
          "--profile",
          "public",
          "--check",
        ],
        tempRoot,
      );
      await writeUsageReceipts(tempRoot);
      const usageDir = path.join(tempRoot, ".runtime", "agent-atlas", "usage");
      await run(
        "npx",
        [
          "atlas",
          "discover-gaps",
          ".",
          "--receipts",
          usageDir,
          "--profile",
          "public",
          "--out",
          "gaps.json",
          "--json",
        ],
        tempRoot,
      );
      const proposalOutput = await runCapture(
        "npx",
        [
          "atlas",
          "propose-cards",
          "--report",
          "gaps.json",
          "--out",
          "proposals",
          "--json",
        ],
        tempRoot,
      );
      const proposalPath = JSON.parse(proposalOutput).proposalPath;
      if (typeof proposalPath !== "string") {
        throw new Error(
          `No proposalPath returned by propose-cards: ${proposalOutput}`,
        );
      }
      await run(
        "npx",
        ["atlas", "proposal", "validate", proposalPath],
        tempRoot,
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function writeMinimalAtlasRepo(root) {
  const repoDir = path.join(root, ".agent-atlas", "public", "repositories");
  const componentDir = path.join(root, ".agent-atlas", "public", "components");
  await mkdir(repoDir, { recursive: true });
  await mkdir(componentDir, { recursive: true });
  await writeFile(
    path.join(repoDir, "example.yaml"),
    `id: repository:example
kind: repository
title: Example
summary: Minimal public package smoke test repository.
status: active
visibility: public
uri: repo://example
relations: []
`,
  );
  await writeFile(
    path.join(componentDir, "source.yaml"),
    `id: component:source
kind: component
title: Source
summary: Minimal source component.
status: active
visibility: public
code:
  paths:
    - src/**
relations:
  - type: part-of
    target: repository:example
`,
  );
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "index.ts"),
    "export const value = 1;\n",
  );
}

async function writeUsageReceipts(root) {
  const usageDir = path.join(root, ".runtime", "agent-atlas", "usage");
  await mkdir(usageDir, { recursive: true });
  const receipt = `version: 1
recorded_at: "2026-04-30T00:00:00.000Z"
task: Add billing import flow
profile: public
command: context-pack
selected_entities: []
selected_files:
  - src/billing/import.ts
selected_tests:
  - npm test
broad_search_fallback: true
missing_cards:
  - billing import flow
misleading_cards: []
`;
  await writeFile(path.join(usageDir, "first.yaml"), receipt);
  await writeFile(path.join(usageDir, "second.yaml"), receipt);
}

async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: npmAuth.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`${command} ${args.join(" ")} exited with code ${code}`),
        );
      }
    });
  });
}

async function runCapture(command, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: npmAuth.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve(out);
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with code ${code}\n${err}`,
          ),
        );
      }
    });
  });
}

function extractJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find JSON array in output: ${output}`);
  }
  return output.slice(start, end + 1);
}

async function prepareNpmAuth() {
  const token = process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN;
  if (!token) {
    return {
      env: process.env,
      cleanup: async () => {},
    };
  }

  const authDir = await mkdtemp(
    path.join(os.tmpdir(), "agent-atlas-npm-auth-"),
  );
  const userConfigPath = path.join(authDir, ".npmrc");
  await writeFile(
    userConfigPath,
    "registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n",
  );

  return {
    env: {
      ...process.env,
      NODE_AUTH_TOKEN: token,
      npm_config_userconfig: userConfigPath,
    },
    cleanup: async () => {
      await rm(authDir, { recursive: true, force: true });
    },
  };
}
