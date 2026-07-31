const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { loadEnvConfig } = require("@next/env")

const projectDir = path.resolve(__dirname, "..")
const cacheFile = path.join(
  projectDir,
  ".next",
  "cache",
  "iris-startup",
  "migrations.sha256"
)

const collectFiles = directory => {
  if (!fs.existsSync(directory)) return []

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const target = path.join(directory, entry.name)
      return entry.isDirectory() ? collectFiles(target) : [target]
    })
    .sort((left, right) => left.localeCompare(right))
}

const computeFingerprint = () => {
  loadEnvConfig(projectDir)

  const hash = crypto.createHash("sha256")
  hash.update(process.env.DATABASE_URL || "")

  const files = [
    path.join(projectDir, "prisma", "schema.prisma"),
    path.join(projectDir, "prisma", "migrations", "migration_lock.toml"),
    ...collectFiles(path.join(projectDir, "prisma", "migrations")).filter(
      file => file.endsWith(".sql")
    )
  ]

  for (const file of files) {
    if (!fs.existsSync(file)) continue
    hash.update(path.relative(projectDir, file))
    hash.update(fs.readFileSync(file))
  }

  return hash.digest("hex")
}

const warnOnNodeVersionMismatch = () => {
  const nvmrcPath = path.join(projectDir, ".nvmrc")
  if (!fs.existsSync(nvmrcPath)) return

  const expected = fs.readFileSync(nvmrcPath, "utf8").trim().replace(/^v/, "")
  const expectedMajor = expected.split(".")[0]
  const currentMajor = process.versions.node.split(".")[0]

  if (expectedMajor && expectedMajor !== currentMajor) {
    console.warn(
      `[WARN] Node ${process.versions.node} is active; this project is validated with Node ${expected}.`
    )
  }
}

const mode = process.argv[2] || "check"
warnOnNodeVersionMismatch()

if (mode === "check") {
  const current = computeFingerprint()
  const cached = fs.existsSync(cacheFile)
    ? fs.readFileSync(cacheFile, "utf8").trim()
    : ""

  if (process.argv.includes("--force") || current !== cached) {
    console.log("[MIGRATE] Database migration fingerprint changed.")
    process.exitCode = 10
  } else {
    console.log("[MIGRATE] Database migration fingerprint unchanged; skipping.")
  }
} else if (mode === "mark") {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, `${computeFingerprint()}\n`, "utf8")
  console.log("[MIGRATE] Migration fingerprint updated.")
} else {
  console.error(`Unknown startup preflight mode: ${mode}`)
  process.exitCode = 1
}
