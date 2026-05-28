import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { loadConfig, ROOT } from './config.js'
import { createRouter } from './routes.js'
import { resolveClipPath } from './clips.js'

// This Node server hosts the REST API and frontend static assets.
// Python is only used for the sync process via run_sync.py.

const cfg = loadConfig()
fs.mkdirSync(cfg.clipsDirectory, { recursive: true })

const app = express()
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  })
)

const api = createRouter()
app.use('/api', api)

app.get('/api/clips/:matchId/:filename', (req, res) => {
  const file = resolveClipPath(
    Number(req.params.matchId),
    req.params.filename
  )
  if (!file) return res.status(404).json({ detail: 'Clip not found' })
  res.sendFile(file)
})

const dist = path.join(ROOT, 'frontend', 'dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const PORT = process.env.PORT || 8000
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Rion Dota Journey API http://127.0.0.1:${PORT}`)
})
