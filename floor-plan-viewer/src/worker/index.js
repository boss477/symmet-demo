import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { webhooksRoute } from './routes/webhooks.js'

// Handlers (to be split into separate route files as the project grows)
const app = new Hono()

app.use('*', cors())

// Basic health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/webhooks', webhooksRoute)

export default app
