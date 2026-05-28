import Database from 'better-sqlite3'
import { loadConfig } from './config.js'

let db = null

export function getDb() {
  if (!db) {
    const cfg = loadConfig()
    db = new Database(cfg.databasePath)
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function rowToObject(row) {
  return row ? { ...row } : null
}
