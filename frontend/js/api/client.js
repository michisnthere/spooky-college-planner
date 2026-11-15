// frontend/js/api/client.js
// Fetch wrapper for the backend API (design 4.1 and 4.2, requirements 4).
// Every response follows the envelope from design 4.2:
//   success: {success: true, data, message}
//   error:   {success: false, error, code}
// Successful calls resolve with `data`. Failed calls throw an ApiError with `code`, `message`, and `status`.

/** Backend base URL when none is configured. Empty means same origin: requests go to /api on the host that served the page. */
export const DEFAULT_BASE_URL = '';

/** Longest a request may run, in milliseconds (design 8.1). */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Codes this client creates itself. Backend codes arrive in the `code` field of the envelope. */
export const ERROR_CODES = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
});

/** Error thrown for every failed request. */
export class ApiError extends Error {
  /**
   * @param {string} message Text a user can read.
   * @param {string} code Backend error code, or one of ERROR_CODES, or HTTP_<status>.
   * @param {number|null} [status] HTTP status, or null when no response arrived.
   */
  constructor(message, code, status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Returns the backend base URL. Set `globalThis.SPOOKY_API_BASE_URL` before the page
 * sends requests to point at another server. Trailing slashes are removed.
 * @returns {string}
 */
export function getBaseUrl() {
  const configured = globalThis.SPOOKY_API_BASE_URL;
  const value = typeof configured === 'string' && configured.trim() !== '' ? configured.trim() : DEFAULT_BASE_URL;
  return value.replace(/\/+$/, '');
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Turns a failure from fetch or body reading into an ApiError. An abort means our timer fired.
function transportError(error, timedOut, timeoutMs) {
  if (timedOut) {
    return new ApiError(`The request timed out after ${timeoutMs} ms. Try again.`, ERROR_CODES.TIMEOUT, null);
  }
  return new ApiError(
    'Could not reach the server. Check your connection and try again.',
    ERROR_CODES.NETWORK_ERROR,
    null,
  );
}

async function request(method, path, { body, timeoutMs, baseUrl } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError(`API path must start with "/": got ${JSON.stringify(path)}`);
  }

  const url = `${baseUrl ?? getBaseUrl()}${path}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const init = { method, headers: { Accept: 'application/json' }, signal: controller.signal };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  try {
    let response;
    let text;
    try {
      response = await fetch(url, init);
      text = await response.text();
    } catch (error) {
      throw transportError(error, timedOut, timeoutMs);
    }

    const payload = parseJson(text);
    const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload);

    if (!isObject) {
      if (!response.ok) {
        throw new ApiError(`Request failed with status ${response.status}.`, `HTTP_${response.status}`, response.status);
      }
      throw new ApiError('The server sent a response that is not valid JSON.', ERROR_CODES.INVALID_RESPONSE, response.status);
    }

    if (!response.ok || payload.success === false) {
      const message = typeof payload.error === 'string' && payload.error
        ? payload.error
        : `Request failed with status ${response.status}.`;
      const code = typeof payload.code === 'string' && payload.code
        ? payload.code
        : `HTTP_${response.status}`;
      throw new ApiError(message, code, response.status);
    }

    if (payload.success !== true) {
      throw new ApiError('The server response did not follow the expected format.', ERROR_CODES.INVALID_RESPONSE, response.status);
    }

    return payload.data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Creates a client with its own timeout. The base URL is read on each request unless one is given.
 * @param {object} [options]
 * @param {string} [options.baseUrl] Overrides the configured base URL.
 * @param {number} [options.timeoutMs=5000] Time limit per request, in milliseconds. Must be positive.
 * @returns {{get: Function, post: Function, patch: Function, delete: Function}}
 */
export function createApiClient({ baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('timeoutMs must be a positive number');
  }
  const base = { baseUrl, timeoutMs };
  return {
    get: (path) => request('GET', path, base),
    post: (path, body) => request('POST', path, { ...base, body }),
    patch: (path, body) => request('PATCH', path, { ...base, body }),
    delete: (path) => request('DELETE', path, base),
  };
}

/** Shared client with the default timeout and base URL. */
export const apiClient = createApiClient();

const enc = (value) => encodeURIComponent(String(value));

/**
 * Loads the saved colleges for a student.
 * @param {string} studentId
 */
export const getColleges = (studentId) => apiClient.get(`/api/colleges?studentId=${enc(studentId)}`);

/**
 * Saves a new college.
 * @param {object} college Fields the backend expects: studentId, name, state, location, acceptanceRate, scorecardId.
 */
export const addCollege = (college) => apiClient.post('/api/colleges', college);

/**
 * Updates a saved college.
 * @param {string|number} collegeId
 * @param {object} updates
 */
export const updateCollege = (collegeId, updates) => apiClient.patch(`/api/colleges/${enc(collegeId)}`, updates);

/**
 * Removes a saved college.
 * @param {string|number} collegeId
 */
export const deleteCollege = (collegeId) => apiClient.delete(`/api/colleges/${enc(collegeId)}`);

/**
 * Searches the College Scorecard through the backend.
 * @param {string} name
 * @returns {Promise<object[]>} Matches with id, name, city, state, acceptanceRate, scorecardId. Empty when nothing matches.
 */
export async function lookupCollege(name) {
  const results = await apiClient.get(`/api/lookup/college?name=${enc(name)}`);
  return Array.isArray(results) ? results : [];
}

/**
 * Creates a student record for this browser. Returns the new student, including its id.
 */
export const createStudent = () => apiClient.post('/api/students', {});

/**
 * Creates an application record for a college.
 * @param {{studentId: string, collegeId: string|number, deadlineDate?: string|null}} application
 */
export const createApplication = ({ studentId, collegeId, deadlineDate }) =>
  apiClient.post('/api/applications', { studentId, collegeId, deadlineDate });

/**
 * Loads the application record for a college.
 * @param {string|number} collegeId
 */
export const getApplication = (collegeId) => apiClient.get(`/api/applications/${enc(collegeId)}`);

/**
 * Sets the application status, such as 'submitted'.
 * @param {string|number} collegeId
 * @param {string} status One of pending, submitted, accepted, rejected, waitlisted.
 */
export const updateApplicationStatus = (collegeId, status) =>
  apiClient.patch(`/api/applications/${enc(collegeId)}/status`, { status });

/**
 * Loads deadline info, including days remaining and zombie progress.
 * @param {string|number} collegeId
 */
export const getDeadline = (collegeId) => apiClient.get(`/api/deadlines/${enc(collegeId)}`);

/**
 * Sets the deadline date.
 * @param {string|number} collegeId
 * @param {string} deadlineDate "YYYY-MM-DD"
 */
export const updateDeadline = (collegeId, deadlineDate) =>
  apiClient.patch(`/api/deadlines/${enc(collegeId)}`, { deadlineDate });
