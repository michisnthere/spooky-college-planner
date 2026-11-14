// backend/middleware/errorHandler.js
// Central error handler. Known errors keep their own status code.
// Unknown errors return a generic 500 and are logged in full on the server.

const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const getKnownStatus = (err) => {
  const status = Number(err && (err.status || err.statusCode));
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : null;
};

const errorHandler = (err, req, res, next) => {
  // If a response has already started, Express needs the default handler to close the socket.
  if (res.headersSent) {
    return next(err);
  }

  const status = getKnownStatus(err);

  if (status === null) {
    console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }

  // 5xx messages can contain internal detail, so they are replaced with a generic message.
  const message = status >= 500 || !err.message ? 'Internal server error' : err.message;
  const code = typeof err.code === 'string' && err.code ? err.code : (DEFAULT_CODES[status] || 'REQUEST_ERROR');

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] Error on ${req.method} ${req.originalUrl}:`, err);
  }

  return res.status(status).json({
    success: false,
    error: message,
    code,
  });
};

module.exports = errorHandler;
