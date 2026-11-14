// frontend/js/api/student.js
// Student identifier for college requests. The first call asks the backend to create a
// student row (POST /api/students) and keeps the returned ID in localStorage, so saved
// colleges load again after a page refresh. colleges.student_id references students(id).

import { createStudent } from './client.js';

export const STUDENT_ID_KEY = 'spooky-planner.studentId';

// Shared by concurrent first calls, so only one student is created per page load.
let pendingId = null;
// Used when storage is blocked. Keeps one ID for the page load.
let memoryId = null;

// Reads the global localStorage. Browsers can throw here when storage is disabled.
function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function createAndStore(target) {
  const student = await createStudent();
  const id = student?.id;
  if (id === undefined || id === null || id === '') {
    throw new Error('The server did not return a student ID.');
  }
  const value = String(id);
  try {
    if (!target) throw new Error('no storage');
    target.setItem(STUDENT_ID_KEY, value);
  } catch {
    memoryId = value;
  }
  return value;
}

/**
 * Returns the student ID, creating the student on first use.
 * Rejects when the server cannot create the student. The next call tries again.
 * @param {Storage|null} [storage] Defaults to localStorage. Pass a Storage-like object in tests.
 * @returns {Promise<string>}
 */
export async function getStudentId(storage) {
  const target = resolveStorage(storage);
  let stored = null;
  try {
    stored = target ? target.getItem(STUDENT_ID_KEY) : null;
  } catch {
    stored = null;
  }
  if (stored) return stored;
  if (memoryId) return memoryId;

  pendingId = pendingId ?? createAndStore(target).finally(() => {
    pendingId = null;
  });
  return pendingId;
}
