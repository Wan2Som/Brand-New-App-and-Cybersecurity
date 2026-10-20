/** Wrap async route handlers so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}

function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

module.exports = { asyncHandler, errorHandler, notFound };
