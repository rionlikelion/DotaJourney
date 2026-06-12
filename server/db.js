import { createRequire } from 'node:module'
import { loadConfig } from './config.js'

const require = createRequire(import.meta.url)

let db = null

const BUSY_RETRY_ATTEMPTS = 12
const BUSY_RETRY_DELAY_MS = 50

export function isDbBusyError(err) {
  const message = String(err?.message || err || '')
  return (
    err?.code === 'SQLITE_BUSY' ||
    err?.code === 'SQLITE_LOCKED' ||
    message.includes('database is locked') ||
    message.includes('SQLITE_BUSY') ||
    message.includes('SQLITE_LOCKED')
  )
}

function sleepSync(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    // Spin briefly while waiting for Python sync to release the DB lock.
  }
}

function withBusyRetry(fn) {
  for (let attempt = 0; attempt <= BUSY_RETRY_ATTEMPTS; attempt++) {
    try {
      return fn()
    } catch (err) {
      if (!isDbBusyError(err) || attempt === BUSY_RETRY_ATTEMPTS) throw err
      sleepSync(BUSY_RETRY_DELAY_MS * (attempt + 1))
    }
  }
}

function wrapStatement(stmt) {
  return {
    get(...args) {
      return withBusyRetry(() => stmt.get(...args))
    },
    all(...args) {
      return withBusyRetry(() => stmt.all(...args))
    },
    run(...args) {
      return withBusyRetry(() => stmt.run(...args))
    },
  }
}

function wrapDatabase(database) {
  return {
    prepare(sql) {
      return wrapStatement(database.prepare(sql))
    },
  }
}

function configureDatabase(database) {
  const exec = (sql) => database.exec(sql)
  const pragma = (sql) => database.pragma?.(sql) ?? exec(`PRAGMA ${sql}`)

  pragma('foreign_keys = ON')
  pragma('busy_timeout = 30000')
  pragma('journal_mode = WAL')
  pragma('synchronous = NORMAL')
}

function openDatabase(dbPath) {
  const major = Number(process.versions.node.split('.')[0])

  if (major >= 22) {
    try {
      const { DatabaseSync } = require('node:sqlite')
      const database = new DatabaseSync(dbPath)
      configureDatabase(database)
      console.log(`[db] using node:sqlite (${process.version})`)
      return wrapDatabase(database)
    } catch (err) {
      console.warn(
        `[db] node:sqlite unavailable on ${process.version}, falling back to better-sqlite3:`,
        err.message
      )
    }
  }

  let Database
  try {
    Database = require('better-sqlite3')
  } catch (err) {
    const versionHint = err.message?.includes('NODE_MODULE_VERSION')
      ? `better-sqlite3 was built for a different Node version. Re-run npm install --workspaces using Node ${process.version} (the same Node you use for npm run dev:server).\n`
      : ''
    throw new Error(
      `${versionHint}SQLite driver unavailable on Node ${process.version}. ` +
        'Run npm install --workspaces from the repo root.\n' +
        `Original error: ${err.message}`
    )
  }

  const database = new Database(dbPath)
  configureDatabase(database)
  return wrapDatabase(database)
}

export function getDb() {
  if (!db) {
    const cfg = loadConfig()
    db = openDatabase(cfg.databasePath)
  }
  return db
}

export function rowToObject(row) {
  return row ? { ...row } : null
}

export function runDb(fn) {
  return withBusyRetry(() => fn(getDb()))
}
