import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { loadConfig, ROOT } from './config.js'
import { createRouter } from './routes.js'
import { resolveClipPath } from './clips.js'
import { apiErrorHandler, routeHandler } from './middleware.js'

// This Node server hosts the REST API and frontend static assets.

const cfg = loadConfig()
fs.mkdirSync(path.dirname(cfg.databasePath), { recursive: true })
fs.mkdirSync(cfg.clipsDirectory, { recursive: true })

const app = express()
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
const allowAllOrigins = process.env.CORS_ALLOW_ALL === '1'
// CORS only on /api — dev Vite (5173) → API (8000). Production serves UI + API same-origin.
const apiCors = cors({
  origin: allowAllOrigins
    ? true
    : (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
})

const api = createRouter()
app.use('/api', apiCors, api)

app.get(
  '/api/clips/:matchId/:filename',
  routeHandler((req, res, next) => {
    const file = resolveClipPath(
      Number(req.params.matchId),
      req.params.filename
    )
    if (!file) return res.status(404).json({ detail: 'Clip not found' })
    res.sendFile(file, (err) => {
      if (err) next(err)
    })
  })
)

const dist = path.join(ROOT, 'frontend', 'dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use(apiErrorHandler)

const PORT = process.env.PORT || 8000
const HOST = process.env.HOST || '0.0.0.0'
app.listen(PORT, HOST, () => {
  console.log(`Rion Dota Journey API http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`)
})
