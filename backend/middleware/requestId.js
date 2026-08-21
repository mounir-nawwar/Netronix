// Correlation id (SEC-009).
//
// A client is told *only* that something went wrong, plus this id. The id is
// also on every server-side log line for the request, so an operator can join
// the two without the response ever carrying a stack, a path, or a database
// message.

import { randomUUID } from 'node:crypto'

export default function requestId(req, res, next) {
    req.id = randomUUID()
    res.setHeader('X-Request-Id', req.id)
    next()
}
