import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const rootDir = path.dirname(serverDir)
const nodeBin = path.dirname(process.execPath)
const major = Number(process.versions.node.split('.')[0])

function tryNodeSqlite() {
  const { DatabaseSync } = require('node:sqlite')
  const probe = new DatabaseSync(':memory:')
  probe.exec('SELECT 1')
  probe.close()
}

function tryBetterSqlite3() {
  const Database = require('better-sqlite3')
  const probe = new Database(':memory:')
  probe.close()
}

function rebuildBetterSqlite3() {
  console.log(`Rebuilding better-sqlite3 for Node ${process.version}...`)
  execSync('npm rebuild better-sqlite3', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${nodeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
  })
}

if (major >= 22) {
  try {
    tryNodeSqlite()
    console.log(`SQLite driver OK (node:sqlite, Node ${process.version})`)
    process.exit(0)
  } catch (err) {
    console.warn(
      `node:sqlite probe failed on Node ${process.version}, trying better-sqlite3...`,
      err.message
    )
  }
}

try {
  tryBetterSqlite3()
  console.log(`SQLite driver OK (better-sqlite3, Node ${process.version})`)
} catch {
  rebuildBetterSqlite3()
  tryBetterSqlite3()
  console.log(`SQLite driver OK (better-sqlite3 rebuilt, Node ${process.version})`)
}
