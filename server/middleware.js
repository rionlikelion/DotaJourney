import { isDbBusyError } from './db.js'

export function routeHandler(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next)
      if (result && typeof result.then === 'function') {
        result.catch(next)
      }
    } catch (err) {
      next(err)
    }
  }
}

export function apiErrorHandler(err, req, res, _next) {
  if (res.headersSent) return

  const busy = isDbBusyError(err)
  const status = busy ? 503 : 500

  console.error(`[api] ${req.method} ${req.originalUrl}:`, err?.stack || err)

  res.status(status).json({
    detail: busy
      ? 'Database temporarily busy. If sync is running, try again in a moment.'
      : err?.message || 'Internal server error',
    retryable: busy,
  })
}
